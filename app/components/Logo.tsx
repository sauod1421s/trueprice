import Link from "next/link";

export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-mint to-[#1f9e69] text-forest shadow-[inset_0_-3px_0_rgb(0_0_0/0.12),0_8px_18px_-8px_rgb(61_220_151/0.7)] ${className}`}
    >
      <span className="absolute inset-x-1 top-0.5 h-1/3 rounded-full bg-white/50 blur-[2px]" />
      <svg viewBox="0 0 24 24" className="relative size-[56%]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17l5-5 4 4 7-8" />
        <path d="M15 8h5v5" />
      </svg>
      <span className="absolute bottom-1 left-1 size-1.5 rounded-full bg-yellow" />
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="TruePrice — الرئيسية">
      <LogoMark />
      <span className="leading-tight">
        <span className="block text-[1.05rem] font-bold tracking-tight text-ink" dir="ltr">
          True<span className="text-brand">Price</span>
        </span>
        <span className="block text-[0.7rem] text-ink-3">المرجع الذكي للأسعار</span>
      </span>
    </Link>
  );
}
