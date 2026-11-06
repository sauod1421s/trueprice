import Link from "next/link";
import { LogoMark } from "./Logo";

const LINKS = [
  {
    title: "المنصة",
    items: [
      { href: "/", label: "الرئيسية" },
      { href: "/search", label: "المنتجات" },
      { href: "/cars", label: "السيارات" },
      { href: "/#how-it-works", label: "كيف يعمل؟" },
    ],
  },
  {
    title: "المعلومات",
    items: [
      { href: "/#about", label: "عن TruePrice" },
      { href: "/methodology", label: "المنهجية" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface/40">
      <div className="container-page py-10 sm:py-12">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-[2fr_1fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <LogoMark className="size-8" />
              <div className="leading-tight">
                <div className="font-bold" dir="ltr">TruePrice</div>
                <div className="text-xs text-ink-3">منصة سعودية مستقلة لذكاء الأسعار</div>
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm leading-7 text-ink-2">
              TruePrice منصة مرجعية مستقلة لعرض ومقارنة معلومات الأسعار، ولا
              تبيع المنتجات أو السيارات ولا تعمل كوكيل أو وسيط.
            </p>
          </div>

          {LINKS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="mb-3 text-sm font-semibold text-ink">{group.title}</h2>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-9 items-center text-sm text-ink-2 transition-colors hover:text-brand-soft"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {group.title === "المعلومات" && (
                <p className="mt-3 text-xs leading-6 text-ink-3">
                  الأسعار قد تتغير حسب المصدر ووقت التحقق.
                </p>
              )}
            </nav>
          ))}
        </div>

        <details className="group mt-10 rounded-xl border border-line bg-surface/60 open:bg-surface">
          <summary className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm font-semibold text-ink">
            تنبيه وإخلاء مسؤولية
            <span className="text-ink-3 transition-transform group-open:rotate-180" aria-hidden>
              ⌄
            </span>
          </summary>
          <div className="space-y-2 px-4 pb-4 text-xs leading-6 text-ink-3">
            <p>
              TruePrice منصة مستقلة لعرض ومقارنة الأسعار بهدف مساعدة المستخدم
              على معرفة النطاق السعري للمنتجات قبل الشراء.
            </p>
            <p>
              الأسعار والمعلومات المعروضة في المنصة لأغراض مرجعية ومعلوماتية
              فقط، وقد تتغير الأسعار أو التوفر لدى المتاجر في أي وقت.
            </p>
            <p>
              قد تعتمد بعض البيانات المعروضة على معلومات وأسعار منشورة أو متاحة
              من مصادر المتاجر، ولا تضمن TruePrice استمرار دقة الأسعار أو توفر
              المنتجات بشكل لحظي.
            </p>
            <p>
              لا تمثل TruePrice أيًا من المتاجر أو العلامات التجارية المذكورة،
              ولا يعني ظهور أي متجر أو منتج في المنصة وجود شراكة أو اعتماد أو
              علاقة تجارية معه، ما لم يُذكر ذلك صراحة.
            </p>
            <p>
              لا تتم عملية البيع أو الدفع من خلال TruePrice، ويُنصح المستخدم
              بالتحقق من السعر والتوفر والشروط النهائية مباشرةً من المتجر قبل
              إتمام عملية الشراء.
            </p>
          </div>
        </details>

        <div className="mt-8 flex flex-col gap-2 border-t border-line pt-6 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between">
          <span dir="ltr" className="text-right sm:text-left">
            © {new Date().getFullYear()} TruePrice
          </span>
          <span>المرجع الذكي للأسعار — صنع في السعودية · نموذج أولي قيد التطوير</span>
        </div>
      </div>
    </footer>
  );
}
