import type { Metadata } from "next";

/*
 * لوحة الإدارة: غير مرتبطة من أي صفحة عامة، ولا تُفهرس في محركات البحث.
 * في الوضع العادي لا تحفظ شيئًا (معاينة فقط). في نسخة MVP المحلية (TP_DATA_SOURCE=db)
 * تحفظ في القاعدة المحلية بهوية المستخدم، والقاعدة نفسها تطبّق الصلاحيات.
 */
export const metadata: Metadata = {
  title: "لوحة الإدارة",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
