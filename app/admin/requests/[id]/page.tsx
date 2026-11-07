import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requestDetail } from "../../../lib/admin/db";
import { KINDS, STATUS_TONE, STATUSES } from "../../../lib/support/validate";
import { Badge } from "../../../components/ui";
import { changeRequestStatus, replyToRequest } from "../../actions";
import AdminShell, { can, Field, Flash, inputCls, requireAdmin, SubmitButton } from "../../_components/AdminShell";

export const metadata: Metadata = { title: "طلب تواصل", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const ctx = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9]{1,12}$/.test(id) || !can(ctx, "requests:read")) notFound();
  const r = await requestDetail(ctx.claims, Number(id));
  if (!r) notFound();
  const manage = can(ctx, "requests:manage");
  const related = r.related_ref
    ? /^[0-9]+$/.test(r.related_ref) ? { href: `/product/${r.related_ref}`, label: `المنتج رقم ${r.related_ref}` } : { href: r.related_ref, label: r.related_ref }
    : null;

  return (
    <AdminShell ctx={ctx} active="/admin/requests" title={`الطلب ${r.reference}`} subtitle={`${KINDS[r.kind as keyof typeof KINDS] ?? r.kind} · ${fmt.format(new Date(r.created_at))}`}>
      <Flash ok={sp.ok} err={sp.err} />
      <Link href="/admin/requests" className="text-sm text-ink-3 hover:text-ink">← كل الطلبات</Link>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{r.subject}</h2>
            <Badge tone={STATUS_TONE[r.status]}>{STATUSES[r.status as keyof typeof STATUSES] ?? r.status}</Badge>
          </div>
          {related && (
            <p className="mt-2 text-sm">بخصوص: <Link href={related.href} className="text-brand underline" dir="ltr">{related.label}</Link></p>
          )}
          <div className="mt-4 whitespace-pre-line rounded-xl bg-surface-2 p-4 text-sm leading-7" data-message>{r.message}</div>

          <h3 className="mt-6 font-bold">الردود والملاحظات ({r.replies.length})</h3>
          {r.replies.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">لا ردود بعد.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {r.replies.map((x) => (
                <li key={x.id} className={`rounded-xl border p-3 text-sm leading-7 ${x.is_public ? "border-mint/50 bg-mint-50" : "border-dashed border-line-strong"}`}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    <Badge tone={x.is_public ? "good" : undefined}>{x.is_public ? "رد ظاهر للمرسل" : "ملاحظة داخلية"}</Badge>
                    {x.author ?? "—"} · {fmt.format(new Date(x.at))}
                  </div>
                  <div className="whitespace-pre-line">{x.body}</div>
                </li>
              ))}
            </ol>
          )}

          {manage ? (
            <form action={replyToRequest} className="mt-5 space-y-3 border-t border-line pt-5">
              <input type="hidden" name="id" value={r.id} />
              <Field label="رد أو ملاحظة">
                <textarea name="body" required maxLength={4000} rows={4} className={`${inputCls} py-2 leading-7`} />
              </Field>
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="visibility" value="public" defaultChecked /> رد يظهر للمرسل في صفحة المتابعة
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="visibility" value="internal" /> ملاحظة داخلية فقط
                </label>
              </fieldset>
              <SubmitButton>حفظ</SubmitButton>
            </form>
          ) : (
            <p className="mt-5 text-sm text-ink-3">الرد ومعالجة الطلبات تتطلب صلاحية requests:manage مع التحقق الثنائي.</p>
          )}
        </section>

        <aside className="space-y-4">
          <section className="card p-5 text-sm">
            <h3 className="font-bold">بيانات المرسل</h3>
            <dl className="mt-3 space-y-2">
              <div><dt className="text-xs text-ink-3">الاسم</dt><dd>{r.name ?? "—"}</dd></div>
              <div><dt className="text-xs text-ink-3">البريد</dt><dd dir="ltr" className="text-right">{r.email ? <a className="text-brand underline" href={`mailto:${r.email}`}>{r.email}</a> : "—"}</dd></div>
              <div><dt className="text-xs text-ink-3">الجوال</dt><dd dir="ltr" className="text-right">{r.phone ?? "—"}</dd></div>
            </dl>
            <p className="mt-3 text-xs leading-6 text-ink-3">لا تُستخدم هذه البيانات إلا للرد على هذا الطلب.</p>
          </section>
          {manage && (
            <section className="card p-5">
              <h3 className="font-bold">الحالة</h3>
              <form action={changeRequestStatus} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={r.id} />
                <select name="status" defaultValue={r.status} className={inputCls}>
                  {Object.entries(STATUSES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <SubmitButton tone="ghost">تحديث</SubmitButton>
              </form>
            </section>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}
