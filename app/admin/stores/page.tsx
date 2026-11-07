import { Badge } from "../../components/ui";
import { listStoresAndSources } from "../../lib/admin/db";
import { addSource, addStore } from "../actions";
import AdminShell, { can, Field, Flash, inputCls, requireAdmin, SubmitButton } from "../_components/AdminShell";

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

const KIND_LABEL: Record<string, string> = {
  manual_upload: "رفع يدوي بدليل",
  store_feed: "ملف متجر واحد",
  legacy_manual: "بيانات الموقع الحالية",
  affiliate_feed: "شبكة تسويق",
  official_api: "واجهة رسمية",
};

export default async function StoresPage({ searchParams }: Props) {
  const { ok, err } = await searchParams;
  const ctx = await requireAdmin();
  const { stores, sources } = await listStoresAndSources(ctx.claims);

  return (
    <AdminShell ctx={ctx} active="/admin/stores" title="المتاجر ومصادر الأسعار" subtitle="لا يُستورد أي سعر إلا من مصدر معتمد بأساس إذن مكتوب">
      <Flash ok={ok} err={err} />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-bold">إضافة متجر</h2>
          {can(ctx, "store:approve_alias") ? (
            <form action={addStore} className="mt-4 space-y-3">
              <Field label="المعرّف الثابت" hint="أحرف لاتينية صغيرة وأرقام وشرطة، مثل jarir أو demo-store-a">
                <input name="id" required pattern="[a-z0-9][a-z0-9\-]{1,62}" className={inputCls} dir="ltr" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="الاسم (EN)"><input name="name" required className={inputCls} dir="ltr" /></Field>
                <Field label="الاسم بالعربية"><input name="nameAr" required className={inputCls} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isMarketplace" /> سوق متعدد البائعين</label>
              <label className="flex items-start gap-2 rounded-xl border border-coral/30 bg-coral-50 p-3 text-sm text-coral-ink">
                <input type="checkbox" name="isDemo" className="mt-1" />
                <span>متجر تجريبي للعرض (يُضاف البادئة demo- للمعرّف)</span>
              </label>
              <SubmitButton>إضافة المتجر</SubmitButton>
            </form>
          ) : (
            <p className="mt-3 text-sm text-ink-3">يتطلب صلاحية مشرف.</p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-bold">إضافة مصدر سعر</h2>
          {can(ctx, "source:manage") ? (
            <form action={addSource} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="المعرّف"><input name="id" required pattern="[a-z0-9][a-z0-9\-]{1,62}" className={inputCls} dir="ltr" /></Field>
                <Field label="الاسم"><input name="name" required className={inputCls} /></Field>
              </div>
              <Field label="النوع" hint="الاستيراد الآلي والشبكات معطّلة مؤقتًا في MVP">
                <select name="kind" className={inputCls}>
                  <option value="manual_upload">رفع يدوي بدليل (لقطة/صفحة المتجر)</option>
                  <option value="store_feed">ملف متجر واحد</option>
                </select>
              </Field>
              <Field label="المتجر (لملف متجر واحد فقط)">
                <select name="storeId" className={inputCls} defaultValue="">
                  <option value="">—</option>
                  {stores.filter((s) => s.status === "active").map((s) => (
                    <option key={s.id} value={s.id}>{s.nameAr} ({s.id})</option>
                  ))}
                </select>
              </Field>
              <Field label="أساس الإذن" hint="مثال: اتفاقية مع المتجر، أو إدخال يدوي من صفحة عامة بدليل لكل سعر">
                <input name="permissionBasis" required className={inputCls} />
              </Field>
              <Field label="رابط الدليل (اختياري)"><input name="evidenceUrl" type="url" className={inputCls} dir="ltr" placeholder="https://" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="approve" defaultChecked /> اعتماد المصدر الآن</label>
              <SubmitButton>إضافة المصدر</SubmitButton>
            </form>
          ) : (
            <p className="mt-3 text-sm text-ink-3">يتطلب صلاحية مشرف.</p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-bold">المتاجر ({stores.length})</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {stores.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <span>{s.nameAr} <span className="text-ink-3" dir="ltr">({s.id})</span></span>
                <span className="flex gap-1">
                  {s.isDemo && <Badge tone="coral">تجريبي</Badge>}
                  {s.status === "active" ? <Badge tone="good">نشط</Badge> : <Badge>{s.status}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="font-bold">المصادر ({sources.length})</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {sources.map((s) => (
              <li key={s.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{s.name}</span>
                  {s.status === "approved" ? <Badge tone="good">معتمد</Badge> : <Badge tone="warn">{s.status}</Badge>}
                </div>
                <div className="text-xs text-ink-3">
                  <span dir="ltr">{s.id}</span> · {KIND_LABEL[s.kind] ?? s.kind}
                  {s.storeId ? ` · ${s.storeId}` : ""}
                </div>
                {s.permissionBasis && <div className="mt-0.5 text-xs text-ink-3">الإذن: {s.permissionBasis}</div>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AdminShell>
  );
}
