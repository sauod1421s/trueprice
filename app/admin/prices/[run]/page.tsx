import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Price } from "../../../components/ui";
import { runDetail } from "../../../lib/admin/db";
import { commitRun, discardRun } from "../../actions";
import AdminShell, { can, Flash, requireAdmin, SubmitButton } from "../../_components/AdminShell";

type Props = { params: Promise<{ run: string }>; searchParams: Promise<{ ok?: string; err?: string }> };

const AVAILABILITY: Record<string, string> = { out_of_stock: "غير متوفر", preorder: "طلب مسبق", unknown: "غير محدد" };

const ISSUE_LABEL: Record<string, string> = {
  needs_review: "يحتاج مطابقة",
  unmatched: "غير موجود",
  store_unknown: "متجر غير معروف",
  currency_not_supported: "عملة غير الريال",
  condition_not_supported: "ليس جديدًا",
  row_rejected: "صف غير صالح",
  duplicate_offer: "مكرر",
  issues_truncated: "مختصر",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export default async function RunPage({ params, searchParams }: Props) {
  const { run: runId } = await params;
  const { ok, err } = await searchParams;
  if (!UUID.test(runId)) notFound();
  const ctx = await requireAdmin();
  const detail = await runDetail(ctx.claims, runId);
  if (!detail) notFound();
  const { run, rows, issues } = detail;
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
                  <td className="px-4 py-2">{r.availability === "in_stock" ? <Badge tone="good">متوفر</Badge> : <Badge>{AVAILABILITY[r.availability] ?? r.availability}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {issues.length > 0 && (
        <section className="card mt-5 overflow-hidden">
          <h2 className="p-5 pb-1 font-bold">صفوف لم تُرفع ({issues.length})</h2>
          <p className="px-5 pb-3 text-xs leading-6 text-ink-3">
            هذه الصفوف من الملف لم تدخل المعاينة ولن تُطبق. المطابقة بالاسم لا تُعتمد تلقائيًا أبدًا: أضف الباركود أو رقم
            الموديل للمنتج الصحيح من <Link className="underline" href="/admin/catalog">الكتالوج</Link> ثم أعد رفع الملف.
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="sticky top-0 bg-surface-2 text-right text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2 font-medium">صف</th>
                  <th className="px-4 py-2 font-medium">الاسم في الملف</th>
                  <th className="px-4 py-2 font-medium">السبب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {issues.map((i, n) => (
                  <tr key={n}>
                    <td className="num px-4 py-2 text-ink-3">{i.rowNo || "—"}</td>
                    <td className="px-4 py-2 text-ink-2">{i.name ?? "—"}</td>
                    <td className="px-4 py-2">
                      <Badge tone={i.severity === "error" ? "coral" : "warn"}>{ISSUE_LABEL[i.code] ?? i.code}</Badge>{" "}
                      <span className="text-xs text-ink-3">{i.message}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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
