/**
 * دخول المعاينة المحلية للوحة الإدارة — للتجربة المحلية فقط.
 *
 * ليس نظام الدخول النهائي: الإنتاج سيستخدم Supabase Auth مع التحقق الثنائي (aal2).
 * هنا يختار المختبِر أحد مستخدمي الاختبار المسجلين في القاعدة المحلية، ويحمل
 * المتصفح ملف تعريف موقّعًا (HMAC) بسر يُولَّد محليًا في .local/ ولا يُحفظ في Git.
 * الصلاحيات نفسها لا تُقرأ من المتصفح: تحددها القاعدة من user_roles عند كل عملية.
 *
 * يعمل فقط إذا: TP_PREVIEW_AUTH=on و TP_DATA_SOURCE=db وسر بطول كافٍ، وخارج Vercel.
 */
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { DbClaims } from "../db/pool";

export const PREVIEW_COOKIE = "tp_preview_session";
const MAX_AGE_SECONDS = 8 * 60 * 60;

/** مستخدمو الاختبار المحليون (db/local/003_local_preview_users.sql) */
export const PREVIEW_USERS = [
  { id: "00000000-0000-4000-8000-0000000000a1", name: "مشرف تجريبي أ", role: "admin", note: "يضيف المنتجات والمتاجر ويستورد الأسعار" },
  { id: "00000000-0000-4000-8000-0000000000a2", name: "مشرف تجريبي ب", role: "admin", note: "مشرف ثانٍ (للاعتماد بمبدأ العينين)" },
  { id: "00000000-0000-4000-8000-0000000000b1", name: "مراجع تجريبي", role: "reviewer", note: "يعتمد الأسعار أو يرفضها فقط" },
] as const;

export type PreviewUserId = (typeof PREVIEW_USERS)[number]["id"];

function secret(): string | null {
  const s = process.env.TP_PREVIEW_SESSION_SECRET ?? "";
  return s.length >= 32 ? s : null;
}

export function previewAuthEnabled(): boolean {
  return (
    process.env.TP_PREVIEW_AUTH === "on" &&
    process.env.TP_DATA_SOURCE === "db" &&
    !process.env.VERCEL &&
    secret() !== null
  );
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** قيمة ملف التعريف: uid.expires.signature */
export function makeSessionValue(uid: string, nowMs: number, key = secret()): string {
  if (!key) throw new Error("preview auth is not configured");
  const exp = Math.floor(nowMs / 1000) + MAX_AGE_SECONDS;
  const payload = `${uid}.${exp}`;
  return `${payload}.${sign(payload, key)}`;
}

export function readSessionValue(value: string | undefined, nowMs: number, key = secret()): string | null {
  if (!value || !key) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [uid, exp, sig] = parts;
  const expected = Buffer.from(sign(`${uid}.${exp}`, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 <= nowMs) return null;
  if (!PREVIEW_USERS.some((u) => u.id === uid)) return null;
  return uid;
}

/** هوية الجلسة على الخادم (لا تُقبل من حقول النماذج أبدًا) */
export async function currentClaims(): Promise<DbClaims | null> {
  if (!previewAuthEnabled()) return null;
  const store = await cookies();
  const uid = readSessionValue(store.get(PREVIEW_COOKIE)?.value, Date.now());
  // دخول المعاينة يحاكي جلسة اجتازت التحقق الثنائي (aal2) — Supabase Auth لاحقًا
  return uid ? { sub: uid, aal: "aal2" } : null;
}

export function previewUser(uid: string | undefined | null) {
  return PREVIEW_USERS.find((u) => u.id === uid) ?? null;
}

export const SESSION_MAX_AGE_SECONDS = MAX_AGE_SECONDS;
