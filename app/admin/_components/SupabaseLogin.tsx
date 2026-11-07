"use client";

/**
 * دخول لوحة الإدارة عبر Supabase Auth: بريد وكلمة مرور، ثم التحقق الثنائي (TOTP) إلزاميًا.
 * يعمل في المتصفح بالمفتاح العام فقط (publishable)، والخادم لا يثق إلا بالرمز بعد التحقق من توقيعه.
 * لا يوجد تسجيل ذاتي: الحسابات تُنشأ من لوحة Supabase، والصلاحيات تحددها القاعدة.
 */
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Step = "password" | "mfa";
type Enroll = { factorId: string; qr: string; secret: string } | null;

const MESSAGES: Record<string, string> = {
  "Invalid login credentials": "البريد أو كلمة المرور غير صحيحة.",
  "Email not confirmed": "الحساب غير مفعّل بعد.",
  "Invalid TOTP code entered": "رمز التحقق غير صحيح أو انتهت صلاحيته.",
};
const msg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return MESSAGES[m] ?? "تعذّر إكمال العملية. حاول مرة أخرى.";
};

export default function SupabaseLogin({ url, publishableKey, initialStep }: { url: string; publishableKey: string; initialStep: Step }) {
  const router = useRouter();
  const sb = useMemo(() => createBrowserClient(url, publishableKey), [url, publishableKey]);
  const [step, setStep] = useState<Step>(initialStep);
  const [enroll, setEnroll] = useState<Enroll>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function afterPassword() {
    const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) throw error;
    if (data.currentLevel === "aal2") return router.refresh();
    setStep("mfa");
    if (data.nextLevel !== "aal2") await startEnroll();
  }

  // فتح الصفحة بجلسة بلا تحقق ثنائي (مثل إعادة التحميل أثناء التسجيل): إن لم يوجد عامل مُفعّل
  // يظهر رمز QR جديد فورًا، بدل أن يُعاد التسجيل بصمت عند إدخال أول رمز
  const checked = useRef(false);
  useEffect(() => {
    if (step !== "mfa" || enroll || checked.current) return;
    checked.current = true;
    void (async () => {
      try {
        const factors = await sb.auth.mfa.listFactors();
        if (!factors.data?.totp.some((f) => f.status === "verified")) await startEnroll();
      } catch (e) {
        setError(msg(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function startEnroll() {
    // تنظيف عوامل غير مكتملة من محاولات سابقة ثم إنشاء عامل TOTP جديد
    const factors = await sb.auth.mfa.listFactors();
    for (const f of factors.data?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "TruePrice admin" });
    if (error) throw error;
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function onPassword(form: FormData) {
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
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function onCode(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const code = String(form.get("code") ?? "").replace(/\s+/g, "");
      if (!/^\d{6}$/.test(code)) throw new Error("Invalid TOTP code entered");
      let factorId = enroll?.factorId;
      if (!factorId) {
        const factors = await sb.auth.mfa.listFactors();
        factorId = factors.data?.totp.find((f) => f.status === "verified")?.id;
        if (!factorId) {
          await startEnroll();
          return;
        }
      }
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      router.refresh();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-base outline-none focus:border-brand";
  const button = "inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60";

  return (
    <div className="card mx-auto mt-6 max-w-md p-6">
      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-bad/30 bg-bad/[0.06] px-3 py-2 text-sm text-bad">
          {error}
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
              <p className="text-ink-3">
                أو أدخل المفتاح يدويًا: <code dir="ltr" className="break-all">{enroll.secret}</code>
              </p>
            </div>
          ) : (
            <p className="text-sm leading-7">أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.</p>
          )}
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required dir="ltr"
                 placeholder="000000" className={`${input} text-center tracking-[0.4em]`} />
          <button disabled={busy} className={button}>{busy ? "جارٍ التحقق..." : "تحقق"}</button>
        </form>
      )}
    </div>
  );
}
