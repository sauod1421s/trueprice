/**
 * مفتاح موحّد للمتجر.
 *
 * الهدف: لا يُحتسب المتجر نفسه أكثر من مرة في التقييم، حتى لو وصل سعره
 * من شبكتين مختلفتين (مثلًا Admitad و ArabClicks) أو بكتابات مختلفة
 * ("noon" / "نون" / "noon.com").
 */

import { normalizeText } from "../search";

/** متاجر معروفة: كل الكتابات المحتملة → مفتاح واحد */
const KNOWN_STORES: Record<string, string[]> = {
  amazon: ["amazon", "amazon.sa", "amazonsa", "amazon saudi", "أمازون", "امازون"],
  noon: ["noon", "noon.com", "noon ksa", "نون"],
  jarir: ["jarir", "jarir.com", "jarir bookstore", "مكتبة جرير", "جرير"],
  extra: ["extra", "extra.com", "extra stores", "eXtra", "إكسترا", "اكسترا"],
  apple: ["apple", "apple.com", "apple store", "أبل", "ابل"],
  samsung: ["samsung", "samsung.com", "سامسونج"],
  xiaomi: ["xiaomi", "mi.com", "شاومي"],
  lulu: ["lulu", "luluhypermarket", "لولو"],
  carrefour: ["carrefour", "carrefourksa", "كارفور"],
};

const ALIAS_TO_KEY = new Map<string, string>();
for (const [key, aliases] of Object.entries(KNOWN_STORES)) {
  for (const a of aliases) ALIAS_TO_KEY.set(compact(a), key);
}

/**
 * نطاقات روابط التتبع لشبكات العمولة: لا تدل على المتجر نفسه،
 * فلا نستنتج اسم المتجر منها.
 */
const REDIRECT_HOSTS = [
  "admitad.com",
  "ad.admitad.com",
  "alitems.com",
  "lenkmio.com",
  "arabclicks.com",
  "go.arabclicks.com",
  "awin1.com",
  "prf.hn",
  "linksynergy.com",
  "click.linksynergy.com",
  "tradedoubler.com",
  "dcmnetwork.com",
  "boostiny.com",
];

function compact(s: string): string {
  return normalizeText(s).replace(/\s+/g, "");
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isRedirectHost(url: string): boolean {
  const host = hostOf(url);
  return !!host && REDIRECT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * يحدد مفتاح المتجر من اسمه، وإن لم يوجد فمن نطاق الرابط
 * (إلا إذا كان رابط تتبع لشبكة عمولة). يعيد null إن تعذر التحديد.
 */
export function resolveStoreKey(storeName: string, url: string): string | null {
  if (storeName.trim()) {
    const c = compact(storeName);
    const known = ALIAS_TO_KEY.get(c);
    if (known) return known;
    // اسم غير معروف: نستخدم صيغته الموحّدة كمفتاح
    return c || null;
  }

  if (!isRedirectHost(url)) {
    const host = hostOf(url);
    if (host) {
      const known = ALIAS_TO_KEY.get(compact(host));
      if (known) return known;
      // "store.example.sa" → "example"
      const parts = host.split(".");
      const base = parts.length >= 3 && parts.at(-2)!.length <= 3 ? parts.at(-3)! : parts.at(-2) ?? host;
      return ALIAS_TO_KEY.get(compact(base)) ?? compact(base);
    }
  }
  return null;
}
