import type { Metadata } from "next";
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

  // key يضمن إعادة تهيئة البحث عند تغيّر الرابط من صفحة أخرى
  return <SearchClient key={initialQuery} initialQuery={initialQuery} />;
}
