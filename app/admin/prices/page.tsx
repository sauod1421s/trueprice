import Link from "next/link";
import { Badge } from "../../components/ui";
import { importLookups, listRuns } from "../../lib/admin/db";
import { MVP_MAX_BYTES, MVP_MAX_ROWS } from "../../lib/admin/priceRows";
import { stageCsv, stageFeedFile, stageSinglePrice } from "../actions";
import AdminShell, { can, Field, Flash, inputCls, requireAdmin, SubmitButton } from "../_components/AdminShell";

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "neutral" | "coral" }> = {
  previewed: { label: "بانتظار الاعتماد", tone: "warn" },
  committed: { label: "مطبّق", tone: "good" },
  discarded: { label: "ملغى", tone: "neutral" },
  staging: { label: "قيد الرفع", tone: "neutral" },
  failed: { label: "فشل", tone: "coral" },
};

/** قيمة افتراضية لحقل التاريخ: الآن بتوقيت الرياض (UTC+3 بلا توقيت صيفي) */
function riyadhNowForInput(): string {
  return new Date(new Date().getTime() + 3 * 3600_000).toISOString().slice(0, 16);
}

export default async function PricesPage({ searchParams }: Props) {
  const { ok, err } = await searchParams;
  const ctx = await requireAdmin();
  const [lk, runs] = await Promise.all([importLookups(ctx.claims), listRuns(ctx.claims)]);
  const sources = lk.sources.filter((s) => s.kind !== "legacy_manual");
  const canImport = can(ctx, "import:commit");
  const nowLocal = riyadhNowForInput();

  return (
    <AdminShell ctx={ctx} active="/admin/prices" title="استيراد الأسعار" subtitle="بالريال السعودي فقط · كل إدخال يمر بمعاينة مختومة ثم اعتماد ثم مراجعة قبل الظهور">
      <Flash ok={ok} err={err} />
      {!canImport ? (
        <p className="card p-5 text-sm text-ink-3">استيراد الأسعار يتطلب صلاحية مشرف (import:commit).</p>
      ) : sources.length === 0 ? (
        <p className="card p-5 text-sm text-ink-3">
          لا يوجد مصدر معتمد للإدخال. أضف مصدرًا من <Link className="underline" href="/admin/stores">المتاجر والمصادر</Link>.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-bold">سعر واحد</h2>
            <form action={stageSinglePrice} className="mt-4 space-y-3">
              <Field label="المصدر">
                <select name="sourceId" required className={inputCls}>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="المنتج">
                <select name="productId" required className={inputCls}>
                  {lk.products.map((p) => <option key={p.publicId} value={p.publicId}>{p.publicId} — {p.name}</option>)}
                </select>
              </Field>
              <Field label="المتجر">
                <select name="storeId" required className={inputCls}>
                  {lk.stores.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.id})</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="السعر"><input name="price" required inputMode="decimal" className={inputCls} dir="ltr" placeholder="1999" /></Field>
                <Field label="العملة" hint="الريال فقط في MVP">
                  <select name="currency" className={inputCls}><option value="SAR">ريال سعودي</option></select>
                </Field>
              </div>
              <Field label="رابط صفحة المنتج في المتجر"><input name="url" required type="url" className={inputCls} dir="ltr" placeholder="https://" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="تاريخ السعر (توقيت الرياض)" hint="اتركه فارغًا = الآن"><input name="asOf" type="datetime-local" max={nowLocal} className={inputCls} dir="ltr" /></Field>
                <Field label="التوفر">
                  <select name="availability" className={inputCls}>
                    <option value="in_stock">متوفر</option>
                    <option value="out_of_stock">غير متوفر</option>
                  </select>
                </Field>
              </div>
              <SubmitButton>معاينة السعر</SubmitButton>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="font-bold">ملف CSV صغير</h2>
            <p className="mt-1 text-xs leading-6 text-ink-3">
              الأعمدة: <code dir="ltr">product_id,store_id,price,url</code> واختياريًا{" "}
              <code dir="ltr">currency,as_of,availability,list_price</code>. حتى {MVP_MAX_ROWS.toLocaleString("en-US")} صف
              (الاستيراد الضخم معطّل مؤقتًا). رقم المنتج هو رقم صفحته في الموقع.
            </p>
            <form action={stageCsv} className="mt-4 space-y-3">
              <Field label="المصدر">
                <select name="sourceId" required className={inputCls}>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="الصق CSV">
                <textarea name="csv" rows={6} dir="ltr" className={`${inputCls} py-2 font-mono text-xs`}
                  placeholder={"product_id,store_id,price,url\n1,jarir,3899,https://www.jarir.com/..."} />
              </Field>
              <Field label="أو اختر ملفًا"><input type="file" name="file" accept=".csv,text/csv" className="text-sm" /></Field>
              <SubmitButton>معاينة الملف</SubmitButton>
            </form>
          </section>

          <section className="card p-5 lg:col-span-2">
            <h2 className="font-bold">ملف شريك (CSV · Google Merchant · YML · XML)</h2>
            <p className="mt-1 text-xs leading-6 text-ink-3">
              يُحلَّل الملف على الخادم ويُطابق كل صف مع الكتالوج <strong>بالباركود أو رقم الموديل فقط</strong>. الصفوف التي
              تشبه منتجًا بالاسم لا تُدمج تلقائيًا، بل تظهر في المعاينة كملاحظات. حتى{" "}
              {MVP_MAX_ROWS.toLocaleString("en-US")} صف و{Math.round(MVP_MAX_BYTES / 1024)} ك.ب، والريال السعودي فقط. السعر
              الذي لا يذكر الملف تاريخه يُعلَّم «تاريخ غير مؤكد» ولا يدخل في السعر العادل.
            </p>
            <form action={stageFeedFile} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="المصدر">
                <select name="sourceId" required className={inputCls}>
                  {sources.filter((s) => s.kind === "store_feed" || s.kind === "manual_upload").map((s) => (
                    <option key={s.id} value={s.id}>{s.label}{s.storeId ? ` (${s.storeId})` : ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="صيغة الملف">
                <select name="format" className={inputCls}>
                  <option value="auto">اكتشاف تلقائي</option>
                  <option value="csv">CSV</option>
                  <option value="google-merchant">Google Merchant (XML)</option>
                  <option value="yml">YML (XML)</option>
                  <option value="xml">XML عام</option>
                </select>
              </Field>
              <Field label="المنطقة الزمنية للتواريخ" hint="للتواريخ التي لا تذكر منطقتها">
                <input name="timeZone" className={inputCls} dir="ltr" placeholder="Asia/Riyadh" />
              </Field>
              <Field label="الملف">
                <input type="file" name="file" required accept=".csv,.xml,.txt,text/csv,application/xml,text/xml" className="text-sm" />
              </Field>
              <div className="sm:col-span-2 lg:col-span-4">
                <SubmitButton>تحليل الملف ومعاينته</SubmitButton>
              </div>
            </form>
          </section>
        </div>
      )}

      <section className="card mt-6 overflow-hidden">
        <h2 className="p-5 pb-3 font-bold">آخر عمليات الاستيراد</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-surface-2 text-right text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">الوقت</th>
                <th className="px-4 py-2 font-medium">المصدر</th>
                <th className="px-4 py-2 font-medium">الملف</th>
                <th className="px-4 py-2 font-medium">الصفوف</th>
                <th className="px-4 py-2 font-medium">بواسطة</th>
                <th className="px-4 py-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-ink-3" dir="ltr">{r.startedAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-2" dir="ltr">{r.sourceId}</td>
                  <td className="px-4 py-2"><Link className="hover:text-brand-soft" href={`/admin/prices/${r.id}`}>{r.fileName}</Link></td>
                  <td className="num px-4 py-2">{r.rows ?? "—"}</td>
                  <td className="px-4 py-2 text-ink-2">{r.startedBy ?? "—"}</td>
                  <td className="px-4 py-2"><Badge tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
