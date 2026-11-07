import Link from "next/link";
import { Badge } from "../../components/ui";
import { catalogOptions, listProducts } from "../../lib/admin/db";
import { addProduct } from "../actions";
import AdminShell, { can, Field, Flash, inputCls, requireAdmin, SubmitButton } from "../_components/AdminShell";

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

export default async function CatalogPage({ searchParams }: Props) {
  const { ok, err } = await searchParams;
  const ctx = await requireAdmin();
  const [options, products] = await Promise.all([catalogOptions(ctx.claims), listProducts(ctx.claims)]);
  const canEdit = can(ctx, "catalog:edit");

  return (
    <AdminShell ctx={ctx} active="/admin/catalog" title="المنتجات" subtitle={`${products.length} منتجًا إلكترونيًا في الكتالوج`}>
      <Flash ok={ok} err={err} />
      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        <section className="card p-5">
          <h2 className="font-bold">إضافة منتج</h2>
          {canEdit ? (
            <form action={addProduct} className="mt-4 space-y-3">
              <Field label="التصنيف">
                <select name="categoryId" required className={inputCls}>
                  {options.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="العلامة التجارية" hint="أو اترك القائمة فارغة وأضف علامة جديدة أدناه">
                <select name="brandId" className={inputCls} defaultValue="">
                  <option value="">— علامة جديدة —</option>
                  {options.brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="علامة جديدة (EN)"><input name="newBrandName" className={inputCls} dir="ltr" /></Field>
                <Field label="بالعربية"><input name="newBrandNameAr" className={inputCls} /></Field>
              </div>
              <Field label="الاسم بالعربية"><input name="nameAr" required className={inputCls} /></Field>
              <Field label="الاسم بالإنجليزية"><input name="name" required className={inputCls} dir="ltr" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="التخزين"><input name="storage" className={inputCls} /></Field>
                <Field label="الذاكرة"><input name="memory" className={inputCls} /></Field>
              </div>
              <Field label="الشاشة"><input name="screen" className={inputCls} /></Field>
              <Field label="المعالج"><input name="chip" className={inputCls} /></Field>
              <Field label="وصف مختصر"><textarea name="description" rows={2} className={`${inputCls} py-2`} /></Field>
              <label className="flex items-start gap-2 rounded-xl border border-coral/30 bg-coral-50 p-3 text-sm text-coral-ink">
                <input type="checkbox" name="isDemo" className="mt-1" />
                <span>بيانات تجريبية للعرض (تظهر بشارة &quot;بيانات تجريبية&quot; ولا تُفهرس)</span>
              </label>
              <SubmitButton>إضافة المنتج</SubmitButton>
            </form>
          ) : (
            <p className="mt-3 text-sm text-ink-3">إضافة المنتجات تتطلب صلاحية catalog:edit (مشرف).</p>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-surface-2 text-right text-xs text-ink-3">
                <tr>
                  <th className="px-4 py-2 font-medium">رقم الصفحة</th>
                  <th className="px-4 py-2 font-medium">المنتج</th>
                  <th className="px-4 py-2 font-medium">العلامة</th>
                  <th className="px-4 py-2 font-medium">التصنيف</th>
                  <th className="px-4 py-2 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="num px-4 py-2 text-ink-3">{p.publicId}</td>
                    <td className="px-4 py-2">
                      <Link href={`/product/${p.publicId}`} className="font-medium hover:text-brand-soft">{p.nameAr}</Link>
                      {p.isDemo && <Badge tone="coral" className="mr-2">تجريبي</Badge>}
                    </td>
                    <td className="px-4 py-2 text-ink-2">{p.brand}</td>
                    <td className="px-4 py-2 text-ink-2">{p.category}</td>
                    <td className="px-4 py-2">{p.status === "active" ? <Badge tone="good">منشور</Badge> : <Badge>{p.status}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
