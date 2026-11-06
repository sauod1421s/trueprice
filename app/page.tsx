import {
  BarChart3,
  Car,
  CheckCircle2,
  ChevronLeft,
  Layers,
  Scale,
  Search,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import BrandCard from "./components/BrandCard";
import HomeSearch from "./components/HomeSearch";
import { SectionHeading, formatNumber } from "./components/ui";
import { brandSummaries, featuredBrandIds } from "./lib/carBrands";
import { popularProducts } from "./lib/examples";
import { siteStats } from "./lib/siteStats";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const featuredBrands = featuredBrandIds
  .map((id) => brandSummaries.find((b) => b.id === id))
  .filter((b) => b !== undefined);

const STATS: { icon: LucideIcon; value: number; label: string }[] = [
  { icon: Layers, value: siteStats.products, label: "منتج إلكتروني" },
  { icon: Store, value: siteStats.stores, label: "متجر مرجعي" },
  { icon: Car, value: siteStats.carBrands, label: "علامة سيارات" },
  { icon: BarChart3, value: siteStats.carModels, label: "موديل سيارة" },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Search,
    title: "ابحث",
    text: "اكتب اسم المنتج الذي تريد معرفة سعره، بالعربي أو بالإنجليزي.",
  },
  {
    icon: Store,
    title: "نقارن",
    text: "نقارن الأسعار بين المصادر والمتاجر للحصول على صورة أوضح للسوق.",
  },
  {
    icon: BarChart3,
    title: "نحلل",
    text: "نحلل الأسعار ونحدد أقل سعر ومتوسط السوق والسعر العادل.",
  },
  {
    icon: Scale,
    title: "قرر",
    text: "اعرف إذا كان السعر مناسبًا قبل اتخاذ قرار الشراء.",
  },
];

export default function Home() {
  return (
    <main id="home">
      {/* ================= HERO ================= */}
      <section className="theme-navy relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_26rem_at_50%_-8rem,rgb(37_99_235/0.4),transparent_70%),radial-gradient(30rem_18rem_at_85%_110%,rgb(20_184_166/0.18),transparent_70%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.035)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
        />

        <div className="container-page relative py-14 text-center sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-ink-2">
            <span className="size-1.5 rounded-full bg-teal" aria-hidden />
            منصة سعودية مستقلة لذكاء الأسعار
          </span>

          <h1 className="mx-auto mt-5 max-w-3xl text-[2.1rem] font-bold leading-[1.25] tracking-tight sm:text-5xl sm:leading-[1.2]">
            اعرف{" "}
            <span className="bg-gradient-to-l from-brand-soft to-accent bg-clip-text text-transparent">
              السعر الحقيقي
            </span>
            <br className="hidden sm:block" /> قبل أن تشتري
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-ink-2 sm:text-lg">
            قارن الأسعار، افهم السوق، واكتشف السعر العادل للمنتج أو السيارة قبل
            اتخاذ قرار الشراء.
          </p>

          <div className="mt-8">
            <HomeSearch />
          </div>
        </div>
      </section>

      {/* ================= STATS ================= */}
      <section aria-label="أرقام المنصة" className="container-page -mt-px py-8 sm:py-10">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="card flex items-center gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-soft">
                <Icon size={19} aria-hidden />
              </span>
              <div className="min-w-0 leading-tight">
                <dd className="num text-xl font-bold text-ink">{formatNumber(value)}</dd>
                <dt className="truncate text-xs text-ink-3">{label}</dt>
              </div>
            </div>
          ))}
        </dl>
      </section>

      {/* ================= CARS ================= */}
      <section className="container-page py-8 sm:py-12">
        <SectionHeading
          eyebrow={
            <>
              <Car size={14} aria-hidden /> قسم السيارات
            </>
          }
          title="مرجع أسعار السيارات"
          description="تعرّف على أسعار السيارات الجديدة في السعودية وقارن الموديلات والفئات قبل التواصل مع الوكيل."
          action={
            <Link
              href="/cars"
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-line-strong px-3 text-sm font-medium text-ink transition-colors hover:border-brand/50 hover:text-brand-soft"
            >
              استعرض السيارات
              <ChevronLeft size={16} aria-hidden />
            </Link>
          }
        />

        <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
          <ul className="flex snap-x gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-5">
            {featuredBrands.map((brand) => (
              <li key={brand.id} className="w-[11.5rem] shrink-0 snap-start sm:w-auto">
                <BrandCard brand={brand} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how-it-works" className="container-page py-8 sm:py-12">
        <SectionHeading
          eyebrow="طريقة العمل"
          title="كيف يعمل TruePrice؟"
          description="أربع خطوات بسيطة لمعرفة السعر قبل الشراء"
        />

        <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="card p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-lg bg-surface-3 text-brand-soft">
                  <Icon size={19} aria-hidden />
                </span>
                <span className="num font-mono text-xs text-ink-3">0{i + 1}</span>
              </div>
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-[0.8rem] leading-6 text-ink-2 sm:text-sm sm:leading-7">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ================= EXAMPLES ================= */}
      <section className="container-page py-8 sm:py-12">
        <SectionHeading
          eyebrow="🔎 أمثلة للبحث"
          title="ابدأ بأحد المنتجات الشائعة"
          action={
            <Link
              href="/search"
              className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand-soft hover:text-brand"
            >
              كل المنتجات
              <ChevronLeft size={16} aria-hidden />
            </Link>
          }
        />
        <div className="flex flex-wrap gap-2">
          {popularProducts.map((product) => (
            <Link
              key={product}
              href={`/search?q=${encodeURIComponent(product)}`}
              className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink-2 transition-colors hover:border-brand/40 hover:text-ink"
            >
              {product}
            </Link>
          ))}
        </div>
      </section>

      {/* ================= ABOUT ================= */}
      <section id="about" className="container-page pb-14 pt-8 sm:pb-20 sm:pt-12">
        <div className="card theme-navy relative overflow-hidden p-6 sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-0 size-72 rounded-full bg-brand/30 blur-3xl"
          />
          <div className="relative max-w-2xl">
            <h2 className="text-xl font-bold sm:text-2xl">عن TruePrice</h2>
            <p className="mt-3 leading-8 text-ink-2">
              TruePrice منصة مستقلة تهدف إلى مساعدة المستهلك على فهم الأسعار
              ومقارنتها قبل الشراء، من خلال عرض بيانات الأسعار وتحليلها بطريقة
              بسيطة وواضحة.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <span className="inline-flex items-center gap-1.5 text-accent">
                <CheckCircle2 size={16} aria-hidden />
                منصة مستقلة لمرجع الأسعار والمعلومات
              </span>
              <Link
                href="/methodology"
                className="inline-flex min-h-10 items-center gap-1 text-ink-2 underline-offset-4 hover:text-ink hover:underline"
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
