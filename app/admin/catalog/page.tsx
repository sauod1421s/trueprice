import Link from "next/link";
import { Badge } from "../../components/ui";
import { catalogOptions, importLookups, listIdentifiers, listProducts } from "../../lib/admin/db";
import { addProduct, addProductIdentifier, changeProductStatus, deleteProductIdentifier } from "../actions";
import AdminShell, { can, Field, Flash, inputCls, requireAdmin, SubmitButton } from "../_components/AdminShell";

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

export default async function CatalogPage({ searchParams }: Props) {
  const { ok, err } = await searchParams;
  const ctx = await requireAdmin();
  const [options, products, identifiers, lookups] = await Promise.all([
    catalogOptions(ctx.claims), listProducts(ctx.claims), listIdentifiers(ctx.claims), importLookups(ctx.claims),
  ]);
  const stores = lookups.stores;
  const canEdit = can(ctx, "catalog:edit");
  const idsByProduct = new Map<number, typeof identifiers>();
  for (const i of identifiers) idsByProduct.set(i.productId, [...(idsByProduct.get(i.productId) ?? []), i]);

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

          {canEdit && (
            <div className="mt-6 border-t border-line pt-5">
              <h2 className="font-bold">باركود أو رقم موديل لمنتج</h2>
              <p className="mt-1 text-xs leading-6 text-ink-3">
                هذا ما يسمح بمطابقة ملفات الشركاء تلقائيًا وبأمان. أدخله من علبة المنتج أو صفحته الرسمية فقط.
              </p>
              <form action={addProductIdentifier} className="mt-3 space-y-3">
                <Field label="المنتج">
                  <select name="productId" required className={inputCls}>
                    {products.filter((p) => p.status === "active").map((p) => (
                      <option key={p.id} value={p.id}>{p.publicId} — {p.nameAr}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
                  <Field label="النوع">
                    <select name="kind" className={inputCls}>
                      <option value="gtin">باركود</option>
                      <option value="mpn">رقم موديل</option>
                      <option value="store_sku">رمز متجر (ASIN/SKU)</option>
                    </select>
                  </Field>
                  <Field label="القيمة"><input name="value" required className={inputCls} dir="ltr" placeholder="0194253401234" /></Field>
                </div>
                <Field label="المتجر (لرمز المتجر فقط)" hint="رمز ASIN من رابط المنتج في amazon.sa (بعد /dp/)، أو رمز المنتج لدى نون/جرير">
                  <select name="storeId" className={inputCls} defaultValue="">
                    <option value="">—</option>
                    {stores.map((st) => <option key={st.id} value={st.id}>{st.id}</option>)}
                  </select>
                </Field>
                <SubmitButton>إضافة المعرّف</SubmitButton>
              </form>
            </div>
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
                  <th className="px-4 py-2 font-medium">باركود / موديل</th>
                  <th className="px-4 py-2 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="num px-4 py-2 text-ink-3">{p.publicId}</td>
                    <td className="px-4 py-2">
                      <Link href={`/admin/catalog/${p.id}`} className="font-medium hover:text-brand-soft" title="تعديل الاسم والمواصفات">{p.nameAr}</Link>
                      {p.isDemo && <Badge tone="coral" className="mr-2">تجريبي</Badge>}
                      {p.status === "active" && (
                        <Link href={`/product/${p.publicId}`} className="mr-2 text-xs text-ink-3 underline hover:text-ink">في الموقع</Link>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-2">{p.brand}</td>
                    <td className="px-4 py-2 text-ink-2">{p.category}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(idsByProduct.get(p.id) ?? []).map((i) => (
                          <form key={i.id} action={deleteProductIdentifier} className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-0.5 text-xs" dir="ltr">
                            <span title={i.kind === "gtin" ? "باركود" : i.kind === "mpn" ? "رقم موديل" : `رمز ${i.storeId}`}>{i.kind === "store_sku" ? `${i.storeId}:` : ""}{i.value}</span>
                            {canEdit && (
                              <>
                                <input type="hidden" name="id" value={i.id} />
                                <button type="submit" className="text-ink-3 hover:text-coral" aria-label="حذف المعرّف">×</button>
                              </>
                            )}
                          </form>
                        ))}
                        {!idsByProduct.get(p.id) && <span className="text-xs text-ink-3">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {p.status === "active" ? <Badge tone="good">منشور</Badge> : <Badge>{p.status === "archived" ? "مخفي" : p.status}</Badge>}
                        {canEdit && (
                          <form action={changeProductStatus}>
                            <input type="hidden" name="productId" value={p.id} />
                            <input type="hidden" name="status" value={p.status === "active" ? "archived" : "active"} />
                            <button type="submit" className="text-xs text-ink-3 underline hover:text-ink">
                              {p.status === "active" ? "إخفاء" : "إظهار"}
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
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
