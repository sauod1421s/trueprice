/**
 * سجل الأسعار.
 *
 * النموذج:
 * - "مسار عرض" (stream) = متجر + بائع + منتج خارجي + حالة المنتج.
 * - "حالة سعر" (PriceObservation) لا تُعدّل ولا تُحذف؛ تُنشأ حالة جديدة فقط
 *   عند تغيّر السعر أو السعر الأصلي أو العملة.
 * - "أحداث" إلحاقية: أول ظهور، تغيّر السعر، تغيّر التوفر، تغيّر الرابط.
 * - "مؤشر آخر ظهور" لكل مسار: يتحدث عند رؤية نفس السعر مجددًا (ليس سجلًا
 *   تاريخيًا للسعر)، فلا تُنشأ سجلات مكررة بلا داعٍ.
 * - الملف القديم (وقته أقدم من آخر ما رأيناه) لا يعيد السعر للخلف.
 * - نفس الملف مرتين لا يغيّر شيئًا (بصمة المحتوى).
 *
 * منطق خالص بدون تخزين: الدوال تعيد حالة جديدة ولا تعدّل القديمة.
 */

import type { VerificationStatus } from "../trust";
import type { ValuationOffer } from "../valuation/electronics";
import type {
  Condition,
  HistoryEvent,
  NormalizedOffer,
  PriceObservation,
  StreamPointer,
  VerificationEvent,
} from "./types";

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
 * مفتاح ثابت للعرض داخل المتجر: المعرّف الخارجي، ثم الباركود، ثم الرابط
 * الفعلي، ثم الاسم. رابط التتبع نفسه لا يدخل في الهوية.
 */
