import type { Metadata } from "next";
import Link from "next/link";
import { TRUST_TEXT } from "../lib/trust";

export const metadata: Metadata = {
  title: "منهجية الأسعار",
  description:
    "كيف تجمع TruePrice الأسعار المرجعية وتعرضها، وما حالة التحقق الحالية من البيانات، ومتى يظهر السعر العادل.",
  alternates: { canonical: "/methodology" },
};

const section: React.CSSProperties = {
  background: "#0F172A",
  border: "1px solid #243244",
  borderRadius: 18,
  padding: "22px 24px",
  marginBottom: 18,
};

const h2: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 21,
  fontWeight: 800,
};

const p: React.CSSProperties = {
  margin: 0,
  color: "#CBD5E1",
  lineHeight: 2,
  fontSize: 15,
};

export default function MethodologyPage() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#080D14",
        color: "#F8FAFC",
        padding: "40px 20px 70px",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#6EE7B7", textDecoration: "none" }}>
          ← العودة للرئيسية
        </Link>

        <h1 style={{ fontSize: "clamp(30px,5vw,42px)", margin: "20px 0 8px" }}>
          منهجية الأسعار في TruePrice
        </h1>
        <p style={{ ...p, marginBottom: 26, color: "#94A3B8" }}>
          نوضح هنا من أين تأتي الأسعار المعروضة، وما الذي تم التحقق منه وما
          الذي لم يُتحقق منه بعد.
        </p>

        <section
          style={{
            ...section,
            background: "#1c1503",
            border: "1px solid #4a3a0a",
          }}
        >
          <h2 style={{ ...h2, color: "#FCD34D" }}>⚠️ حالة البيانات الحالية</h2>
          <p style={{ ...p, color: "#FDE68A" }}>
            المنصة نموذج أولي. جميع الأسعار المعروضة حاليًا{" "}
            {TRUST_TEXT.manualEntry}، وهي {TRUST_TEXT.unverified}ة، و
            {TRUST_TEXT.dateUnconfirmed}. لا توجد حتى الآن أي أسعار مجموعة
            آليًا أو مرتبطة مباشرة بالمتاجر، ولا تمثل الأسعار عرضًا من أي متجر.
          </p>
        </section>

        <section style={section}>
          <h2 style={h2}>حالات التحقق</h2>
          <p style={p}>
            لكل سعر إحدى ثلاث حالات: <strong>غير موثق</strong> (الحالة الافتراضية
            لكل الأسعار الحالية)، <strong>موثق</strong> (بعد التأكد من المصدر
            وتاريخ الجمع)، <strong>مرفوض</strong>. الأسعار غير الموثقة لا تُستخدم
            في السعر العادل المعتمد مستقبلًا، ولا نعرض أي شارة «موثق» إلا بعد
            تحقق فعلي.
          </p>
        </section>

        <section style={section}>
          <h2 style={h2}>الأجهزة الإلكترونية</h2>
          <p style={p}>
            نعرض أقل وأعلى ومتوسط الأسعار المرجعية لكل منتج. «السعر العادل»
            يُحسب من الأسعار الموثقة فقط، ويلزم توفرها من 3 متاجر مختلفة على
            الأقل، وهو الوسيط لهذه الأسعار. ولأن جميع الأسعار الحالية غير
            موثقة، فالسعر العادل مخفي مؤقتًا، وسيظهر تلقائيًا بعد اعتماد مصادر
            موثوقة. «التوفير» هو الفرق بين السعر العادل الموثوق والسعر المعروض،
            ولا يظهر عند عدم كفاية البيانات.
          </p>
        </section>

        <section style={section}>
          <h2 style={h2}>السيارات</h2>
          <p style={p}>
            للسيارات منهجية مستقلة عن الإلكترونيات. السعر المرجعي لكل موديل
            منسوب إلى مصدر مذكور، لكن {TRUST_TEXT.carPriceSourceUnconfirmed}{" "}
            يظهر السعر العادل فقط عند توفر أسعار من 3 مصادر سوقية على الأقل،
            ويُخفى إذا كانت الأسعار متطابقة حرفيًا في كل المصادر، لأن ذلك يشير
            إلى أنها قد لا تكون مستقلة، حتى تتم مراجعتها.
          </p>
        </section>

        <section style={section}>
          <h2 style={h2}>ما القادم</h2>
          <p style={p}>
            نعمل على جمع الأسعار من مصادر معتمدة عبر واجهات رسمية أو اتفاقيات
            مع المتاجر فقط، مع حفظ تاريخ كامل لكل سعر ومراجعة قبل اعتماده. حتى
            ذلك الحين، تحقّق دائمًا من السعر النهائي لدى المتجر أو الوكيل قبل
            الشراء.
          </p>
        </section>
      </div>
    </main>
  );
}
