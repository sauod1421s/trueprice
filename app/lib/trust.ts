/**
 * حالة الثقة في بيانات الأسعار — مصدر واحد لكل النصوص والقواعد.
 *
 * قاعدة المرحلة 0: لا يوجد حاليًا أي سعر تم التحقق منه فعليًا.
 * جميع الأسعار مُدخلة يدويًا، وتاريخ جمعها غير مؤكد، لذلك
 * لا نعرض أي شارة "موثق" ولا أي نسبة ثقة.
 */

export type VerificationStatus = "unverified" | "verified" | "rejected";

export const TRUST_TEXT = {
  manualEntry: "سعر مرجعي مُدخل يدويًا",
  unverified: "غير موثق",
  dateUnconfirmed: "تاريخ الجمع غير مؤكد",
  verificationPending:
    "لم يتم التحقق من هذه الأسعار بعد. تحقّق من السعر النهائي لدى المتجر قبل الشراء.",
  dataUnavailable: "البيانات غير متاحة",
  carPriceSourceUnconfirmed:
    "لم يتم التأكد بعد من أن هذا السعر هو سعر الوكيل الرسمي.",
} as const;

export function verificationLabel(status: VerificationStatus): string {
  switch (status) {
    case "verified":
      return "موثق";
    case "rejected":
      return "مرفوض";
    default:
      return "غير موثق";
  }
}

/** تاريخ إدخال مع توضيح حالته */
export function describeEntryDate(
  date: string | null | undefined,
  confirmed: boolean
): string {
  if (!date) return "تاريخ الجمع غير معروف";
  return confirmed ? date : `${date} (غير مؤكد)`;
}
