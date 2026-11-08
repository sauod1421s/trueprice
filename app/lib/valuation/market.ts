/**
 * محرك مقارنة السوق والسعر العادل — مشترك للإلكترونيات والسيارات.
 *
 * القواعد (تظهر نصًا للمستخدم في صفحة المنتج وصفحة المنهجية):
 * 1. لا يدخل الحساب إلا سعر موثق (اعتمده مراجع بدليل) وحديث (القاعدة تستبعد ما تجاوز مدة الصلاحية)
 *    ومطابق للمنتج نفسه (السعة/الذاكرة/الفئة/السنة) — القاعدة لا تعرض غير ذلك أصلًا.
 * 2. سعر واحد لكل مصدر (الأقل)، فلا يُحسب المتجر مرتين.
 * 3. يُستبعد السعر الشاذ: الذي يبتعد عن الوسيط أكثر من OUTLIER_PERCENT.
 * 4. السعر العادل = متوسط الأسعار غير الشاذة، بشرط MIN_SOURCES مصادر مستقلة على الأقل
 *    وألا تكون الأسعار متطابقة حرفيًا (تطابقها مؤشر على أنها منقولة من مصدر واحد).
 * 5. إن لم تتحقق الشروط يُخفى السعر العادل ويُكتب سببه. لا يُستبدل بأحد الأسعار.
 *
 * متوسط السوق = متوسط كل الأسعار الموثقة (بما فيها الشاذة)، والسعر العادل يختلف عنه
 * حين توجد أسعار شاذة. أقل سعر = أقل سعر موثق حالي.
 */
import { allPricesIdentical } from "../pricing";

export const MIN_SOURCES = 3;
export const OUTLIER_PERCENT = 15;

export type MarketInput = {
  storeId: string;
  storeAr: string;
  price: number | null;
  url?: string;
  asOf?: string | null;
  verified: boolean;
};

export type MarketPoint = {
  storeId: string;
  storeAr: string;
  price: number;
  url?: string;
  asOf?: string | null;
  verified: boolean;
  /** used = دخل الحساب، outlier = موثق لكنه شاذ، unverified = غير موثق لا يدخل */
  role: "used" | "outlier" | "unverified";
};

export type FairStatus = "available" | "unverified-data" | "not-enough-data" | "not-independent";

export type MarketSummary = {
  points: MarketPoint[];
  /** عدد المصادر الموثقة المستقلة (بعد توحيد المتجر) */
  verifiedSources: number;
  /** عدد المصادر التي دخلت حساب السعر العادل (بعد استبعاد الشاذ) */
  usedSources: number;
  lowest: number | null;
  highest: number | null;
  average: number | null;
  median: number | null;
  fairPrice: number | null;
  status: FairStatus;
};

const valid = (p: number | null | undefined): p is number => typeof p === "number" && Number.isFinite(p) && p > 0;

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

const storeKey = (s: string) => s.trim().toLowerCase();

export function summarizeMarket(input: MarketInput[]): MarketSummary {
  // أقل سعر موثق لكل متجر
  const best = new Map<string, MarketInput & { price: number }>();
  const unverified: MarketPoint[] = [];
  for (const o of input) {
    if (!valid(o.price)) continue;
    if (!o.verified) {
      unverified.push({ ...o, price: o.price, role: "unverified" });
      continue;
    }
    const k = storeKey(o.storeId);
    const prev = best.get(k);
    if (!prev || o.price < prev.price) best.set(k, { ...o, price: o.price });
  }
  const verified = [...best.values()];
  const prices = verified.map((o) => o.price);
  const med = prices.length ? median(prices) : null;
  const isOutlier = (p: number) => med !== null && Math.abs(p - med) / med > OUTLIER_PERCENT / 100;
  const used = verified.filter((o) => !isOutlier(o.price));

  const points: MarketPoint[] = [
    ...verified.map((o) => ({
      storeId: o.storeId, storeAr: o.storeAr, price: o.price, url: o.url, asOf: o.asOf, verified: true,
      role: isOutlier(o.price) ? ("outlier" as const) : ("used" as const),
    })),
    ...unverified,
  ].sort((a, b) => a.price - b.price);

  const base = {
    points,
    verifiedSources: verified.length,
    usedSources: used.length,
    lowest: prices.length ? Math.min(...prices) : null,
    highest: prices.length ? Math.max(...prices) : null,
    average: prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : null,
    median: med === null ? null : Math.round(med),
  };

  if (verified.length === 0) return { ...base, fairPrice: null, status: "unverified-data" };
  if (used.length < MIN_SOURCES) return { ...base, fairPrice: null, status: "not-enough-data" };
  if (allPricesIdentical(used.map((o) => o.price))) return { ...base, fairPrice: null, status: "not-independent" };
  const fair = Math.round(used.reduce((s, o) => s + o.price, 0) / used.length);
  return { ...base, fairPrice: fair, status: "available" };
}

export function fairStatusText(s: MarketSummary): string {
  switch (s.status) {
    case "available":
      return `محسوب من ${s.usedSources} مصادر موثقة ومستقلة${
        s.verifiedSources > s.usedSources ? ` (استُبعد ${s.verifiedSources - s.usedSources} سعر شاذ)` : ""
      }.`;
    case "unverified-data":
      return "السعر العادل غير متاح مؤقتًا: لا توجد أسعار موثقة وحديثة لهذا المنتج بعد.";
    case "not-enough-data":
      return `السعر العادل غير متاح مؤقتًا: يلزم ${MIN_SOURCES} مصادر موثقة مستقلة على الأقل، والمتوفر ${s.usedSources}.`;
    case "not-independent":
      return "السعر العادل غير متاح مؤقتًا: الأسعار الموثقة متطابقة حرفيًا، فلا يمكن التأكد من استقلال مصادرها.";
  }
}

export const METHOD_TEXT =
  `السعر العادل = متوسط الأسعار الموثقة والحديثة والمطابقة للمنتج نفسه، بسعر واحد لكل مصدر، ` +
  `بعد استبعاد أي سعر يبتعد عن الوسيط أكثر من ${OUTLIER_PERCENT}%، وبشرط ${MIN_SOURCES} مصادر مستقلة على الأقل. ` +
  `متوسط السوق = متوسط كل الأسعار الموثقة. الأسعار غير الموثقة أو القديمة لا تدخل في أي حساب.`;
