/**
 * أنواع موصّل استيراد الأسعار (المرحلة 1).
 *
 * كل شيء هنا منطق خالص بدون تخزين: يأخذ ملفًا ويعيد نتائج.
 * التخزين الدائم (المصادر، سجل الأسعار، سجل الاستيراد) ينتظر قرار
 * قاعدة البيانات — انظر docs/phase-1-storage-options.md
 */

import type { VerificationStatus } from "../trust";

export type FeedFormat = "csv" | "google-merchant" | "yml" | "xml";

export type Availability = "in_stock" | "out_of_stock" | "preorder" | "unknown";

export type Condition = "new" | "used" | "refurbished";

/** الحقول الموحّدة التي نحاول قراءتها من أي ملف */
export type CanonicalField =
  | "externalId"
  | "name"
  | "price"
  | "salePrice"
  | "currency"
  | "url"
  | "store"
  | "gtin"
  | "mpn"
  | "brand"
  | "availability"
  | "condition"
  | "updatedAt";

/** صف خام بعد القراءة: مفاتيحه أسماء الأعمدة كما في الملف */
export type RawRecord = Record<string, string>;

/** إعداد مصدر بيانات (يُضاف بعد الحصول على الملف أو الصلاحية فقط) */
export type SourceConfig = {
  /** معرّف ثابت مثل "admitad-store-x" */
  id: string;
  name: string;
  kind: "affiliate_network" | "store_feed" | "manual_upload";
  /** اسم الشبكة إن وُجدت (Admitad / ArabClicks ...) — للعرض فقط */
  network?: string;
  /** اسم المتجر إذا كان الملف لا يحتوي عمود متجر */
  defaultStore?: string;
  /** العملة الافتراضية إذا لم تُذكر في الملف (لا تُستخدم إلا إذا حُددت صراحة) */
  defaultCurrency?: string;
  /** ربط أعمدة خاصة بهذا المصدر بالحقول الموحّدة */
  columnMap?: Partial<Record<CanonicalField, string>>;
};

export type IssueSeverity = "error" | "warning";

export type ImportIssue = {
  row: number;
  field?: CanonicalField;
  severity: IssueSeverity;
  code: string;
  message: string;
};

/** عرض سعر صالح بعد التوحيد والتحقق */
export type NormalizedOffer = {
  row: number;
  sourceId: string;
  externalId: string | null;
  name: string;
  /** السعر المعتمد للعرض (سعر التخفيض إن وُجد وكان أقل) */
  price: number;
  /** السعر الأصلي قبل التخفيض إن وُجد */
  listPrice: number | null;
  currency: "SAR";
  url: string;
  store: string;
  /** مفتاح موحّد للمتجر لمنع احتسابه أكثر من مرة */
  storeKey: string;
  gtin: string | null;
  mpn: string | null;
  brand: string | null;
  availability: Availability;
  condition: Condition;
  /** آخر تحديث للسعر كما ذكره المصدر (ISO) أو null إن لم يُذكر */
  sourceUpdatedAt: string | null;
};

export type MatchMethod = "gtin" | "model" | "name";

export type MatchCandidate = {
  productId: number;
  label: string;
  score: number;
  reasons: string[];
};

export type MatchResult =
  | {
      status: "matched";
      method: Exclude<MatchMethod, "name">;
      productId: number;
      label: string;
    }
  | {
      /** لا يُدمج تلقائيًا: يذهب لقائمة المراجعة اليدوية */
      status: "needs_review";
      reason: string;
      candidates: MatchCandidate[];
    }
  | {
      status: "unmatched";
      reason: string;
    };

/** ملاحظة سعر واحدة في السجل (لا تُعدّل ولا تُحذف أبدًا) */
export type PriceObservation = {
  /** معرّف حتمي يمنع تكرار نفس الملاحظة عند إعادة استيراد نفس الملف */
  id: string;
  sourceId: string;
  storeKey: string;
  store: string;
  externalId: string | null;
  /** المنتج في الكتالوج إن تمت المطابقة المؤكدة، وإلا null */
  productId: number | null;
  name: string;
  price: number;
  currency: "SAR";
  condition: Condition;
  availability: Availability;
  url: string;
  sourceUpdatedAt: string | null;
  importedAt: string;
  importId: string;
  /** الحالة الابتدائية دائمًا "unverified"؛ التغيير يتم عبر أحداث منفصلة */
  initialStatus: "unverified";
};

/** حدث تغيير حالة التحقق (سجل إلحاقي — لا يستبدل الملاحظة الأصلية) */
export type VerificationEvent = {
  observationId: string;
  status: VerificationStatus;
  at: string;
  by: string;
  note?: string;
};
