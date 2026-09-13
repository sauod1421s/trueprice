import Link from "next/link";
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

type CarModel = {
  name: string;
  year: number;
  price: number;
  trim?: string;
  engine?: string;
  power?: string;
  fuel?: string;
};

const brands: Record<
  string,
  {
    name: string;
    description: string;
    sourceName: string;
    sourceUrl: string;
    models: CarModel[];
  }
> = {
  toyota: {
    name: "تويوتا",
    description: "أسعار سيارات تويوتا المنشورة في السوق السعودي.",
    sourceName: "Toyota السعودية",
    sourceUrl: "https://www.toyota.com.sa/ar/vehicles",

    models: [
      {
        name: "Yaris",
        year: 2026,
        price: 66987.5,
        engine: "1.3 لتر",
        power: "97 حصان",
        fuel: "بنزين",
      },
      {
        name: "Corolla",
        year: 2026,
        price: 82627.5,
        trim: "1.5L XLI",
        engine: "1.5 لتر",
        power: "119 حصان",
        fuel: "بنزين",
      },
      {
        name: "Camry",
        year: 2026,
        price: 109825,
        engine: "2.5 لتر",
        fuel: "بنزين / هجين",
      },
      {
        name: "Crown",
        year: 2026,
        price: 158355,
        fuel: "هجين",
      },
      {
        name: "GR86",
        year: 2026,
        price: 147487.5,
        fuel: "بنزين",
      },
      {
        name: "Supra",
        year: 2026,
        price: 278760,
        fuel: "بنزين",
      },
      {
        name: "Raize",
        year: 2026,
        price: 68827.5,
        fuel: "بنزين",
      },
      {
        name: "Urban Cruiser",
        year: 2026,
        price: 84755,
        fuel: "بنزين",
      },
      {
        name: "Veloz",
        year: 2026,
        price: 84007.5,
        fuel: "بنزين",
      },
      {
        name: "Corolla Cross",
        year: 2025,
        price: 103845,
        fuel: "بنزين",
      },
      {
        name: "RAV4",
        year: 2026,
        price: 106662.5,
        fuel: "بنزين",
      },
      {
        name: "Innova",
        year: 2026,
        price: 127765,
        fuel: "بنزين",
      },
      {
        name: "Land Cruiser Hardtop",
        year: 2026,
        price: 158240,
        fuel: "بنزين",
      },
      {
        name: "Fortuner",
        year: 2026,
        price: 128742.5,
        fuel: "بنزين",
      },
      {
        name: "Highlander",
        year: 2026,
        price: 151455,
        fuel: "بنزين",
      },
      {
        name: "Prado",
        year: 2026,
        price: 199582.5,
        trim: "TX-2",
        engine: "2.4 لتر تيربو",
        power: "267 حصان",
        fuel: "بنزين",
      },
      {
        name: "Land Cruiser",
        year: 2026,
        price: 263407.5,
        fuel: "بنزين",
      },
      {
        name: "LC300 HEV MAX",
        year: 2026,
        price: 334535,
        fuel: "هجين",
      },
    ],
  },

  hyundai: {
    name: "هيونداي",
    description:
      "أسعار هيونداي المنشورة من موزعيها المعتمدين في السعودية.",
    sourceName: "موزعو هيونداي في السعودية",
    sourceUrl: "https://hyundaiksa.com/",

    models: [
      {
        name: "Accent",
        year: 2026,
        price: 71484,
        engine: "1.5 لتر",
        power: "113 حصان",
        fuel: "بنزين",
      },
      {
        name: "Elantra",
        year: 2026,
        price: 86694,
        trim: "1.5 GL",
        engine: "1.5 لتر",
        power: "157 حصان",
        fuel: "بنزين",
      },
      {
        name: "Tucson",
        year: 2026,
        price: 107704,
        engine: "1.6 لتر تيربو",
        power: "178 حصان",
        fuel: "بنزين",
      },
      {
        name: "Creta",
        year: 2026,
        price: 86200,
        engine: "1.5 لتر تيربو",
        power: "160 حصان",
        fuel: "بنزين",
      },
      {
        name: "Sonata",
        year: 2026,
        price: 107904,
        engine: "2.5 لتر تيربو",
        power: "290 حصان",
        fuel: "بنزين",
      },
      {
        name: "Kona",
        year: 2026,
        price: 86290,
        engine: "2.0 لتر",
        power: "195 حصان",
        fuel: "بنزين",
      },
      {
        name: "Palisade",
        year: 2026,
        price: 177039,
        engine: "2.5 لتر تيربو",
        power: "277 حصان",
        fuel: "بنزين",
      },
      {
        name: "Staria Premium",
        year: 2026,
        price: 177447,
        engine: "3.5 لتر",
        power: "268 حصان",
        fuel: "بنزين",
      },
    ],
  },

  kia: {
    name: "كيا",
    description:
      "أسعار كيا المنشورة من موزع كيا في السعودية.",
    sourceName: "كيا الجبر",
    sourceUrl: "https://www.kia.com/aljabr/ar/",

    models: [
      {
        name: "K4",
        year: 2026,
        price: 86135,
        fuel: "بنزين",
      },
      {
        name: "K8",
        year: 2026,
        price: 160885,
        fuel: "بنزين",
      },
      {
        name: "K5",
        year: 2026,
        price: 103385,
        fuel: "بنزين",
      },
      {
        name: "Pegas",
        year: 2026,
        price: 53935,
        fuel: "بنزين",
      },
      {
        name: "K3",
        year: 2026,
        price: 72335,
        fuel: "بنزين",
      },
      {
        name: "Carens",
        year: 2026,
        price: 91885,
        fuel: "بنزين",
      },
      {
        name: "Sportage L",
        year: 2026,
        price: 103385,
        fuel: "بنزين",
      },
      {
        name: "Sonet",
        year: 2026,
        price: 74635,
        fuel: "بنزين",
      },
      {
        name: "Seltos",
        year: 2026,
        price: 76935,
        fuel: "بنزين",
      },
      {
        name: "Carnival",
        year: 2026,
        price: 149385,
        fuel: "بنزين",
      },
      {
        name: "Telluride",
        year: 2026,
        price: 160885,
        fuel: "بنزين",
      },
    ],
  },

  nissan: {
    name: "نيسان",
    description:
      "أسعار سيارات نيسان المنشورة في السوق السعودي.",
    sourceName: "نيسان السعودية",
    sourceUrl:
      "https://ar.nissan-saudiarabia.com/vehicles/new.html",

    models: [
      {
        name: "Magnite",
        year: 2026,
        price: 69999,
        fuel: "بنزين",
      },
      {
        name: "Kicks",
        year: 2026,
        price: 89599,
        fuel: "بنزين",
      },
      {
        name: "X-Trail",
        year: 2026,
        price: 104999,
        fuel: "بنزين",
      },
      {
        name: "Altima",
        year: 2026,
        price: 112700,
        fuel: "بنزين",
      },
      {
        name: "X-Terra",
        year: 2026,
        price: 118999,
        fuel: "بنزين",
      },
      {
        name: "Pathfinder",
        year: 2026,
        price: 164999,
        fuel: "بنزين",
      },
      {
        name: "Patrol",
        year: 2026,
        price: 270999,
        fuel: "بنزين",
      },
      {
        name: "Patrol PRO-4X",
        year: 2026,
        price: 380999,
        fuel: "بنزين",
      },
      {
        name: "Patrol NISMO",
        year: 2026,
        price: 450999,
        fuel: "بنزين",
      },
      {
        name: "Z",
        year: 2026,
        price: 261999,
        fuel: "بنزين",
      },
    ],
  },

  mg: {
    name: "MG",
    description:
      "أسعار سيارات MG المنشورة من MG السعودية.",
    sourceName: "MG السعودية",
    sourceUrl: "https://www.mg-sa.com/ar/",

    models: [
      {
        name: "MG 5",
        year: 2026,
        price: 54450,
        engine: "1.5 لتر",
        power: "110 حصان",
        fuel: "بنزين",
      },
      {
        name: "MG 7",
        year: 2026,
        price: 86650,
        engine: "2.0 لتر تيربو",
        power: "261 حصان",
        fuel: "بنزين",
      },
      {
        name: "MG HS",
        year: 2026,
        price: 85040,
        engine: "2.0 لتر تيربو",
        fuel: "بنزين",
      },
      {
        name: "MG HS Hybrid+",
        year: 2026,
        price: 116089,
        power: "221 حصان",
        fuel: "هجين",
      },
      {
        name: "MG RX9",
        year: 2026,
        price: 108765,
        engine: "2.0 لتر تيربو",
        fuel: "بنزين",
      },
      {
        name: "MG One",
        year: 2026,
        price: 74610,
        engine: "1.5 لتر تيربو",
        power: "168 حصان",
        fuel: "بنزين",
      },
    ],
  },
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 0,
  }).format(Math.round(price));
}

