import { Mail, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { dataSource, getProduct } from "../lib/catalog";
import { siteContact, type SiteContact } from "../lib/support/db";
import { issueFormToken } from "../lib/support/validate";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "تواصل معنا",
  description: "استفسارات وشكاوى واقتراحات، والإبلاغ عن خطأ في سعر معروض على TruePrice.",
  alternates: { canonical: "/contact" },
};

type Props = { searchParams: Promise<{ kind?: string; ref?: string }> };

const KINDS = new Set(["inquiry", "complaint", "suggestion", "price_error"]);

export default async function ContactPage({ searchParams }: Props) {
  const sp = await searchParams;
  const db = dataSource() === "db";
  const kind = sp.kind && KINDS.has(sp.kind) ? sp.kind : "inquiry";

  let relatedRef: string | null = null;
  let relatedLabel: string | null = null;
  if (sp.ref && /^[0-9]{1,9}$/.test(sp.ref)) {
    relatedRef = sp.ref;
    const p = db ? await getProduct(Number(sp.ref)).catch(() => null) : null;
    relatedLabel = p ? `${p.nameAr} (رقم ${sp.ref})` : `المنتج رقم ${sp.ref}`;
  } else if (sp.ref && /^\/cars\/[a-z0-9-]{1,60}$/.test(sp.ref)) {
    relatedRef = sp.ref;
    relatedLabel = `صفحة السيارات ${sp.ref.slice(6)}`;
  }

  let contact: SiteContact = { email: null, whatsapp: null };
  let dbDown = false;
  if (db) {
    try {
      contact = await siteContact();
    } catch {
      dbDown = true;
    }
  }

  return (
    <main>
      <section className="theme-forest bg-hero relative overflow-hidden">
        <div className="bg-dots pointer-events-none absolute inset-0 opacity-70" aria-hidden />
        <div className="container-page relative max-w-3xl py-10 sm:py-12">
          <Link href="/" className="inline-flex min-h-10 items-center text-sm text-mint hover:text-ink">← العودة للرئيسية</Link>
          <h1 className="mt-2 text-[1.9rem] font-bold leading-tight sm:text-4xl">
            تواصل <span className="text-gradient">معنا</span>
          </h1>
          <p className="mt-3 max-w-2xl leading-8 text-ink-2">
            استفسار، شكوى، اقتراح، أو سعر رأيته خاطئًا؟ أرسل طلبك وستحصل على رقم مرجعي لمتابعته.
          </p>
        </div>
      </section>

      <div className="container-page max-w-3xl py-8 sm:py-10">
        {!db ? (
          <p className="card p-5 text-sm leading-7 text-ink-2">نموذج التواصل يعمل في نسخة قاعدة البيانات فقط.</p>
        ) : dbDown ? (
          <p role="alert" className="card border-bad/30 p-5 text-sm leading-7 text-bad">
            الخدمة غير متاحة مؤقتًا. حاول بعد قليل.
          </p>
        ) : (
          <ContactForm token={issueFormToken()} initialKind={kind} relatedRef={relatedRef} relatedLabel={relatedLabel} />
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/track" className="card card-hover p-4 text-sm">
            <div className="font-semibold">متابعة طلب سابق</div>
            <div className="mt-1 text-ink-3">بالرقم المرجعي ورمز المتابعة</div>
          </Link>
          {(contact.email || contact.whatsapp) && (
            <div className="card space-y-2 p-4 text-sm">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-brand" dir="ltr">
                  <Mail size={16} aria-hidden /> {contact.email}
                </a>
              )}
              {contact.whatsapp && (
                <a
                  href={`https://wa.me/${contact.whatsapp.replace(/^\+/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-brand"
                  dir="ltr"
                >
                  <MessageCircle size={16} aria-hidden /> {contact.whatsapp}
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
