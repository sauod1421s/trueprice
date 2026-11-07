/**
 * طلبات التواصل: التحقق من المدخلات ورمز زمن التعبئة — منطق خالص (يُختبر وحده).
 * القاعدة تعيد نفس التحقق (pub.submit_contact_request)، فهذا خط الدفاع الأول فقط.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const KINDS = {
  inquiry: "استفسار",
  complaint: "شكوى",
  suggestion: "اقتراح",
  price_error: "بلاغ عن خطأ في سعر",
} as const;
export type RequestKind = keyof typeof KINDS;

export const STATUSES = {
  new: "جديد",
  in_progress: "قيد المعالجة",
  answered: "تم الرد",
  closed: "مغلق",
  spam: "مزعج",
} as const;
export type RequestStatus = keyof typeof STATUSES;

export const STATUS_TONE: Record<string, "warn" | "good" | "coral" | undefined> = {
  new: "coral", in_progress: "warn", answered: "good", closed: undefined, spam: undefined,
};

export type ContactInput = {
  kind: RequestKind;
  name: string | null;
  email: string | null;
  phone: string | null;
  subject: string;
  message: string;
  relatedRef: string | null;
};

const EMAIL = /^[^@\s]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
const PHONE = /^\+?[0-9]{7,15}$/;
const RELATED = /^(\/[a-z0-9/_-]{1,200}|[0-9]{1,9})$/;
 
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

function clean(v: FormDataEntryValue | null, max: number): string {
  if (typeof v !== "string") return "";
  return v.normalize("NFC").replace(CONTROL, "").trim().slice(0, max + 1);
}

/** أرقام عربية → لاتينية، وحذف المسافات والأقواس والشرطات */
export function normalizePhone(v: string): string {
  return v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s()-]/g, "");
}

export function parseContactForm(fd: FormData): { ok: true; value: ContactInput } | { ok: false; error: string } {
  const kind = clean(fd.get("kind"), 20);
  if (!(kind in KINDS)) return { ok: false, error: "اختر نوع الطلب" };
  const subject = clean(fd.get("subject"), 150);
  if (subject.length < 3 || subject.length > 150) return { ok: false, error: "العنوان من 3 إلى 150 حرفًا" };
  const message = clean(fd.get("message"), 4000);
  if (message.length < 10 || message.length > 4000) return { ok: false, error: "الرسالة من 10 إلى 4000 حرف" };
  if ((message.match(/https?:\/\//gi) ?? []).length > 3) return { ok: false, error: "الرسالة تحتوي روابط كثيرة" };
  const name = clean(fd.get("name"), 100);
  if (name.length > 100) return { ok: false, error: "الاسم طويل جدًا" };
  const email = clean(fd.get("email"), 254).toLowerCase();
  if (email && !EMAIL.test(email)) return { ok: false, error: "البريد الإلكتروني غير صحيح" };
  const phone = normalizePhone(clean(fd.get("phone"), 30));
  if (phone && !PHONE.test(phone)) return { ok: false, error: "رقم الجوال غير صحيح (أرقام فقط، مثال: 9665xxxxxxxx+)" };
  const related = clean(fd.get("relatedRef"), 201);
  return {
    ok: true,
    value: {
      kind: kind as RequestKind,
      name: name || null,
      email: email || null,
      phone: phone || null,
      subject,
      message,
      relatedRef: RELATED.test(related) ? related : null,
    },
  };
}

/* ------------------------------------------------------------------ رمز زمن التعبئة */

const MIN_AGE_MS = 3_000; // أسرع من 3 ثوانٍ = آلي غالبًا
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // النموذج صالح ساعتين

/**
 * مفتاح التوقيع: TP_FORM_SECRET إن وُجد، وإلا مشتق من رابط القاعدة السري (سر خادمي موجود
 * أصلًا) — لا يصل أي منهما للمتصفح.
 */
function formKey(env: Record<string, string | undefined> = process.env): Buffer {
  const base = env.TP_FORM_SECRET && env.TP_FORM_SECRET.length >= 32 ? env.TP_FORM_SECRET : `db|${env.DATABASE_URL ?? ""}`;
  return createHash("sha256").update(`trueprice-form-v1|${base}`).digest();
}

export function issueFormToken(now = Date.now(), env?: Record<string, string | undefined>): string {
  const ts = String(now);
  const sig = createHmac("sha256", formKey(env)).update(ts).digest("base64url");
  return `${ts}.${sig}`;
}

export function checkFormToken(
  token: FormDataEntryValue | null,
  now = Date.now(),
  env?: Record<string, string | undefined>
): "ok" | "too_fast" | "expired" | "invalid" {
  if (typeof token !== "string" || !/^[0-9]{13}\.[A-Za-z0-9_-]{43}$/.test(token)) return "invalid";
  const [ts, sig] = token.split(".");
  const expected = createHmac("sha256", formKey(env)).update(ts).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return "invalid";
  const age = now - Number(ts);
  if (age < MIN_AGE_MS) return "too_fast";
  if (age > MAX_AGE_MS) return "expired";
  return "ok";
}

/** الرقم المرجعي ورمز المتابعة كما يكتبهما الزائر (مسافات، حروف صغيرة) */
export function normalizeReference(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const s = v.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const m = /^TP-?([A-HJ-NP-Z2-9]{8})$/.exec(s);
  return m ? `TP-${m[1]}` : null;
}

export function normalizeTrackingCode(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-HJ-NP-Z2-9]{16}$/.test(s) ? s : null;
}

/** رسائل أخطاء القاعدة → عربية (بلا تفاصيل داخلية) */
export function friendlySupportError(e: unknown): string {
  const code = (e as { code?: string }).code;
  if (code === "TP429") return "وصلت إلى الحد المسموح من الطلبات. حاول لاحقًا.";
  if (code === "TP409") return "أرسلت نفس الرسالة اليوم، وطلبك السابق مسجل.";
  if (code === "TP400") return "تأكد من الحقول وأعد المحاولة.";
  return "تعذر حفظ الطلب الآن. حاول بعد قليل.";
}
