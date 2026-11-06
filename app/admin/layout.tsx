import type { Metadata } from "next";

/*
 * لوحة الإدارة: غير مرتبطة من أي صفحة عامة، ولا تُفهرس في محركات البحث.
 * لا تحفظ أي بيانات على الخادم حاليًا (معاينة فقط).
 * قبل إضافة أي حفظ دائم يجب اعتماد قاعدة البيانات ونظام دخول للمشرفين.
 */
export const metadata: Metadata = {
  title: "لوحة الاستيراد",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
