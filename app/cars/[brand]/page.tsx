import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Scale,
  Database,
} from "lucide-react";

import {
  calculateFairPrice,
  getFairPriceIcon,
  getFairPriceLabel,
} from "@/app/data/priceUtils";

import brands, { type CarModel } from "@/app/data/cars";
import { TRUST_TEXT } from "@/app/lib/trust";

const brandNameAr: Record<string, string> = {
  toyota: "تويوتا",
  hyundai: "هيونداي",
  kia: "كيا",
  nissan: "نيسان",
  mg: "MG",
  ford: "فورد",
  honda: "هوندا",
  mazda: "مازدا",
  suzuki: "سوزوكي",
  isuzu: "إيسوزو",
  changan: "شانجان",
  geely: "جيلي",
  gac: "GAC",
  haval: "هافال",
  jetour: "جيتور",
  chery: "شيري",
  chevrolet: "شفروليه",
  gmc: "GMC",
  mitsubishi: "ميتسوبيشي",
  jeep: "جيب",
  lexus: "لكزس",
  bmw: "BMW",
  mercedes: "مرسيدس",
  audi: "أودي",
  volkswagen: "فولكس واجن",
  byd: "BYD",
  exeed: "إكسيد",
  hongqi: "هونشي",
  greatwall: "جريت وول",
  tank: "تانك",
  jac: "جاك",
  mahindra: "ماهيندرا",
  renault: "رينو",
  peugeot: "بيجو",
  landrover: "لاند روفر",
  volvo: "فولفو",
  porsche: "بورشه",
  tesla: "تسلا",
  lucid: "لوسيد",
  genesis: "جينيسيس",
};

function getFairPrice(car: CarModel) {
  if (typeof car.price !== "number") {
    return {
      fairPrice: null,
      marketLow: null,
      marketHigh: null,
      marketAverage: null,
      marketCount: 0,
      sourceCount: 0,
      sources: [],
      status: "not-enough-data" as const,
      difference: null,
      differencePercent: null,
    };
  }

  return calculateFairPrice(
    car.name,
    car.year,
    car.price,
    car.trim
  );
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 0,
  }).format(Math.round(price));
}

