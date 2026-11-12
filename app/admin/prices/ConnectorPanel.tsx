import Link from "next/link";
import { Badge } from "../../components/ui";
import { connectorSources, type ConnectorSourceRow } from "../../lib/admin/db";
import type { DbClaims } from "../../lib/db/pool";
import { readiness } from "../../lib/connectors/registry";
import { runSourceConnector } from "../actions";
import { SubmitButton } from "../_components/AdminShell";

const KIND: Record<string, string> = {
  official_api: "واجهة رسمية",
  affiliate_feed: "شبكة عمولة",
  store_feed: "ملف متجر",
};

/**
 * الجلب الآلي من المصادر المعتمدة (أمازون، ArabClicks، Admitad، ملفات المتاجر).
 * يظهر لكل مصدر سبب عدم جاهزيته إن وُجد. أسماء متغيرات البيئة الناقصة فقط تُعرض — لا قيم.
 */
export default async function ConnectorPanel({ claims }: { claims: DbClaims }) {
  const rows: ConnectorSourceRow[] = await connectorSources(claims);
  return (
    <section className="card mt-5 p-5" data-connector-panel>
      <h2 className="font-bold">الجلب من المصادر</h2>
      <p className="mt-1 text-sm leading-7 text-ink-3">
        يعمل المصدر فقط بعد اعتماده بأساس إذن مكتوب، والسماح له بالجلب الآلي، وضبط مفاتيحه على الخادم. الجلب ينشئ معاينة مختومة
        مثل الرفع اليدوي: تعتمدها، ثم يُراجَع كل سعر قبل ظهوره. لا يُرفع إلا ما يطابق منتجًا بباركود أو رقم موديل أو رمز متجر.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-3">
          لا توجد مصادر آلية بعد. أضف مصدرًا بنوع «واجهة رسمية» أو «شبكة عمولة» أو «ملف متجر» من{" "}
          <Link className="underline" href="/admin/stores">المتاجر والمصادر</Link>.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line text-sm">
          {rows.map((s) => {
            const r = readiness(s, process.env);
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-connector={s.id}>
                <div className="min-w-0">
                  <div className="font-medium">
                    {s.name} <span className="text-ink-3" dir="ltr">({s.id})</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    <Badge tone="neutral">{KIND[s.kind] ?? s.kind}</Badge>
                    {s.storeId && <Badge tone="neutral">المتجر: {s.storeId}</Badge>}
                    {s.networkId && <Badge tone="neutral">الشبكة: {s.networkId}</Badge>}
                    {r.ready ? <Badge tone="good">جاهز</Badge> : <Badge tone="warn">{r.reason}</Badge>}
                  </div>
                  {!r.ready && r.missing?.length ? (
                    <div className="mt-1 text-xs text-ink-3" dir="ltr">{r.missing.join(", ")}</div>
                  ) : null}
                </div>
                {r.ready && (
                  <form action={runSourceConnector}>
                    <input type="hidden" name="sourceId" value={s.id} />
                    <SubmitButton>اجلب الآن</SubmitButton>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
