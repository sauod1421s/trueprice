import { Car, Home, Search } from "lucide-react";
import Link from "next/link";

const LINKS = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/search", label: "البحث", icon: Search },
  { href: "/cars", label: "السيارات", icon: Car },
];

export default function NotFound() {
  return (
    <main className="container-page grid min-h-[60vh] place-items-center py-16">
      <div className="text-center">
        <div className="num font-mono text-sm text-brand-soft">404</div>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">الصفحة غير موجودة</h1>
        <p className="mx-auto mt-2 max-w-sm leading-7 text-ink-2">
          قد يكون الرابط غير صحيح أو أن المنتج أو العلامة غير متوفرة.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium transition-colors hover:border-brand/50 hover:text-brand-soft"
            >
              <Icon size={16} aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
