import Link from "next/link";
import { dashboardCounts } from "../lib/admin/db";
import { currentClaims, PREVIEW_USERS, previewAuthEnabled } from "../lib/admin/session";
import { loginAs } from "./actions";
import AdminShell, { Flash, requireAdmin } from "./_components/AdminShell";

type Props = { searchParams: Promise<{ ok?: string; err?: string }> };

export default async function AdminHome({ searchParams }: Props) {
  const { ok, err } = await searchParams;

  if (!previewAuthEnabled()) {
    return (
      <main className="container-page py-10">
        <h1 className="text-2xl font-bold">لوحة الإدارة</h1>
        <p className="mt-3 max-w-2xl leading-8 text-ink-2">
          لوحة MVP المرتبطة بقاعدة البيانات تعمل في النسخة التجريبية المحلية فقط
          (<code dir="ltr">npm run mvp:setup</code> ثم <code dir="ltr">npm run mvp:dev</code>).
        </p>
        <Link href="/admin/import" className="mt-4 inline-block text-brand-soft underline">
          معاينة ملفات الأسعار في المتصفح (بدون حفظ)
        </Link>
      </main>
    );
  }

  if (!(await currentClaims())) {
    return (
      <main className="container-page py-10">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-coral/30 bg-coral-50 px-4 py-3 text-sm leading-7 text-coral-ink">
            دخول تجريبي محلي لاختبار دورة العمل. في الإنتاج سيكون الدخول عبر Supabase Auth مع التحقق
            الثنائي، والصلاحيات تحددها القاعدة لا هذه الشاشة.
          </div>
          <h1 className="mt-6 text-2xl font-bold">الدخول إلى لوحة الإدارة (معاينة)</h1>
          <Flash ok={ok} err={err} />
          <ul className="mt-4 space-y-3">
            {PREVIEW_USERS.map((u) => (
              <li key={u.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="font-semibold">{u.name}</div>
                  <div className="text-sm text-ink-3">{u.note}</div>
                </div>
                <form action={loginAs}>
                  <input type="hidden" name="uid" value={u.id} />
                  <button className="min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong">
                    دخول
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </main>
    );
  }

  const ctx = await requireAdmin();
  const counts = await dashboardCounts(ctx.claims);
  const tiles = [
    { label: "أسعار بانتظار المراجعة", value: counts.pending, href: "/admin/review", tone: "border-yellow/60 bg-yellow-50" },
    { label: "أسعار معتمدة ظاهرة", value: counts.verified, href: "/admin/review?status=verified", tone: "border-mint/50 bg-mint-50" },
    { label: "أسعار مرفوضة", value: counts.rejected, href: "/admin/review?status=rejected", tone: "border-coral/30 bg-coral-50" },
    { label: "استيراد بانتظار الاعتماد", value: counts.previewed, href: "/admin/prices", tone: "border-line bg-surface" },
    { label: "منتجات", value: counts.products, href: "/admin/catalog", tone: "border-line bg-surface" },
    { label: "متاجر نشطة", value: counts.stores, href: "/admin/stores", tone: "border-line bg-surface" },
    { label: "مصادر معتمدة", value: counts.sources, href: "/admin/stores", tone: "border-line bg-surface" },
  ];

  return (
    <AdminShell ctx={ctx} active="/admin" title="لوحة الإدارة" subtitle="دورة العمل: منتج ← متجر ومصدر ← استيراد ← معاينة ← اعتماد ← ظهور في الموقع">
      <Flash ok={ok} err={err} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className={`rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 ${t.tone}`}>
            <div className="num text-3xl font-bold">{t.value}</div>
            <div className="mt-1 text-sm text-ink-2">{t.label}</div>
          </Link>
        ))}
      </div>

      <section className="card mt-6 p-5">
        <h2 className="font-bold">ما المفعّل وما المعطّل مؤقتًا في MVP</h2>
        <div className="mt-3 grid gap-4 text-sm leading-7 sm:grid-cols-2">
          <ul className="list-disc pr-5 text-ink-2">
            <li>المنتجات والتصنيفات والمتاجر ومصادر الأسعار</li>
            <li>الأسعار بالريال السعودي فقط</li>
            <li>لا يظهر سعر قبل اعتماده من مشرف أو مراجع آخر (مبدأ العينين)</li>
            <li>السعر العادل والمتوسط والأعلى والأقل من الأسعار المعتمدة فقط</li>
            <li>سجل الأسعار: كل تحديث يضيف سجلًا ولا يمسح السابق</li>
          </ul>
          <ul className="list-disc pr-5 text-ink-3">
            <li>تحويل العملات — معطّل مؤقتًا (التصميم والجداول باقية)</li>
            <li>الاستيراد الآلي من الخدمات — معطّل مؤقتًا</li>
            <li>الاستيراد الضخم — حد 1,000 صف للتشغيل الواحد</li>
            <li>
              مطابقة ملفات الشبكات بالاسم — متاحة كمعاينة فقط في{" "}
              <Link href="/admin/import" className="underline">صفحة المعاينة القديمة</Link>
            </li>
          </ul>
        </div>
      </section>
    </AdminShell>
  );
}
