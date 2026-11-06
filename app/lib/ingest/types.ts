/**
 * أنواع موصّل استيراد الأسعار (المرحلة 1).
 *
 * كل شيء هنا منطق خالص بدون تخزين: يأخذ ملفًا ويعيد نتائج.
 * التخزين الدائم ينتظر قرار قاعدة البيانات — docs/phase-1-storage-options.md
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
  | "seller"
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
  /**
   * معرّف ثابت يكتبه المشرف مرة واحدة (أحرف لاتينية صغيرة وأرقام وشرطة).
   * لا يُشتق من الاسم، فتغيير اسم المصدر لا يغيّر هويته.
   */
  id: string;
  name: string;
  kind: "affiliate_network" | "store_feed" | "manual_upload";
  /** اسم الشبكة إن وُجدت (Admitad / ArabClicks ...) — للعرض فقط */
  network?: string;
  /** معرّف المتجر الثابت إذا كان الملف لمتجر واحد ولا يذكره */
  storeId?: string;
  /** اسم المتجر إذا كان الملف لا يحتوي عمود متجر (يُطابق مع سجل المتاجر) */
  defaultStore?: string;
  /** العملة الافتراضية إذا لم تُذكر في الملف (لا تُستخدم إلا إذا حُددت صراحة) */
  defaultCurrency?: string;
  /**
   * المنطقة الزمنية (IANA مثل "Asia/Riyadh") للتواريخ التي لا تحمل منطقة.
   * إن لم تُحدد: التواريخ بلا منطقة تُتجاهل بتحذير ولا تُخمَّن.
   */
  timeZone?: string;
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

/** مبلغ بعملته الأصلية كما ورد في الملف */
export type Money = {
  amount: number;
  /** رمز ISO 4217 */
  currency: string;
};

/** بيانات تحويل العملة (للمستقبل — لا يوجد تحويل حاليًا) */
export type FxConversion = {
  rate: number;
  source: string;
  /** تاريخ سعر الصرف (UTC ISO) */
  asOf: string;
};

/** تاريخ موحّد على UTC مع المنطقة الأصلية */
export type ParsedTimestamp = {
  /** الوقت بتوقيت UTC (ISO) */
  utc: string;
  /** الإزاحة الأصلية كما وردت أو كما حُسبت ("+03:00" / "Z") */
  originalOffset: string;
  /** إذا لم تحمل القيمة منطقة واستُخدمت منطقة المصدر المعلنة */
  assumedTimeZone: string | null;
};

/** عرض سعر صالح بعد التوحيد والتحقق */
export type NormalizedOffer = {
  row: number;
  sourceId: string;
  externalId: string | null;
  name: string;
  /** السعر المعروض بالعملة الأصلية (سعر الخصم إن وُجد وكان أقل) */
  price: Money;
  /** السعر الأصلي قبل الخصم بالعملة الأصلية */
  listPrice: Money | null;
  /** السعر بالريال إن كانت العملة الأصلية ريالًا، وإلا null حتى يُعتمد تحويل */
  sarPrice: number | null;
  sarListPrice: number | null;
  fx: FxConversion | null;
  url: string;
  /** الرابط الفعلي للمتجر بعد إزالة روابط التتبع وبارامترات الحملات */
  canonicalUrl: string;
  /** اسم المتجر كما ورد */
  storeName: string;
  /** معرّف المتجر الثابت من سجل المتاجر، أو null إذا كان الاسم يحتاج مراجعة */
  storeId: string | null;
  /** البائع داخل المتجر (للمتاجر متعددة البائعين) */
  sellerName: string | null;
  sellerKey: string | null;
  gtin: string | null;
  mpn: string | null;
  brand: string | null;
  availability: Availability;
  condition: Condition;
  /** آخر تحديث للسعر كما ذكره الصف نفسه */
  sourceUpdatedAt: ParsedTimestamp | null;
  /** وقت توليد الملف ككل (ليس وقت تحديث السعر) */
  feedGeneratedAt: ParsedTimestamp | null;
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

/** مقترح اسم بديل لمتجر غير معروف — يراجعه المشرف */
export type StoreAliasProposal = {
  rawName: string;
  normalized: string;
  suggestedStoreId: string | null;
  reason: string;
  rows: number[];
};

/**
 * حالة سعر واحدة (لا تُعدّل ولا تُحذف أبدًا).
 * تُنشأ حالة جديدة فقط عند تغيّر السعر أو العملة أو السعر الأصلي.
 */
export type PriceObservation = {
  id: string;
  /** هوية العرض: متجر + بائع + منتج خارجي + حالة المنتج */
  streamKey: string;
  sourceId: string;
  storeId: string;
  storeName: string;
  sellerKey: string | null;
  sellerName: string | null;
  externalId: string | null;
  productId: number | null;
  name: string;
  price: Money;
  listPrice: Money | null;
  sarPrice: number | null;
  sarListPrice: number | null;
  fx: FxConversion | null;
  condition: Condition;
  /** أول مرة رأينا فيها هذا السعر */
  firstSeenAt: string;
  /** "اعتبارًا من" عند الإنشاء: وقت تحديث المصدر، أو وقت الملف، أو وقت الجمع */
  firstAsOf: string;
  importId: string;
  initialStatus: "unverified";
};

/** حدث في سجل العرض (إلحاقي) */
export type HistoryEvent =
  | { kind: "first_seen"; streamKey: string; observationId: string; at: string; importId: string }
  | { kind: "price_changed"; streamKey: string; observationId: string; previousObservationId: string; at: string; importId: string }
  | { kind: "availability_changed"; streamKey: string; observationId: string; from: Availability; to: Availability; at: string; importId: string }
  | { kind: "url_changed"; streamKey: string; observationId: string; from: string; to: string; at: string; importId: string };

/** آخر ظهور للعرض (مؤشر يتحدث — ليس سجلًا تاريخيًا للسعر) */
export type StreamPointer = {
  observationId: string;
  availability: Availability;
  /** آخر رابط خام (قد يحمل بارامترات تتبع متغيرة) */
  url: string;
  /** الرابط الموحّد — تغيّره فقط يُسجَّل كحدث */
  canonicalUrl: string;
  lastSeenAt: string;
  lastAsOf: string;
  lastImportId: string;
};

/** حدث تغيير حالة التحقق (سجل إلحاقي — لا يستبدل الملاحظة الأصلية) */
export type VerificationEvent = {
  observationId: string;
  status: VerificationStatus;
  at: string;
  by: string;
  note?: string;
};
