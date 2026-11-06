import { Car, Info } from "lucide-react";
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
      <section className="border-b border-line bg-[radial-gradient(50rem_20rem_at_50%_-6rem,rgb(16_185_129/0.12),transparent_70%)]">
        <div className="container-page py-10 sm:py-14">
          <div className="eyebrow mb-3">
            <Car size={14} aria-hidden /> قسم السيارات · المرحلة الأولى
          </div>
          <h1 className="text-[1.9rem] font-bold leading-tight sm:text-4xl">
            مرجع أسعار السيارات
          </h1>
          <p className="mt-3 max-w-2xl leading-8 text-ink-2">
            استعرض أسعار السيارات الجديدة في السعودية، وتعرّف على الموديلات
            والفئات قبل التواصل مع الوكيل أو البائع.
          </p>

          <dl className="mt-7 grid max-w-xl grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
            {stats.map((s) => (
              <div key={s.label} className="bg-surface px-3 py-3 text-center sm:px-4">
                <dd className="num text-xl font-bold sm:text-2xl">{formatNumber(s.value)}</dd>
                <dt className="mt-0.5 text-[0.7rem] leading-5 text-ink-3 sm:text-xs">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="container-page py-8 sm:py-12">
        <SectionHeading
          eyebrow="العلامات التجارية"
          title="اختر الشركة"
          description="اختر علامة تجارية لاستعراض سياراتها وأسعارها."
        />
        <BrandGrid brands={brandSummaries} />
      </section>

      <section className="container-page pb-14">
        <div className="card flex gap-3 p-5">
          <Info size={19} className="mt-1 shrink-0 text-brand-soft" aria-hidden />
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
