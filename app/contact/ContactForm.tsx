"use client";

import { CheckCircle2, Copy } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { submitContact, type ContactState } from "./actions";

const KIND_OPTIONS = [
  { value: "inquiry", label: "استفسار" },
  { value: "complaint", label: "شكوى" },
  { value: "suggestion", label: "اقتراح" },
  { value: "price_error", label: "بلاغ عن خطأ في سعر" },
] as const;

const input =
  "w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-[0.95rem] outline-none focus:border-brand focus:shadow-[0_0_0_3px_rgb(61_220_151/0.3)]";

export default function ContactForm({
  token,
  initialKind,
  relatedRef,
  relatedLabel,
}: {
  token: string;
  initialKind: string;
  relatedRef: string | null;
  relatedLabel: string | null;
}) {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContact, { status: "idle" });
  const [kind, setKind] = useState(initialKind);
  const v = state.status === "error" ? state.values : undefined;

  if (state.status === "sent") {
    return <Sent reference={state.reference} code={state.trackingCode} />;
  }

  return (
    <form action={action} className="card space-y-4 p-5 sm:p-6" noValidate={false}>
      {state.status === "error" && (
        <div role="alert" data-flash="err" className="rounded-xl border border-bad/30 bg-bad/[0.06] px-4 py-3 text-sm text-bad">
          {state.error}
        </div>
      )}
      <input type="hidden" name="t" value={token} />
      {relatedRef && <input type="hidden" name="relatedRef" value={relatedRef} />}
      {/* حقل للآليين فقط: مخفي عن الزائر وقارئات الشاشة */}
      {/* sr-only يقص الحقل داخل الصفحة (الإزاحة لليسار تُحدث تمريرًا أفقيًا في الصفحات العربية) */}
      <div className="sr-only" aria-hidden>
        <label>
          الموقع الإلكتروني
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-2">نوع الطلب</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {KIND_OPTIONS.map((k) => (
            <label
              key={k.value}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 text-center text-sm ${
                kind === k.value ? "border-brand bg-mint-50 font-semibold text-forest" : "border-line-strong bg-surface text-ink-2"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={k.value}
                checked={kind === k.value}
                onChange={() => setKind(k.value)}
                className="sr-only"
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      {relatedLabel && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">
          بخصوص: <span className="font-semibold">{relatedLabel}</span>
        </p>
      )}

      <label className="block text-sm">
        <span className="font-medium text-ink-2">العنوان</span>
        <input name="subject" defaultValue={v?.subject} required minLength={3} maxLength={150} className={`${input} mt-1`}
          placeholder={kind === "price_error" ? "مثال: السعر المعروض أعلى من سعر المتجر" : "عنوان مختصر لطلبك"} />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-ink-2">الرسالة</span>
        <textarea name="message" defaultValue={v?.message} required minLength={10} maxLength={4000} rows={6} className={`${input} mt-1 py-2 leading-7`}
          placeholder={kind === "price_error" ? "اذكر السعر الصحيح ومصدره (رابط المتجر) وتاريخ رؤيته إن أمكن" : "اكتب التفاصيل هنا"} />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-ink-2">الاسم <span className="text-ink-3">(اختياري)</span></span>
          <input name="name" defaultValue={v?.name} maxLength={100} autoComplete="name" className={`${input} mt-1`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink-2">البريد <span className="text-ink-3">(اختياري)</span></span>
          <input name="email" defaultValue={v?.email} type="email" maxLength={254} autoComplete="email" dir="ltr" className={`${input} mt-1`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink-2">الجوال <span className="text-ink-3">(اختياري)</span></span>
          <input name="phone" defaultValue={v?.phone} type="tel" maxLength={20} autoComplete="tel" dir="ltr" className={`${input} mt-1`} placeholder="+9665xxxxxxxx" />
        </label>
      </div>
      <p className="text-xs leading-6 text-ink-3">
        بيانات التواصل اختيارية، ولا يراها إلا فريق TruePrice المختص لمعالجة طلبك. ستحصل بعد الإرسال على رقم مرجعي ورمز
        متابعة لمتابعة الطلب دون الحاجة إليها.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand px-5 font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-60 sm:w-auto"
      >
        {pending ? "جارٍ الإرسال…" : "إرسال الطلب"}
      </button>
    </form>
  );
}

function Sent({ reference, code }: { reference: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card p-5 sm:p-6" data-flash="ok" role="status">
      <div className="flex items-center gap-2 text-lg font-bold text-good-soft">
        <CheckCircle2 size={22} aria-hidden /> وصلنا طلبك
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-ink-3">الرقم المرجعي</dt>
          <dd className="num mt-1 text-xl font-bold" dir="ltr" data-reference>{reference}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-xs text-ink-3">رمز المتابعة (سري)</dt>
          <dd className="num mt-1 text-xl font-bold" dir="ltr" data-tracking-code>{code}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm leading-7 text-coral-ink">
        احفظ الرقم والرمز الآن: الرمز لا يُعرض مرة أخرى، ولا نستطيع استرجاعه لأننا لا نحفظه.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(`${reference}\n${code}`).then(() => setCopied(true));
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line-strong px-4 text-sm hover:border-brand"
        >
          <Copy size={14} aria-hidden /> {copied ? "تم النسخ" : "نسخ الرقم والرمز"}
        </button>
        <Link href="/track" className="inline-flex min-h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand">
          متابعة الطلب
        </Link>
      </div>
    </div>
  );
}
