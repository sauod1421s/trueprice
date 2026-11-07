/**
 * تصنيف مشاهدات الصفحات لإحصائيات الزوار — منطق خالص بلا قاعدة (يُختبر وحده).
 *
 * الخصوصية: لا يخرج من هنا إلا مسار الصفحة، نوعها، رقم المنتج أو العلامة، كلمة البحث
 * (بعد تنقيتها من أي بيانات شخصية محتملة)، اسم موقع الإحالة فقط، ونوع الجهاز.
 */

export type PageKind =
  | "home" | "search" | "product" | "car_brand" | "cars" | "category" | "methodology" | "contact" | "other";

export type PageView = {
  path: string;
  kind: PageKind;
  ref: string | null;
  query: string | null;
};

export type Device = "mobile" | "tablet" | "desktop";

const MAX_PATH = 200;

/** مسارات لا تُحصى أبدًا (اللوحة والواجهات الداخلية) */
const EXCLUDED = /^\/(admin|api|_next|monitoring)(\/|$)/;

/**
 * يُرجع null للمسارات التي لا تُحصى. المسار يُطبَّع: بلا شرطة أخيرة، وبلا أي query string
 * (عدا كلمة البحث في /search فتُستخرج منفصلة بعد التنقية).
 */
export function classifyPath(rawPath: string, search = ""): PageView | null {
  if (typeof rawPath !== "string" || !rawPath.startsWith("/") || rawPath.startsWith("//")) return null;
  let path = rawPath.split(/[?#]/)[0] ?? "/";
  if (path.length > 1) path = path.replace(/\/+$/, "") || "/";
   
  if (path.length > MAX_PATH || /[\u0000-\u001f\u007f]/.test(path)) return null;
  if (EXCLUDED.test(path)) return null;

  if (path === "/") return { path, kind: "home", ref: null, query: null };
  if (path === "/search") {
    const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("q");
    return { path, kind: "search", ref: null, query: cleanSearchQuery(q) };
  }
  if (path === "/cars") return { path, kind: "cars", ref: null, query: null };
  if (path === "/methodology") return { path, kind: "methodology", ref: null, query: null };
  if (path === "/contact" || path === "/track") return { path, kind: "contact", ref: null, query: null };

  const product = /^\/product\/([0-9]{1,9})$/.exec(path);
  if (product) return { path, kind: "product", ref: String(Number(product[1])), query: null };
  const car = /^\/cars\/([a-z0-9-]{1,60})$/.exec(path);
  if (car) return { path, kind: "car_brand", ref: car[1], query: null };

  return { path, kind: "other", ref: null, query: null };
}

/**
 * كلمة البحث كما تُحفظ: مختصرة، بلا مسافات زائدة، بحروف لاتينية صغيرة. تُرفض إن بدت
 * بريدًا أو رقم هاتف أو رقمًا طويلًا (قد تكون بيانات شخصية كُتبت في البحث بالخطأ).
 */
export function cleanSearchQuery(q: string | null | undefined): string | null {
  if (!q) return null;
   
  const v = q.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (v.length < 2 || v.length > 80) return null;
  if (/@/.test(v)) return null;
  if (/[0-9٠-٩]{7,}/.test(v.replace(/[\s+()-]/g, ""))) return null;
  if (/https?:|www\./.test(v)) return null;
  return v;
}

/** الزيارات الآلية المعروفة (الزائر الحقيقي يُرسل إشارة من المتصفح بعد تحميل الصفحة) */
const BOT_UA =
  /bot|crawl|spider|slurp|scrape|fetch|monitor|uptime|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|curl|wget|python|java\/|go-http|okhttp|axios|node-fetch|undici|httpclient|libwww|facebookexternalhit|whatsapp|telegram|discord|slack|embedly|bingpreview|vercel/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.length < 20 || ua.length > 600) return true;
  return BOT_UA.test(ua);
}

export function deviceOf(ua: string | null | undefined): Device {
  const s = ua ?? "";
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/i.test(s)) return "mobile";
  return "desktop";
}

/**
 * اسم موقع الإحالة فقط (بلا مسار أو معاملات). الإحالة من الموقع نفسه = تنقل داخلي (null).
 */
export function referrerHost(referrer: string | null | undefined, ownHost: string | null | undefined): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    const u = new URL(referrer);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const own = (ownHost ?? "").toLowerCase().split(":")[0].replace(/^www\./, "");
  if (!host || host === own) return null;
  if (!/^[a-z0-9.-]{1,100}$/.test(host)) return null;
  return host;
}

/** أول عنوان في x-forwarded-for (تضبطه منصة الاستضافة)، أو x-real-ip */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  const ip = first || headers.get("x-real-ip")?.trim() || "";
  return /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip : "";
}
