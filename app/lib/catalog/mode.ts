import { withPreviewDefaults } from "../previewDefaults";
import type { DataSource } from "./types";

/**
 * مصدر بيانات الموقع:
 * - "static" (الافتراضي): نفس سلوك الموقع الحالي تمامًا، من ملفات app/data.
 * - "db": نسخة MVP المحلية — المنتجات والأسعار من قاعدة البيانات.
 */
export function dataSource(): DataSource {
  const env = withPreviewDefaults(process.env);
  return env.TP_DATA_SOURCE === "db" && env.DATABASE_URL ? "db" : "static";
}

/**
 * في وضع db: هل تُعرض الأسعار المرجعية القديمة (غير الموثقة) في قسم منفصل؟
 * تُعرض بوضوح أنها غير معتمدة ولا تدخل في أي حساب. لتطبيق قاعدة
 * "اعتماد الأسعار قبل عرضها" حرفيًا: TP_SHOW_LEGACY_REFERENCE=off
 */
export function showLegacyReference(): boolean {
  return process.env.TP_SHOW_LEGACY_REFERENCE !== "off";
}

/** المعرّف العام للمنتجات الجديدة (غير الموروثة): يبقى رقميًا ولا يتصادم مع legacy_id */
export const NEW_PRODUCT_ID_OFFSET = 900_000;

export function publicIdOf(dbId: number, legacyId: number | null): number {
  return legacyId ?? NEW_PRODUCT_ID_OFFSET + dbId;
}
