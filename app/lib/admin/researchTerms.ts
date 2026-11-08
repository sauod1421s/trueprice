/**
 * صفحات شروط الاستخدام في مواقع مصادر «مساعد الرصد» مع ملخص ما وجدناه فيها (راجعناها في 8 نوفمبر 2026).
 * تُعرض في نموذج اعتماد المصادر لتسريع المراجعة. المشرف يقرأ الشروط بنفسه ويقرر؛ لا يُعتمد أي مصدر تلقائيًا.
 * الملخص للمساعدة فقط وليس رأيًا قانونيًا.
 */
export type TermsHint = { url: string; note: string };

export const SUGGESTED_TERMS: Record<string, TermsHint> = {
  "research-apple": {
    url: "https://www.apple.com/legal/internet-services/terms/site.html",
    note: "تمنع نسخ أو إعادة نشر أي محتوى من الموقع لغرض تجاري دون موافقة Apple الكتابية المسبقة، وتمنع النسخ اليدوي المنهجي أيضًا.",
  },
  "research-jarir": {
    url: "https://www.jarir.com/sa-en/customer-care/terms-of-service",
    note: "البند 1.4: لا يجوز نسخ أو استغلال أي جزء من المحتوى دون إذن كتابي صريح من جرير.",
  },
  "research-toyota-brand-site": {
    url: "https://www.toyota.com.sa/en/terms",
    note: "استخدام المحتوى لأغراض تجارية يتطلب ترخيصًا كتابيًا مسبقًا من عبد اللطيف جميل.",
  },
  "research-nissan-brand-site": {
    url: "https://en.nissan-saudiarabia.com/terms-conditions.html",
    note: "الاستخدام شخصي غير تجاري فقط، ولا يجوز نسخ شيء من الموقع أو إعادة بيع معلوماته دون إذن نيسان.",
  },
  "research-hyundai-naghi": {
    url: "https://hyundaiksa.com/en/mynaghi/terms-of-use",
    note: "تمنع نسخ المحتوى أو البيانات أو جمعها، والاستخدام شخصي غير تجاري فقط.",
  },
};