export function generateStaticParams() {
  return Object.keys(brands).map((brand) => ({ brand }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ brand: string }>;
}): Promise<Metadata> {
  const { brand: brandParam } = await params;
  const brandId = brandParam.toLowerCase();
  const brand = brands[brandId];

  if (!brand) {
    return { title: "العلامة غير موجودة", robots: { index: false } };
  }

  const nameAr = brandNameAr[brandId] ?? brand.name;
  const title = `أسعار سيارات ${nameAr} في السعودية`;
  const description = `أسعار مرجعية لـ ${brand.models.length} موديل من ${nameAr} (${brand.name}) في السعودية مع مقارنة السوق. الأسعار مرجعية وغير موثقة بعد.`;

  return {
    title,
    description,
    alternates: { canonical: `/cars/${brandId}` },
    openGraph: {
      title,
      description,
      url: `/cars/${brandId}`,
      siteName: "TruePrice",
      locale: "ar_SA",
      type: "website",
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: brandParam } = await params;

  const brandId = brandParam.toLowerCase();
  const brand = brands[brandId];

  if (!brand) {
    notFound();
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top,#142333 0%,#080D14 45%,#060A10 100%)",
        color: "#fff",
        paddingBottom: 80,
      }}
    >
      <div
        style={{
          maxWidth: 1350,
          margin: "0 auto",
          padding: "30px 22px",
        }}
      >
        <Link
          href="/cars"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "#A7B4C4",
            textDecoration: "none",
            fontSize: 16,
            marginBottom: 30,
          }}
        >
          <ArrowRight size={19} />
          جميع السيارات
        </Link>

        {/* HERO */}
        <section
          style={{
            background:
              "linear-gradient(135deg,#101C29,#0D1722)",
            border: "1px solid #243244",
            borderRadius: 26,
            padding: "40px 34px",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 25,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#6EE7B7",
                  fontSize: 14,
                  marginBottom: 15,
                }}
              >
                <ShieldCheck size={17} />
                بيانات مرجعية غير موثقة بعد
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(42px,6vw,68px)",
                  fontWeight: 900,
                }}
              >
                {brand.name}
              </h1>

              <p
                style={{
                  color: "#AAB7C6",
                  fontSize: 20,
                  lineHeight: 1.8,
                  margin: "12px 0 0",
                }}
              >
                {brand.description}
              </p>
            </div>

            <div
              style={{
                background: "#09111A",
                border: "1px solid #263647",
                borderRadius: 18,
                padding: "18px 28px",
                minWidth: 150,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: "#8191A4",
                  fontSize: 14,
                }}
              >
                عدد الموديلات
              </div>

              <div
                style={{
                  fontSize: 34,
                  fontWeight: 900,
                  marginTop: 5,
                }}
              >
                {brand.models.length}
              </div>
            </div>
          </div>
        </section>

        {/* CARS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(330px,1fr))",
            gap: 22,
          }}
        >
          {brand.models.map((car) => {
            const fair = getFairPrice(car);

            return (
              <article
                key={`${car.name}-${car.year}-${car.trim ?? "base"}`}
                style={{
                  background:
                    "linear-gradient(145deg,#111D2A,#0C151F)",
                  border: "1px solid #263646",
                  borderRadius: 24,
                  padding: 26,
                  boxShadow:
                    "0 14px 35px rgba(0,0,0,0.18)",
                }}
              >
                {/* HEADER */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 15,
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin: 0,
                        fontSize: 30,
                        fontWeight: 900,
                        color: "#FFFFFF",
                      }}
                    >
                      {car.name}
                    </h2>

                    <div
                      style={{
                        color: "#9AAABC",
                        fontSize: 15,
                        marginTop: 8,
                      }}
                    >
                      {car.year}
                      {car.trim ? ` • ${car.trim}` : ""}
                    </div>
                  </div>

                  <span
                    style={{
                      background: "#172536",
                      border: "1px solid #2B3C4F",
                      borderRadius: 10,
                      padding: "7px 11px",
                      fontSize: 12,
                      color: "#D5DEE8",
                      fontWeight: 700,
                    }}
                  >
                    جديد
                  </span>
                </div>

                {/* OFFICIAL PRICE */}
                <div
                  style={{
                    marginTop: 25,
                    padding: "20px 0",
                    borderTop: "1px solid #263646",
                    borderBottom: "1px solid #263646",
                  }}
                >
                  <div
                    style={{
                      color: "#8B9BAD",
                      fontSize: 14,
                      marginBottom: 6,
                    }}
                  >
                    السعر المرجعي
                  </div>

                  <div
                    style={{
                      fontSize: 37,
                      fontWeight: 900,
                      color: "#FFFFFF",
                    }}
                  >
                    {typeof car.price === "number"
                      ? formatPrice(car.price)
                      : "السعر غير متوفر"}

                    {typeof car.price === "number" && (
                      <span
                        style={{
                          fontSize: 16,
                          color: "#9BA9B8",
                          marginRight: 7,
                        }}
                      >
                        ريال
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      color: "#6EE7B7",
                      fontSize: 12,
                      marginTop: 7,
                    }}
                  >
                    المصدر المذكور: {brand.sourceName}
                  </div>

                  <div
                    style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      marginTop: 4,
                      lineHeight: 1.7,
                    }}
                  >
                    {TRUST_TEXT.carPriceSourceUnconfirmed}{" "}
                    {TRUST_TEXT.dateUnconfirmed}.
                  </div>
                </div>

                {/* MARKET */}
                <div
                  style={{
                    marginTop: 20,
                    background:
                      "linear-gradient(145deg,#0A151F,#09131C)",
                    border: "1px solid #25384A",
                    borderRadius: 18,
                    padding: 19,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: "#FFFFFF",
                      fontSize: 16,
                      fontWeight: 800,
                    }}
                  >
                    <Scale size={19} />
                    مقارنة السوق
                  </div>

                  {fair.marketCount > 0 ? (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit,minmax(150px,1fr))",
                          gap: 10,
                          marginTop: 15,
                        }}
                      >
                        {fair.sources.map(
                          (source, index) => (
                            <a
                              key={`${source.source}-${source.price}-${index}`}
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                textDecoration: "none",
                                background: "#111F2C",
                                border:
                                  "1px solid #2A3B4D",
                                borderRadius: 13,
                                padding: 13,
                              }}
                            >
                              <div
                                style={{
                                  color: "#8293A5",
                                  fontSize: 12,
                                  marginBottom: 6,
                                }}
                              >
                                {source.source ===
                                "motory"
                                  ? "موتري"
                                  : source.source ===
                                    "syarah"
                                  ? "سيارة"
                                  : "هتلاقي"}
                              </div>

                              <div
                                style={{
                                  color: "#FFFFFF",
                                  fontSize: 18,
                                  fontWeight: 900,
                                }}
                              >
                                {formatPrice(
                                  source.price
                                )}
                              </div>

                              <div
                                style={{
                                  color: "#6EE7B7",
                                  fontSize: 11,
                                  marginTop: 4,
                                }}
                              >
                                فتح المصدر ↗
                              </div>
                            </a>
                          )
                        )}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit,minmax(130px,1fr))",
                          gap: 9,
                          marginTop: 13,
                        }}
                      >
                        <MarketBox
                          title="أقل سعر"
                          value={fair.marketLow}
                        />

                        <MarketBox
                          title="أعلى سعر"
                          value={fair.marketHigh}
                        />

                        <MarketBox
                          title="متوسط السوق"
                          value={fair.marketAverage}
                        />
                      </div>
                    </>
                  ) : (
                    <div
                      style={{
                        marginTop: 13,
                        color: "#9AA9B8",
                        fontSize: 13,
                        lineHeight: 1.8,
                      }}
                    >
                      لا توجد بيانات سوقية موثقة كافية
                      لهذا الموديل حاليًا لحساب المقارنة.
                    </div>
                  )}
                </div>

                {/* FAIR PRICE */}
                <div
                  style={{
                    marginTop: 15,
                    background:
                      fair.fairPrice !== null
                        ? "linear-gradient(135deg,#08251D,#0B1917)"
                        : "#09131D",
                    border:
                      fair.fairPrice !== null
                        ? "1px solid #145C47"
                        : "1px solid #25384A",
                    borderRadius: 18,
                    padding: 19,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: "#FFFFFF",
                      fontSize: 16,
                      fontWeight: 800,
                    }}
                  >
                    <Scale size={19} />
                    السعر العادل
                  </div>

                  {fair.fairPrice !== null ? (
                    <>
                      <div
                        style={{
                          fontSize: 32,
                          fontWeight: 900,
                          color: "#6EE7B7",
                          marginTop: 9,
                        }}
                      >
                        {formatPrice(fair.fairPrice)}

                        <span
                          style={{
                            fontSize: 14,
                            color: "#8FA0B2",
                            marginRight: 6,
                          }}
                        >
                          ريال
                        </span>
                      </div>

                      <div
                        style={{
                          marginTop: 9,
                          fontSize: 14,
                          fontWeight: 800,
                        }}
                      >
                        {getFairPriceIcon(fair.status)}{" "}
                        {getFairPriceLabel(fair.status)}
                      </div>

                      {fair.differencePercent !== null && (
                        <div
                          style={{
                            marginTop: 6,
                            color: "#AAB8C6",
                            fontSize: 13,
                          }}
                        >
                          الفرق عن السعر العادل:{" "}
                          {Math.abs(
                            fair.differencePercent
                          ).toFixed(1)}
                          %
                          {fair.difference !== null &&
                            (fair.difference > 0
                              ? " أعلى"
                              : fair.difference < 0
                              ? " أقل"
                              : " مطابق")}
                        </div>
                      )}

                      <div
                        style={{
                          color: "#718296",
                          fontSize: 11,
                          marginTop: 8,
                        }}
                      >
                        تقدير أولي (الوسيط) من بيانات منشورة
                        في {fair.sourceCount} مصادر، لم يتم التحقق
                        منها بعد.
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          marginTop: 12,
                          color: "#AAB7C5",
                          fontSize: 14,
                          lineHeight: 1.8,
                        }}
                      >
                        لا نعرض رقمًا تقديريًا للسعر العادل.
                      </div>

                      {fair.status === "not-independent" && (
                        <div
                          style={{
                            marginTop: 6,
                            color: "#FCD34D",
                            fontSize: 12,
                            lineHeight: 1.7,
                          }}
                        >
                          {getFairPriceIcon(fair.status)} السعر
                          متطابق حرفيًا في جميع المصادر، لذلك لا
                          يمكن التأكد من أنها مصادر مستقلة. السعر
                          العادل مخفي حتى تتم مراجعتها.
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: 6,
                          color: "#6EE7B7",
                          fontSize: 12,
                          lineHeight: 1.7,
                        }}
                      >
                        يظهر السعر العادل فقط بعد توفر
                        بيانات سوقية كافية من 3 مصادر
                        مستقلة على الأقل.
                      </div>
                    </>
                  )}
                </div>

                {/* REFERENCES */}
                <div
                  style={{
                    marginTop: 18,
                    background: "#0A131D",
                    borderRadius: 16,
                    padding: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      color: "#FFFFFF",
                      fontSize: 14,
                      fontWeight: 800,
                    }}
                  >
                    <Database size={17} />
                    المراجع
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit,minmax(150px,1fr))",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <ReferenceLink
                      number="①"
                      name={brand.sourceName}
                      url={brand.sourceUrl}
                      primary
                    />

                    <ReferenceLink
                      number="②"
                      name="موتري"
                      url="https://ksa.motory.com/ar/"
                    />

                    <ReferenceLink
                      number="③"
                      name="سيارة"
                      url="https://syarah.com/"
                    />

                    <ReferenceLink
                      number="④"
                      name="هتلاقي"
                      url="https://ksa.hatla2ee.com/ar/"
                    />
                  </div>
                </div>

                {/* SPECS */}
                {(car.engine || car.power || car.fuel) && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      marginTop: 15,
                    }}
                  >
                    {car.engine && (
                      <SpecBadge text={car.engine} />
                    )}

                    {car.power && (
                      <SpecBadge text={car.power} />
                    )}

                    {car.fuel && (
                      <SpecBadge text={car.fuel} />
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}

function MarketBox({
  title,
  value,
}: {
  title: string;
  value: number | null;
}) {
  return (
    <div
      style={{
        background: "#111F2C",
        border: "1px solid #26394B",
        borderRadius: 12,
        padding: "11px 12px",
      }}
    >
      <div
        style={{
          color: "#8191A4",
          fontSize: 11,
          marginBottom: 5,
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: "#E8EEF5",
          fontSize: 15,
          fontWeight: 900,
        }}
      >
        {value !== null
          ? `${formatPrice(value)} ريال`
          : "غير متاح"}
      </div>
    </div>
  );
}

function ReferenceLink({
  number,
  name,
  url,
  primary = false,
}: {
  number: string;
  name: string;
  url: string;
  primary?: boolean;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        background: primary
          ? "#0E2A22"
          : "#101B26",
        border: primary
          ? "1px solid #17634D"
          : "1px solid #263747",
        borderRadius: 11,
        padding: "10px 11px",
        textDecoration: "none",
        color: primary
          ? "#6EE7B7"
          : "#B5C1CE",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <span>
        {number} {name}
      </span>

      <ExternalLink size={13} />
    </a>
  );
}

function SpecBadge({
  text,
}: {
  text: string;
}) {
  return (
    <span
      style={{
        background: "#172536",
        border: "1px solid #27394C",
        borderRadius: 9,
        padding: "8px 11px",
        fontSize: 12,
        color: "#B7C5D3",
      }}
    >
      {text}
    </span>
  );
}