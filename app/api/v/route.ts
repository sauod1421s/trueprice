/**
 * استقبال مشاهدات الصفحات من المتصفح (إحصائيات الزوار بلا ملفات تعريف).
 *
 * طبقات الحماية من الزيارات الآلية والإغراق:
 *   1) من نفس الموقع فقط (Origin + Sec-Fetch-Site)، وطلب POST بجسم صغير
 *   2) فلتر المتصفحات الآلية المعروفة (User-Agent)، والمتصفح المؤتمت يُستبعد في المتصفح نفسه
 *   3) حد معدل لكل زائر داخل القاعدة (120 مشاهدة / 10 دقائق)
 * عنوان IP والمتصفح يُرسلان للقاعدة لحساب بصمة يومية فقط ولا يُخزَّنان.
 * إشارة Global Privacy Control (Sec-GPC: 1) تُحترم: لا يُسجَّل شيء.
 */
import { NextResponse, type NextRequest } from "next/server";
import { classifyPath, clientIp, deviceOf, isBotUserAgent, referrerHost } from "../../lib/analytics/classify";
import { databaseConfigured, withPublicWrite } from "../../lib/db/pool";

const MAX_BODY = 2048;
const noContent = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

function sameOrigin(req: NextRequest): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (!origin) return site === "same-origin";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!databaseConfigured()) return noContent();
  if (!sameOrigin(req)) return new NextResponse(null, { status: 403 });
  if (req.headers.get("sec-gpc") === "1") return noContent();
  const ua = req.headers.get("user-agent");
  if (isBotUserAgent(ua)) return noContent();

  const raw = await req.text();
  if (raw.length > MAX_BODY) return new NextResponse(null, { status: 413 });
  let body: { p?: unknown; s?: unknown; r?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (typeof body.p !== "string") return new NextResponse(null, { status: 400 });
  const view = classifyPath(body.p, typeof body.s === "string" ? body.s : "");
  if (!view) return noContent();

  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    await withPublicWrite((c) =>
      c.query("select pub.record_page_view($1, $2, $3, $4, $5, $6, $7, $8)", [
        clientIp(req.headers),
        ua,
        view.path,
        view.kind,
        view.ref,
        view.query,
        referrerHost(typeof body.r === "string" ? body.r : null, host),
        deviceOf(ua),
      ])
    );
  } catch (e) {
    // الإحصائيات لا تُعطّل الموقع: يُسجَّل نوع الخطأ فقط (بلا مدخلات الزائر)
    console.error("analytics: record failed", (e as { code?: string }).code ?? (e as Error).name);
  }
  return noContent();
}
