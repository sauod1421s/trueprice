import Link from "next/link";

export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-strong text-white shadow-[0_6px_20px_-6px_rgb(16_185_129/0.6)] ${className}`}
    >
      <svg viewBox="0 0 24 24" className="size-[55%]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17l5-5 4 4 7-8" />
        <path d="M15 8h5v5" />
      </svg>
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="TruePrice — الرئيسية">
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[1.05rem] font-bold tracking-tight text-ink" dir="ltr">
          TruePrice
        </span>
        <span className="block text-[0.7rem] text-ink-3">المرجع الذكي للأسعار</span>
      </span>
    </Link>
  );
}
