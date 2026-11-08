/**
 * محرك السعر العادل للإلكترونيات (مستقل عن محرك السيارات).
 *
 * القواعد:
 * - لا يدخل في الحساب إلا الأسعار ذات الحالة "verified".
 * - يلزم توفر أسعار موثقة من MIN_VERIFIED_STORES متاجر مختلفة على الأقل.
 * - إذا تطابقت الأسعار حرفيًا في كل المتاجر يُعتبر غير مستقل ويُخفى.
 * - يُستبعد السعر الشاذ (يبتعد عن الوسيط أكثر من 15%).
 * - السعر العادل = متوسط الأسعار الموثقة غير الشاذة (محرك market.ts المشترك).
 *
 * حاليًا جميع الأسعار غير موثقة، لذلك يكون السعر العادل مخفيًا تلقائيًا.
 * يظهر تلقائيًا بمجرد اعتماد أسعار من مصادر موثوقة (تغيير الحالة إلى
 * "verified")، دون أي تعديل في الواجهة.
 */

import { summarizeMarket } from "./market";
import type { VerificationStatus } from "../trust";

export const MIN_VERIFIED_STORES = 3;

export type ValuationOffer = {
  store: string;
  price: number | null;
  verificationStatus?: VerificationStatus;
};

export type ElectronicsFairPriceStatus =
  | "available"
  /** توجد أسعار لكن لم يُتحقق من أي منها */
  | "unverified-data"
  /** أسعار موثقة من عدد متاجر أقل من الحد الأدنى */
  | "not-enough-data"
  /** الأسعار الموثقة متطابقة حرفيًا: لا يمكن التأكد من استقلاليتها */
  | "not-independent";

export type ElectronicsFairPrice = {
  fairPrice: number | null;
  status: ElectronicsFairPriceStatus;
  verifiedStores: number;
  totalOffers: number;
};

function isValidPrice(p: number | null): p is number {
  return typeof p === "number" && Number.isFinite(p) && p > 0;
}

export function electronicsFairPrice(
  offers: ValuationOffer[]
): ElectronicsFairPrice {
  const totalOffers = offers.filter((o) => isValidPrice(o.price)).length;
  // نفس محرك مقارنة السوق المشترك (market.ts): موثق فقط، سعر واحد لكل متجر، استبعاد الشاذ، 3 مصادر
  const m = summarizeMarket(
    offers.map((o) => ({ storeId: o.store, storeAr: o.store, price: o.price, verified: o.verificationStatus === "verified" }))
  );
  return { fairPrice: m.fairPrice, status: m.status, verifiedStores: m.verifiedSources, totalOffers };
}

export function fairPriceUnavailableReason(
  status: ElectronicsFairPriceStatus
): string {
  switch (status) {
    case "unverified-data":
      return "السعر العادل مخفي مؤقتًا لأن جميع الأسعار لم يتم التحقق منها بعد.";
    case "not-enough-data":
      return `السعر العادل مخفي لعدم توفر أسعار موثقة كافية (يلزم ${MIN_VERIFIED_STORES} متاجر على الأقل).`;
    case "not-independent":
      return "السعر العادل مخفي لأن الأسعار الموثقة متطابقة ولا يمكن التأكد من استقلالية مصادرها.";
    default:
      return "";
  }
}

export type Saving = {
  /** موجب = السعر المعروض أقل من العادل (توفير) */
  amount: number;
  percent: number;
  verdict: "below-fair" | "at-fair" | "above-fair";
};

/** هامش ±2% يُعتبر "ضمن السعر العادل" */
export const AT_FAIR_TOLERANCE_PERCENT = 2;

/**
 * التوفير = السعر العادل الموثوق − السعر المعروض.
 * يعيد null إذا لم يتوفر سعر عادل موثوق أو سعر معروض صالح.
 */
export function computeSaving(
  fairPrice: number | null,
  displayedPrice: number | null | undefined
): Saving | null {
  if (fairPrice === null || !isValidPrice(fairPrice)) return null;
  if (displayedPrice === undefined || !isValidPrice(displayedPrice)) return null;

  const amount = fairPrice - displayedPrice;
  const percent = (amount / fairPrice) * 100;

  const verdict =
    Math.abs(percent) <= AT_FAIR_TOLERANCE_PERCENT
      ? "at-fair"
      : amount > 0
      ? "below-fair"
      : "above-fair";

  return { amount, percent, verdict };
}
