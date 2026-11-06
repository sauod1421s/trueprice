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
  size = 34,
}: {
  category: string;
  className?: string;
  size?: number;
}) {
  return (
    <div
      className={`relative grid place-items-center overflow-hidden rounded-xl border border-line bg-gradient-to-b from-surface-3 to-surface-2 text-brand-soft ${className}`}
      aria-hidden
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-brand/40 to-transparent" />
      <CategoryIcon category={category} size={size} />
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
  tone?: "neutral" | "brand" | "warn";
  className?: string;
}) {
  const tones = {
    neutral: "border-line-strong bg-surface-2 text-ink-2",
    brand: "border-brand/30 bg-brand/10 text-brand-soft",
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
      className={`flex gap-3 rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-sm leading-6 text-warn/90 ${className}`}
    >
      <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
      <div>
        {title && <p className="font-semibold text-warn">{title}</p>}
        {children && <div className="text-warn/80">{children}</div>}
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
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <Tag
          className={
            Tag === "h1"
              ? "text-2xl font-bold leading-tight sm:text-3xl"
              : "text-xl font-bold leading-tight sm:text-2xl"
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

export function BrandMonogram({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-lg border border-brand/20 bg-brand/10 font-bold text-brand-soft ${
        label.length > 1 ? "text-xs" : "text-base"
      } ${className}`}
    >
      {label}
    </span>
  );
}
