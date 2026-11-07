import type { Metadata } from "next";
import Link from "next/link";
import { visitorStats, type VisitorStats } from "../../lib/admin/db";
import AdminShell, { can, requireAdmin } from "../_components/AdminShell";

export const metadata: Metadata = { title: "إحصائيات الزوار", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PERIODS = [
  { d: 1, label: "اليوم" },
  { d: 7, label: "7 أيام" },
  { d: 30, label: "30 يومًا" },
  { d: 90, label: "90 يومًا" },
  { d: 365, label: "سنة" },
] as const;

const METRICS = {
  visitors: "الزوار الفريدون",
  visits: "الزيارات",
  pageviews: "مشاهدات الصفحات",
} as const;
type Metric = keyof typeof METRICS;

const DEVICE: Record<string, string> = { mobile: "جوال", tablet: "جهاز لوحي", desktop: "كمبيوتر" };
const nf = new Intl.NumberFormat("en-US");
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ d?: string; m?: string }> }) {
  const ctx = await requireAdmin();
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p.d) === sp.d)?.d ?? 30;
  const metric: Metric = sp.m === "visits" || sp.m === "pageviews" ? sp.m : "visitors";

  if (!can(ctx, "stats:read")) {
    return (
      <AdminShell ctx={ctx} active="/admin/analytics" title="إحصائيات الزوار">
        <p className="card p-5 text-sm text-ink-3">عرض الإحصائيات يتطلب صلاحية stats:read (مشرف أو مشاهد).</p>
      </AdminShell>
    );
  }
  const s = await visitorStats(ctx.claims, days);
  const multiDay = days > 1;

  return (
    <AdminShell
      ctx={ctx}
      active="/admin/analytics"
      title="إحصائيات الزوار"
      subtitle={`من ${s.from} إلى ${s.to} (بتوقيت الرياض) — أرقام حقيقية من زيارات الموقع، بلا ملفات تعريف، وتُستبعد الزيارات الآلية المعروفة`}
    >
      <nav className="flex flex-wrap gap-2" aria-label="الفترة">
        {PERIODS.map((p) => (
          <Link
            key={p.d}
            href={`/admin/analytics?d=${p.d}&m=${metric}`}
            aria-current={p.d === days ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm ${
              p.d === days ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink-2 hover:border-brand"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </nav>

      <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="الإجمالي">
        <Stat
          label={multiDay ? "الزوار الفريدون (مجموع الأيام)" : "الزوار الفريدون"}
          value={s.totals.daily_unique_visitors_sum}
          hint={multiDay ? "الزائر يُحسب مرة في كل يوم يزور فيه — لا نتتبع الزائر بين الأيام" : "زوار مختلفون اليوم"}
        />
        <Stat label="الزيارات" value={s.totals.visits} hint="جلسة جديدة بعد 30 دقيقة بلا نشاط" />
        <Stat label="مشاهدات الصفحات" value={s.totals.pageviews} hint="كل صفحة فُتحت" />
      </section>

      {multiDay && <DailyChart s={s} metric={metric} days={days} />}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <TopList title="أكثر المنتجات مشاهدة" rows={s.top_products.map((x) => ({ label: x.name ?? `منتج ${x.ref_id}`, href: `/product/${x.ref_id}`, n: x.n }))} />
        <TopList title="أكثر علامات السيارات مشاهدة" rows={s.top_cars.map((x) => ({ label: x.name ?? x.ref_id, href: `/cars/${x.ref_id}`, n: x.n }))} />
        <TopList title="أكثر كلمات البحث" rows={s.top_searches.map((x) => ({ label: x.q, href: `/search?q=${encodeURIComponent(x.q)}`, n: x.n }))} empty="لا عمليات بحث في هذه الفترة" />
        <TopList title="أكثر الصفحات زيارة" rows={s.top_pages.map((x) => ({ label: x.path, href: x.path, n: x.n, ltr: true }))} />
        <TopList title="مصادر الزيارات" rows={s.referrers.map((x) => ({ label: x.host === "direct" ? "مباشر / بلا إحالة" : x.host, n: x.n, ltr: x.host !== "direct" }))} />
        <TopList title="الأجهزة" rows={s.devices.map((x) => ({ label: DEVICE[x.device] ?? x.device, n: x.n }))} />
      </div>

      <p className="mt-5 text-xs leading-6 text-ink-3">
        الخصوصية: لا يُحفظ عنوان IP ولا بيانات المتصفح. يُحسب لكل زائر رمز يومي غير قابل للعكس يتغير كل يوم، وتُحذف مفاتيحه
        بعد يومين. كلمات البحث التي تشبه بريدًا أو رقم هاتف لا تُحفظ. إشارة Global Privacy Control تُحترم.
      </p>
    </AdminShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="num mt-1 text-3xl font-bold" data-stat={label}>{nf.format(value)}</div>
      <div className="mt-1 text-[0.7rem] leading-5 text-ink-3">{hint}</div>
    </div>
  );
}

function DailyChart({ s, metric, days }: { s: VisitorStats; metric: Metric; days: number }) {
  const values = s.daily.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const W = 720, H = 180, PAD_B = 22, PAD_T = 8;
  const n = s.daily.length;
  const step = W / n;
  const bw = Math.max(1, Math.min(18, step - 2));
  const labelEvery = Math.ceil(n / 8);
  return (
    <section className="card mt-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">{METRICS[metric]} يوميًا</h2>
        <div className="flex gap-1.5" role="group" aria-label="المقياس">
          {(Object.keys(METRICS) as Metric[]).map((m) => (
            <Link
              key={m}
              href={`/admin/analytics?d=${days}&m=${m}`}
              aria-current={m === metric ? "true" : undefined}
              className={`rounded-full border px-2.5 py-1 text-xs ${m === metric ? "border-brand text-brand" : "border-line text-ink-3 hover:text-ink"}`}
            >
              {METRICS[m]}
            </Link>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`${METRICS[metric]} يوميًا`} style={{ direction: "ltr" }}>
        <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="var(--color-line)" strokeWidth="1" />
        {s.daily.map((d, i) => {
          const v = d[metric];
          const h = ((H - PAD_B - PAD_T) * v) / max;
          const x = i * step + (step - bw) / 2;
          return (
            <g key={d.day}>
              <rect x={i * step} y={PAD_T} width={step} height={H - PAD_B - PAD_T} fill="transparent">
                <title>{`${d.day}: ${nf.format(v)}`}</title>
              </rect>
              {v > 0 && (
                <rect x={x} y={H - PAD_B - h} width={bw} height={h} rx={Math.min(4, bw / 2)} fill="var(--color-brand)" pointerEvents="none" />
              )}
              {i % labelEvery === 0 && (
                <text x={i * step + step / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">
                  {dayFmt.format(new Date(`${d.day}T00:00:00Z`))}
                </text>
              )}
            </g>
          );
        })}
        <text x="2" y={PAD_T + 10} fontSize="10" fill="var(--color-ink-3)">{nf.format(max)}</text>
      </svg>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-ink-3">عرض الأرقام كجدول</summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-right text-xs">
            <thead className="text-ink-3">
              <tr><th className="py-1 font-medium">اليوم</th><th className="py-1 font-medium">الزوار</th><th className="py-1 font-medium">الزيارات</th><th className="py-1 font-medium">المشاهدات</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...s.daily].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="num py-1" dir="ltr">{d.day}</td>
                  <td className="num py-1">{nf.format(d.visitors)}</td>
                  <td className="num py-1">{nf.format(d.visits)}</td>
                  <td className="num py-1">{nf.format(d.pageviews)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function TopList({
  title,
  rows,
  empty = "لا بيانات في هذه الفترة",
}: {
  title: string;
  rows: { label: string; n: number; href?: string; ltr?: boolean }[];
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="card p-5" aria-label={title}>
      <h2 className="font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                {r.href ? (
                  <Link href={r.href} className="truncate text-ink-2 hover:text-brand" dir={r.ltr ? "ltr" : undefined}>{r.label}</Link>
                ) : (
                  <span className="truncate text-ink-2" dir={r.ltr ? "ltr" : undefined}>{r.label}</span>
                )}
                <span className="num shrink-0 font-semibold">{nf.format(r.n)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                <div className="h-1.5 rounded-full bg-brand/70" style={{ width: `${(100 * r.n) / max}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
