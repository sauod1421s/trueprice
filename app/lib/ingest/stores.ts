/**
 * هوية المتاجر بمعرّفات ثابتة.
 *
 * - سجل المتاجر المعروفة: معرّف ثابت + نطاقات + أسماء بديلة معتمدة.
 * - الاسم غير المعروف لا يُنشئ متجرًا جديدًا تلقائيًا: يتحول إلى "مقترح اسم
 *   بديل" يراجعه المشرف، ولا يدخل التقييم حتى يُعتمد.
 * - روابط التتبع لشبكات العمولة لا تدل على المتجر؛ نستخرج الرابط الفعلي منها
 *   إن أمكن.
 * - البائع (في المتاجر متعددة البائعين) منفصل عن المتجر.
 */

import { normalizeText } from "../search";

export type StoreRecord = {
  /** معرّف ثابت لا يتغير */
  id: string;
  name: string;
  nameAr: string;
  /** نطاقات المتجر الرسمية */
  domains: string[];
  /** أسماء بديلة معتمدة (تُطابق بعد التوحيد) */
  aliases: string[];
  /** متجر يبيع فيه بائعون متعددون */
  marketplace: boolean;
};

/**
 * سجل المتاجر المعروفة. الإضافة إليه أو اعتماد اسم بديل قرار مشرف.
 * (لاحقًا ينتقل إلى قاعدة البيانات مع واجهة مراجعة.)
 */
export const STORE_REGISTRY: readonly StoreRecord[] = [
  { id: "amazon-sa", name: "Amazon.sa", nameAr: "أمازون", domains: ["amazon.sa"], aliases: ["amazon", "amazon.sa", "amazon saudi", "amazon ksa", "أمازون", "امازون"], marketplace: true },
  { id: "noon", name: "noon", nameAr: "نون", domains: ["noon.com"], aliases: ["noon", "noon.com", "noon ksa", "نون"], marketplace: true },
  { id: "jarir", name: "Jarir", nameAr: "جرير", domains: ["jarir.com"], aliases: ["jarir", "jarir.com", "jarir bookstore", "مكتبة جرير", "جرير"], marketplace: false },
  { id: "extra", name: "eXtra", nameAr: "إكسترا", domains: ["extra.com"], aliases: ["extra", "extra.com", "extra stores", "إكسترا", "اكسترا"], marketplace: false },
  { id: "apple-sa", name: "Apple", nameAr: "أبل", domains: ["apple.com"], aliases: ["apple", "apple.com", "apple store", "أبل", "ابل"], marketplace: false },
  { id: "samsung-sa", name: "Samsung", nameAr: "سامسونج", domains: ["samsung.com"], aliases: ["samsung", "samsung.com", "سامسونج"], marketplace: false },
  { id: "xiaomi-sa", name: "Xiaomi", nameAr: "شاومي", domains: ["mi.com"], aliases: ["xiaomi", "mi.com", "شاومي"], marketplace: false },
  { id: "lulu", name: "Lulu", nameAr: "لولو", domains: ["luluhypermarket.com"], aliases: ["lulu", "luluhypermarket", "لولو"], marketplace: false },
  { id: "carrefour-sa", name: "Carrefour", nameAr: "كارفور", domains: ["carrefourksa.com"], aliases: ["carrefour", "carrefourksa", "كارفور"], marketplace: false },
];

/** أسماء بديلة اعتمدها المشرف: الاسم الموحّد → معرّف المتجر */
export type ApprovedAliases = Readonly<Record<string, string>>;

export function compactName(s: string): string {
  return normalizeText(s).replace(/\s+/g, "");
}

/* ---------------------------------------------------------------
   الروابط
--------------------------------------------------------------- */

/** نطاقات روابط التتبع لشبكات العمولة (لا تدل على المتجر نفسه) */
const REDIRECT_HOSTS = [
  "admitad.com", "alitems.com", "lenkmio.com", "arabclicks.com", "awin1.com", "prf.hn",
  "linksynergy.com", "tradedoubler.com", "dcmnetwork.com", "boostiny.com",
];

/** بارامترات الرابط التي تحمل الوجهة الفعلية داخل روابط التتبع */
const TARGET_PARAMS = ["ulp", "url", "u", "murl", "dest", "destination", "redirect", "target", "r"];

/** بارامترات تتبع تُزال عند توحيد الرابط */
const TRACKING_PARAM = /^(utm_.*|gclid|fbclid|ttclid|msclkid|aff.*|affiliate.*|ref|ref_|tag|clickid|click_id|subid.*|sub_id.*|sid|irclickid|admitad_uid|tracking.*)$/i;

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

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

/**
 * يعيد الرابط الفعلي للمنتج: يستخرج الوجهة من روابط التتبع (إن وُجدت)،
 * ويزيل بارامترات الحملات والجزء بعد #. يعيد null إذا لم يمكن معرفة الوجهة.
 */
