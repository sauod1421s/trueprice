import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DETAIL_FIELDS, productForEdit, type DetailField } from "../../../lib/admin/db";
import { editProduct } from "../../actions";
import AdminShell, { can, Field, Flash, inputCls, requireAdmin, SubmitButton } from "../../_components/AdminShell";

export const metadata: Metadata = { title: "تعديل منتج", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const ctx = await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9]{1,12}$/.test(id)) notFound();
  const p = await productForEdit(ctx.claims, Number(id));
  if (!p) notFound();
  const edit = can(ctx, "catalog:edit");

  return (
    <AdminShell ctx={ctx} active="/admin/catalog" title={p.nameAr ?? p.name} subtitle={`${p.brand} · ${p.category} · الرقم العام ${p.publicId}`}>
      <Flash ok={sp.ok} err={sp.err} />
      <div className="flex flex-wrap gap-4 text-sm">
        <Link href="/admin/catalog" className="text-ink-3 hover:text-ink">← كل المنتجات</Link>
        {p.status === "active" && <Link href={`/product/${p.publicId}`} className="text-brand underline">صفحة المنتج في الموقع</Link>}
      </div>
      <form action={editProduct} className="card mt-4 grid gap-4 p-5 sm:grid-cols-2">
        <input type="hidden" name="id" value={p.id} />
        <Field label="الاسم بالعربي"><input name="nameAr" defaultValue={p.nameAr ?? ""} maxLength={500} className={inputCls} disabled={!edit} /></Field>
        <Field label="الاسم بالإنجليزي"><input name="name" defaultValue={p.name} required maxLength={500} dir="ltr" className={inputCls} disabled={!edit} /></Field>
        {(Object.entries(DETAIL_FIELDS) as [DetailField, string][]).map(([k, label]) => (
          <Field key={k} label={label}>
            <input name={k} defaultValue={p.details[k] ?? ""} maxLength={k === "screen" || k === "chip" ? 300 : 120} className={inputCls} disabled={!edit} />
          </Field>
        ))}
        <Field label="الألوان" hint="مفصولة بفاصلة"><input name="colors" defaultValue={p.details.colors.join("، ")} maxLength={400} className={inputCls} disabled={!edit} /></Field>
        <div className="sm:col-span-2">
          <Field label="الوصف"><textarea name="description" defaultValue={p.details.description ?? ""} maxLength={4000} rows={4} className={`${inputCls} py-2 leading-7`} disabled={!edit} /></Field>
        </div>
        <div className="sm:col-span-2">
          {edit ? <SubmitButton>حفظ التعديلات</SubmitButton> : <p className="text-sm text-ink-3">التعديل يتطلب صلاحية catalog:edit (مشرف).</p>}
          <p className="mt-2 text-xs text-ink-3">التعديل يشمل الاسم والمواصفات فقط. الأسعار تُضاف وتُراجع من صفحتي الاستيراد والمراجعة، وسجلها لا يُعدَّل.</p>
        </div>
      </form>
    </AdminShell>
  );
}
