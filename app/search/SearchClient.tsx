"use client";

import { Search } from "lucide-react";
import { Boxes3D, Magnifier3D } from "../components/illustrations";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ProductCard from "../components/ProductCard";
import { TrustNote } from "../components/ui";
import products from "../data/products";
import { searchProducts } from "../lib/search";
import { TRUST_TEXT } from "../lib/trust";

const categories = Array.from(
  new Map(products.map((p) => [p.category, p.categoryAr])).entries()
);

export default function SearchClient({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("all");

  function submit() {
    const value = input.trim();
    setQuery(value);
    router.replace(
      value ? `/search?q=${encodeURIComponent(value)}` : "/search",
      { scroll: false }
    );
  }

  const results = useMemo(() => {
    return searchProducts(products, query).filter(
      (product) => category === "all" || product.category === category
    );
  }, [query, category]);

  const chip = (active: boolean) =>
    `inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm transition-colors ${
      active
        ? "border-mint bg-mint font-semibold text-forest"
        : "border-white/15 bg-white/[0.06] text-ink-2 hover:border-white/30 hover:text-ink"
    }`;

  return (
    <main>
      <section className="theme-forest bg-hero relative overflow-hidden">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="pointer-events-none absolute left-6 top-6 hidden w-28 md:block lg:left-16" aria-hidden>
          <Magnifier3D className="float w-full" />
        </div>
        <div className="pointer-events-none absolute left-40 top-14 hidden w-20 lg:left-52 lg:block" aria-hidden>
          <Boxes3D className="float-slow w-full" />
        </div>
        <div className="container-page relative py-8 sm:py-12">
          <h1 className="text-[1.75rem] font-bold sm:text-4xl">البحث في <span className="text-gradient" dir="ltr">TruePrice</span></h1>
          <p className="mt-1 text-ink-2">ابحث عن أي جهاز أو شركة أو فئة</p>

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="theme-light mt-5 flex max-w-3xl items-center gap-2 rounded-2xl border border-white/40 bg-surface p-1.5 shadow-[0_24px_50px_-18px_rgb(0_0_0/0.55)] transition-shadow focus-within:shadow-[0_0_0_4px_rgb(61_220_151/0.45),0_24px_50px_-18px_rgb(0_0_0/0.55)]"
          >
            <span className="ms-1 grid size-10 shrink-0 place-items-center rounded-xl bg-mint-50 text-brand-soft" aria-hidden>
              <Search size={19} />
            </span>
            <input
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="مثال: آيفون، سامسونج، آيباد، شاومي..."
              aria-label="البحث عن منتج"
              enterKeyHint="search"
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
            />
            <button
              type="submit"
              className="h-11 shrink-0 rounded-xl bg-brand px-5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong sm:px-7"
            >
              بحث
            </button>
          </form>

          <div className="scroll-x -mx-4 mt-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-2" role="group" aria-label="تصفية حسب الفئة">
              <button
                type="button"
                aria-pressed={category === "all"}
                onClick={() => setCategory("all")}
                className={chip(category === "all")}
              >
                الكل
              </button>
              {categories.map(([cat, catAr]) => (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={category === cat}
                  onClick={() => setCategory(cat)}
                  className={chip(category === cat)}
                >
                  {catAr}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-page py-6 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-3" aria-live="polite">
          <span>
            عدد النتائج:{" "}
            <strong className="num text-ink">{results.length}</strong>
            {query && (
              <>
                {" "}
                لـ «<span className="text-ink">{query}</span>»
              </>
            )}
          </span>
        </div>

        <TrustNote className="mb-6">
          جميع الأسعار {TRUST_TEXT.manualEntry} و{TRUST_TEXT.unverified}، و
          {TRUST_TEXT.dateUnconfirmed}. تحقّق من السعر لدى المتجر قبل الشراء.
        </TrustNote>

        {results.length === 0 ? (
          <div className="card bg-cream-wash flex flex-col items-center px-6 py-10 text-center">
            <div className="relative h-28 w-40" aria-hidden>
              <Boxes3D className="absolute bottom-0 left-0 w-24 opacity-90" />
              <Magnifier3D className="absolute right-0 top-0 w-24" />
            </div>
            <p className="mt-3 font-medium">لا توجد منتجات مطابقة للبحث.</p>
            <p className="mt-1 text-sm text-ink-3">
              جرّب كلمات أقل أو اسم الشركة فقط (مثال: «سامسونج» أو «iPhone»).
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
