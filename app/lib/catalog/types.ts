import type { PriceOffer, Product } from "../../data/products";

/** نقطة في سجل الأسعار العام (أسعار موثقة فقط — لا تُحذف ولا تُعدّل) */
export type PriceHistoryPoint = {
  observationId: number;
  storeId: string;
  storeAr: string;
  price: number;
  /** وقت السعر كما ذكره المصدر (UTC ISO) */
  asOf: string;
  verifiedAt: string | null;
  isCurrent: boolean;
};

/**
 * منتج كما تعرضه الواجهات، في الوضعين:
 * - static: من app/data/products.ts كما كان قبل MVP (بدون تغيير)
 * - db: من قاعدة البيانات؛ offers = الأسعار المعتمدة فقط
 */
export type CatalogProduct = Product & {
  /** بيانات عرض/اختبار — تظهر بشارة واضحة ولا تُفهرس */
  isDemo?: boolean;
  /**
   * الأسعار المرجعية القديمة (مُدخلة يدويًا، غير موثقة، تاريخها غير مؤكد).
   * في وضع db تُعرض منفصلة إن سُمح بذلك، ولا تدخل في أي حساب.
   */
  legacyReference?: PriceOffer[];
};

export type CatalogProductDetail = CatalogProduct & {
  history: PriceHistoryPoint[];
};

export type DataSource = "static" | "db";

export type SiteStats = {
  products: number;
  stores: number;
  carBrands: number;
  carModels: number;
};
