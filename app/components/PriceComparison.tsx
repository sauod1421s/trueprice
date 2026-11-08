/**
 * مقارنة السوق والسعر العادل: رسم بياني أفقي (SVG من الخادم، بلا JavaScript) + ملخص + طريقة الحساب.
 * مصمم للعربية (الأشرطة تبدأ من اليمين) وللجوال (يتمدد بعرض الشاشة)، مع جدول بديل لقارئات الشاشة.
 */
import { ExternalLink, Info, Scale } from "lucide-react";
import { fairStatusText, METHOD_TEXT, MIN_SOURCES, type MarketSummary } from "../lib/valuation/market";
import { formatNumber, Price } from "./ui";

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium" });

const ROLE_LABEL = { used: "موثق — يدخل الحساب", outlier: "موثق — مستبعد لأنه شاذ", unverified: "غير موثق — لا يدخل الحساب" };

function niceFloor(v: number): number {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(v, 1))) - 1);
  return Math.floor(v / step) * step;
}

export function PriceComparison({
  summary,
  title = "مقارنة السوق والسعر العادل",
  emptyText,
  compact = false,
}: {
  summary: MarketSummary;
  title?: string;
  /** نص الحالة الفارغة (لا توجد أي أسعار) */
  emptyText?: string;
  compact?: boolean;
}) {
  const { points } = summary;
  const values = [...points.map((p) => p.price), summary.average, summary.fairPrice].filter(
    (v): v is number => typeof v === "number"
  );

  const maxV = values.length ? Math.max(...values) : 1;
  const minV = values.length ? Math.min(...values) : 0;
  // المحور يبدأ قبل أقل سعر حتى تظهر الفروق، ويُكتب ذلك صراحة تحت الرسم
  const lo = values.length > 1 && minV > 0 ? niceFloor(minV * 0.85) : 0;
  const hi = maxV * 1.02;
  const pct = (v: number) => Math.min(100, Math.max(2, ((v - lo) / Math.max(hi - lo, 1)) * 100));

  const markers = [
    summary.average !== null && { v: summary.average, label: "متوسط السوق", line: "border-[#2563eb] border-dashed", text: "text-[#2563eb]" },
    summary.fairPrice !== null && { v: summary.fairPrice, label: "السعر العادل", line: "border-good", text: "text-good" },
  ].filter(Boolean) as { v: number; label: string; line: string; text: string }[];

  const aria =
    points.length === 0
      ? `${title}: لا توجد أسعار`
      : `${title}: ${points.map((p) => `${p.storeAr} ${formatNumber(p.price)} ريال (${ROLE_LABEL[p.role]})`).join("، ")}` +
        (summary.average !== null ? `، متوسط السوق ${formatNumber(summary.average)}` : "") +
        (summary.fairPrice !== null ? `، السعر العادل ${formatNumber(summary.fairPrice)}` : "، السعر العادل غير متاح");

  return (
    <section aria-label={title} data-price-comparison className="card overflow-hidden p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Scale size={18} className="text-brand-soft" aria-hidden />
        {title}
      </h2>

      {points.length === 0 ? (
        <p className="mt-3 rounded-xl border border-line bg-surface-2 p-3 text-sm leading-7 text-ink-3" data-chart-empty>
          {emptyText ?? fairStatusText(summary)}
        </p>
      ) : (
        <figure className="mt-3">
          <div role="img" aria-label={aria} data-chart>
            <div className="grid grid-cols-[minmax(4.5rem,7.5rem)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5">
              {points.map((p, i) => (
                <div key={`${p.storeId}-${i}`} className="contents" data-chart-row={p.role}>
                  <span className={`truncate text-sm font-semibold ${p.role === "unverified" ? "text-ink-3" : ""}`} title={p.storeAr}>
                    {p.storeAr}
                  </span>
                  <span className={`relative ${compact ? "h-5" : "h-6"} rounded-md bg-surface-2`} aria-hidden>
                    <span
                      className={`absolute inset-y-0 right-0 rounded-md ${
                        p.role === "used" ? "bg-brand-soft" : p.role === "outlier" ? "bg-yellow" : "border border-dashed border-line-strong bg-[repeating-linear-gradient(45deg,var(--color-surface-2)_0_4px,var(--color-line)_4px_7px)]"
                      }`}
                      style={{ width: `${pct(p.price)}%` }}
                    />
                    {/* خطوط متوسط السوق والسعر العادل: نفس الموضع في كل صف فتتحاذى عموديًا */}
                    {markers.map((m) => (
                      <span
                        key={m.label}
                        data-chart-marker={i === 0 ? m.label : undefined}
                        className={`absolute -inset-y-1 border-r-2 ${m.line}`}
                        style={{ right: `${pct(m.v)}%` }}
                      />
                    ))}
                  </span>
                  <span className={`num text-left text-sm font-bold ${p.role === "unverified" ? "text-ink-3" : ""}`}>{formatNumber(p.price)}</span>
                </div>
              ))}
            </div>
          </div>
          <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.72rem] text-ink-3">
            <span className="inline-flex items-center gap-1"><i className="inline-block size-3 rounded-sm bg-brand-soft" aria-hidden /> موثق</span>
            {markers.map((m) => (
              <span key={m.label} className={`inline-flex items-center gap-1 font-semibold ${m.text}`}>
                <i className={`inline-block h-3 border-r-2 ${m.line}`} aria-hidden /> {m.label} <span className="num">{formatNumber(m.v)}</span>
              </span>
            ))}
            {points.some((p) => p.role === "outlier") && (
              <span className="inline-flex items-center gap-1"><i className="inline-block size-3 rounded-sm bg-yellow" aria-hidden /> موثق شاذ (مستبعد)</span>
            )}
            {points.some((p) => p.role === "unverified") && (
              <span className="inline-flex items-center gap-1"><i className="inline-block size-3 rounded-sm border border-line-strong bg-surface-2" aria-hidden /> غير موثق (لا يدخل الحساب)</span>
            )}
            {lo > 0 && <span>المحور يبدأ من {formatNumber(lo)} ر.س لإظهار الفروق</span>}
          </figcaption>

          <table className="sr-only">
            <caption>{title}</caption>
            <thead><tr><th>المصدر</th><th>السعر (ر.س)</th><th>الحالة</th><th>التاريخ</th></tr></thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}><td>{p.storeAr}</td><td>{formatNumber(p.price)}</td><td>{ROLE_LABEL[p.role]}</td><td>{p.asOf ? dateFmt.format(new Date(p.asOf)) : "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4" data-market-stats>
        <Stat title="أقل سعر موثق" value={summary.lowest} />
        <Stat title="متوسط السوق" value={summary.average} />
        <Stat title="السعر العادل" value={summary.fairPrice} empty="غير متاح مؤقتًا" strong testId="fair" />
        <div className="rounded-xl border border-line bg-surface-2 px-2 py-2.5">
          <dt className="text-[0.7rem] text-ink-3">مصادر في الحساب</dt>
          <dd className="num mt-0.5 text-lg font-bold" data-sources={summary.usedSources}>
            {summary.usedSources}<span className="text-xs font-medium text-ink-3"> / {MIN_SOURCES} مطلوبة</span>
          </dd>
        </div>
      </dl>

      {summary.fairPrice !== null && summary.lowest !== null && summary.lowest < summary.fairPrice && (
        <p className="mt-2 text-sm text-good" data-lowest-vs-fair>
          أقل سعر موثق أقل من السعر العادل بـ <Price value={summary.fairPrice - summary.lowest} className="font-bold" />
          {" "}({(((summary.fairPrice - summary.lowest) / summary.fairPrice) * 100).toFixed(1)}%).
        </p>
      )}

      <details className="mt-3 rounded-xl border border-line bg-surface-2 p-3 text-sm leading-7 text-ink-2">
        <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
          <Info size={14} aria-hidden /> كيف نحسب؟ — {summary.status === "available" ? "السعر العادل متاح" : "السعر العادل غير متاح مؤقتًا"}
        </summary>
        <p className="mt-2">{fairStatusText(summary)}</p>
        <p className="mt-1">{METHOD_TEXT}</p>
        {points.some((p) => p.url) && (
          <ul className="mt-2 space-y-1">
            {points.filter((p) => p.url).map((p, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink hover:underline">
                  {p.storeAr} <ExternalLink size={12} aria-hidden />
                </a>
                <span className="text-xs text-ink-3">
                  {ROLE_LABEL[p.role]}{p.asOf ? ` • رُصد ${dateFmt.format(new Date(p.asOf))}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

function Stat({ title, value, empty = "—", strong = false, testId }: { title: string; value: number | null; empty?: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`rounded-xl border px-2 py-2.5 ${strong && value !== null ? "border-mint/50 bg-mint-50" : "border-line bg-surface-2"}`}>
      <dt className="text-[0.7rem] text-ink-3">{title}</dt>
      <dd className="mt-0.5 text-lg font-bold" data-stat={testId}>
        {value !== null ? <Price value={value} /> : <span className="text-sm font-medium text-ink-3">{empty}</span>}
      </dd>
    </div>
  );
}
