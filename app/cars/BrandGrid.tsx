"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import BrandCard from "../components/BrandCard";
import type { BrandSummary } from "../lib/carBrands";
import { normalizeText } from "../lib/search";

export default function BrandGrid({ brands }: { brands: BrandSummary[] }) {
  const [filter, setFilter] = useState("");

  const visible = useMemo(() => {
    const q = normalizeText(filter).replace(/\s+/g, "");
    if (!q) return brands;
    return brands.filter((b) =>
      [b.nameAr, b.name, b.id].some((t) =>
        normalizeText(t).replace(/\s+/g, "").includes(q)
      )
    );
  }, [brands, filter]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="flex h-11 w-full items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 transition-colors focus-within:border-brand/60 sm:w-80">
          <Search size={17} className="shrink-0 text-ink-3" aria-hidden />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="ابحث عن علامة... مثال: تويوتا"
            aria-label="البحث عن علامة تجارية"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <span className="text-sm text-ink-3" aria-live="polite">
          <span className="num font-semibold text-ink-2">{visible.length}</span> علامة
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="card p-8 text-center text-sm text-ink-2">
          لا توجد علامة مطابقة. جرّب الاسم بالعربي أو بالإنجليزي.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((brand) => (
            <li key={brand.id}>
              <BrandCard brand={brand} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
