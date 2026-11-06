/**
 * سجل الأسعار — إلحاقي فقط (append-only).
 *
 * - لا تُعدّل أي ملاحظة سعر ولا تُحذف بعد إضافتها.
 * - إعادة استيراد نفس الملف لا تكرر الملاحظات (معرّف حتمي).
 * - تغيير حالة التحقق يتم بإضافة "حدث" جديد، والحالة الفعلية = آخر حدث.
 * - التقييم يأخذ آخر سعر لكل متجر فقط، للمنتجات الجديدة فقط،
 *   والموثقة فقط، فلا يُحتسب المتجر أكثر من مرة.
 *
 * هذا الملف منطق خالص: التخزين الدائم ينتظر قرار قاعدة البيانات.
 */

import type { VerificationStatus } from "../trust";
import type { ValuationOffer } from "../valuation/electronics";
import type { Condition, NormalizedOffer, PriceObservation, VerificationEvent } from "./types";

/** بصمة حتمية قصيرة (FNV-1a مزدوج 32 بت) — للتعرف على التكرار وليست للأمان */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/**
 * نفس المتجر + نفس المنتج الخارجي + نفس السعر + نفس وقت التحديث من المصدر
 * = نفس الملاحظة. أي تغيّر في السعر أو وقت التحديث = ملاحظة جديدة.
 */
export function observationId(o: Pick<NormalizedOffer, "storeKey" | "externalId" | "url" | "price" | "condition" | "sourceUpdatedAt">): string {
  return stableHash(
    [o.storeKey, o.externalId ?? o.url, o.price.toFixed(2), o.condition, o.sourceUpdatedAt ?? "no-date"].join("|")
  );
}

export function toObservation(
  offer: NormalizedOffer,
  productId: number | null,
  importId: string,
  importedAt: string
): PriceObservation {
  return {
    id: observationId(offer),
    sourceId: offer.sourceId,
    storeKey: offer.storeKey,
    store: offer.store,
    externalId: offer.externalId,
    productId,
    name: offer.name,
    price: offer.price,
    currency: "SAR",
    condition: offer.condition,
    availability: offer.availability,
    url: offer.url,
    sourceUpdatedAt: offer.sourceUpdatedAt,
    importedAt,
    importId,
    initialStatus: "unverified",
  };
}

/**
 * يضيف ملاحظات جديدة دون المساس بالقديمة.
 * يعيد مصفوفة جديدة (القديمة لا تتغير) مع إحصاء المضاف والمكرر.
 */
export function appendObservations(
  existing: readonly PriceObservation[],
  incoming: readonly PriceObservation[]
): { history: PriceObservation[]; added: number; duplicates: number } {
  const seen = new Set(existing.map((o) => o.id));
  const history = [...existing];
  let added = 0;
  let duplicates = 0;
  for (const o of incoming) {
    if (seen.has(o.id)) {
      duplicates++;
      continue;
    }
    seen.add(o.id);
    history.push(Object.freeze({ ...o }));
    added++;
  }
  return { history, added, duplicates };
}

/** يضيف حدث تحقق (لا يحذف الأحداث السابقة) */
export function appendVerification(
  events: readonly VerificationEvent[],
  event: VerificationEvent
): VerificationEvent[] {
  return [...events, Object.freeze({ ...event })];
}

/** الحالة الفعلية للملاحظة = آخر حدث، وإلا "غير موثق" */
export function effectiveStatus(
  observationId: string,
  events: readonly VerificationEvent[]
): VerificationStatus {
  let latest: VerificationEvent | null = null;
  for (const e of events) {
    if (e.observationId !== observationId) continue;
    if (!latest || e.at >= latest.at) latest = e;
  }
  return latest?.status ?? "unverified";
}

function recency(o: PriceObservation): string {
  return o.sourceUpdatedAt ?? o.importedAt;
}

/**
 * يجهّز عروض محرك السعر العادل لمنتج واحد:
 * - المنتج الجديد فقط (المستعمل والمجدد منفصلان)
 * - آخر ملاحظة لكل متجر فقط (لا يُحتسب المتجر مرتين حتى لو جاء من شبكتين)
 * - الحالة الفعلية من أحداث التحقق؛ المحرك نفسه يستبعد غير الموثق
 */
export function valuationOffersFor(
  productId: number,
  history: readonly PriceObservation[],
  events: readonly VerificationEvent[],
  condition: Condition = "new"
): ValuationOffer[] {
  const latestByStore = new Map<string, PriceObservation>();
  for (const o of history) {
    if (o.productId !== productId || o.condition !== condition) continue;
    const prev = latestByStore.get(o.storeKey);
    if (!prev || recency(o) > recency(prev) || (recency(o) === recency(prev) && o.importedAt > prev.importedAt)) {
      latestByStore.set(o.storeKey, o);
    }
  }
  return [...latestByStore.values()].map((o) => ({
    store: o.storeKey,
    price: o.price,
    verificationStatus: effectiveStatus(o.id, events),
  }));
}
