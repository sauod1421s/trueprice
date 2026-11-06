import type { Metadata } from "next";
import {
  ChevronLeft,
  ExternalLink,
  Info,
  ShieldCheck,
  Store,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import products from "../../data/products";
import {
  computeSaving,
  electronicsFairPrice,
  fairPriceUnavailableReason,
  type Saving,
} from "../../lib/valuation/electronics";
import type { VerificationStatus } from "../../lib/trust";
import { describeEntryDate, TRUST_TEXT } from "../../lib/trust";
import {
  Badge,
  Price,
  ProductVisual,
  TrustNote,
} from "../../components/ui";

type PageOffer = {
  store: string;
  storeAr: string;
  price: number | null;
  url: string;
  available?: boolean;
  verified?: boolean;
  isVerified?: boolean;
  verificationStatus?: VerificationStatus;
  checkedAt?: string | null;
};

type ProductPageProduct = {
  id: number;
  name: string;
  nameAr: string;
  brand: string;
  brandAr: string;
  category: string;
  categoryAr: string;
  memory: string;
  storage: string;
  offers: PageOffer[];
  price: number | null;
  prices: number[];
  averagePrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  fairPrice: number | null;
  confidence: number;

  screen?: string | null;
  chip?: string | null;
  camera?: string | null;
  frontCamera?: string | null;
  battery?: string | null;
  connectivity?: string | null;
  waterResistance?: string | null;
  refreshRate?: string | null;
  colors?: string[];
  description?: string | null;
  lastUpdated?: string | null;
  lastUpdatedConfirmed?: boolean;
  store?: string | null;
  amazonUrl?: string | null;
};

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export function generateStaticParams() {
  return products.map((p) => ({ id: String(p.id) }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = products.find((item) => item.id === Number(id));

  if (!product) {
    return { title: "المنتج غير موجود", robots: { index: false } };
  }

  const title = `سعر ${product.nameAr} في السعودية`;
  const description = `مقارنة الأسعار المرجعية لـ ${product.nameAr} (${product.name}) لدى ${product.offers.length} متاجر في السعودية. الأسعار مُدخلة يدويًا وغير موثقة بعد — تحقق من المتجر قبل الشراء.`;

  return {
    title,
    description,
    alternates: { canonical: `/product/${product.id}` },
    openGraph: {
      title,
      description,
      url: `/product/${product.id}`,
      type: "website",
      siteName: "TruePrice",
      locale: "ar_SA",
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;

  const product = products.find(
    (item) => item.id === Number(id)
  ) as ProductPageProduct | undefined;

  if (!product) {
    notFound();
  }

  /*
   * السعر العادل يُحسب من الأسعار الموثقة فقط (محرك الإلكترونيات).
   * حاليًا كل الأسعار غير موثقة، فيبقى مخفيًا حتى اعتماد مصادر موثوقة.
   * الحقل product.fairPrice في البيانات محفوظ كما هو ولا يُعرض.
   */
  const valuation = electronicsFairPrice(product.offers);
  const fairPrice = valuation.fairPrice;

  /*
   * التوفير = السعر العادل الموثوق − السعر المعروض (أقل سعر).
   * لا يظهر إذا لم يتوفر سعر عادل موثوق.
   */
  const saving = computeSaving(fairPrice, product.lowestPrice);

  const hasUnverified = product.offers.some(
    (o) => o.verificationStatus !== "verified"
  );

  const specs = [
    { title: "الشاشة", value: product.screen },
    { title: "المعالج", value: product.chip },
    { title: "الكاميرا الخلفية", value: product.camera },
    { title: "الكاميرا الأمامية", value: product.frontCamera },
    { title: "الذاكرة", value: product.memory },
    { title: "السعة التخزينية", value: product.storage },
    { title: "البطارية", value: product.battery },
    { title: "الاتصال", value: product.connectivity },
    { title: "مقاومة الماء والغبار", value: product.waterResistance },
    { title: "معدل التحديث", value: product.refreshRate },
  ].filter((s): s is { title: string; value: string } => Boolean(s.value));

  const sortedOffers = product.offers
    .map((offer, index) => ({ offer, index }))
    .sort(
      (a, b) =>
        (a.offer.price ?? Infinity) - (b.offer.price ?? Infinity) ||
        a.index - b.index
    );

  return (
    <main>
      <div className="container-page py-6 sm:py-10">
        {/* مسار التنقل */}
        <ol className="mb-5 flex min-w-0 items-center gap-1 text-sm text-ink-3">
          <li className="shrink-0">
            <Link href="/" className="hover:text-ink">
              الرئيسية
            </Link>
          </li>
          <li aria-hidden className="shrink-0">
            <ChevronLeft size={14} />
          </li>
          <li className="shrink-0">
            <Link
              href={`/search?q=${encodeURIComponent(product.brand)}`}
              className="hover:text-ink"
            >
              {product.brandAr || product.brand}
            </Link>
          </li>
          <li aria-hidden className="shrink-0">
            <ChevronLeft size={14} />
          </li>
          <li className="truncate text-ink-2" aria-current="page">
            {product.nameAr || product.name}
          </li>
        </ol>

        {/* تنبيه حالة البيانات */}
        {hasUnverified && (
          <TrustNote
            className="mb-5"
            title={`${TRUST_TEXT.manualEntry} · ${TRUST_TEXT.unverified} · ${TRUST_TEXT.dateUnconfirmed}`}
          >
            {TRUST_TEXT.verificationPending}
          </TrustNote>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          {/* ============ العمود الرئيسي ============ */}
          <div className="min-w-0 space-y-5">
            {/* العنوان */}
            <section className="card flex gap-4 p-5 sm:p-6">
              <ProductVisual
                category={product.category}
                className="size-20 shrink-0 sm:size-28"
                size={40}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink-3">
                  {product.brandAr || product.brand}
                </div>
                <h1 className="mt-0.5 text-xl font-bold leading-snug sm:text-3xl">
                  {product.nameAr || product.name}
                </h1>
                <div
                  className="mt-1 truncate text-sm text-ink-3"
                  dir="ltr"
                  style={{ textAlign: "right" }}
                >
                  {product.name}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge>{product.categoryAr || product.category}</Badge>
                  {product.storage && <Badge>{product.storage}</Badge>}
                  {product.memory &&
                    product.memory !== "غير معلن رسميًا من Apple" && (
                      <Badge>RAM {product.memory}</Badge>
                    )}
                </div>
              </div>
            </section>

            {/* ملخص الأسعار على الجوال يظهر هنا، وعلى الكمبيوتر في العمود الجانبي */}
            <div className="space-y-5 lg:hidden">
              {renderPriceSummary()}
            </div>

            {/* العروض */}
            <section className="card p-5 sm:p-6">
              <h2 className="text-lg font-bold">أفضل الأسعار المتاحة</h2>
              <p className="mt-0.5 text-sm text-ink-3">
                مرتبة من الأقل إلى الأعلى
              </p>

              {product.offers.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {sortedOffers.map(({ offer, index }, rank) => (
                    <li
                      key={`${offer.store}-${index}`}
                      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border p-3 sm:p-4 ${
                        rank === 0
                          ? "border-good/30 bg-good/[0.04]"
                          : "border-line bg-surface-2"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {offer.storeAr || offer.store}
                          </span>
                          {rank === 0 && offer.price !== null && (
                            <Badge tone="good">الأقل سعرًا</Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-ink-3">
                          {offer.verified ?? offer.isVerified
                            ? "✓ سعر موثق"
                            : `${TRUST_TEXT.manualEntry} · ${TRUST_TEXT.unverified}`}
                        </div>
                      </div>

                      <div className="text-left">
                        <div className="text-lg font-bold">
                          {offer.price !== null ? (
                            <Price value={offer.price} />
                          ) : (
                            <span className="text-sm text-ink-3">غير متوفر</span>
                          )}
                        </div>
                        <OfferSaving saving={computeSaving(fairPrice, offer.price)} />
                      </div>

                      {offer.url && (
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          className={`inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors sm:w-auto ${
                            rank === 0
                              ? "bg-brand text-white hover:bg-brand-strong"
                              : "border border-brand/30 bg-surface text-brand-soft hover:bg-brand hover:text-white"
                          }`}
                        >
                          الانتقال للمتجر
                          <ExternalLink size={14} aria-hidden />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-surface-2 p-6 text-center text-sm text-ink-3">
                  لا توجد عروض متاحة حاليًا.
                </p>
              )}
            </section>

            {/* المواصفات */}
            {specs.length > 0 && (
              <section className="card p-5 sm:p-6">
                <h2 className="text-lg font-bold">مواصفات المنتج</h2>
                <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line [&>*:last-child:nth-child(odd)]:col-span-2">
                  {specs.map((spec) => (
                    <div key={spec.title} className="min-w-0 bg-surface-2 px-3 py-3 sm:px-4">
                      <dt className="text-xs text-ink-3">{spec.title}</dt>
                      <dd className="mt-0.5 break-words text-sm font-medium leading-6 sm:text-base sm:leading-7">
                        <bdi>{spec.value}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* الألوان */}
            {product.colors && product.colors.length > 0 && (
              <section className="card p-5 sm:p-6">
                <h2 className="text-lg font-bold">الألوان المتوفرة</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {product.colors.map((color: string) => (
                    <Badge key={color}>{color}</Badge>
                  ))}
                </div>
              </section>
            )}

            {/* الوصف */}
            {product.description && (
              <section className="card p-5 sm:p-6">
                <h2 className="text-lg font-bold">عن المنتج</h2>
                <p className="mt-2 leading-8 text-ink-2">{product.description}</p>
              </section>
            )}

            {/* زر أمازون */}
            {product.amazonUrl && (
              <a
                href={product.amazonUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 font-semibold text-white transition-colors hover:bg-brand-strong"
              >
                البحث عن المنتج في Amazon
                <ExternalLink size={16} aria-hidden />
              </a>
            )}
          </div>

          {/* ============ العمود الجانبي (كمبيوتر) ============ */}
          <aside className="hidden space-y-5 lg:sticky lg:top-24 lg:block">
            {renderPriceSummary()}
          </aside>
        </div>

        {/* تاريخ الإدخال */}
        <p className="mt-8 text-center text-sm text-ink-3">
          تاريخ الإدخال:{" "}
          <bdi dir="ltr" className="num">{product.lastUpdated ?? ""}</bdi>
          {product.lastUpdated ? (product.lastUpdatedConfirmed ? "" : " (غير مؤكد)") : describeEntryDate(null, false)}
        </p>

        <div className="mt-4 text-center">
          <Link
            href="/search"
            className="inline-flex min-h-10 items-center gap-1 text-sm text-brand-soft hover:text-brand"
          >
            ← العودة للمنتجات
          </Link>
        </div>
      </div>
    </main>
  );

  /* ملخص الأسعار والسعر العادل وحالة البيانات */
  function renderPriceSummary() {
    if (!product) return null;
    return (
      <>
        <section className="card overflow-hidden">
          <div className="p-5">
            <div className="text-sm text-ink-3">أقل سعر مرجعي</div>
            <div className="mt-1 text-3xl font-bold text-ink">
              {product.price !== null ? (
                <Price value={product.price} unitClassName="text-ink-3 text-[0.55em] font-medium" />
              ) : (
                <span className="text-lg text-ink-3">غير متوفر</span>
              )}
            </div>
            {product.offers.length > 0 && (
              <div className="mt-1 text-xs text-ink-3">
                لدى <span className="num">{product.offers.length}</span> متاجر مرجعية
              </div>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-px border-t border-line bg-line text-center">
            <PriceStat title="أقل سعر" value={product.lowestPrice} />
            <PriceStat title="متوسط السوق" value={product.averagePrice} />
            <PriceStat title="أعلى سعر" value={product.highestPrice} />
          </dl>
        </section>

        {/* السعر العادل */}
        <section
          className={`rounded-[var(--radius-card)] border p-5 ${
            saving ? verdictStyle(saving).box : "border-line bg-surface"
          }`}
        >
          <div className="text-sm font-semibold text-ink-2">⭐ السعر العادل</div>
          <div
            className={`mt-1 font-bold ${
              fairPrice !== null ? "text-2xl" : "text-lg text-ink-3"
            } ${saving ? verdictStyle(saving).text : ""}`}
          >
            {fairPrice !== null ? <Price value={fairPrice} /> : "مخفي مؤقتًا"}
          </div>

          <div className="mt-3 text-sm leading-7">
            {saving ? (
              <>
                <strong className={verdictStyle(saving).text}>
                  {verdictStyle(saving).label}
                </strong>
                <p className="text-ink-2">
                  محسوب من أسعار موثقة لدى {valuation.verifiedStores} متاجر.
                </p>
              </>
            ) : (
              <div className="flex gap-2 text-ink-2">
                <Info size={16} className="mt-1 shrink-0 text-ink-3" aria-hidden />
                <p>
                  {fairPriceUnavailableReason(valuation.status)} سيظهر السعر
                  العادل تلقائيًا بعد اعتماد أسعار من مصادر موثوقة.
                </p>
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          {/* التوفير لا يظهر إلا مع سعر عادل موثوق */}
          {saving && (
            <InfoBox
              title="💰 التوفير"
              value={
                saving.amount > 0
                  ? `${Math.round(saving.amount).toLocaleString("en-US")} ريال`
                  : "لا يوجد"
              }
              note={
                saving.amount > 0
                  ? `أقل سعر معروض أقل من السعر العادل بنسبة ${saving.percent.toFixed(1)}%`
                  : "أقل سعر معروض ليس أقل من السعر العادل"
              }
              tone="good"
              wide
            />
          )}

          <InfoBox
            icon={<ShieldCheck size={15} aria-hidden />}
            title="حالة البيانات"
            value={hasUnverified ? TRUST_TEXT.unverified : "موثقة"}
            note={hasUnverified ? TRUST_TEXT.manualEntry : undefined}
            tone={hasUnverified ? "warn" : "good"}
          />

          <InfoBox
            icon={<Store size={15} aria-hidden />}
            title="المتجر"
            value={getMainStore(product)}
          />
        </div>
      </>
    );
  }
}

/* =========================
   دوال مساعدة
========================= */

function getMainStore(product: ProductPageProduct): string {
  if (product.store) {
    return product.store;
  }

  if (product.offers && product.offers.length > 0) {
    return (
      product.offers[0].storeAr ||
      product.offers[0].store ||
      "غير محدد"
    );
  }

  return "غير محدد";
}

/* =========================
   حكم السعر مقابل السعر العادل
========================= */

function verdictStyle(saving: Saving) {
  switch (saving.verdict) {
    case "below-fair":
      return {
        label: "✅ أقل من السعر العادل",
        text: "text-good-soft",
        box: "border-good/30 bg-good/[0.06]",
      };
    case "at-fair":
      return {
        label: "🟡 ضمن السعر العادل",
        text: "text-warn",
        box: "border-warn-line bg-warn-bg",
      };
    default:
      return {
        label: "⚠️ أعلى من السعر العادل",
        text: "text-bad",
        box: "border-bad/30 bg-bad/[0.06]",
      };
  }
}

function OfferSaving({ saving }: { saving: Saving | null }) {
  if (!saving || saving.amount <= 0) return null;

  return (
    <div className="text-xs font-semibold text-good-soft">
      توفير {Math.round(saving.amount).toLocaleString("en-US")} ريال عن السعر
      العادل
    </div>
  );
}

function PriceStat({
  title,
  value,
}: {
  title: string;
  value: number | null | undefined;
}) {
  return (
    <div className="bg-surface px-2 py-3">
      <dt className="text-[0.7rem] text-ink-3">{title}</dt>
      <dd className="mt-0.5 text-sm font-semibold">
        {value !== null && value !== undefined ? (
          <Price value={value} unitClassName="text-ink-3 text-[0.75em] font-normal" />
        ) : (
          "غير متوفر"
        )}
      </dd>
    </div>
  );
}

function InfoBox({
  title,
  value,
  note,
  icon,
  tone = "neutral",
  wide = false,
}: {
  title: string;
  value: string;
  note?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "brand" | "good" | "warn";
  wide?: boolean;
}) {
  const valueColor = {
    neutral: "text-ink",
    brand: "text-brand-soft",
    good: "text-good-soft",
    warn: "text-warn",
  }[tone];

  return (
    <div className={`card p-4 ${wide ? "col-span-2" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs text-ink-3">
        {icon}
        {title}
      </div>
      <div className={`mt-1 truncate font-semibold ${valueColor}`}>{value}</div>
      {note && <div className="mt-0.5 text-xs leading-5 text-ink-3">{note}</div>}
    </div>
  );
}