export function offerKeyOf(o: Pick<NormalizedOffer, "externalId" | "gtin" | "canonicalUrl" | "name">): string {
  if (o.externalId) return `ext:${o.externalId}`;
  if (o.gtin) return `gtin:${o.gtin}`;
  if (o.canonicalUrl) return `url:${o.canonicalUrl}`;
  return `name:${o.name.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export function streamKeyOf(o: Pick<NormalizedOffer, "storeId" | "sellerKey" | "externalId" | "gtin" | "canonicalUrl" | "name" | "condition">): string {
  return stableHash([o.storeId ?? "?", o.sellerKey ?? "-", offerKeyOf(o), o.condition].join("|"));
}

/** "اعتبارًا من": وقت تحديث الصف، ثم وقت توليد الملف، ثم وقت الجمع */
export function asOfOf(o: Pick<NormalizedOffer, "sourceUpdatedAt" | "feedGeneratedAt">, importedAt: string): string {
  return o.sourceUpdatedAt?.utc ?? o.feedGeneratedAt?.utc ?? importedAt;
}

function samePriceState(o: PriceObservation, n: NormalizedOffer): boolean {
  return (
    o.price.amount === n.price.amount &&
    o.price.currency === n.price.currency &&
    (o.listPrice?.amount ?? null) === (n.listPrice?.amount ?? null)
  );
}

export type HistoryState = {
  readonly observations: readonly PriceObservation[];
  readonly events: readonly HistoryEvent[];
  readonly pointers: Readonly<Record<string, StreamPointer>>;
  /** بصمات الملفات المستوردة (sourceId|contentHash) */
  readonly importedFiles: readonly string[];
  readonly verifications: readonly VerificationEvent[];
};

export const EMPTY_HISTORY: HistoryState = {
  observations: [],
  events: [],
  pointers: {},
  importedFiles: [],
  verifications: [],
};

export type ApplyStats = {
  duplicateFile: boolean;
  newObservations: number;
  priceChanges: number;
  availabilityChanges: number;
  urlChanges: number;
  refreshed: number;
  staleIgnored: number;
  skippedPendingStore: number;
};

export type ApplyInput = {
  sourceId: string;
  contentHash: string;
  importId: string;
  importedAt: string;
  rows: readonly { offer: NormalizedOffer; productId: number | null }[];
};

/**
 * يطبّق نتيجة استيراد على السجل ويعيد حالة جديدة.
 * الحالة القديمة لا تتغير، والملاحظات والأحداث القديمة لا تُحذف.
 */
export function applyImport(state: HistoryState, input: ApplyInput): { state: HistoryState; stats: ApplyStats } {
  const stats: ApplyStats = {
    duplicateFile: false,
    newObservations: 0,
    priceChanges: 0,
    availabilityChanges: 0,
    urlChanges: 0,
    refreshed: 0,
    staleIgnored: 0,
    skippedPendingStore: 0,
  };

  const fileKey = `${input.sourceId}|${input.contentHash}`;
  if (state.importedFiles.includes(fileKey)) {
    return { state, stats: { ...stats, duplicateFile: true } };
  }

  const observations = [...state.observations];
  const events = [...state.events];
  const pointers: Record<string, StreamPointer> = { ...state.pointers };
  const byId = new Map(observations.map((o) => [o.id, o]));

  for (const { offer, productId } of input.rows) {
    if (!offer.storeId) {
      stats.skippedPendingStore++;
      continue;
    }
    const streamKey = streamKeyOf(offer);
    const asOf = asOfOf(offer, input.importedAt);
    const pointer = pointers[streamKey];
    const base = { streamKey, at: input.importedAt, importId: input.importId };

    const createObservation = (): PriceObservation => {
      const o: PriceObservation = Object.freeze({
        id: stableHash(`${streamKey}|${offer.price.amount}|${offer.price.currency}|${offer.listPrice?.amount ?? "-"}|${asOf}`),
        streamKey,
        sourceId: offer.sourceId,
        storeId: offer.storeId!,
        storeName: offer.storeName,
        sellerKey: offer.sellerKey,
        sellerName: offer.sellerName,
        externalId: offer.externalId,
        productId,
        name: offer.name,
        price: offer.price,
        listPrice: offer.listPrice,
        sarPrice: offer.sarPrice,
        sarListPrice: offer.sarListPrice,
        fx: offer.fx,
        condition: offer.condition,
        firstSeenAt: input.importedAt,
        firstAsOf: asOf,
        importId: input.importId,
        initialStatus: "unverified",
      });
      observations.push(o);
      byId.set(o.id, o);
      stats.newObservations++;
      return o;
    };

    const newPointer = (observationId: string): StreamPointer =>
      Object.freeze({
        observationId,
        availability: offer.availability,
        url: offer.url,
        canonicalUrl: offer.canonicalUrl,
        lastSeenAt: input.importedAt,
        lastAsOf: asOf,
        lastImportId: input.importId,
      });

    if (!pointer) {
      const o = createObservation();
      events.push({ kind: "first_seen", observationId: o.id, ...base });
      pointers[streamKey] = newPointer(o.id);
      continue;
    }

    // ملف أقدم مما رأيناه: لا يعيد السعر للخلف
    if (Date.parse(asOf) < Date.parse(pointer.lastAsOf)) {
      stats.staleIgnored++;
      continue;
    }

    const current = byId.get(pointer.observationId)!;
    if (!samePriceState(current, offer)) {
      const o = createObservation();
      events.push({ kind: "price_changed", observationId: o.id, previousObservationId: current.id, ...base });
      stats.priceChanges++;
      pointers[streamKey] = newPointer(o.id);
      continue;
    }

    // نفس السعر: نسجل التغيّرات الأخرى فقط ونحدّث آخر ظهور
    if (pointer.availability !== offer.availability) {
      events.push({ kind: "availability_changed", observationId: current.id, from: pointer.availability, to: offer.availability, ...base });
      stats.availabilityChanges++;
    }
    // نقارن الرابط الموحّد: تغيّر بارامترات التتبع وحدها لا يُنشئ حدثًا
    if (pointer.canonicalUrl !== offer.canonicalUrl) {
      events.push({ kind: "url_changed", observationId: current.id, from: pointer.canonicalUrl, to: offer.canonicalUrl, ...base });
      stats.urlChanges++;
    }
    pointers[streamKey] = newPointer(current.id);
    stats.refreshed++;
  }

  return {
    state: {
      observations,
      events,
      pointers,
      importedFiles: [...state.importedFiles, fileKey],
      verifications: state.verifications,
    },
    stats,
  };
}

/* ---------------------------------------------------------------
   التحقق
--------------------------------------------------------------- */

/** يضيف حدث تحقق (لا يحذف الأحداث السابقة) */
export function appendVerification(state: HistoryState, event: VerificationEvent): HistoryState {
  return { ...state, verifications: [...state.verifications, Object.freeze({ ...event })] };
}

/** الحالة الفعلية = آخر حدث بالوقت (مقارنة زمنية وليست نصية)، وإلا "غير موثق" */
export function effectiveStatus(observationId: string, events: readonly VerificationEvent[]): VerificationStatus {
  let latest: VerificationEvent | null = null;
  let latestMs = -Infinity;
  for (const e of events) {
    if (e.observationId !== observationId) continue;
    const ms = Date.parse(e.at);
    if (Number.isNaN(ms)) continue;
    if (ms >= latestMs) {
      latest = e;
      latestMs = ms;
    }
  }
  return latest?.status ?? "unverified";
}

/* ---------------------------------------------------------------
   الربط مع محرك السعر العادل
--------------------------------------------------------------- */

/** سياسة عمر السعر: السعر الذي لم يُرَ منذ أكثر من هذه المدة لا يدخل التقييم */
export const DEFAULT_MAX_PRICE_AGE_DAYS = 14;

export type ValuationPolicy = {
  /** الوقت الحالي (UTC ISO) — يُمرر صراحة لتكون النتائج قابلة للاختبار */
  now: string;
  maxAgeDays?: number;
  condition?: Condition;
  /** استبعاد العروض غير المتوفرة (افتراضيًا نعم) */
  excludeOutOfStock?: boolean;
};

export type ExcludedReason = "stale" | "out_of_stock" | "not_sar" | "other_condition";

/**
 * يجهّز عروض محرك السعر العادل لمنتج واحد:
 * - السعر الحالي فقط لكل مسار (الحالات القديمة المستبدلة لا تدخل)
 * - المنتج الجديد فقط افتراضيًا (المستعمل والمجدد منفصلان)
 * - الريال فقط (العملات غير المحولة لا تدخل)
 * - السعر الحديث فقط حسب سياسة العمر
 * - المتجر هو وحدة الاستقلالية: عدة بائعين في متجر واحد = متجر واحد
 *   (المحرك يأخذ أقل سعر موثق لكل متجر)
 * - حالة التحقق الفعلية من الأحداث؛ المحرك نفسه يستبعد غير الموثق
 */
export function valuationOffersFor(
  productId: number,
  state: HistoryState,
  policy: ValuationPolicy
): { offers: ValuationOffer[]; excluded: { observationId: string; reason: ExcludedReason }[] } {
  const maxAgeMs = (policy.maxAgeDays ?? DEFAULT_MAX_PRICE_AGE_DAYS) * 86_400_000;
  const nowMs = Date.parse(policy.now);
  const condition = policy.condition ?? "new";
  const excludeOos = policy.excludeOutOfStock ?? true;
  const byId = new Map(state.observations.map((o) => [o.id, o]));

  const offers: ValuationOffer[] = [];
  const excluded: { observationId: string; reason: ExcludedReason }[] = [];

  for (const pointer of Object.values(state.pointers)) {
    const o = byId.get(pointer.observationId);
    if (!o || o.productId !== productId) continue;
    if (o.condition !== condition) {
      excluded.push({ observationId: o.id, reason: "other_condition" });
      continue;
    }
    if (o.sarPrice === null) {
      excluded.push({ observationId: o.id, reason: "not_sar" });
      continue;
    }
    if (nowMs - Date.parse(pointer.lastAsOf) > maxAgeMs) {
      excluded.push({ observationId: o.id, reason: "stale" });
      continue;
    }
    if (excludeOos && pointer.availability === "out_of_stock") {
      excluded.push({ observationId: o.id, reason: "out_of_stock" });
      continue;
    }
    offers.push({ store: o.storeId, price: o.sarPrice, verificationStatus: effectiveStatus(o.id, state.verifications) });
  }
  return { offers, excluded };
}
