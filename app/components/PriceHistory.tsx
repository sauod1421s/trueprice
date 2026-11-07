import { History } from "lucide-react";
import type { PriceHistoryPoint } from "../lib/catalog/types";
import { Badge, Price } from "./ui";

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * سجل الأسعار المعتمدة لكل متجر، الأحدث أولًا.
 * كل سعر جديد يُضاف كسجل مستقل؛ السعر السابق يبقى كما هو ولا يُستبدل.
 * لا يظهر هنا أي سعر غير موثق أو مرفوض (تحدد ذلك القاعدة: pub.price_history).
 */
export default function PriceHistory({ points }: { points: PriceHistoryPoint[] }) {
  return (
    <section className="card p-5 sm:p-6" aria-labelledby="price-history">
      <div className="flex items-center gap-2">
        <History size={18} className="text-brand-soft" aria-hidden />
        <h2 id="price-history" className="text-lg font-bold">سجل الأسعار</h2>
      </div>
      <p className="mt-0.5 text-sm text-ink-3">
        الأسعار المعتمدة فقط، الأحدث أولًا. السعر السابق يبقى محفوظًا عند كل تحديث.
      </p>

      {points.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-2 p-5 text-center text-sm text-ink-3">
          لا يوجد سجل أسعار معتمدة بعد.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-line text-right text-xs text-ink-3">
                <th className="py-2 font-medium">المتجر</th>
                <th className="py-2 font-medium">السعر</th>
                <th className="py-2 font-medium">تاريخ السعر</th>
                <th className="py-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {points.map((p) => (
                <tr key={p.observationId}>
                  <td className="py-2.5">{p.storeAr}</td>
                  <td className="py-2.5 font-semibold">
                    <Price value={p.price} />
                  </td>
                  <td className="py-2.5 text-ink-2">
                    <time dateTime={p.asOf}>{dateFmt.format(new Date(p.asOf))}</time>
                  </td>
                  <td className="py-2.5">
                    {p.isCurrent ? <Badge tone="good">الحالي</Badge> : <Badge>سابق</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
