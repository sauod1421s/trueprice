/**
 * وضع دخول لوحة الإدارة (بلا أسرار):
 *   - "local-preview": دخول تجريبي محلي (TP_PREVIEW_AUTH=on مع قاعدة محلية، ولا يعمل على Vercel أبدًا).
 *   - "supabase": Supabase Auth (بريد + كلمة مرور + تحقق ثنائي TOTP)، ويتطلب TP_DATA_SOURCE=db.
 *   - "off": لا لوحة مرتبطة بقاعدة (الوضع العادي للموقع).
 *
 * المفتاح العام فقط (publishable/anon) يُسمح به هنا. أي مفتاح سري أو service_role في متغير عام
 * يُرفض ويُعطّل الدخول، حتى لا يُرسل إلى المتصفح خطأً.
 */
import { withPreviewDefaults } from "../previewDefaults";

export type AuthMode = "supabase" | "local-preview" | "off";

export type SupabasePublicConfig = { url: string; key: string };

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** true إن كان المفتاح سريًا ولا يجوز أن يصل إلى المتصفح */
export function isSecretSupabaseKey(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const payload = decodeJwtPayload(key);
  return payload?.role === "service_role";
}

export function supabasePublicConfig(rawEnv: Record<string, string | undefined> = process.env): SupabasePublicConfig | null {
  const env = withPreviewDefaults(rawEnv);
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !key) return null;
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(url)) return null;
  if (isSecretSupabaseKey(key)) return null;
  return { url, key };
}

export function authMode(rawEnv: Record<string, string | undefined> = process.env): AuthMode {
  const env = withPreviewDefaults(rawEnv);
  const dbMode = env.TP_DATA_SOURCE === "db";
  if (dbMode && env.TP_PREVIEW_AUTH === "on" && !env.VERCEL && (env.TP_PREVIEW_SESSION_SECRET ?? "").length >= 32) {
    return "local-preview";
  }
  if (dbMode && supabasePublicConfig(env)) return "supabase";
  return "off";
}