export default async function Page({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: brandParam } = await params;

  const brand = brands[brandParam.toLowerCase()];

  if (!brand) {
    return (
      <main
        dir="rtl"
        style={{
          minHeight: "100vh",
          background: "#080D14",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1>العلامة غير موجودة</h1>

          <Link
            href="/cars"
            style={{
              color: "#34D399",
              textDecoration: "none",
            }}
          >
            العودة إلى السيارات
          </Link>
        </div>
      </main>
    );
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
                بيانات أسعار منشورة
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
            const fair = calculateFairPrice(
              car.name,
              car.year,
              car.price,
              car.trim
            );

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
                    السعر المنشور من المصدر
                  </div>

                  <div
                    style={{
                      fontSize: 37,
                      fontWeight: 900,
                      color: "#FFFFFF",
                    }}
                  >
                    {formatPrice(car.price)}

                    <span
                      style={{
                        fontSize: 16,
                        color: "#9BA9B8",
                        marginRight: 7,
                      }}
                    >
                      ريال
                    </span>
                  </div>

                  <div
                    style={{
                      color: "#6EE7B7",
                      fontSize: 12,
                      marginTop: 7,
                    }}
                  >
                    المصدر: {brand.sourceName}
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
                        محسوب من بيانات سوقية منشورة
                        من {fair.sourceCount} مصادر مستقلة.
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