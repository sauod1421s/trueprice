import { ChevronDown, ExternalLink } from "lucide-react";
import type { PriceOffer } from "../data/products";
import { TRUST_TEXT } from "../lib/trust";
import { Badge, Price } from "./ui";

/**
 * الأسعار المرجعية القديمة (من بيانات الموقع الحالية): مُدخلة يدويًا، غير موثقة،
 * وتاريخ جمعها غير مؤكد. تُعرض مطوية ومنفصلة عن الأسعار المعتمدة، ولا تدخل في
 * أقل/متوسط/أعلى سعر ولا في السعر العادل. محفوظة في القاعدة بانتظار المراجعة.
 */
export default function LegacyReferencePrices({ offers }: { offers: PriceOffer[] }) {
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  return (
    <details className="group card border-dashed">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 p-4 sm:px-6">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-semibold">أسعار مرجعية قديمة غير معتمدة</span>
          <Badge tone="warn">لا تدخل في أي حساب</Badge>
        </span>
        <ChevronDown size={16} className="shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-4 pb-4 sm:px-6">
        <p className="mt-3 text-xs leading-6 text-ink-3">
          {TRUST_TEXT.manualEntry} · {TRUST_TEXT.unverified} · {TRUST_TEXT.dateUnconfirmed}. محفوظة كما
          هي بانتظار المراجعة، ولا تُستخدم في أقل سعر أو المتوسط أو السعر العادل.
        </p>
        <ul className="mt-2 divide-y divide-line">
          {sorted.map((o, i) => (
            <li key={`${o.store}-${i}`} className="flex min-h-10 items-center justify-between gap-3 text-sm">
              <a
                href={o.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 text-ink-2 hover:text-ink"
              >
                <span className="truncate">{o.storeAr}</span>
                <ExternalLink size={12} className="shrink-0 text-ink-3" aria-hidden />
              </a>
              <Price value={o.price} className="text-ink-2" />
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
