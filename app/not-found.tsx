import { Car, Home, Search } from "lucide-react";
import Link from "next/link";
import { Boxes3D, Magnifier3D } from "./components/illustrations";

const LINKS = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/search", label: "البحث", icon: Search },
  { href: "/cars", label: "السيارات", icon: Car },
];

export default function NotFound() {
  return (
    <main className="bg-mint-wash">
      <div className="container-page grid min-h-[62vh] place-items-center py-14">
        <div className="text-center">
          <div className="relative mx-auto h-36 w-52" aria-hidden>
            <Boxes3D className="absolute bottom-0 left-0 w-32" />
            <Magnifier3D className="float absolute right-0 top-0 w-28" />
          </div>
          <div className="num mt-2 font-mono text-sm font-semibold text-coral-ink">404</div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">الصفحة غير موجودة</h1>
          <p className="mx-auto mt-2 max-w-sm leading-7 text-ink-2">
            قد يكون الرابط غير صحيح أو أن المنتج أو العلامة غير متوفرة.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {LINKS.map(({ href, label, icon: Icon }, i) => (
              <Link
                key={href}
                href={href}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors ${
                  i === 0
                    ? "bg-brand text-on-brand hover:bg-brand-strong"
                    : "border border-line-strong bg-surface text-ink hover:border-brand"
                }`}
              >
                <Icon size={16} aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
