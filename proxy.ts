import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authMode, supabasePublicConfig } from "./app/lib/auth/config";
import { withPreviewDefaults } from "./app/lib/previewDefaults";

/**
 * بوابة /admin على مستوى الطلب.
 *
 * هذه طبقة إضافية فقط وليست التفويض نفسه: كل عملية حفظ تتحقق من الهوية والصلاحية
 * داخلها، والقاعدة نفسها (RLS + admin_api) هي التفويض النهائي.
 *
 * في الإنتاج تُخفى اللوحة (404) ما لم يُفعّل متغير البيئة صراحة (TRUEPRICE_ADMIN_PREVIEW=on).
 *
 * MVP: عند تفعيل Supabase Auth (authMode = "supabase") يجدّد هذا الملف جلسة المستخدم
 * لصفحات اللوحة فقط (Next.js 16: proxy بدل middleware)، بالتحقق من توقيع الرمز عبر getClaims().
 */
export async function proxy(request: NextRequest) {
  const isProduction = process.env.NODE_ENV === "production";
  const enabled = withPreviewDefaults(process.env).TRUEPRICE_ADMIN_PREVIEW === "on";
  if (isProduction && !enabled) {
    return new NextResponse("Not Found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  }

  let res = NextResponse.next({ request });
  const cfg = authMode() === "supabase" ? supabasePublicConfig() : null;
  if (cfg) {
    const sb = createServerClient(cfg.url, cfg.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list, headers) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          res = NextResponse.next({ request });
          for (const { name, value, options } of list) res.cookies.set(name, value, options);
          for (const [k, v] of Object.entries(headers ?? {})) res.headers.set(k, v);
        },
      },
    });
    // يتحقق من التوقيع ويجدّد الرمز إن قارب الانتهاء (لا تُستخدم getSession على الخادم)
    await sb.auth.getClaims();
  }
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
