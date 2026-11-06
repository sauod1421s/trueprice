import { ChevronDown, ChevronLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { Product } from "../data/products";
import { electronicsFairPrice } from "../lib/valuation/electronics";
import { Badge, Price, ProductVisual } from "./ui";

const HIDDEN_MEMORY = new Set(["—", "", "غير معلن رسميًا من Apple"]);

export default function ProductCard({ product }: { product: Product }) {
  // السعر العادل من الأسعار الموثقة فقط — لا يُعرض إذا لم تتوفر بيانات موثوقة
  const fair = electronicsFairPrice(product.offers);
  const verified = product.offers.length > 0 &&
    product.offers.every((o) => o.verificationStatus === "verified");
  const hasPrices = product.offers.length > 0;

  return (
    <article className="card card-hover flex h-full flex-col p-4">
      {/* الرأس */}
      <div className="flex gap-3">
        <ProductVisual category={product.category} className="size-16 shrink-0" size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-ink-3">
            {product.brandAr} · {product.categoryAr}
          </div>
          <h2 className="mt-0.5 line-clamp-2 font-semibold leading-snug">
            <Link href={`/product/${product.id}`} className="hover:text-brand-soft">
              {product.nameAr}
            </Link>
          </h2>
          <div className="mt-0.5 truncate text-xs text-ink-3" dir="ltr" style={{ textAlign: "right" }}>
            {product.name}
          </div>
        </div>
      </div>

      {/* السعة والذاكرة وحالة البيانات */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {product.storage && product.storage !== "—" && (
          <Badge>التخزين {product.storage}</Badge>
        )}
        {!HIDDEN_MEMORY.has(product.memory) && <Badge>الذاكرة {product.memory}</Badge>}
        {hasPrices && (
          <Badge tone={verified ? "good" : "warn"}>{verified ? "موثق" : "غير موثق"}</Badge>
        )}
      </div>

      {/* الأسعار */}
      {hasPrices ? (
        <div className="mt-4 rounded-xl bg-surface-2 p-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-xs text-ink-3">أقل سعر مرجعي</div>
              <div className="text-xl font-bold leading-tight">
                <Price value={product.lowestPrice} />
              </div>
            </div>
            <div className="text-left text-xs leading-5 text-ink-3">
              <div>
                حتى <Price value={product.highestPrice} className="text-ink-2" unitClassName="" />
              </div>
              <div>
                المتوسط <Price value={product.averagePrice} className="text-ink-2" unitClassName="" />
              </div>
            </div>
          </div>

          {fair.fairPrice !== null && (
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-sm">
              <span className="text-accent">السعر العادل</span>
              <Price value={fair.fairPrice} className="font-semibold text-accent" />
            </div>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-surface-2 p-3 text-sm text-ink-3">
          لا توجد أسعار متاحة حاليًا
        </p>
      )}

      {/* مراجع الأسعار */}
      {hasPrices && (
        <details className="group mt-3 rounded-lg border border-line">
          <summary className="flex min-h-11 items-center justify-between gap-2 px-3 text-sm text-ink-2 transition-colors hover:text-ink">
            <span>مراجع الأسعار</span>
            <span className="inline-flex items-center gap-1 text-xs text-ink-3">
              <span className="num">
                {product.offers.length} {product.offers.length === 1 ? "مرجع" : "مراجع"}
              </span>
              <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <ul className="divide-y divide-line border-t border-line px-3">
            {product.offers.map((offer, index) => (
              <li key={`${product.id}-${offer.store}-${index}`}>
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`فتح المرجع في متجر ${offer.storeAr}`}
                  className="flex min-h-10 items-center justify-between gap-2 text-sm text-ink-2 transition-colors hover:text-ink"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{offer.storeAr}</span>
                    <ExternalLink size={12} className="shrink-0 text-ink-3" aria-hidden />
                  </span>
                  <Price value={offer.price} className="font-medium text-ink" />
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex-1" />
      <Link
        href={`/product/${product.id}`}
        className="mt-4 flex min-h-11 items-center justify-center gap-1 rounded-lg border border-brand/30 text-sm font-semibold text-brand-soft transition-colors hover:bg-brand hover:text-white"
      >
        عرض التفاصيل والمقارنة
        <ChevronLeft size={16} aria-hidden />
      </Link>
    </article>
  );
}
