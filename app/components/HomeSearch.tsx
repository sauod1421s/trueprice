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
    <div className="mx-auto w-full max-w-2xl lg:mx-0">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(search);
        }}
        className="theme-light flex items-center gap-2 rounded-2xl border border-white/40 bg-surface p-1.5 shadow-[0_24px_50px_-18px_rgb(0_0_0/0.55)] transition-shadow focus-within:shadow-[0_0_0_4px_rgb(61_220_151/0.45),0_24px_50px_-18px_rgb(0_0_0/0.55)]"
      >
        <span className="ms-1 grid size-10 shrink-0 place-items-center rounded-xl bg-mint-50 text-brand-soft" aria-hidden>
          <Search size={19} />
        </span>
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
          className="h-12 shrink-0 rounded-xl bg-brand px-5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong sm:px-7"
        >
          بحث
        </button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm lg:justify-start">
        <span className="text-ink-3">أمثلة:</span>
        {popularProducts.slice(0, 4).map((product) => (
          <button
            key={product}
            type="button"
            onClick={() => go(product)}
            className="min-h-9 rounded-full border border-white/15 bg-white/[0.07] px-3 text-ink-2 backdrop-blur transition-colors hover:border-mint/60 hover:bg-white/[0.12] hover:text-ink"
          >
            {product}
          </button>
        ))}
      </div>
    </div>
  );
}
