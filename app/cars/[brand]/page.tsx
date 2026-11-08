import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  Database,
  ExternalLink,
  Scale,
  ShieldCheck,
} from "lucide-react";

import brands, { type CarModel } from "@/app/data/cars";
import { Badge, BrandMonogram, Price, TrustNote } from "@/app/components/ui";
import { Car3D, CarKey3D } from "@/app/components/illustrations";
import { brandInitial, brandNameAr, brandSummaries } from "@/app/lib/carBrands";
import { dataSource, getVerifiedCarOffers, showLegacyReference, type VerifiedCarOffer } from "@/app/lib/catalog";
import { carSlugs } from "@/app/lib/catalog/carSlugs";
import { TRUST_TEXT } from "@/app/lib/trust";
import { PriceComparison } from "@/app/components/PriceComparison";
import { summarizeMarket, type MarketSummary } from "@/app/lib/valuation/market";

const verifiedDateFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  timeZone: "Asia/Riyadh",
  year: "numeric",
  month: "short",
  day: "numeric",
});

const MARKET_REFERENCES = [
  { name: "موتري", url: "https://ksa.motory.com/ar/" },
  { name: "سيارة", url: "https://syarah.com/" },
  { name: "هتلاقي", url: "https://ksa.hatla2ee.com/ar/" },
];

