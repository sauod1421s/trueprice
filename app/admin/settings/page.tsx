import type { Metadata } from "next";
import { siteSettings } from "../../lib/admin/db";
import { saveContactSettings } from "../actions";
import AdminShell, { can, Field, Flash, inputCls, requireAdmin, SubmitButton } from "../_components/AdminShell";

export const metadata: Metadata = { title: "الإعدادات", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireAdmin();
  const sp = await searchParams;
  const settings = await siteSettings(ctx.claims);
  const edit = can(ctx, "settings:manage");
  return (
    <AdminShell ctx={ctx} active="/admin/settings" title="الإعدادات" subtitle="بيانات التواصل الرسمية التي تظهر للزوار">
      <Flash ok={sp.ok} err={sp.err} />
      <section className="card max-w-xl p-5">
        <h2 className="font-bold">بيانات التواصل</h2>
        <p className="mt-1 text-xs leading-6 text-ink-3">
          تبقى فارغة حتى تُدخل البيانات الرسمية. الفارغ لا يظهر في الموقع إطلاقًا، ومسح الحقل يزيله. كل تغيير يُسجَّل في سجل التدقيق.
        </p>
        <form action={saveContactSettings} className="mt-4 space-y-3">
          <Field label="البريد الإلكتروني الرسمي">
            <input name="contact_email" type="email" dir="ltr" defaultValue={settings.contact_email?.value ?? ""} disabled={!edit} className={inputCls} placeholder="غير مضبوط" />
          </Field>
          <Field label="رقم الواتساب الرسمي" hint="بالصيغة الدولية، مثال: ‎+9665XXXXXXXX">
            <input name="contact_whatsapp" type="tel" dir="ltr" defaultValue={settings.contact_whatsapp?.value ?? ""} disabled={!edit} className={inputCls} placeholder="غير مضبوط" />
          </Field>
          {edit ? <SubmitButton>حفظ</SubmitButton> : <p className="text-sm text-ink-3">التعديل يتطلب صلاحية settings:manage (مشرف).</p>}
        </form>
      </section>
    </AdminShell>
  );
}
