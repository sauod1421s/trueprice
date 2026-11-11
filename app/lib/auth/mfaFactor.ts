/**
 * اختيار عامل التحقق الثنائي (TOTP) الذي يُرسل له الرمز — من حالة الخادم دائمًا، لا من ذاكرة الصفحة.
 *
 * السبب الجذري لعطل 2026-11-11: نافذة قديمة احتفظت في ذاكرتها بمعرّف عامل حُذف لاحقًا، فأرسلت
 * الرموز إليه وردّ Supabase بـ 404 mfa_factor_not_found. كذلك كانت كل إعادة فتح للصفحة تحذف العامل
 * غير المكتمل الذي مسحه المستخدم وتنشئ غيره. الآن:
 *  - قبل كل تحقق تُقرأ العوامل من الخادم ويُختار منها.
 *  - العامل غير المكتمل لا يُحذف إلا بطلب صريح من المستخدم (زر "رمز QR جديد").
 * لا تتعامل هذه الوحدة مع المفتاح السري إطلاقًا.
 */

export type ServerFactor = { id: string; factor_type: string; status: string; created_at?: string };

export type FactorChoice =
  | { kind: "verified"; factorId: string } // مستخدم سبق له التفعيل: أدخل الرمز فقط
  | { kind: "pending"; factorId: string } // تسجيل لم يكتمل: الرمز يُرسل للعامل الموجود على الخادم
  | { kind: "none" }; // لا يوجد عامل: يلزم إنشاء رمز QR

const time = (f: ServerFactor) => (f.created_at ? Date.parse(f.created_at) || 0 : 0);

export function chooseFactor(all: readonly ServerFactor[], inMemoryId?: string | null): FactorChoice {
  const totp = all.filter((f) => f.factor_type === "totp");
  const verified = totp.find((f) => f.status === "verified");
  if (verified) return { kind: "verified", factorId: verified.id };
  const pending = totp.filter((f) => f.status !== "verified");
  // العامل الذي عرضت هذه الصفحة رمزه، إن كان لا يزال موجودًا على الخادم
  const mine = inMemoryId ? pending.find((f) => f.id === inMemoryId) : undefined;
  if (mine) return { kind: "pending", factorId: mine.id };
  // وإلا الأحدث (قد يكون أُنشئ في نافذة أخرى أو قبل إعادة التحميل وهو ما مسحه المستخدم)
  const latest = [...pending].sort((a, b) => time(b) - time(a))[0];
  return latest ? { kind: "pending", factorId: latest.id } : { kind: "none" };
}

/** رسائل عربية لرموز أخطاء Supabase Auth، مع إظهار الرمز الحقيقي للتشخيص (لا يحوي أسرارًا). */
const BY_CODE: Record<string, string> = {
  invalid_credentials: "البريد أو كلمة المرور غير صحيحة.",
  email_not_confirmed: "الحساب غير مفعّل بعد.",
  mfa_verification_failed: "رمز التحقق غير صحيح. تأكد أنه من حساب TruePrice في تطبيق المصادقة وأن وقت الجوال تلقائي.",
  mfa_challenge_expired: "انتهت مهلة التحقق. أدخل الرمز الحالي مرة أخرى.",
  mfa_factor_not_found: "رمز QR في هذه الصفحة لم يعد صالحًا (أُنشئ غيره). حدّث الصفحة.",
  mfa_verification_rejected: "رُفض التحقق. حاول مرة أخرى.",
  mfa_totp_enroll_not_enabled: "تفعيل TOTP غير مفعّل في إعدادات Supabase.",
  mfa_totp_verify_not_enabled: "التحقق بـ TOTP غير مفعّل في إعدادات Supabase.",
  too_many_enrolled_mfa_factors: "يوجد عدد كبير من عوامل التحقق غير المكتملة.",
  over_request_rate_limit: "محاولات كثيرة. انتظر دقيقة ثم حاول.",
  session_not_found: "انتهت الجلسة. سجّل الدخول من جديد.",
  session_expired: "انتهت الجلسة. سجّل الدخول من جديد.",
  aal_not_upgraded: "تم التحقق لكن الجلسة لم تنتقل إلى مستوى التحقق الثنائي. سجّل الدخول من جديد.",
  no_factor: "لا يوجد رمز QR مسجّل. اضغط \"إنشاء رمز QR جديد\".",
  invalid_code_format: "أدخل 6 أرقام.",
};

export type AuthErrorLike = { code?: string; status?: number; message?: string; name?: string };

export function describeAuthError(e: unknown): { text: string; code: string } {
  const err = (typeof e === "object" && e !== null ? e : { message: String(e) }) as AuthErrorLike;
  const code = err.code || (err.status ? `http_${err.status}` : err.name || "unknown");
  const text = BY_CODE[code] ?? (err.message ? `تعذّر إكمال العملية: ${err.message}` : "تعذّر إكمال العملية.");
  return { text, code };
}

export class FlowError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