export function generateStaticParams() {
  return Object.keys(brands).map((brand) => ({ brand }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string }>;
}): Promise<Metadata> {
  const { brand: brandParam } = await params;
  const brandId = brandParam.toLowerCase();
  const brand = brands[brandId];

  if (!brand) {
    return { title: "العلامة غير موجودة", robots: { index: false } };
  }

  const nameAr = brandNameAr[brandId] ?? brand.name;
  const title = `أسعار سيارات ${nameAr} في السعودية`;
  const description = `أسعار مرجعية لـ ${brand.models.length} موديل من ${nameAr} (${brand.name}) في السعودية مع مقارنة السوق. الأسعار مرجعية وغير موثقة بعد.`;

  return {
    title,
    description,
    alternates: { canonical: `/cars/${brandId}` },
    openGraph: {
      title,
      description,
      url: `/cars/${brandId}`,
      siteName: "TruePrice",
      locale: "ar_SA",
      type: "website",
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: brandParam } = await params;

  const brandId = brandParam.toLowerCase();
  const brand = brands[brandId];

  if (!brand) {
    notFound();
  }

  const nameAr = brandNameAr[brandId] ?? brand.name;
  // وضع db: الأسعار المعتمدة من المراجع تظهر بجانب المرجع القديم. الوضع الثابت: خريطة فارغة (لا تغيير)
  const verified = await getVerifiedCarOffers(brandId);
  const slugs = carSlugs(brandId, brand.models);
  const showReference = dataSource() !== "db" || showLegacyReference();

  return (
    <main>
      {/* ================= BRAND SWITCHER ================= */}
      <nav aria-label="العلامات التجارية" className="border-b border-line bg-surface">
        <div className="container-page">
          <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
            <ul className="flex gap-1.5 py-2.5">
              <li className="shrink-0">
                <Link
                  href="/cars"
                  className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm text-ink-2 hover:text-ink"
                >
                  جميع السيارات
                </Link>
              </li>
              {brandSummaries.map((b) => {
                const active = b.id === brandId;
                return (
                  <li key={b.id} className="shrink-0">
                    <Link
                      href={`/cars/${b.id}`}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex h-9 items-center rounded-full border px-3 text-sm transition-colors ${
                        active
                          ? "border-brand bg-brand font-semibold text-on-brand"
                          : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
                      }`}
                    >
                      {b.nameAr}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </nav>

      <div className="container-page py-6 sm:py-10">
        {/* ================= BREADCRUMB ================= */}
        <ol className="mb-5 flex items-center gap-1 text-sm text-ink-3">
          <li>
            <Link href="/cars" className="hover:text-ink">
              السيارات
            </Link>
          </li>
          <li aria-hidden>
            <ChevronLeft size={14} />
          </li>
          <li className="text-ink-2" aria-current="page">
            {nameAr}
          </li>
        </ol>

        {/* ================= HERO ================= */}
        <section className="theme-forest bg-hero relative flex flex-col gap-5 overflow-hidden rounded-[1.75rem] p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="bg-dots pointer-events-none absolute inset-0 opacity-60" aria-hidden />
          <div className="pointer-events-none absolute -bottom-3 left-[30%] hidden w-56 lg:block" aria-hidden>
            <Car3D className="float-slow w-full" />
          </div>
          <div className="pointer-events-none absolute left-[22%] top-3 hidden w-14 lg:block" aria-hidden>
            <CarKey3D className="float w-full" />
          </div>
          <div className="relative flex min-w-0 items-center gap-4">
            <BrandMonogram label={brandInitial(brand.name)} toneKey={brandId} className="size-16 rounded-2xl text-lg" />
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge tone="warn">
                  <ShieldCheck size={13} aria-hidden />
                  بيانات مرجعية غير موثقة بعد
                </Badge>
              </div>
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
                {nameAr}{" "}
                <span className="text-lg font-medium text-ink-3" dir="ltr">
                  {brand.name}
                </span>
              </h1>
              <p className="mt-1 text-sm leading-7 text-ink-2">{brand.description}</p>
            </div>
          </div>

          <dl className="relative flex shrink-0 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5">
              <dt className="text-xs text-ink-3">عدد الموديلات</dt>
              <dd className="num text-2xl font-bold text-mint">{brand.models.length}</dd>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5">
              <dt className="text-xs text-ink-3">المصدر المذكور</dt>
              <dd className="mt-1 text-sm font-medium text-ink-2">{brand.sourceName}</dd>
            </div>
          </dl>
        </section>

        <TrustNote className="mt-4">
          الأسعار المعروضة مرجعية. {TRUST_TEXT.carPriceSourceUnconfirmed}{" "}
          {TRUST_TEXT.dateUnconfirmed}.
        </TrustNote>

        {/* ================= MODELS ================= */}
        <section aria-label={`موديلات ${nameAr}`} className="mt-8">
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {brand.models.map((car, i) => (
              <li key={`${car.name}-${car.year}-${car.trim ?? "base"}`}>
                <ModelCard
                  car={car}
                  sourceName={brand.sourceName}
                  verified={verified.get(slugs[i]) ?? NO_OFFERS}
                  showReference={showReference}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* ================= REFERENCES ================= */}
        <section className="card bg-cream-wash mt-8 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-mint-50 text-brand-soft" aria-hidden><Database size={16} /></span>
            المراجع
          </h2>
          <p className="mt-1 text-sm text-ink-3">
            ① مصدر السعر الرسمي للعلامة. ②–④ مواقع مقارنة يمكنك الرجوع إليها بنفسك: لا ننقل أسعارها ولا تدخل في حساباتنا.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <li>
              <ReferenceLink number="①" name={brand.sourceName} url={brand.sourceUrl} primary />
            </li>
            {MARKET_REFERENCES.map((ref, i) => (
              <li key={ref.url}>
                <ReferenceLink number={["②", "③", "④"][i]} name={ref.name} url={ref.url} />
              </li>
            ))}
          </ul>
        </section>

        {dataSource() === "db" && (
          <Link
            href={`/contact?kind=price_error&ref=${encodeURIComponent(`/cars/${brandId}`)}`}
            className="mt-4 flex min-h-11 items-center justify-center rounded-[var(--radius-card)] border border-line bg-surface px-4 text-sm text-ink-2 hover:border-brand hover:text-brand"
          >
            رأيت سعرًا مختلفًا لإحدى سيارات {nameAr}؟ أبلغ عن خطأ في السعر
          </Link>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   بطاقة الموديل
========================================================= */

const NO_OFFERS: VerifiedCarOffer[] = [];

function ModelCard({
  car,
  sourceName,
  verified,
  showReference,
}: {
  car: CarModel;
  sourceName: string;
  verified: VerifiedCarOffer[];
  showReference: boolean;
}) {
  // مقارنة السوق والسعر العادل من الأسعار المعتمدة فقط (نفس محرك الإلكترونيات)
  const market = summarizeMarket(
    verified.map((o) => ({ storeId: o.storeId, storeAr: o.storeAr, price: o.price, url: o.url, asOf: o.asOf, verified: true }))
  );

  return (
    <article className="card card-hover relative flex h-full flex-col overflow-hidden" data-car-card>
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-1 ${market.fairPrice !== null ? "bg-gradient-to-l from-mint to-[#1f9e69]" : verified.length > 0 ? "bg-mint/60" : "bg-line"}`}
      />
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold leading-snug" dir="ltr" style={{ textAlign: "right" }}>
            {car.name}
          </h2>
          <div className="num mt-0.5 text-xs text-ink-3">
            {car.year}
            {car.trim ? ` • ${car.trim}` : ""}
          </div>
        </div>
        <Badge>جديد</Badge>
      </div>

      {verified.length > 0 && (
        <div className="mx-4 mb-3 rounded-xl border border-mint/50 bg-mint-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-good-soft">
            <ShieldCheck size={13} aria-hidden />
            سعر معتمد من مراجع
          </div>
          <ul className="mt-2 space-y-1.5">
            {verified.map((o) => (
              <li key={o.storeId} className="flex items-center justify-between gap-3 text-sm">
                <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ink-2 hover:text-ink">
                  {o.storeAr}
                  <ExternalLink size={12} className="text-ink-3" aria-hidden />
                </a>
                <span className="text-left">
                  <Price value={o.price} className="font-bold" />
                  <span className="block text-[0.7rem] text-ink-3">بتاريخ {verifiedDateFmt.format(new Date(o.asOf))}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showReference ? (
        <>
          <div className="flex items-end justify-between gap-3 px-4">
            <div>
              <div className="text-xs text-ink-3">السعر المرجعي (غير موثق)</div>
              <div className="mt-0.5 text-2xl font-bold leading-tight">
                {typeof car.price === "number" ? (
                  <Price value={car.price} />
                ) : (
                  <span className="text-base font-medium text-ink-3">السعر غير متوفر</span>
                )}
              </div>
            </div>
            <FairPill market={market} />
          </div>
          <div className="mt-1 px-4 text-[0.7rem] text-ink-3">المصدر المذكور: {sourceName}</div>
        </>
      ) : (
        verified.length === 0 && <div className="px-4 text-sm text-ink-3">لا يوجد سعر معتمد لهذا الموديل بعد.</div>
      )}

      {(car.engine || car.power || car.fuel) && (
        <div className="mt-3 flex flex-wrap gap-1.5 px-4">
          {car.engine && <Badge>{car.engine}</Badge>}
          {car.power && <Badge>{car.power}</Badge>}
          {car.fuel && <Badge>{car.fuel}</Badge>}
        </div>
      )}

      <details className="group mt-auto border-t border-line [&:not([open])]:mt-4" data-market-details>
        <summary className="flex min-h-11 items-center justify-between gap-2 px-4 text-sm font-medium text-ink-2 transition-colors hover:text-ink">
          <span className="inline-flex items-center gap-1.5">
            <Scale size={15} aria-hidden />
            مقارنة السوق والسعر العادل
          </span>
          <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="px-3 pb-3">
          <PriceComparison
            summary={market}
            compact
            title={`مقارنة السوق — ${car.name} ${car.year}`}
            emptyText="لا توجد أسعار معتمدة وحديثة لهذا الموديل بعد، لذلك السعر العادل غير متاح مؤقتًا. يظهر هنا فور اعتماد أسعار من مصادر موثوقة."
          />
        </div>
      </details>
    </article>
  );
}

function FairPill({ market }: { market: MarketSummary }) {
  if (market.fairPrice !== null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-mint-50 px-2.5 py-1 text-xs font-semibold text-brand-soft">
        عادل <Price value={market.fairPrice} className="text-sm font-bold text-brand-soft" unitClassName="text-brand-soft/80 text-[0.7em]" />
      </span>
    );
  }
  return <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[0.7rem] text-ink-3">السعر العادل غير متاح مؤقتًا</span>;
}

function ReferenceLink({
  number,
  name,
  url,
  primary = false,
}: {
  number: string;
  name: string;
  url: string;
  primary?: boolean;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium transition-colors ${
        primary
          ? "border-mint/50 bg-mint-50 text-brand-soft hover:bg-mint-soft/60"
          : "border-line bg-surface-2 text-ink-2 hover:border-line-strong hover:text-ink"
      }`}
    >
      <span className="truncate">
        {number} {name}
      </span>
      <ExternalLink size={14} className="shrink-0" aria-hidden />
    </a>
  );
}
