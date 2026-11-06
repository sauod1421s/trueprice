"use client";

import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";

const NAV = [
  { href: "/", label: "الرئيسية" },
  { href: "/search", label: "المنتجات" },
  { href: "/cars", label: "السيارات" },
  { href: "/#how-it-works", label: "كيف يعمل؟" },
  { href: "/methodology", label: "المنهجية" },
];

function isActive(pathname: string, href: string) {
  if (href.includes("#")) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) ||
    (href === "/search" && pathname.startsWith("/product/"));
}

export default function SiteHeader() {
  const pathname = usePathname();
  const [openFor, setOpenFor] = useState<string | null>(null);
  // تُغلق القائمة تلقائيًا عند الانتقال لصفحة أخرى
  const open = openFor === pathname;

  return (
    <header className="theme-forest sticky top-0 z-40 border-b border-white/[0.06] bg-bg shadow-[0_8px_24px_-16px_rgb(0_0_0/0.5)]">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav aria-label="التنقل الرئيسي" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-white/10 text-ink shadow-[inset_0_-2px_0_var(--color-mint)]"
                        : "text-ink-2 hover:bg-white/[0.06] hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/search"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-on-brand shadow-[0_6px_16px_-6px_rgb(61_220_151/0.6)] transition-colors hover:bg-brand-strong sm:px-4"
          >
            <Search size={17} aria-hidden />
            <span>بحث</span>
          </Link>

          <button
            type="button"
            className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-ink md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            onClick={() => setOpenFor(open ? null : pathname)}
          >
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="القائمة"
          className="animate-fade-up border-t border-line bg-bg md:hidden"
        >
          <ul className="container-page py-2">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpenFor(null)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-12 items-center rounded-lg px-3 text-base font-medium ${
                      active ? "bg-white/10 text-ink" : "text-ink-2"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </header>
  );
}
