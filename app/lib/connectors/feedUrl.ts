/**
 * موصّل "رابط ملف المنتجات" — لشبكات العمولة (ArabClicks، Admitad) وملفات المتاجر المباشرة.
 *
 * الشبكة تعطي لكل برنامج معتمد رابط ملف منتجات (YML/XML/CSV/Google Merchant) يحمل رمز الحساب،
 * لذلك يُعامل الرابط كسرّ: يوضع في متغير بيئة باسم TP_FEED_URL__<معرّف المصدر>.
 * مثال: المصدر "noon-arabclicks" ← TP_FEED_URL__NOON_ARABCLICKS
 */
import { ConnectorError, fetchTextCapped, redactUrl } from "./http";
import { envKey, type Connector, type ConnectorSource, type Env } from "./types";

export const FEED_KINDS = new Set(["affiliate_feed", "store_feed"]);

export function feedUrlVar(sourceId: string): string {
  return `TP_FEED_URL__${envKey(sourceId)}`;
}

/** تخمين الصيغة من بداية المحتوى (المحرك يتحقق مرة أخرى) */
export function sniffFormat(content: string): "auto" | "yml" | "xml" | "csv" {
  const head = content.slice(0, 2048).trimStart();
  if (head.startsWith("<")) return /<yml_catalog/i.test(head) ? "yml" : "xml";
  return head.length ? "csv" : "auto";
}

export const feedUrlConnector: Connector = {
  id: "feed-url",
  label: "رابط ملف منتجات (شبكة عمولة أو متجر)",
  appliesTo: (s: ConnectorSource) => FEED_KINDS.has(s.kind),
  missingConfig: (s: ConnectorSource, env: Env) => (env[feedUrlVar(s.id)]?.trim() ? [] : [feedUrlVar(s.id)]),
  async run(ctx) {
    const url = ctx.env[feedUrlVar(ctx.source.id)]?.trim();
    if (!url) throw new ConnectorError("not_configured", `متغير البيئة ${feedUrlVar(ctx.source.id)} غير مضبوط`);
    const now = ctx.now ?? (() => new Date());
    const content = await fetchTextCapped(url, {
      fetch: ctx.fetch,
      maxBytes: ctx.maxBytes ?? 25 * 1024 * 1024,
      timeoutMs: 25_000,
      init: { headers: { accept: "application/xml, text/xml, text/csv, text/plain, */*" } },
    });
    if (!content.trim()) throw new ConnectorError("empty", "ملف المصدر فارغ");
    const fetchedAt = now().toISOString();
    return {
      fileName: `${ctx.source.id}-${fetchedAt.slice(0, 19).replace(/[:T]/g, "-")}.feed`,
      format: sniffFormat(content),
      content,
      fetchedAt,
      meta: { host: redactUrl(url), bytes: Buffer.byteLength(content) },
    };
  },
};
