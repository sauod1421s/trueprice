import type { Metadata } from "next";
import brands from "../data/cars";
import { brandNameAr } from "../lib/carBrands";
import { dataSource, getProducts } from "../lib/catalog";
import type { SearchableCar } from "../lib/search";
import SearchClient from "./SearchClient";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const hasQuery = typeof q === "string" && q.trim() !== "";

  return {
    title: "البحث عن المنتجات",
    description:
      "ابحث بالعربي أو بالإنجليزي عن الجوالات والأجهزة اللوحية واللابتوبات والتلفزيونات وقارن أسعارها المرجعية في السعودية.",
    alternates: { canonical: "/search" },
    // صفحات نتائج البحث لا تُفهرس حتى لا تتكرر الصفحات في محركات البحث
    robots: hasQuery ? { index: false, follow: true } : undefined,
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q : "";

  const products = await getProducts();
  const db = dataSource() === "db";
  // وضع القاعدة: البحث يشمل موديلات السيارات أيضًا (موديل واحد لكل اسم مع سنواته)
  const cars: SearchableCar[] = db ? carIndex() : [];

  // key يضمن إعادة تهيئة البحث عند تغيّر الرابط من صفحة أخرى
  return <SearchClient key={initialQuery} initialQuery={initialQuery} products={products} cars={cars} approvedOnly={db} />;
}

function carIndex(): SearchableCar[] {
  const out: SearchableCar[] = [];
  for (const [brandId, b] of Object.entries(brands)) {
    const byName = new Map<string, Set<number>>();
    for (const m of b.models) {
      const years = byName.get(m.name) ?? new Set<number>();
      years.add(m.year);
      byName.set(m.name, years);
    }
    for (const [name, years] of byName) {
      out.push({ brandId, brandAr: brandNameAr[brandId] ?? b.name, brand: b.name, name, years: [...years].sort() });
    }
  }
  return out;
}
