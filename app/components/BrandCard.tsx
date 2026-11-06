import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { BrandSummary } from "../lib/carBrands";
import { BrandMonogram, Price } from "./ui";

export default function BrandCard({
  brand,
  className = "",
}: {
  brand: BrandSummary;
  className?: string;
}) {
  return (
    <Link
      href={`/cars/${brand.id}`}
      title={`أسعار ومواصفات سيارات ${brand.nameAr} في السعودية`}
      className={`card card-hover group flex h-full flex-col gap-3 p-4 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <BrandMonogram label={brand.initial} toneKey={brand.id} className="size-10 sm:size-11" />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[0.95rem] font-semibold text-ink">{brand.nameAr}</div>
          <div className="truncate text-xs text-ink-3" dir="ltr" style={{ textAlign: "right" }}>
            {brand.name}
          </div>
        </div>
        <ChevronLeft
          size={16}
          className="hidden shrink-0 text-ink-3 transition-transform sm:block group-hover:-translate-x-0.5 group-hover:text-brand"
          aria-hidden
        />
      </div>

      <div className="mt-auto space-y-0.5 border-t border-dashed border-line-strong pt-3 text-xs leading-5">
        <div className="text-ink-3">
          <span className="num font-semibold text-ink-2">{brand.modelCount}</span> موديل
        </div>
        <div className="truncate text-ink-3">
          {brand.minPrice !== null ? (
            <>
              يبدأ من{" "}
              <Price value={brand.minPrice} className="font-semibold text-ink" unitClassName="text-ink-3" />
            </>
          ) : (
            "لا يوجد سعر منشور"
          )}
        </div>
      </div>
    </Link>
  );
}
