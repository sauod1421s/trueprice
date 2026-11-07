import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Price } from "../../../components/ui";
import { runDetail } from "../../../lib/admin/db";
import { commitRun, discardRun } from "../../actions";
import AdminShell, { can, Flash, requireAdmin, SubmitButton } from "../../_components/AdminShell";

type Props = { params: Promise<{ run: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function RunPage({ params, searchParams }: Props) {
  const { run: runId } = await params;
  const { ok, err } = await searchParams;
  if (!UUID.test(runId)) notFound();
  const ctx = await requireAdmin();
  const detail = await runDetail(ctx.claims, runId);
  if (!detail) notFound();
  const { run, rows } = detail;
  const pending = run.status === "previewed";

  return (
    <AdminShell
      ctx={ctx}
      active="/admin/prices"
      title={pending ? "معاينة الاستيراد قبل الاعتماد" : "تفاصيل الاستيراد"}
      subtitle={`${run.fileName} · المصدر ${run.sourceId} · ${run.rows ?? 0} صف`}
    >
      <Flash ok={ok} err={err} />

      {pending && (
        <div className="mb-5 rounded-2xl border border-warn-line bg-warn-bg p-4 text-sm leading-7 text-warn">
          لم يُطبَّق أي سعر بعد ولا يظهر شيء في الموقع. هذه الصفوف مختومة ببصمة SHA-256؛ أي تغيير فيها
          بعد الختم يجعل الاعتماد يُرفض. بعد الاعتماد تذهب الأسعار إلى قائمة المراجعة، ولا تظهر في صفحة
          المنتج إلا بعد اعتمادها من مراجع.
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-surface-2 text-right text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">المنتج</th>
                <th className="px-4 py-2 font-medium">المتجر</th>
                <th className="px-4 py-2 font-medium">السعر الجديد</th>
                <th className="px-4 py-2 font-medium">السعر الحالي في القاعدة</th>
                <th className="px-4 py-2 font-medium">تاريخ السعر</th>
                <th className="px-4 py-2 font-medium">التوفر</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.rowNo}>
                  <td className="num px-4 py-2 text-ink-3">{r.rowNo}</td>
                  <td className="px-4 py-2">
                    {r.publicId ? <Link href={`/product/${r.publicId}`} className="hover:text-brand-soft">{r.product}</Link> : r.product}
                  </td>
                  <td className="px-4 py-2" dir="ltr">{r.storeId}</td>
                  <td className="px-4 py-2 font-semibold"><Price value={r.amount} /> <span className="text-xs text-ink-3">{r.currency}</span></td>
                  <td className="px-4 py-2 text-ink-2">
                    {r.currentPrice === null ? <span className="text-ink-3">جديد</span> : r.currentPrice === r.amount ? "بلا تغيير" : <Price value={r.currentPrice} />}
                  </td>
                  <td className="px-4 py-2 text-ink-3" dir="ltr">{r.asOf.slice(0, 16).replace("T", " ")} UTC</td>
                  <td className="px-4 py-2">{r.availability === "in_stock" ? <Badge tone="good">متوفر</Badge> : <Badge>{r.availability}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-4 text-xs text-ink-3">
        بصمة المعاينة المختومة: <code dir="ltr" className="break-all">{run.contentSha256 ?? "—"}</code>
      </div>

      {run.stats && (
        <div className="mt-4 rounded-2xl border border-mint/50 bg-mint-50 p-4 text-sm text-good-soft">
          نتيجة التطبيق: {run.stats.new ?? 0} جديد · {run.stats.price_changed ?? 0} تغيّر سعره (السابق محفوظ) ·{" "}
          {run.stats.refreshed ?? 0} بلا تغيير · {run.stats.stale ?? 0} أقدم من الموجود (تُجوهل).{" "}
          <Link href="/admin/review" className="underline">اذهب للمراجعة</Link>
        </div>
      )}

      {pending && can(ctx, "import:commit") && (
        <div className="mt-5 flex flex-wrap gap-3">
          <form action={commitRun}>
            <input type="hidden" name="runId" value={run.id} />
            <input type="hidden" name="contentSha256" value={run.contentSha256 ?? ""} />
            <SubmitButton>اعتماد الاستيراد (يذهب للمراجعة)</SubmitButton>
          </form>
          <form action={discardRun}>
            <input type="hidden" name="runId" value={run.id} />
            <SubmitButton tone="ghost">إلغاء</SubmitButton>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
