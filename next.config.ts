import type { NextConfig } from "next";
import { withPreviewDefaults } from "./app/lib/previewDefaults";

/**
 * رؤوس الأمان لكل الصفحات (HTTPS يفرضه المضيف؛ HSTS يمنع الرجوع إلى HTTP).
 *
 * CSP: السكربتات والأنماط من الموقع نفسه فقط ('unsafe-inline' تحتاجه صفحات Next.js المولّدة
 * مسبقًا بلا nonce — حسب content-security-policy.md "Without Nonces")، ولا يُسمح بأي اتصال
 * خارجي إلا خدمة الدخول في Supabase، ولا تضمين للموقع داخل إطارات مواقع أخرى.
 */
const isDev = process.env.NODE_ENV === "development";

function supabaseOrigin(): string {
  try {
    const u = withPreviewDefaults(process.env).NEXT_PUBLIC_SUPABASE_URL;
    return u ? new URL(u).origin : "";
  } catch {
    return "";
  }
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin()}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
