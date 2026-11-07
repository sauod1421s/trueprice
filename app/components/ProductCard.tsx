import { ChevronDown, ChevronLeft, ExternalLink, Lock } from "lucide-react";
import Link from "next/link";
import type { CatalogProduct } from "../lib/catalog/types";
import { computeSaving, electronicsFairPrice } from "../lib/valuation/electronics";
import { CategoryArt } from "./illustrations";
import { Badge, Price, formatNumber } from "./ui";

const HIDDEN_MEMORY = new Set(["—", "", "غير معلن رسميًا من Apple"]);

/** خلفية ناعمة لمساحة الصورة حسب الفئة */
const CATEGORY_TINT: Record<string, string> = {
  Smartphones: "from-mint-50 via-white to-mint-50",
  Tablets: "from-yellow-50 via-white to-yellow-50",
  Laptops: "from-cream via-white to-cream",
  Smartwatches: "from-coral-50 via-white to-coral-50",
  Audio: "from-mint-50 via-white to-mint-50",
  Gaming: "from-yellow-50 via-white to-yellow-50",
  TV: "from-cream via-white to-cream",
};

export default function ProductCard({ product }: { product: CatalogProduct }) {
  // السعر العادل من الأسعار الموثقة فقط — لا يُعرض إذا لم تتوفر بيانات موثوقة
  const fair = electronicsFairPrice(product.offers);
  const saving = computeSaving(fair.fairPrice, product.lowestPrice);
  const verified =
    product.offers.length > 0 &&
    product.offers.every((o) => o.verificationStatus === "verified");
  const hasPrices = product.offers.length > 0;
  // أسعار مرّت بالاستيراد والمراجعة (نسخة MVP) مقابل الأسعار المرجعية المُدخلة يدويًا
  const approvedPipeline = hasPrices && product.offers.every((o) => o.entryMethod === "import");
  const legacy = product.legacyReference ?? [];
  const legacyMin = legacy.length ? Math.min(...legacy.map((o) => o.price)) : null;
  const tint = CATEGORY_TINT[product.category] ?? "from-cream via-white to-cream";

  const range = product.highestPrice - product.lowestPrice;
  const avgPos = range > 0 ? ((product.averagePrice - product.lowestPrice) / range) * 100 : 50;

  return (
    <article className="card card-hover flex h-full flex-col overflow-hidden">
      {/* مساحة الصورة: رسم توضيحي للفئة (لا توجد صور حقيقية بعد) */}
      <Link
        href={`/product/${product.id}`}
        tabIndex={-1}
        aria-hidden
        className={`relative block h-36 bg-gradient-to-br ${tint}`}
      >
        <div className="bg-dots-dark absolute inset-0 opacity-50" />
        <div className="absolute inset-y-2 left-1/2 aspect-square -translate-x-1/2">
          <CategoryArt category={product.category} className="size-full" />
        </div>
        <span className="absolute right-3 top-3">
          {hasPrices && (
            <Badge tone={verified ? "good" : "warn"} className="shadow-sm">
              {verified ? (approvedPipeline ? "معتمد" : "موثق") : "غير موثق"}
            </Badge>
          )}
          {product.isDemo && (
            <Badge tone="coral" className="mr-1 shadow-sm">بيانات تجريبية</Badge>
          )}
        </span>
        <span className="absolute left-3 top-3">
          <Badge className="bg-white/80 shadow-sm backdrop-blur">{product.categoryAr}</Badge>
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        {/* الاسم والموديل */}
        <div className="text-xs font-medium text-ink-3">{product.brandAr}</div>
        <h2 className="mt-0.5 line-clamp-2 text-[1.05rem] font-bold leading-snug">
          <Link href={`/product/${product.id}`} className="hover:text-brand-soft">
            {product.nameAr}
          </Link>
        </h2>
        <div className="mt-0.5 truncate text-xs text-ink-3" dir="ltr" style={{ textAlign: "right" }}>
          {product.name}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {product.storage && product.storage !== "—" && (
            <Badge>التخزين {product.storage}</Badge>
          )}
          {!HIDDEN_MEMORY.has(product.memory) && <Badge>الذاكرة {product.memory}</Badge>}
        </div>

        {/* الأسعار */}
        {hasPrices ? (
          <div className="mt-4 rounded-2xl border border-line bg-surface-2 p-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-xs text-ink-3">{approvedPipeline ? "أقل سعر معتمد" : "أقل سعر مرجعي"}</div>
                <div className="text-[1.35rem] font-bold leading-tight">
                  <Price value={product.lowestPrice} />
                </div>
              </div>
              <span className="text-xs text-ink-3">
                من <span className="num font-semibold text-ink-2">{product.offers.length}</span> متاجر
              </span>
            </div>

            {/* شريط النطاق السعري */}
            <div className="mt-3" aria-label={`النطاق السعري من ${formatNumber(product.lowestPrice)} إلى ${formatNumber(product.highestPrice)} ريال`}>
              <div className="relative h-2 rounded-full bg-gradient-to-l from-mint via-yellow to-coral/70">
                {range > 0 && (
                  <span
                    className="absolute top-1/2 size-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-forest shadow"
                    style={{ right: `${avgPos}%` }}
                    title="المتوسط"
                  />
                )}
              </div>
              <div className="mt-1 flex justify-between text-[0.7rem] text-ink-3">
                <span className="num">{formatNumber(product.lowestPrice)}</span>
                <span>
                  المتوسط <span className="num text-ink-2">{formatNumber(product.averagePrice)}</span>
                </span>
                <span className="num">{formatNumber(product.highestPrice)}</span>
              </div>
            </div>

            {/* السعر العادل والتوفير — فقط مع بيانات موثوقة */}
            {fair.fairPrice !== null ? (
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2 text-sm">
                <span className="text-brand-soft">
                  السعر العادل <Price value={fair.fairPrice} className="font-semibold" />
                </span>
                {saving && saving.amount > 0 && (
                  <Badge tone="good">وفّر {formatNumber(saving.amount)} ريال</Badge>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2 text-xs text-ink-3">
                <Lock size={12} aria-hidden />
                السعر العادل مخفي حتى التحقق من الأسعار
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-line-strong bg-surface-2 p-4 text-center text-sm text-ink-3">
            {legacy.length > 0 ? "لا توجد أسعار معتمدة بعد" : "لا توجد أسعار متاحة حاليًا"}
            {legacyMin !== null && (
              <div className="mt-1.5 text-xs">
                سعر مرجعي قديم غير معتمد يبدأ من <Price value={legacyMin} className="font-medium text-ink-2" />
                <span className="block text-[0.7rem]">لا يدخل في أي حساب</span>
              </div>
            )}
          </div>
        )}

        {/* مراجع الأسعار */}
        {hasPrices && (
          <details className="group mt-3 rounded-xl border border-line">
            <summary className="flex min-h-11 items-center justify-between gap-2 px-3 text-sm text-ink-2 transition-colors hover:text-ink">
              <span>مراجع الأسعار</span>
              <span className="inline-flex items-center gap-1 text-xs text-ink-3">
                <span className="num">
                  {product.offers.length} {product.offers.length === 1 ? "مرجع" : "مراجع"}
                </span>
                <ChevronDown size={15} className="transition-transform group-open:rotate-180" aria-hidden />
              </span>
            </summary>
            <ul className="divide-y divide-line border-t border-line px-3">
              {product.offers.map((offer, index) => (
                <li key={`${product.id}-${offer.store}-${index}`}>
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`فتح المرجع في متجر ${offer.storeAr}`}
                    className="flex min-h-10 items-center justify-between gap-2 text-sm text-ink-2 transition-colors hover:text-ink"
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{offer.storeAr}</span>
                      <ExternalLink size={12} className="shrink-0 text-ink-3" aria-hidden />
                    </span>
                    <Price value={offer.price} className="font-medium text-ink" />
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex-1" />
        <Link
          href={`/product/${product.id}`}
          className="mt-4 flex min-h-11 items-center justify-center gap-1 rounded-xl bg-brand text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
        >
          عرض التفاصيل والمقارنة
          <ChevronLeft size={16} aria-hidden />
        </Link>
      </div>
    </article>
  );
}
