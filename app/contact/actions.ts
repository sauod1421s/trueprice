"use server";

import { headers } from "next/headers";
import { clientIp } from "../lib/analytics/classify";
import { databaseConfigured } from "../lib/db/pool";
import { submitContactRequest, trackContactRequest, type TrackedRequest } from "../lib/support/db";
import {
  checkFormToken,
  friendlySupportError,
  normalizeReference,
  normalizeTrackingCode,
  parseContactForm,
} from "../lib/support/validate";

export type ContactValues = { subject: string; message: string; name: string; email: string; phone: string };

export type ContactState =
  | { status: "idle" }
  | { status: "error"; error: string; values?: ContactValues }
  | { status: "sent"; reference: string; trackingCode: string };

/** ما كتبه الزائر يعود للنموذج عند الخطأ حتى لا يضيع (مختصرًا لأطوال الحقول) */
function keep(fd: FormData): ContactValues {
  const g = (k: string, n: number) => (typeof fd.get(k) === "string" ? (fd.get(k) as string).slice(0, n) : "");
  return { subject: g("subject", 150), message: g("message", 4000), name: g("name", 100), email: g("email", 254), phone: g("phone", 20) };
}

/**
 * إرسال طلب: حقل مخفي للآليين، رمز زمن التعبئة الموقّع، تحقق المدخلات، ثم القاعدة
 * (تحقق ثانٍ + حد المعدل + منع التكرار). رمز المتابعة يُعرض مرة واحدة ولا يُحفظ إلا بصمته.
 */
export async function submitContact(_prev: ContactState, fd: FormData): Promise<ContactState> {
  if (!databaseConfigured()) return { status: "error", error: "النموذج غير متاح في هذه النسخة." };
  // الحقل المخفي: الإنسان لا يراه ولا يملؤه
  if (typeof fd.get("website") === "string" && (fd.get("website") as string).length > 0) {
    return { status: "error", error: "تعذر إرسال الطلب." };
  }
  const t = checkFormToken(fd.get("t"));
  if (t === "too_fast") return { status: "error", error: "أُرسل النموذج بسرعة غير طبيعية. انتظر لحظات وأعد الإرسال.", values: keep(fd) };
  if (t !== "ok") return { status: "error", error: "انتهت صلاحية النموذج. حدّث الصفحة وأعد الإرسال.", values: keep(fd) };
  const parsed = parseContactForm(fd);
  if (!parsed.ok) return { status: "error", error: parsed.error, values: keep(fd) };
  try {
    const ip = clientIp(await headers());
    const r = await submitContactRequest(ip, parsed.value);
    return { status: "sent", reference: r.reference, trackingCode: r.trackingCode };
  } catch (e) {
    console.error("contact: submit failed", (e as { code?: string }).code ?? (e as Error).name);
    return { status: "error", error: friendlySupportError(e), values: keep(fd) };
  }
}

export type TrackState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "found"; request: TrackedRequest };

export async function trackRequest(_prev: TrackState, fd: FormData): Promise<TrackState> {
  if (!databaseConfigured()) return { status: "error", error: "المتابعة غير متاحة في هذه النسخة." };
  const reference = normalizeReference(fd.get("reference"));
  const code = normalizeTrackingCode(fd.get("code"));
  if (!reference || !code) return { status: "error", error: "تأكد من الرقم المرجعي (مثل TP-ABCD2345) ورمز المتابعة (16 حرفًا ورقمًا)." };
  try {
    const r = await trackContactRequest(clientIp(await headers()), reference, code);
    // نفس الرسالة لرقم غير موجود أو رمز خاطئ (لا نكشف وجود الطلبات)
    if (!r) return { status: "error", error: "لم نجد طلبًا بهذا الرقم والرمز." };
    return { status: "found", request: r };
  } catch (e) {
    console.error("contact: track failed", (e as { code?: string }).code ?? (e as Error).name);
    return { status: "error", error: friendlySupportError(e) };
  }
}
