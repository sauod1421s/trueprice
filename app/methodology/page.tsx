import { Car, ListChecks, Rocket, Smartphone, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TrustNote } from "../components/ui";
import { TRUST_TEXT } from "../lib/trust";

export const metadata: Metadata = {
  title: "منهجية الأسعار",
  description:
    "كيف تجمع TruePrice الأسعار المرجعية وتعرضها، وما حالة التحقق الحالية من البيانات، ومتى يظهر السعر العادل.",
  alternates: { canonical: "/methodology" },
};

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card flex gap-4 p-5 sm:p-6">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-soft">
        <Icon size={19} aria-hidden />
      </span>
      <div className="min-w-0">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 leading-8 text-ink-2">{children}</p>
      </div>
    </section>
  );
}

export default function MethodologyPage() {
  return (
    <main>
      <div className="container-page max-w-3xl py-8 sm:py-12">
        <Link href="/" className="inline-flex min-h-10 items-center text-sm text-brand-soft hover:text-brand">
          ← العودة للرئيسية
        </Link>

        <h1 className="mt-3 text-[1.9rem] font-bold leading-tight sm:text-4xl">
          منهجية الأسعار في TruePrice
        </h1>
        <p className="mt-3 leading-8 text-ink-2">
          نوضح هنا من أين تأتي الأسعار المعروضة، وما الذي تم التحقق منه وما الذي
          لم يُتحقق منه بعد.
        </p>

        <TrustNote className="mt-6" title="حالة البيانات الحالية">
          المنصة نموذج أولي. جميع الأسعار المعروضة حاليًا {TRUST_TEXT.manualEntry}،
          وهي {TRUST_TEXT.unverified}ة، و{TRUST_TEXT.dateUnconfirmed}. لا توجد حتى
          الآن أي أسعار مجموعة آليًا أو مرتبطة مباشرة بالمتاجر، ولا تمثل الأسعار
          عرضًا من أي متجر.
        </TrustNote>

        <div className="mt-6 space-y-3">
          <Section icon={ListChecks} title="حالات التحقق">
            لكل سعر إحدى ثلاث حالات: <strong className="text-ink">غير موثق</strong>{" "}
            (الحالة الافتراضية لكل الأسعار الحالية)،{" "}
            <strong className="text-ink">موثق</strong> (بعد التأكد من المصدر وتاريخ
            الجمع)، <strong className="text-ink">مرفوض</strong>. الأسعار غير الموثقة
            لا تُستخدم في السعر العادل المعتمد مستقبلًا، ولا نعرض أي شارة «موثق» إلا
            بعد تحقق فعلي.
          </Section>

          <Section icon={Smartphone} title="الأجهزة الإلكترونية">
            نعرض أقل وأعلى ومتوسط الأسعار المرجعية لكل منتج. «السعر العادل» يُحسب
            من الأسعار الموثقة فقط، ويلزم توفرها من 3 متاجر مختلفة على الأقل، وهو
            الوسيط لهذه الأسعار. ولأن جميع الأسعار الحالية غير موثقة، فالسعر العادل
            مخفي مؤقتًا، وسيظهر تلقائيًا بعد اعتماد مصادر موثوقة. «التوفير» هو
            الفرق بين السعر العادل الموثوق والسعر المعروض، ولا يظهر عند عدم كفاية
            البيانات.
          </Section>

          <Section icon={Car} title="السيارات">
            للسيارات منهجية مستقلة عن الإلكترونيات. السعر المرجعي لكل موديل منسوب
            إلى مصدر مذكور، لكن {TRUST_TEXT.carPriceSourceUnconfirmed} يظهر السعر
            العادل فقط عند توفر أسعار من 3 مصادر سوقية على الأقل، ويُخفى إذا كانت
            الأسعار متطابقة حرفيًا في كل المصادر، لأن ذلك يشير إلى أنها قد لا تكون
            مستقلة، حتى تتم مراجعتها.
          </Section>

          <Section icon={Rocket} title="ما القادم">
            نعمل على جمع الأسعار من مصادر معتمدة عبر واجهات رسمية أو اتفاقيات مع
            المتاجر فقط، مع حفظ تاريخ كامل لكل سعر ومراجعة قبل اعتماده. حتى ذلك
            الحين، تحقّق دائمًا من السعر النهائي لدى المتجر أو الوكيل قبل الشراء.
          </Section>
        </div>
      </div>
    </main>
  );
}
