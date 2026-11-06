"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { popularProducts } from "../lib/examples";

export default function HomeSearch() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  function go(value: string) {
    const q = value.trim();
    if (!q) return;
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(search);
        }}
        className="flex items-center gap-2 rounded-2xl border border-line-strong bg-surface p-1.5 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.8)] transition-colors focus-within:border-brand/60"
      >
        <Search size={20} className="ms-3 shrink-0 text-ink-3" aria-hidden />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث عن أي منتج... مثال: ايفون 17"
          aria-label="البحث عن منتج"
          enterKeyHint="search"
          className="h-12 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          className="h-12 shrink-0 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong sm:px-7"
        >
          بحث
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
        <span className="text-ink-3">أمثلة:</span>
        {popularProducts.slice(0, 4).map((product) => (
          <button
            key={product}
            type="button"
            onClick={() => go(product)}
            className="min-h-9 rounded-full border border-line bg-surface/70 px-3 text-ink-2 transition-colors hover:border-brand/40 hover:text-brand-soft"
          >
            {product}
          </button>
        ))}
      </div>
    </div>
  );
}
