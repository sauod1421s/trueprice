import {
  Gamepad2,
  Headphones,
  Laptop,
  Package,
  Smartphone,
  Tablet,
  TriangleAlert,
  Tv,
  Watch,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { CategoryArt } from "./illustrations";

/* =========================================================
   تنسيق الأسعار — أرقام لاتينية بعرض ثابت + "ريال"
========================================================= */

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    Math.round(value)
  );
}

export function Price({
  value,
  className = "",
  unitClassName = "text-ink-3 text-[0.7em] font-medium",
}: {
  value: number;
  className?: string;
  unitClassName?: string;
}) {
  return (
    <span className={`num whitespace-nowrap ${className}`}>
      {formatNumber(value)} <span className={unitClassName}>ريال</span>
    </span>
  );
}

/* =========================================================
   أيقونة الفئة — بديل صادق لصورة المنتج (لا توجد صور حقيقية بعد)
========================================================= */

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Smartphones: Smartphone,
  Tablets: Tablet,
  Laptops: Laptop,
  Smartwatches: Watch,
  Audio: Headphones,
  Gaming: Gamepad2,
  TV: Tv,
};

export function CategoryIcon({
  category,
  size = 28,
  className = "",
}: {
  category: string;
  size?: number;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category] ?? Package;
  return <Icon size={size} strokeWidth={1.5} className={className} aria-hidden />;
}

export function ProductVisual({
  category,
  className = "",
}: {
  category: string;
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-surface-2 to-surface ${className}`}
      aria-hidden
    >
      <div className="bg-dots-dark absolute inset-0 opacity-60" />
      <CategoryArt category={category} className="relative size-full p-[8%]" />
    </div>
  );
}

/* =========================================================
   شارات
========================================================= */

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "good" | "coral" | "warn";
  className?: string;
}) {
  const tones = {
    neutral: "border-line bg-surface-2 text-ink-2",
    brand: "border-mint/40 bg-mint-50 text-brand-soft",
    good: "border-mint/50 bg-mint-50 text-good-soft",
    coral: "border-coral/30 bg-coral-50 text-coral-ink",
    warn: "border-warn-line bg-warn-bg text-warn",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5 ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function TrustNote({
  title,
  children,
  className = "",
}: {
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="note"
      className={`flex gap-3 rounded-2xl border border-warn-line bg-warn-bg px-4 py-3 text-sm leading-6 text-warn ${className}`}
    >
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-yellow text-[#5c3d00]" aria-hidden>
        <TriangleAlert size={15} />
      </span>
      <div>
        {title && <p className="font-semibold text-warn">{title}</p>}
        {children && <div className="text-warn/90">{children}</div>}
      </div>
    </div>
  );
}

/* =========================================================
   عناوين الأقسام
========================================================= */

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  as: Tag = "h2",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-mint/40 bg-mint-50 px-3 py-1 text-xs font-semibold text-brand-soft">
            <span className="size-1.5 rounded-full bg-coral" aria-hidden />
            {eyebrow}
          </div>
        )}
        <Tag
          className={
            Tag === "h1"
              ? "text-2xl font-bold leading-tight sm:text-3xl"
              : "text-[1.4rem] font-bold leading-tight sm:text-[1.9rem]"
          }
        >
          {title}
        </Tag>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-7 text-ink-2 sm:text-base">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

const MONOGRAM_TONES = [
  "from-mint-soft to-mint text-forest",
  "from-yellow-50 to-yellow text-[#5c3d00]",
  "from-coral-50 to-coral/70 text-[#7a2614]",
  "from-cream to-[#f2dfb8] text-forest",
];

/** لون ثابت لكل علامة (من اسمها) حتى تبقى البطاقات متنوعة ومتناسقة */
export function toneFor(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % MONOGRAM_TONES.length;
}

export function BrandMonogram({
  label,
  className = "",
  toneKey,
}: {
  label: string;
  className?: string;
  toneKey?: string;
}) {
  const tone = MONOGRAM_TONES[toneFor(toneKey ?? label)];
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br font-bold shadow-[inset_0_-3px_0_rgb(0_0_0/0.08),0_6px_14px_-8px_rgb(18_38_30/0.45)] ${tone} ${
        label.length > 1 ? "text-xs" : "text-base"
      } ${className}`}
    >
      <span className="absolute inset-x-1 top-0.5 h-1/3 rounded-full bg-white/45 blur-[2px]" />
      <span className="relative">{label}</span>
    </span>
  );
}