export function canonicalProductUrl(url: string): string | null {
  if (!isHttpUrl(url)) return null;
  let target = url;
  if (isRedirectHost(url)) {
    const u = new URL(url);
    const found = TARGET_PARAMS.map((p) => u.searchParams.get(p)).find((v) => v && isHttpUrl(v) && !isRedirectHost(v));
    if (!found) return null;
    target = found;
  }
  const u = new URL(target);
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  let out = u.toString();
  if (out.endsWith("/") && u.pathname !== "/") out = out.slice(0, -1);
  return out;
}

/* ---------------------------------------------------------------
   تحديد المتجر
--------------------------------------------------------------- */

export type StoreResolution =
  | { status: "resolved"; storeId: string; via: "source" | "alias" | "domain"; warning?: string }
  | { status: "pending"; normalized: string; suggestedStoreId: string | null; reason: string };

function byId(id: string, registry: readonly StoreRecord[]): StoreRecord | undefined {
  return registry.find((s) => s.id === id);
}

function aliasLookup(normalized: string, registry: readonly StoreRecord[], approved: ApprovedAliases): string | null {
  if (approved[normalized]) return approved[normalized];
  for (const s of registry) {
    if (s.aliases.some((a) => compactName(a) === normalized)) return s.id;
  }
  return null;
}

function domainLookup(canonicalUrl: string | null, registry: readonly StoreRecord[]): string | null {
  if (!canonicalUrl) return null;
  const host = hostOf(canonicalUrl);
  if (!host) return null;
  for (const s of registry) {
    if (s.domains.some((d) => host === d || host.endsWith(`.${d}`))) return s.id;
  }
  return null;
}

/** اقتراح متجر قريب (للمشرف فقط — لا يُعتمد تلقائيًا) */
function suggest(normalized: string, registry: readonly StoreRecord[], approved: ApprovedAliases): string | null {
  if (normalized.length < 3) return null;
  const candidates: [string, string][] = [
    ...registry.flatMap((s) => s.aliases.map((a): [string, string] => [compactName(a), s.id])),
    ...Object.entries(approved),
  ];
  let best: string | null = null;
  let bestLen = 0;
  for (const [alias, id] of candidates) {
    if (alias.length >= 3 && (normalized.startsWith(alias) || alias.startsWith(normalized)) && alias.length > bestLen) {
      best = id;
      bestLen = alias.length;
    }
  }
  return best;
}

export function resolveStore(input: {
  storeName: string;
  canonicalUrl: string | null;
  sourceStoreId?: string;
  registry?: readonly StoreRecord[];
  approvedAliases?: ApprovedAliases;
}): StoreResolution {
  const registry = input.registry ?? STORE_REGISTRY;
  const approved = input.approvedAliases ?? {};

  if (input.sourceStoreId) {
    if (byId(input.sourceStoreId, registry)) return { status: "resolved", storeId: input.sourceStoreId, via: "source" };
    return { status: "pending", normalized: input.sourceStoreId, suggestedStoreId: null, reason: "معرّف المتجر في إعداد المصدر غير موجود في سجل المتاجر" };
  }

  const fromDomain = domainLookup(input.canonicalUrl, registry);
  const normalized = compactName(input.storeName);

  if (normalized) {
    const fromAlias = aliasLookup(normalized, registry, approved);
    if (fromAlias && fromDomain && fromAlias !== fromDomain) {
      return { status: "pending", normalized, suggestedStoreId: fromDomain, reason: "اسم المتجر يشير لمتجر والرابط يشير لمتجر آخر" };
    }
    if (fromAlias) return { status: "resolved", storeId: fromAlias, via: "alias" };
    if (fromDomain) {
      return { status: "resolved", storeId: fromDomain, via: "domain", warning: `اسم المتجر "${input.storeName}" غير معروف؛ حُدد المتجر من نطاق الرابط` };
    }
    return { status: "pending", normalized, suggestedStoreId: suggest(normalized, registry, approved), reason: "اسم متجر غير موجود في السجل — يحتاج اعتماد المشرف" };
  }

  if (fromDomain) return { status: "resolved", storeId: fromDomain, via: "domain" };
  return { status: "pending", normalized: "", suggestedStoreId: null, reason: "لا يوجد اسم متجر والرابط لا يدل على متجر معروف" };
}

/** مفتاح البائع داخل المتجر (null إذا كان البائع هو المتجر نفسه) */
export function sellerKeyFor(sellerName: string, storeId: string | null, registry: readonly StoreRecord[] = STORE_REGISTRY): string | null {
  const key = compactName(sellerName);
  if (!key) return null;
  if (storeId) {
    const store = byId(storeId, registry);
    if (store && store.aliases.some((a) => compactName(a) === key)) return null;
  }
  return key;
}
