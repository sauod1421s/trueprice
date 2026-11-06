"use client";

import { FileUp, Info, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge, TrustNote, formatNumber } from "../../components/ui";
import products from "../../data/products";
import { runImport, type ImportResult } from "../../lib/ingest/importer";
import { catalogFromProducts } from "../../lib/ingest/matching";
import type { FeedFormat, MatchResult, SourceConfig } from "../../lib/ingest/types";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const FORMAT_LABEL: Record<FeedFormat, string> = {
  csv: "CSV",
  "google-merchant": "Google Merchant",
  yml: "YML (XML)",
  xml: "XML عام",
};

const CONDITION_LABEL = { new: "جديد", used: "مستعمل", refurbished: "مجدد" } as const;
const AVAILABILITY_LABEL = {
  in_stock: "متوفر",
  out_of_stock: "غير متوفر",
  preorder: "طلب مسبق",
  unknown: "غير معروف",
} as const;

type Tab = "preview" | "review" | "rejected" | "warnings";

function MatchBadge({ match }: { match: MatchResult }) {
  if (match.status === "matched")
    return <Badge tone="good">مطابق ({match.method === "gtin" ? "باركود" : "موديل"})</Badge>;
  if (match.status === "needs_review") return <Badge tone="warn">يحتاج مراجعة</Badge>;
  return <Badge>غير موجود</Badge>;
}

