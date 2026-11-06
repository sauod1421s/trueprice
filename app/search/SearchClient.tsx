"use client";

import { Search, SearchX } from "lucide-react";
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
        ? "border-brand bg-brand font-semibold text-white"
        : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
    }`;

  return (
    <main>
      <section className="theme-navy bg-[radial-gradient(40rem_16rem_at_50%_-6rem,rgb(37_99_235/0.3),transparent_70%)]">
        <div className="container-page py-8 sm:py-10">
          <h1 className="text-2xl font-bold sm:text-3xl">البحث في TruePrice</h1>
          <p className="mt-1 text-ink-2">ابحث عن أي جهاز أو شركة أو فئة</p>

          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="theme-light mt-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-surface p-1.5 transition-shadow focus-within:shadow-[0_0_0_4px_rgb(37_99_235/0.35)]"
          >
            <Search size={19} className="ms-2.5 shrink-0 text-ink-3" aria-hidden />
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
              className="h-11 shrink-0 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-strong sm:px-7"
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
          <div className="card flex flex-col items-center px-6 py-12 text-center">
            <SearchX size={36} className="text-ink-3" aria-hidden />
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
