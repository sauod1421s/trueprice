import type { Metadata } from "next";
import Link from "next/link";
import { dataSource } from "../lib/catalog";
import TrackForm from "./TrackForm";

export const metadata: Metadata = {
  title: "متابعة طلب",
  description: "تابع حالة استفسارك أو شكواك أو بلاغك بالرقم المرجعي ورمز المتابعة.",
  robots: { index: false, follow: true },
};

export default function TrackPage() {
  return (
    <main>
      <section className="theme-forest bg-hero relative overflow-hidden">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="container-page relative max-w-3xl py-10 sm:py-12">
          <Link href="/contact" className="inline-flex min-h-10 items-center text-sm text-mint hover:text-ink">← تواصل معنا</Link>
          <h1 className="mt-2 text-[1.9rem] font-bold leading-tight sm:text-4xl">
            متابعة <span className="text-gradient">طلب</span>
          </h1>
          <p className="mt-3 max-w-2xl leading-8 text-ink-2">أدخل الرقم المرجعي ورمز المتابعة اللذين ظهرا لك بعد إرسال الطلب.</p>
        </div>
      </section>
      <div className="container-page max-w-3xl py-8 sm:py-10">
        {dataSource() === "db" ? <TrackForm /> : <p className="card p-5 text-sm">المتابعة تعمل في نسخة قاعدة البيانات فقط.</p>}
      </div>
    </main>
  );
}
