/**
 * قيم افتراضية لنسخة معاينة Vercel لفرع mvp-live-preview فقط — قيم عامة بلا أي سر.
 *
 * الهدف: يكفي ضبط متغير سري واحد على Vercel (DATABASE_URL) لتعمل المعاينة كاملة.
 *   - رابط مشروع Supabase والمفتاح العام (publishable): مصممان للمتصفح، ليسا سرًا.
 *   - فتح لوحة الإدارة في المعاينة (الدخول نفسه يبقى: بريد + كلمة مرور + تحقق ثنائي إلزامي).
 *   - وضع القاعدة يُفعَّل فقط إذا وُجد DATABASE_URL.
 * أي متغير مضبوط صراحةً على Vercel يتغلب على هذه القيم.
 *
 * لا ينطبق على الإنتاج (الموقع الرسمي) ولا على أي فرع آخر ولا محليًا: هناك تبقى المتغيرات الصريحة إلزامية.
 * يعتمد على متغيرات Vercel النظامية VERCEL_ENV و VERCEL_GIT_COMMIT_REF؛ إن غابت لا تُطبَّق أي قيمة.
 */
export const PREVIEW_BRANCH = "mvp-live-preview";
export const PREVIEW_SUPABASE_URL = "https://xlpzfnespldgaxkgskkg.supabase.co";
export const PREVIEW_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_x9MTmavYWxcG1dtO2NdvEg_Aa3ieVFz";

type Env = Record<string, string | undefined>;

export function isBranchPreview(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === PREVIEW_BRANCH;
}

export function withPreviewDefaults(env: Env = process.env): Env {
  if (!isBranchPreview(env)) return env;
  const hasKey = !!(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return {
    ...env,
    TP_DATA_SOURCE: env.TP_DATA_SOURCE || (env.DATABASE_URL ? "db" : undefined),
    TRUEPRICE_ADMIN_PREVIEW: env.TRUEPRICE_ADMIN_PREVIEW || "on",
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL || PREVIEW_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: hasKey ? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : PREVIEW_SUPABASE_PUBLISHABLE_KEY,
  };
}
