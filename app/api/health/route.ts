/**
 * فحص صحة النسخة (بلا أسرار): وضع البيانات، واتصال القاعدة برمز تشخيص قصير، وإعداد الدخول، ورقم الإصدار.
 * يُستخدم للتحقق من نسخة المعاينة بعد ضبط متغيرات البيئة. لا يُعيد أي نص خطأ ولا أي قيمة متغير.
 */
import { NextResponse } from "next/server";
import { authMode } from "../../lib/auth/config";
import { dataSource } from "../../lib/catalog/mode";
import { classifyDbError, type DbHealthReason } from "../../lib/db/health";
import { databaseConfigured, withPublic } from "../../lib/db/pool";
import { withPreviewDefaults } from "../../lib/previewDefaults";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let db: { ok: boolean; reason?: DbHealthReason; ms?: number };
  if (!databaseConfigured()) {
    db = { ok: false, reason: "not_configured" };
  } else {
    try {
      // يمر بنفس مسار الموقع العام: tp_app → web_reader → مخطط pub (يثبت أن ملف الإعداد طُبّق وأن الصلاحيات سليمة)
      await withPublic((c) => c.query("select 1 from pub.site_contact limit 1"));
      db = { ok: true, ms: Date.now() - started };
    } catch (e) {
      db = { ok: false, reason: classifyDbError(e), ms: Date.now() - started };
      console.error("health: db check failed", db.reason);
    }
  }
  const body = {
    status: dataSource() === "static" || db.ok ? "ok" : "degraded",
    dataSource: dataSource(),
    db,
    adminLogin: authMode(),
    adminPanel: withPreviewDefaults(process.env).TRUEPRICE_ADMIN_PREVIEW === "on",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || null,
  };
  return NextResponse.json(body, {
    status: body.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}
