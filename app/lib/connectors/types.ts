/**
 * واجهة موحّدة لموصّلات مصادر الأسعار.
 *
 * كل موصّل يجلب البيانات من مصدر معتمد ويعيدها "ملفًا" بصيغة يفهمها محرك الاستيراد الحالي
 * (CSV / Google Merchant / YML / XML). بعدها يمر الملف بنفس المسار تمامًا: تحليل ← مطابقة
 * بمعرّف قاطع ← معاينة مختومة ← اعتماد بشري ← مراجعة كل سعر. لا يُنشر شيء تلقائيًا.
 *
 * الأسرار (مفاتيح API وروابط الملفات التي تحمل رموزًا) في متغيرات البيئة على الخادم فقط،
 * لا في القاعدة ولا في الكود ولا تصل للمتصفح.
 */
import type { FeedFormat } from "../ingest/types";
import type { FetchLike } from "./http";

export type ConnectorSource = {
  id: string;
  name: string;
  kind: string; // tp.source_kind
  storeId: string | null;
  networkId: string | null;
  status: string; // tp.source_status
  allowAutomated: boolean;
};

export type Env = Readonly<Record<string, string | undefined>>;

export type FetchedFeed = {
  fileName: string;
  format: FeedFormat | "auto";
  content: string;
  /** وقت الجلب الفعلي (ISO) */
  fetchedAt: string;
  /** ملخص للعرض والسجل — بلا أسرار */
  meta: Record<string, string | number>;
};

export type ConnectorContext = {
  source: ConnectorSource;
  env: Env;
  fetch?: FetchLike;
  now?: () => Date;
  /** رموز المنتجات لدى متجر المصدر المسجّلة في الكتالوج (مثل ASIN لأمازون) */
  storeSkus?: readonly string[];
  maxBytes?: number;
};

export interface Connector {
  id: string;
  label: string;
  /** هل يخدم هذا الموصّل هذا المصدر؟ */
  appliesTo(source: ConnectorSource): boolean;
  /** أسماء متغيرات البيئة الناقصة (أسماء فقط، لا قيم) */
  missingConfig(source: ConnectorSource, env: Env): string[];
  run(ctx: ConnectorContext): Promise<FetchedFeed>;
}

/** اسم متغير بيئة آمن من معرّف المصدر: "noon-arabclicks" → "NOON_ARABCLICKS" */
export function envKey(sourceId: string): string {
  return sourceId.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
