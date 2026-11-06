import { NextResponse } from "next/server";

/**
 * بوابة /admin على مستوى الطلب.
 *
 * هذه طبقة إضافية فقط وليست التفويض نفسه: كل عملية حفظ مستقبلية تتحقق من
 * الهوية والصلاحية داخلها (app/lib/auth/authz.ts). لوحة الاستيراد الحالية
 * معاينة في المتصفح فقط ولا تحفظ شيئًا.
 *
 * في الإنتاج تُخفى اللوحة (404) ما لم يُفعّل متغير البيئة صراحة.
 */
export function proxy() {
  const isProduction = process.env.NODE_ENV === "production";
  const enabled = process.env.TRUEPRICE_ADMIN_PREVIEW === "on";
  if (isProduction && !enabled) {
    return new NextResponse("Not Found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }
  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
