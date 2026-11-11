"use client";

/**
 * دخول لوحة الإدارة عبر Supabase Auth: بريد وكلمة مرور، ثم التحقق الثنائي (TOTP) إلزاميًا.
 * يعمل في المتصفح بالمفتاح العام فقط (publishable)، والخادم لا يثق إلا بالرمز بعد التحقق من توقيعه.
 * لا يوجد تسجيل ذاتي: الحسابات تُنشأ من لوحة Supabase، والصلاحيات تحددها القاعدة.
 */
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createEnroller, type MfaApi } from "../../lib/auth/mfaEnroll";
import { chooseFactor, describeAuthError, FlowError, type ServerFactor } from "../../lib/auth/mfaFactor";

type Step = "password" | "mfa";
type Enroll = { factorId: string; qr: string; secret: string } | null;

export default function SupabaseLogin({ url, publishableKey, initialStep }: { url: string; publishableKey: string; initialStep: Step }) {
  const router = useRouter();
  const sb = useMemo(() => createBrowserClient(url, publishableKey), [url, publishableKey]);
  const [step, setStep] = useState<Step>(initialStep);
  const [enroll, setEnroll] = useState<Enroll>(null);
  // عامل غير مكتمل موجود على الخادم ولا نملك رمزه هنا (مُسح سابقًا أو في نافذة أخرى)
  const [pendingElsewhere, setPendingElsewhere] = useState(false);
  const [error, setError] = useState<{ text: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const inflight = useRef(false);

  const fail = (e: unknown) => setError(describeAuthError(e));

  async function serverFactors(): Promise<ServerFactor[]> {
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) throw error;
    return (data?.all ?? []) as ServerFactor[];
  }

  async function afterPassword() {
    const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    if (data.currentLevel === "aal2") return router.refresh();
    setStep("mfa");
  }

  // عند الوصول لخطوة التحقق: لا يُحذف أي عامل تلقائيًا. يُنشأ رمز QR فقط إن لم يوجد أي عامل.
  const checked = useRef(false);
  useEffect(() => {
    if (step !== "mfa" || checked.current) return;
    checked.current = true;
    void (async () => {
      try {
        const choice = chooseFactor(await serverFactors(), enroll?.factorId);
        if (choice.kind === "none") await startEnroll();
        else if (choice.kind === "pending" && choice.factorId !== enroll?.factorId) setPendingElsewhere(true);
      } catch (e) {
        fail(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // إنشاء رمز جديد (يحذف العوامل غير المكتملة القديمة) — تلقائيًا فقط عند عدم وجود أي عامل، أو بطلب المستخدم
  const enroller = useMemo(() => createEnroller(sb.auth.mfa as unknown as MfaApi), [sb]);
  async function startEnroll() {
    const e = await enroller();
    setShowSecret(false);
    setPendingElsewhere(false);
    setEnroll(e);
  }

  async function onNewQr() {
    setBusy(true);
    setError(null);
    try {
      await startEnroll();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function onPassword(form: FormData) {
    if (inflight.current) return; // منع إرسال مزدوج للنموذج
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });
      if (error) throw error;
      await afterPassword();
    } catch (e) {
      fail(e);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function onCode(form: FormData) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(null);
    try {
      const code = String(form.get("code") ?? "").replace(/\s+/g, "");
      if (!/^\d{6}$/.test(code)) throw new FlowError("invalid_code_format");
      // المعرّف يُؤخذ من الخادم الآن، لا من ذاكرة الصفحة (قد يكون حُذف أو تغيّر من نافذة أخرى)
      const choice = chooseFactor(await serverFactors(), enroll?.factorId);
      if (choice.kind === "none") throw new FlowError("no_factor");
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: choice.factorId, code });
      if (error) throw error;
      // تأكيد انتقال الجلسة إلى aal2 قبل التحديث
      const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.error) throw aal.error;
      if (aal.data.currentLevel !== "aal2") throw new FlowError("aal_not_upgraded");
      router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const input = "w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-base outline-none focus:border-brand";
  const button = "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60";

  return (
    <div className="card mx-auto mt-6 max-w-md p-6">
      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-bad/30 bg-bad/[0.06] px-3 py-2 text-sm text-bad">
          {error.text}
          <div className="mt-1 text-[0.7rem] opacity-70" dir="ltr">code: {error.code}</div>
        </div>
      )}
      {step === "password" ? (
        <form action={onPassword} className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-ink-2">البريد الإلكتروني</span>
            <input name="email" type="email" autoComplete="username" required dir="ltr" className={`${input} mt-1`} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink-2">كلمة المرور</span>
            <input name="password" type="password" autoComplete="current-password" required dir="ltr" className={`${input} mt-1`} />
          </label>
          <button disabled={busy} className={button}>{busy ? "جارٍ الدخول..." : "دخول"}</button>
          <p className="text-xs leading-6 text-ink-3">لا يوجد تسجيل ذاتي. الحسابات يضيفها مشرف من لوحة Supabase.</p>
        </form>
      ) : (
        <form action={onCode} className="space-y-4">
          {enroll ? (
            <div className="space-y-3 text-sm leading-7">
              <p className="font-medium">التحقق الثنائي إلزامي للوحة الإدارة. امسح الرمز بتطبيق المصادقة (مثل Google Authenticator أو Microsoft Authenticator):</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- رمز QR بصيغة data URI من Supabase */}
              <img src={enroll.qr} alt="رمز QR لتطبيق المصادقة" className="mx-auto size-48 rounded-xl border border-line bg-white p-2" />
              {/* المفتاح النصي مخفي افتراضيًا لتقليل كشفه في لقطات الشاشة */}
              {showSecret ? (
                <p className="text-ink-3">
                  المفتاح اليدوي (لا تشاركه ولا تصوّره): <code dir="ltr" className="break-all">{enroll.secret}</code>
                </p>
              ) : (
                <button type="button" onClick={() => setShowSecret(true)} className="text-xs text-ink-3 underline">
                  لا أستطيع مسح الرمز — أظهر المفتاح اليدوي
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm leading-7">
              <p>أدخل الرمز المكوّن من 6 أرقام من حساب TruePrice في تطبيق المصادقة.</p>
              {pendingElsewhere && (
                <p className="text-xs text-ink-3">
                  يوجد رمز QR مسجّل لم يكتمل تفعيله. إن كنت مسحته، أدخل رمزه هنا. إن لم تمسحه أو حذفته من التطبيق:{" "}
                  <button type="button" onClick={onNewQr} disabled={busy} className="underline">إنشاء رمز QR جديد</button>
                </p>
              )}
            </div>
          )}
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required dir="ltr"
                 placeholder="000000" className={`${input} text-center tracking-[0.4em]`} />
          <button disabled={busy} className={button}>{busy ? "جارٍ التحقق..." : "تحقق"}</button>
        </form>
      )}
    </div>
  );
}
