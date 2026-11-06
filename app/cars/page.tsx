import { Info } from "lucide-react";
import { Car3D, CarKey3D, Coins3D } from "../components/illustrations";
import { priceSources } from "../data/priceSources";
import { formatNumber, SectionHeading, TrustNote } from "../components/ui";
import { brandSummaries } from "../lib/carBrands";
import { siteStats } from "../lib/siteStats";
import { TRUST_TEXT } from "../lib/trust";
import BrandGrid from "./BrandGrid";

const marketSourceCount = priceSources.filter((s) => s.type === "market").length;

export default function CarsPage() {
  const stats = [
    { value: siteStats.carBrands, label: "علامات تجارية" },
    { value: siteStats.carModels, label: "موديل" },
    { value: marketSourceCount, label: "مصادر مقارنة السوق" },
  ];

  return (
    <main>
      <section className="theme-forest bg-hero relative overflow-hidden">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full border border-mint/15" />
        <div className="pointer-events-none absolute bottom-6 left-4 hidden w-72 md:block lg:left-16" aria-hidden>
          <Car3D tone="mint" className="float-slow w-full" />
        </div>
        <div className="pointer-events-none absolute left-72 top-10 hidden w-20 lg:left-[22rem] lg:block" aria-hidden>
          <CarKey3D className="float w-full" />
        </div>
        <div className="pointer-events-none absolute left-10 top-8 hidden w-16 lg:block" aria-hidden>
          <Coins3D className="float w-full" />
        </div>
        <div className="container-page relative py-10 sm:py-14">
          <div className="mb-3 flex items-center gap-3">
            <Car3D className="w-20 md:hidden" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1 text-xs font-semibold text-mint">
              <span className="size-1.5 rounded-full bg-yellow" aria-hidden />
              قسم السيارات · المرحلة الأولى
            </span>
          </div>
          <h1 className="text-[1.9rem] font-bold leading-tight sm:text-4xl">
            مرجع أسعار <span className="text-gradient">السيارات</span>
          </h1>
          <p className="mt-3 max-w-2xl leading-8 text-ink-2">
            استعرض أسعار السيارات الجديدة في السعودية، وتعرّف على الموديلات
            والفئات قبل التواصل مع الوكيل أو البائع.
          </p>

          <dl className="mt-7 grid max-w-xl grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-3 text-center backdrop-blur sm:px-4">
                <dd className="num text-xl font-bold text-mint sm:text-2xl">{formatNumber(s.value)}</dd>
                <dt className="mt-0.5 text-[0.7rem] leading-5 text-ink-3 sm:text-xs">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container-page py-10 sm:py-14">
        <SectionHeading
          eyebrow="العلامات التجارية"
          title="اختر الشركة"
          description="اختر علامة تجارية لاستعراض سياراتها وأسعارها."
        />
        <BrandGrid brands={brandSummaries} />
      </section>

      <section className="container-page pb-14">
        <div className="card bg-cream-wash flex gap-3 p-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-mint-50 text-brand-soft" aria-hidden>
            <Info size={18} />
          </span>
          <div>
            <h2 className="font-semibold">ملاحظة حول الأسعار</h2>
            <p className="mt-1 text-sm leading-7 text-ink-2">
              أسعار السيارات والمواصفات قد تتغير حسب الموديل والفئة ووقت التحقق
              والمصدر. يجب التأكد من السعر النهائي والمواصفات من المصدر الرسمي أو
              الوكيل قبل اتخاذ قرار الشراء.
            </p>
          </div>
        </div>
        <TrustNote className="mt-3" title="الأسعار مرجعية وغير موثقة بعد">
          {TRUST_TEXT.carPriceSourceUnconfirmed} {TRUST_TEXT.dateUnconfirmed}.
        </TrustNote>
      </section>
    </main>
  );
}
