import { LogOut } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { myPermissions, myProfile } from "../../lib/admin/db";
import { adminAuthMode, currentClaims, currentEmail } from "../../lib/admin/session";
import type { DbClaims } from "../../lib/db/pool";
import { logout } from "../actions";

const NAV = [
  { href: "/admin", label: "الرئيسية" },
  { href: "/admin/catalog", label: "المنتجات" },
  { href: "/admin/stores", label: "المتاجر والمصادر" },
  { href: "/admin/prices", label: "استيراد الأسعار" },
  { href: "/admin/review", label: "مراجعة الأسعار" },
  { href: "/admin/requests", label: "الطلبات والشكاوى" },
  { href: "/admin/analytics", label: "الإحصائيات" },
  { href: "/admin/users", label: "المستخدمون" },
  { href: "/admin/settings", label: "الإعدادات" },
];

export type AdminContext = {
  claims: DbClaims;
  permissions: string[];
  userName: string;
  role: string;
  mode: "supabase" | "local-preview" | "off";
};

/**
 * يتحقق من الجلسة على الخادم؛ بدونها يعود لصفحة الدخول. في Supabase يلزم التحقق الثنائي (aal2)
 * لكل صفحات اللوحة. الصلاحيات نفسها تحددها القاعدة عند كل عملية، وهذا للعرض فقط.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const claims = await currentClaims();
  if (!claims || claims.aal !== "aal2") redirect("/admin");
  const [permissions, profile] = await Promise.all([myPermissions(claims), myProfile(claims)]);
  if (permissions.length === 0) redirect("/admin");
  const role = profile.roles.includes("admin") ? "admin" : (profile.roles[0] ?? "");
  const email = await currentEmail();
  return { claims, permissions, userName: profile.displayName ?? email ?? claims.sub, role, mode: adminAuthMode() };
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div
      role={err ? "alert" : "status"}
      data-flash={err ? "err" : "ok"}
      className={`mb-5 rounded-2xl border px-4 py-3 text-sm leading-7 ${
        err ? "border-bad/30 bg-bad/[0.06] text-bad" : "border-mint/50 bg-mint-50 text-good-soft"
      }`}
    >
      {err ?? ok}
    </div>
  );
}

export default function AdminShell({
  ctx,
  active,
  title,
  subtitle,
  children,
}: {
  ctx: AdminContext;
  active: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="container-page py-6 sm:py-8">
      {ctx.mode === "local-preview" ? (
        <div className="mb-4 rounded-2xl border border-coral/30 bg-coral-50 px-4 py-2 text-xs leading-6 text-coral-ink">
          نسخة MVP تجريبية محلية — قاعدة بيانات مؤقتة على هذا الجهاز، ودخول تجريبي (ليس نظام الدخول النهائي).
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-line bg-surface px-4 py-2 text-xs leading-6 text-ink-3">
          نسخة MVP — الدخول عبر Supabase Auth مع التحقق الثنائي، والصلاحيات تحددها قاعدة البيانات في كل عملية.
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full border border-line bg-surface px-3 py-1">
            {ctx.userName} · <span className="text-ink-3">{ctx.role === "admin" ? "مشرف" : ctx.role === "reviewer" ? "مراجع" : ctx.role === "viewer" ? "مشاهد" : ctx.role}</span>
          </span>
          <form action={logout}>
            <button className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-3 text-ink-2 hover:border-brand hover:text-brand">
              <LogOut size={14} aria-hidden /> خروج
            </button>
          </form>
        </div>
      </div>
      <nav className="mt-4 flex gap-2 overflow-x-auto pb-1" aria-label="لوحة الإدارة">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active === n.href ? "page" : undefined}
            className={`inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm ${
              active === n.href ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink-2 hover:border-brand"
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </main>
  );
}

/* عناصر نماذج بسيطة بنفس هوية الموقع */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink-2">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm outline-none focus:border-brand";

export function SubmitButton({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "bad" | "ghost" }) {
  const cls = {
    brand: "bg-brand text-on-brand hover:bg-brand-strong",
    bad: "border border-bad/40 bg-surface text-bad hover:bg-bad/[0.06]",
    ghost: "border border-line-strong bg-surface text-ink-2 hover:border-brand",
  }[tone];
  return (
    <button type="submit" className={`inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold ${cls}`}>
      {children}
    </button>
  );
}

export function can(ctx: AdminContext, permission: string) {
  return ctx.permissions.includes(permission);
}
