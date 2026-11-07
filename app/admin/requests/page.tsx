import type { Metadata } from "next";
import Link from "next/link";
import { listRequests } from "../../lib/admin/db";
import { KINDS, STATUS_TONE, STATUSES } from "../../lib/support/validate";
import { Badge } from "../../components/ui";
import AdminShell, { can, Flash, requireAdmin } from "../_components/AdminShell";

export const metadata: Metadata = { title: "الطلبات والشكاوى", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; ok?: string; err?: string }>;
}) {
  const ctx = await requireAdmin();
  const sp = await searchParams;
  if (!can(ctx, "requests:read")) {
    return (
      <AdminShell ctx={ctx} active="/admin/requests" title="الطلبات والشكاوى">
        <p className="card p-5 text-sm text-ink-3">قراءة الطلبات تتطلب صلاحية requests:read (مشرف).</p>
      </AdminShell>
    );
  }
  const status = sp.status && sp.status in STATUSES ? sp.status : null;
  const kind = sp.kind && sp.kind in KINDS ? sp.kind : null;
  const { rows, counts } = await listRequests(ctx.claims, { status, kind });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const href = (st: string | null, k: string | null) => {
    const q = new URLSearchParams();
    if (st) q.set("status", st);
    if (k) q.set("kind", k);
    const s = q.toString();
    return s ? `/admin/requests?${s}` : "/admin/requests";
  };
  const chip = (active: boolean) =>
    `inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm ${active ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink-2 hover:border-brand"}`;

  return (
    <AdminShell ctx={ctx} active="/admin/requests" title="الطلبات والشكاوى" subtitle="الاستفسارات والشكاوى والاقتراحات وبلاغات الأسعار من الزوار">
      <Flash ok={sp.ok} err={sp.err} />
      <nav className="flex flex-wrap gap-2" aria-label="الحالة">
        <Link href={href(null, kind)} className={chip(!status)}>الكل <span className="num">{total}</span></Link>
        {Object.entries(STATUSES).map(([k, label]) => (
          <Link key={k} href={href(k, kind)} className={chip(status === k)}>
            {label} <span className="num">{counts[k] ?? 0}</span>
          </Link>
        ))}
      </nav>
      <nav className="mt-2 flex flex-wrap gap-2" aria-label="النوع">
        <Link href={href(status, null)} className={chip(!kind)}>كل الأنواع</Link>
        {Object.entries(KINDS).map(([k, label]) => (
          <Link key={k} href={href(status, k)} className={chip(kind === k)}>{label}</Link>
        ))}
      </nav>

      <section className="card mt-5 overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-ink-3">لا توجد طلبات بهذه التصفية.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="bg-surface-2 text-right text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2 font-medium">الرقم</th>
                  <th className="px-4 py-2 font-medium">النوع</th>
                  <th className="px-4 py-2 font-medium">العنوان</th>
                  <th className="px-4 py-2 font-medium">الحالة</th>
                  <th className="px-4 py-2 font-medium">الردود</th>
                  <th className="px-4 py-2 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="num px-4 py-2" dir="ltr">
                      <Link href={`/admin/requests/${r.id}`} className="font-semibold text-brand hover:underline">{r.reference}</Link>
                    </td>
                    <td className="px-4 py-2">{KINDS[r.kind as keyof typeof KINDS] ?? r.kind}</td>
                    <td className="max-w-[18rem] truncate px-4 py-2">{r.subject}</td>
                    <td className="px-4 py-2"><Badge tone={STATUS_TONE[r.status]}>{STATUSES[r.status as keyof typeof STATUSES] ?? r.status}</Badge></td>
                    <td className="num px-4 py-2">{r.replies}</td>
                    <td className="px-4 py-2 text-xs text-ink-3">{fmt.format(new Date(r.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
