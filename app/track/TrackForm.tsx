"use client";

import { useActionState, useState } from "react";
import { trackRequest, type TrackState } from "../contact/actions";

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "جديد — لم يُعالج بعد", cls: "bg-surface-2 text-ink-2" },
  in_progress: { label: "قيد المعالجة", cls: "bg-yellow-50 text-[#5c3d00]" },
  answered: { label: "تم الرد", cls: "bg-mint-50 text-good-soft" },
  closed: { label: "مغلق", cls: "bg-surface-2 text-ink-3" },
};
const KIND: Record<string, string> = {
  inquiry: "استفسار", complaint: "شكوى", suggestion: "اقتراح", price_error: "بلاغ عن خطأ في سعر",
};
const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh",
});
const input =
  "w-full min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-[0.95rem] outline-none focus:border-brand";

export default function TrackForm() {
  const [state, action, pending] = useActionState<TrackState, FormData>(trackRequest, { status: "idle" });
  // حقول محكومة: لا تُمسح بعد المحاولة (React يعيد ضبط النماذج غير المحكومة بعد الإرسال)
  const [reference, setReference] = useState("");
  const [code, setCode] = useState("");
  return (
    <div className="space-y-5">
      <form action={action} className="card grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-sm">
          <span className="font-medium text-ink-2">الرقم المرجعي</span>
          <input name="reference" value={reference} onChange={(e) => setReference(e.target.value)} required dir="ltr" autoComplete="off" placeholder="TP-ABCD2345" className={`${input} mt-1 uppercase`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink-2">رمز المتابعة</span>
          <input name="code" value={code} onChange={(e) => setCode(e.target.value)} required dir="ltr" autoComplete="off" placeholder="XXXX-XXXX-XXXX-XXXX" className={`${input} mt-1 uppercase`} />
        </label>
        <button type="submit" disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-on-brand disabled:opacity-60">
          {pending ? "جارٍ البحث…" : "عرض الحالة"}
        </button>
      </form>

      {state.status === "error" && (
        <div role="alert" data-flash="err" className="rounded-xl border border-bad/30 bg-bad/[0.06] px-4 py-3 text-sm text-bad">{state.error}</div>
      )}
      {state.status === "found" && (
        <section className="card p-5" data-flash="ok" aria-label="حالة الطلب">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="num text-lg font-bold" dir="ltr">{state.request.reference}</div>
              <div className="text-sm text-ink-3">{KIND[state.request.kind] ?? state.request.kind} · {state.request.subject}</div>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[state.request.status]?.cls ?? ""}`} data-status={state.request.status}>
              {STATUS[state.request.status]?.label ?? state.request.status}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            أُرسل {fmt.format(new Date(state.request.createdAt))} · آخر تحديث {fmt.format(new Date(state.request.updatedAt))}
          </p>
          <h2 className="mt-4 text-sm font-bold">الردود</h2>
          {state.request.replies.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">لا توجد ردود بعد.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {state.request.replies.map((r, i) => (
                <li key={i} className="rounded-xl bg-surface-2 p-3 text-sm leading-7">
                  <div className="whitespace-pre-line">{r.body}</div>
                  <div className="mt-1 text-xs text-ink-3">فريق TruePrice · {fmt.format(new Date(r.at))}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
