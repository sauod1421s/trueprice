import Link from "next/link";
import { Badge, Price } from "../../components/ui";
import { legacyPendingCount, recentDecisions, reviewQueue } from "../../lib/admin/db";
import { reviewPrice } from "../actions";
import AdminShell, { can, Flash, inputCls, requireAdmin, SubmitButton } from "../_components/AdminShell";

type Props = { searchParams: Promise<{ ok?: string; err?: string; status?: string; legacy?: string }> };

const REASON: Record<string, string> = {
  unmatched: "غير مربوط بمنتج",
  unverified: "غير موثق",
  rejected: "مرفوض",
  stale: "أقدم من 14 يومًا",
  expired: "منتهي الصلاحية",
  unavailable: "غير متوفر",
  no_sar_price: "بلا سعر بالريال",
  date_unconfirmed: "تاريخ غير مؤكد",
  source_not_approved: "المصدر غير معتمد",
  store_inactive: "المتجر غير نشط",
};

const TABS = [
  { key: "unverified", label: "بانتظار المراجعة" },
  { key: "verified", label: "معتمدة" },
  { key: "rejected", label: "مرفوضة" },
] as const;

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

export default async function ReviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const status = (TABS.find((t) => t.key === sp.status)?.key ?? "unverified") as (typeof TABS)[number]["key"];
  const ctx = await requireAdmin();
  const legacy = sp.legacy === "1";
  const [items, decisions, legacyCount] = await Promise.all([
    reviewQueue(ctx.claims, status, { legacy }),
    recentDecisions(ctx.claims),
    legacyPendingCount(ctx.claims),
  ]);
  const returnTo = `/admin/review?status=${status}${legacy ? "&legacy=1" : ""}`;
  const canVerify = can(ctx, "price:verify");
  const canReject = can(ctx, "price:reject");

  return (
    <AdminShell ctx={ctx} active="/admin/review" title="مراجعة الأسعار" subtitle="لا يظهر سعر في الموقع قبل اعتماده · لا يراجع أحد سعرًا استورده بنفسه">
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === "unverified" ? "/admin/review" : `/admin/review?status=${t.key}`}
            className={`inline-flex h-9 items-center rounded-full border px-3.5 text-sm ${status === t.key ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink-2"}`}>
            {t.label}
          </Link>
        ))}
      </div>

      {status === "unverified" && (
        <p className="mb-4 text-xs leading-6 text-ink-3">
          {legacy ? (
            <>
              هذه الأسعار المرجعية القديمة (مصدر &quot;بيانات الموقع الحالية&quot;): تاريخها غير مؤكد وأقدم من 14 يومًا، لذلك
              حتى لو اعتُمدت لن تظهر في الموقع ولن تدخل في السعر العادل.{" "}
              <Link className="underline" href="/admin/review">العودة للأسعار الجديدة</Link>
            </>
          ) : (
            <>
              الأسعار المرجعية القديمة ({legacyCount}) في قائمة منفصلة:{" "}
              <Link className="underline" href="/admin/review?status=unverified&legacy=1">عرضها</Link>
            </>
          )}
        </p>
      )}

      {items.length === 0 ? (
        <p className="card p-6 text-center text-sm text-ink-3">لا توجد أسعار في هذه القائمة.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.observationId} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {it.publicId ? (
                      <Link href={`/product/${it.publicId}`} className="font-semibold hover:text-brand-soft">{it.product}</Link>
                    ) : (
                      <span className="font-semibold">{it.product}</span>
                    )}
                    {it.isDemo && <Badge tone="coral">بيانات تجريبية</Badge>}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-2">
                    {it.storeAr} <span className="text-ink-3" dir="ltr">({it.storeId})</span> · المصدر <span dir="ltr">{it.sourceId}</span>
                    {it.importedBy && <> · استورده {it.importedBy}</>}
                  </div>
                  <div className="mt-1 text-xs text-ink-3">تاريخ السعر: {dateFmt.format(new Date(it.asOf))}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {it.reasons.length === 0 ? <Badge tone="good">ظاهر في الموقع</Badge> : it.reasons.map((r) => <Badge key={r} tone="warn">{REASON[r] ?? r}</Badge>)}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-2xl font-bold"><Price value={it.amount} /></div>
                  {it.previousAmount !== null && (
                    <div className="text-xs text-ink-3">السابق: <Price value={it.previousAmount} /> (محفوظ في السجل)</div>
                  )}
                </div>
              </div>

              {(canVerify || canReject) && (
                <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                  {canVerify && status !== "verified" && (
                    <form action={reviewPrice} className="space-y-2">
                      <input type="hidden" name="observationId" value={it.observationId} />
                      <input type="hidden" name="status" value="verified" />
                      <input type="hidden" name="expectedPreviousEventId" value={it.lastEventId ?? ""} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input name="evidenceUrl" type="url" dir="ltr" placeholder="رابط الدليل https:// (مطلوب للأسعار اليدوية)" className={inputCls} />
                      {it.lastEventId !== null && <input name="note" placeholder="سبب عكس القرار (مطلوب)" className={inputCls} />}
                      <SubmitButton>اعتماد السعر</SubmitButton>
                    </form>
                  )}
                  {canReject && status !== "rejected" && (
                    <form action={reviewPrice} className="space-y-2">
                      <input type="hidden" name="observationId" value={it.observationId} />
                      <input type="hidden" name="status" value="rejected" />
                      <input type="hidden" name="expectedPreviousEventId" value={it.lastEventId ?? ""} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <input name="note" required minLength={3} placeholder="سبب الرفض (مطلوب)" className={inputCls} />
                      <SubmitButton tone="bad">رفض السعر</SubmitButton>
                    </form>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <section className="card mt-6 p-5">
        <h2 className="font-bold">آخر القرارات (سجل لا يُعدَّل)</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {decisions.length === 0 && <li className="py-2 text-ink-3">لا توجد قرارات بعد.</li>}
          {decisions.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {d.status === "verified" ? <Badge tone="good">اعتماد</Badge> : <Badge tone="coral">رفض</Badge>}{" "}
                {d.product ?? "—"} · <span dir="ltr">{d.storeId}</span> · <Price value={d.amount} />
                {d.note && <span className="text-ink-3"> — {d.note}</span>}
              </span>
              <span className="text-xs text-ink-3">{d.actor} · {dateFmt.format(new Date(d.at))}</span>
            </li>
          ))}
        </ul>
      </section>
    </AdminShell>
  );
}
