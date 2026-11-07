import { CheckCircle2, ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import BrandCard from "./components/BrandCard";
import HomeSearch from "./components/HomeSearch";
import {
  Boxes3D,
  Car3D,
  CarKey3D,
  Cart3D,
  Chart3D,
  Coins3D,
  Magnifier3D,
  Phone3D,
  PriceTag3D,
  Scale3D,
} from "./components/illustrations";
import { Badge, Price, SectionHeading, formatNumber } from "./components/ui";
import products from "./data/products";
import { brandSummaries, featuredBrandIds } from "./lib/carBrands";
import { popularProducts } from "./lib/examples";
import { dataSource, getSiteStats, showLegacyReference, type SiteStats } from "./lib/catalog";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const featuredBrands = featuredBrandIds
  .map((id) => brandSummaries.find((b) => b.id === id))
  .filter((b) => b !== undefined);

/* بطاقة المثال في الواجهة تعرض بيانات منتج حقيقي من المنصة (غير موثقة) */
const showcase = products.find((p) => p.id === 1) ?? products[0];
const showcaseOffers = [...showcase.offers].sort((a, b) => a.price - b.price);

const statsOf = (siteStats: SiteStats): {
  art: ReactNode;
  value: number;
  label: string;
  tone: string;
}[] => [
  { art: <Boxes3D className="size-full" />, value: siteStats.products, label: "منتج إلكتروني", tone: "from-mint-50 to-white border-mint/30" },
  { art: <Cart3D className="size-full" />, value: siteStats.stores, label: "متجر مرجعي", tone: "from-yellow-50 to-white border-yellow/50" },
  { art: <Car3D className="size-full" />, value: siteStats.carBrands, label: "علامة سيارات", tone: "from-coral-50 to-white border-coral/25" },
  { art: <Chart3D className="size-full" />, value: siteStats.carModels, label: "موديل سيارة", tone: "from-cream to-white border-[#f2dfb8]" },
];

const STEPS: { art: ReactNode; title: string; text: string }[] = [
  {
    art: <Magnifier3D className="size-full" />,
    title: "ابحث",
    text: "اكتب اسم المنتج الذي تريد معرفة سعره، بالعربي أو بالإنجليزي.",
  },
  {
    art: <Scale3D className="size-full" />,
    title: "نقارن",
    text: "نقارن الأسعار بين المصادر والمتاجر للحصول على صورة أوضح للسوق.",
  },
  {
    art: <Chart3D className="size-full" />,
    title: "نحلل",
    text: "نحلل الأسعار ونحدد أقل سعر ومتوسط السوق والسعر العادل.",
  },
  {
    art: <PriceTag3D className="size-full" />,
    title: "قرر",
    text: "اعرف إذا كان السعر مناسبًا قبل اتخاذ قرار الشراء.",
  },
];

export default async function Home() {
  // في وضع MVP (قاعدة البيانات) تُحسب الأرقام من القاعدة؛ وإلا من البيانات الحالية
  const STATS = statsOf(await getSiteStats());
  // بطاقة المثال تعرض أسعارًا مرجعية قديمة غير موثقة من البيانات الحالية.
  // في وضع MVP تتبع نفس قاعدة صفحة المنتج: تُعرض موسومة "غير معتمد"، وتختفي إن عُطّل عرض المرجعي القديم.
  const isDb = dataSource() === "db";
  const showShowcase = !isDb || showLegacyReference();
  const maxOffer = Math.max(...showcaseOffers.map((o) => o.price));
  const minOffer = Math.min(...showcaseOffers.map((o) => o.price));

  return (
    <main id="home">
      {/* ================= HERO ================= */}
      <section className="theme-forest bg-hero relative overflow-hidden">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        {/* أشكال هندسية خفيفة */}
        <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 size-[30rem] rounded-full border border-mint/15" />
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 size-[22rem] rounded-full border border-mint/10" />
        <div aria-hidden className="pointer-events-none absolute right-[8%] top-24 hidden size-3 rotate-45 rounded-[3px] bg-coral/80 lg:block" />
        <div aria-hidden className="pointer-events-none absolute bottom-28 right-[42%] hidden size-2.5 rounded-full bg-yellow lg:block" />

        <div className="container-page relative grid grid-cols-1 items-center gap-10 pb-24 pt-10 sm:pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:pb-32 lg:pt-20">
          {/* النص والبحث */}
          <div className="min-w-0 text-center lg:text-right">
            {/* رسومات صغيرة للجوال فوق العنوان */}
            <div className="mb-5 flex items-end justify-center gap-1 lg:hidden" aria-hidden>
              <PriceTag3D className="size-14 -rotate-6" />
              <Magnifier3D className="size-16" />
              <Coins3D className="size-14" />
            </div>

            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-xs font-medium text-ink-2 backdrop-blur">
              <span className="size-1.5 rounded-full bg-mint" aria-hidden />
              منصة سعودية مستقلة لذكاء الأسعار
            </span>

            <h1 className="mx-auto mt-5 max-w-2xl text-[2.25rem] font-bold leading-[1.2] tracking-tight sm:text-5xl lg:mx-0 lg:text-[3.6rem] lg:leading-[1.15]">
              اعرف <span className="text-gradient">السعر الحقيقي</span>
              <br /> قبل أن تشتري
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-ink-2 sm:text-lg lg:mx-0">
              قارن الأسعار، افهم السوق، واكتشف السعر العادل للمنتج أو السيارة قبل
              اتخاذ قرار الشراء.
            </p>

            <div className="mt-8">
              <HomeSearch />
            </div>
          </div>

          {/* مشهد الرسومات (كمبيوتر) */}
          <div className="relative hidden h-[27rem] lg:block">
            <div aria-hidden className="absolute inset-10 rounded-full bg-mint/10 blur-3xl" />

            {showShowcase && (
            <Link
              href={`/product/${showcase.id}`}
              className="theme-light absolute left-1/2 top-1/2 z-10 w-72 -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/60 bg-white/95 p-5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.55)] backdrop-blur transition-transform hover:-translate-y-[52%]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-3">مثال من المنصة</span>
                <Badge tone="warn">{isDb ? "مرجعي قديم · غير معتمد" : "غير موثق"}</Badge>
              </div>
              <div className="mt-2 font-bold leading-snug">{showcase.nameAr}</div>
              <div className="mt-3 text-xs text-ink-3">أقل سعر مرجعي</div>
              <div className="text-2xl font-bold text-ink">
                <Price value={showcase.lowestPrice} />
              </div>
              <ul className="mt-3 space-y-1.5">
                {showcaseOffers.map((o) => {
                  const w = maxOffer === minOffer ? 100 : 55 + ((o.price - minOffer) / (maxOffer - minOffer)) * 45;
                  const best = o.price === minOffer;
                  return (
                    <li key={o.store} className="flex items-center gap-2 text-xs">
                      <span className="w-12 shrink-0 text-ink-2">{o.storeAr}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className={`block h-full rounded-full ${best ? "bg-mint" : "bg-[#dccfb6]"}`}
                          style={{ width: `${w}%` }}
                        />
                      </span>
                      <span className={`num w-12 shrink-0 text-left ${best ? "font-bold text-good-soft" : "text-ink-2"}`}>
                        {formatNumber(o.price)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Link>
            )}

            <Magnifier3D className="float absolute right-2 top-0 w-32" />
            <Coins3D className="float-slow absolute left-0 top-6 w-28" />
            <Cart3D className="float-slow absolute bottom-0 left-6 w-32" />
            <Chart3D className="float absolute bottom-2 right-6 w-28" />
            <PriceTag3D className="float absolute -right-6 top-1/2 w-20 -translate-y-1/2" />
            <Phone3D className="float-slow absolute -left-6 top-[45%] w-20" />
          </div>
        </div>

        {/* انتقال منحني إلى المحتوى */}
        <svg
          aria-hidden
          viewBox="0 0 1440 80"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 h-12 w-full text-bg sm:h-16"
        >
          <path d="M0 80V40C240 0 480 0 720 26s480 54 720 14v40Z" fill="#fbf7ef" />
        </svg>
      </section>

      {/* ================= STATS ================= */}
      <section aria-label="أرقام المنصة" className="container-page relative z-10 -mt-14 sm:-mt-16">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {STATS.map(({ art, value, label, tone }) => (
            <div
              key={label}
              className={`relative flex items-center gap-3 overflow-hidden rounded-[var(--radius-card)] border bg-gradient-to-br p-3 shadow-[var(--shadow-card)] sm:p-4 ${tone}`}
            >
              <span className="size-12 shrink-0 sm:size-14" aria-hidden>
                {art}
              </span>
              <div className="min-w-0 leading-tight">
                <dd className="num text-2xl font-bold text-ink">{formatNumber(value)}</dd>
                <dt className="truncate text-xs text-ink-2">{label}</dt>
              </div>
            </div>
          ))}
        </dl>
      </section>

      {/* ================= CARS ================= */}
      <section className="container-page pb-10 pt-12 sm:pb-14 sm:pt-16">
        <div className="bg-cream-wash relative overflow-hidden rounded-[1.75rem] border border-[#f2dfb8] p-5 sm:p-8">
          <div className="bg-dots-dark pointer-events-none absolute inset-0 opacity-50" aria-hidden />
          <div className="pointer-events-none absolute -left-4 top-4 hidden w-56 md:block" aria-hidden>
            <Car3D className="float-slow w-full" />
          </div>
          <div className="pointer-events-none absolute left-52 top-2 hidden w-16 md:block" aria-hidden>
            <CarKey3D className="float w-full" />
          </div>

          <div className="relative">
            <SectionHeading
              eyebrow="قسم السيارات"
              title={<>مرجع أسعار <span className="text-gradient-ink">السيارات</span></>}
              description="تعرّف على أسعار السيارات الجديدة في السعودية وقارن الموديلات والفئات قبل التواصل مع الوكيل."
              action={
                <Link
                  href="/cars"
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong md:hidden"
                >
                  استعرض السيارات
                  <ChevronLeft size={16} aria-hidden />
                </Link>
              }
            />

            <div className="scroll-x -mx-5 px-5 sm:mx-0 sm:px-0">
              <ul className="flex snap-x gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-5">
                {featuredBrands.map((brand) => (
                  <li key={brand.id} className="w-[11.5rem] shrink-0 snap-start sm:w-auto">
                    <BrandCard brand={brand} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 hidden justify-end md:flex">
              <Link
                href="/cars"
                className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand px-5 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
              >
                استعرض جميع السيارات
                <ChevronLeft size={16} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how-it-works" className="bg-mint-wash border-y border-mint/20 py-12 sm:py-16">
        <div className="container-page">
          <SectionHeading
            eyebrow="طريقة العمل"
            title={<>كيف يعمل <span className="text-gradient-ink" dir="ltr">TruePrice</span>؟</>}
            description="أربع خطوات بسيطة لمعرفة السعر قبل الشراء"
          />

          <ol className="relative grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[12%] top-12 hidden border-t-2 border-dashed border-mint/50 lg:block"
            />
            {STEPS.map(({ art, title, text }, i) => (
              <li key={title} className="card card-hover relative p-4 sm:p-5">
                <div className="flex items-start justify-between">
                  <span className="size-16 sm:size-20" aria-hidden>
                    {art}
                  </span>
                  <span className="num grid size-7 place-items-center rounded-full bg-forest font-mono text-xs font-semibold text-mint">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-bold">{title}</h3>
                <p className="mt-1 text-[0.8rem] leading-6 text-ink-2 sm:text-sm sm:leading-7">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= EXAMPLES ================= */}
      <section className="container-page py-12 sm:py-16">
        <div className="card relative overflow-hidden p-5 sm:p-8">
          <div className="bg-dots-dark pointer-events-none absolute inset-0 opacity-40" aria-hidden />
          <div className="pointer-events-none absolute -bottom-2 left-6 hidden w-28 md:block" aria-hidden>
            <Cart3D className="float-slow w-full" />
          </div>
          <div className="pointer-events-none absolute left-36 top-5 hidden w-14 md:block" aria-hidden>
            <Coins3D className="float w-full" />
          </div>
          <div className="relative md:pl-48">
        <SectionHeading
          eyebrow="🔎 أمثلة للبحث"
          title={<>ابدأ بأحد <span className="text-gradient-ink">المنتجات الشائعة</span></>}
          action={
            <Link
              href="/search"
              className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand-soft hover:text-brand"
            >
              كل المنتجات
              <ChevronLeft size={16} aria-hidden />
            </Link>
          }
        />
        <div className="flex flex-wrap gap-2">
          {popularProducts.map((product, i) => (
            <Link
              key={product}
              href={`/search?q=${encodeURIComponent(product)}`}
              className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink-2 shadow-[0_2px_6px_-3px_rgb(18_38_30/0.15)] transition-all hover:-translate-y-0.5 hover:border-mint hover:text-ink"
            >
              <span
                aria-hidden
                className={`size-2 rounded-full ${["bg-mint", "bg-yellow", "bg-coral"][i % 3]}`}
              />
              {product}
            </Link>
          ))}
        </div>
          </div>
        </div>
      </section>

      {/* ================= ABOUT ================= */}
      <section id="about" className="container-page pb-14 sm:pb-20">
        <div className="theme-forest bg-hero relative overflow-hidden rounded-[1.75rem] p-6 sm:p-10">
          <div className="bg-dots pointer-events-none absolute inset-0 opacity-60" aria-hidden />
          <div className="pointer-events-none absolute -bottom-6 left-4 hidden w-44 md:block" aria-hidden>
            <Boxes3D className="float-slow w-full" />
          </div>
          <div className="pointer-events-none absolute left-44 top-6 hidden w-24 md:block" aria-hidden>
            <Phone3D className="float w-full" />
          </div>

          <div className="relative max-w-2xl">
            <h2 className="text-[1.4rem] font-bold sm:text-[1.9rem]">عن <span className="text-gradient" dir="ltr">TruePrice</span></h2>
            <p className="mt-3 leading-8 text-ink-2">
              TruePrice منصة مستقلة تهدف إلى مساعدة المستهلك على فهم الأسعار
              ومقارنتها قبل الشراء، من خلال عرض بيانات الأسعار وتحليلها بطريقة
              بسيطة وواضحة.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <span className="inline-flex items-center gap-1.5 text-mint">
                <CheckCircle2 size={16} aria-hidden />
                منصة مستقلة لمرجع الأسعار والمعلومات
              </span>
              <Link
                href="/methodology"
                className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-white/[0.08] px-3 text-ink-2 transition-colors hover:bg-white/[0.14] hover:text-ink"
              >
                كيف نجمع الأسعار؟
                <ChevronLeft size={15} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