export default function ImportWorkbench() {
  const catalog = useMemo(() => catalogFromProducts(products), []);

  const [sourceName, setSourceName] = useState("");
  const [kind, setKind] = useState<SourceConfig["kind"]>("affiliate_network");
  const [network, setNetwork] = useState("");
  const [defaultStore, setDefaultStore] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [format, setFormat] = useState<FeedFormat | "auto">("auto");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [tab, setTab] = useState<Tab>("preview");
  // سجل هذه الجلسة فقط (لا يُحفظ)
  const [sessionLog, setSessionLog] = useState<
    { at: string; source: string; file: string; format: FeedFormat; summary: ImportResult["summary"]; error?: string }[]
  >([]);

  async function preview() {
    setError(null);
    setResult(null);
    if (!sourceName.trim()) return setError("اكتب اسم المصدر أولًا.");
    if (!file) return setError("اختر ملفًا.");
    if (file.size > MAX_FILE_BYTES) return setError("حجم الملف أكبر من 15 ميغابايت.");

    setBusy(true);
    const at = new Date().toISOString();
    try {
      const content = await file.text();
      const source: SourceConfig = {
        id: sourceName.trim().toLowerCase().replace(/\s+/g, "-"),
        name: sourceName.trim(),
        kind,
        network: network.trim() || undefined,
        defaultStore: defaultStore.trim() || undefined,
        defaultCurrency: defaultCurrency || undefined,
      };
      const r = runImport({ source, fileName: file.name, content, format, catalog, importedAt: at });
      setResult(r);
      setTab("preview");
      setSessionLog((log) => [{ at, source: source.name, file: file.name, format: r.format, summary: r.summary }, ...log]);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setSessionLog((log) => [
        {
          at,
          source: sourceName,
          file: file.name,
          format: "csv",
          summary: { accepted: 0, rejected: 0, matched: 0, needsReview: 0, unmatched: 0, new: 0, used: 0, refurbished: 0 },
          error: msg,
        },
        ...log,
      ]);
    } finally {
      setBusy(false);
    }
  }

  const reviewRows = result?.accepted.filter((r) => r.match.status !== "matched") ?? [];
  const input = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-mint focus:shadow-[0_0_0_3px_rgb(61_220_151/0.3)]";

  return (
    <main>
      <section className="theme-forest bg-hero">
        <div className="container-page py-8">
          <h1 className="text-2xl font-bold sm:text-3xl">لوحة الاستيراد</h1>
          <p className="mt-1 text-sm text-ink-2">
            رفع ملفات المنتجات (CSV / XML / Google Merchant) ومعاينة القراءة والتحقق والمطابقة قبل الاستيراد.
          </p>
        </div>
      </section>

      <div className="container-page space-y-5 py-6">
        <TrustNote title="وضع المعاينة — لا يتم حفظ أي شيء">
          الملف يُقرأ داخل متصفحك فقط ولا يُرسل لأي خادم. حفظ المصادر وسجل الأسعار وسجل
          الاستيراد يحتاج اعتماد قاعدة البيانات أولًا. كل سعر مستورد يبدأ بحالة «غير موثق»
          ولا يدخل في السعر العادل.
        </TrustNote>

        {/* ===== إعداد المصدر والملف ===== */}
        <section className="card p-5">
          <h2 className="font-bold">المصدر والملف</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-ink-2">اسم المصدر *</span>
              <input className={input} value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="مثال: Admitad — متجر س" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-2">نوع المصدر</span>
              <select className={input} value={kind} onChange={(e) => setKind(e.target.value as SourceConfig["kind"])}>
                <option value="affiliate_network">شبكة عمولة</option>
                <option value="store_feed">ملف من متجر</option>
                <option value="manual_upload">رفع يدوي</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-2">الشبكة (اختياري)</span>
              <input className={input} value={network} onChange={(e) => setNetwork(e.target.value)} placeholder="Admitad / ArabClicks ..." />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-2">اسم المتجر إن لم يكن في الملف</span>
              <input className={input} value={defaultStore} onChange={(e) => setDefaultStore(e.target.value)} placeholder="اتركه فارغًا إن كان الملف يذكر المتجر" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-2">العملة إن لم تُذكر في الملف</span>
              <select className={input} value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
                <option value="">لا تفترض — ارفض الصف</option>
                <option value="SAR">ريال سعودي (SAR)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-2">الصيغة</span>
              <select className={input} value={format} onChange={(e) => setFormat(e.target.value as FeedFormat | "auto")}>
                <option value="auto">اكتشاف تلقائي</option>
                <option value="csv">CSV</option>
                <option value="google-merchant">Google Merchant (XML)</option>
                <option value="yml">YML (XML)</option>
                <option value="xml">XML عام</option>
              </select>
            </label>
          </div>

          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center text-sm transition-colors hover:border-mint">
            <FileUp size={24} className="text-brand-soft" aria-hidden />
            <span className="font-medium">{file ? file.name : "اختر ملف CSV أو XML"}</span>
            <span className="text-xs text-ink-3">
              {file ? `${formatNumber(file.size / 1024)} كيلوبايت` : "حتى 15 ميغابايت — يُقرأ في المتصفح فقط"}
            </span>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xml,.rss,.atom"
              className="sr-only"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {error && <p className="mt-3 rounded-xl border border-bad/30 bg-coral-50 px-3 py-2 text-sm text-bad">{error}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={preview}
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              {busy ? "جارٍ القراءة..." : "معاينة الملف"}
            </button>
            {result && (
              <button
                type="button"
                onClick={() => setResult(null)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-sm"
              >
                <RotateCcw size={15} aria-hidden /> مسح النتيجة
              </button>
            )}
          </div>
        </section>

        {/* ===== النتائج ===== */}
        {result && (
          <>
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold">ملخص القراءة</h2>
                <span className="text-xs text-ink-3">
                  الصيغة: <strong className="text-ink">{FORMAT_LABEL[result.format]}</strong> · {result.fileName}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                {[
                  ["صفوف الملف", result.totalRows],
                  ["مقبولة", result.summary.accepted],
                  ["مرفوضة", result.summary.rejected],
                  ["مكررة في الملف", result.duplicatesInFile],
                  ["مطابقة مؤكدة", result.summary.matched],
                  ["تحتاج مراجعة", result.summary.needsReview],
                  ["غير موجودة", result.summary.unmatched],
                  ["جديد / مستعمل / مجدد", `${result.summary.new} / ${result.summary.used} / ${result.summary.refurbished}`],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-xl border border-line bg-surface-2 p-3">
                    <dd className="num text-lg font-bold">{value}</dd>
                    <dt className="text-xs text-ink-3">{label}</dt>
                  </div>
                ))}
              </dl>

              <details className="mt-4 rounded-xl border border-line">
                <summary className="flex min-h-10 items-center px-3 text-sm text-ink-2">الأعمدة التي تم التعرف عليها</summary>
                <ul className="grid gap-1 border-t border-line p-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(result.columns).map(([field, col]) => (
                    <li key={field}>
                      <span className="text-ink-3">{field}</span> ← <span dir="ltr" className="font-mono">{col}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            <section className="card overflow-hidden">
              <div className="scroll-x border-b border-line">
                <div className="flex gap-1 p-2" role="tablist">
                  {(
                    [
                      ["preview", `معاينة البيانات (${result.accepted.length})`],
                      ["review", `قائمة المراجعة (${reviewRows.length})`],
                      ["rejected", `المرفوضة (${result.rejected.length})`],
                      ["warnings", `التحذيرات (${result.warnings.length})`],
                    ] as [Tab, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={tab === id}
                      onClick={() => setTab(id)}
                      className={`h-9 shrink-0 rounded-lg px-3 text-sm ${tab === id ? "bg-brand font-semibold text-on-brand" : "text-ink-2 hover:bg-surface-2"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="scroll-x">
                {tab === "preview" && (
                  <table className="w-full min-w-[900px] text-right text-sm">
                    <thead className="bg-surface-2 text-xs text-ink-3">
                      <tr>
                        {["صف", "المنتج", "المتجر", "السعر", "الحالة", "التوفر", "باركود / موديل", "تحديث المصدر", "المطابقة", "التحقق"].map((h) => (
                          <th key={h} className="px-3 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {result.accepted.slice(0, 200).map(({ offer, match }) => (
                        <tr key={`${offer.row}-${offer.url}`}>
                          <td className="num px-3 py-2 text-ink-3">{offer.row}</td>
                          <td className="max-w-64 px-3 py-2">
                            <a href={offer.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 hover:text-brand-soft">{offer.name}</a>
                            {offer.brand && <div className="text-xs text-ink-3">{offer.brand}</div>}
                          </td>
                          <td className="px-3 py-2">{offer.store}</td>
                          <td className="num whitespace-nowrap px-3 py-2 font-semibold">
                            {formatNumber(offer.price)} ريال
                            {offer.listPrice && <div className="text-xs font-normal text-ink-3 line-through">{formatNumber(offer.listPrice)}</div>}
                          </td>
                          <td className="px-3 py-2">{CONDITION_LABEL[offer.condition]}</td>
                          <td className="px-3 py-2">{AVAILABILITY_LABEL[offer.availability]}</td>
                          <td className="px-3 py-2 font-mono text-xs" dir="ltr">{offer.gtin ?? "—"}<br />{offer.mpn ?? "—"}</td>
                          <td className="num px-3 py-2 text-xs" dir="ltr">{offer.sourceUpdatedAt?.slice(0, 16).replace("T", " ") ?? "غير مذكور"}</td>
                          <td className="px-3 py-2"><MatchBadge match={match} /></td>
                          <td className="px-3 py-2"><Badge tone="warn">غير موثق</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {tab === "review" && (
                  <ul className="divide-y divide-line">
                    {reviewRows.length === 0 && <li className="p-6 text-center text-sm text-ink-3">لا توجد عناصر تحتاج مراجعة.</li>}
                    {reviewRows.map(({ offer, match }) => (
                      <li key={`${offer.row}-${offer.url}`} className="p-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="num text-ink-3">صف {offer.row} · </span>
                            <strong>{offer.name}</strong> <span className="text-ink-3">— {offer.store}</span>
                          </div>
                          <MatchBadge match={match} />
                        </div>
                        <p className="mt-1 text-xs text-ink-2">{match.status !== "matched" && match.reason}</p>
                        {match.status === "needs_review" && (
                          <ul className="mt-2 space-y-1">
                            {match.candidates.map((c) => (
                              <li key={c.productId} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                                <span className="font-medium">مرشح: {c.label}</span>
                                <span className="text-ink-3">#{c.productId}</span>
                                <span className="text-ink-3">{c.reasons.join(" · ")}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {tab === "rejected" && (
                  <ul className="divide-y divide-line">
                    {result.rejected.length === 0 && <li className="p-6 text-center text-sm text-ink-3">لا توجد صفوف مرفوضة.</li>}
                    {result.rejected.map((r) => (
                      <li key={r.row} className="p-4 text-sm">
                        <span className="num text-ink-3">صف {r.row}</span>
                        {Object.values(r.record)[0] && <span className="text-ink-2"> · {Object.values(r.record).slice(0, 2).join(" · ")}</span>}
                        <ul className="mt-1 list-inside list-disc text-xs text-bad">
                          {r.issues.filter((i) => i.severity === "error").map((i) => (
                            <li key={i.code}>{i.message}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}

                {tab === "warnings" && (
                  <ul className="divide-y divide-line">
                    {result.warnings.length === 0 && <li className="p-6 text-center text-sm text-ink-3">لا توجد تحذيرات.</li>}
                    {result.warnings.slice(0, 300).map((w, i) => (
                      <li key={`${w.row}-${w.code}-${i}`} className="px-4 py-2 text-xs">
                        <span className="num text-ink-3">صف {w.row}</span> · <span className="text-warn">{w.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}

        {/* ===== سجل الجلسة ===== */}
        <section className="card p-5">
          <h2 className="font-bold">سجل عمليات المعاينة</h2>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
            <Info size={13} aria-hidden /> سجل هذه الجلسة فقط — يختفي عند إغلاق الصفحة حتى يُعتمد التخزين الدائم.
          </p>
          {sessionLog.length === 0 ? (
            <p className="mt-3 text-sm text-ink-3">لم تتم أي معاينة بعد.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {sessionLog.map((l, i) => (
                <li key={`${l.at}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{l.source}</strong> <span className="text-ink-3">· {l.file}</span>
                  </span>
                  {l.error ? (
                    <Badge tone="coral">خطأ: {l.error.slice(0, 60)}</Badge>
                  ) : (
                    <span className="num text-xs text-ink-2">
                      {FORMAT_LABEL[l.format]} · مقبولة {l.summary.accepted} · مرفوضة {l.summary.rejected} · مراجعة {l.summary.needsReview}
                    </span>
                  )}
                  <span className="num text-xs text-ink-3" dir="ltr">{l.at.slice(11, 19)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
