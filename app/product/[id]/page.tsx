import Link from "next/link";
import { notFound } from "next/navigation";
import products from "../../data/products";

type PageOffer = {
  store: string;
  storeAr: string;
  price: number | null;
  url: string;
  available?: boolean;
  verified?: boolean;
  isVerified?: boolean;
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
  store?: string | null;
  amazonUrl?: string | null;
};

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;

  const product = products.find(
    (item) => item.id === Number(id)
  ) as ProductPageProduct | undefined;

  if (!product) {
    notFound();
  }

  const currentPrice = product.price ?? 0;
  const fairPrice = product.fairPrice ?? 0;

  const saving = Math.max(0, currentPrice - fairPrice);

  const isGoodPrice =
    product.price !== null &&
    product.fairPrice !== null &&
    product.price <= product.fairPrice;

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#f5f7fa",
        color: "#111827",
        padding: "30px 16px 60px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1100px",
          margin: "0 auto",
        }}
      >
        {/* العودة */}
        <div style={{ marginBottom: "20px" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "#2563eb",
              textDecoration: "none",
              fontSize: "16px",
              fontWeight: "700",
            }}
          >
            ← العودة للرئيسية
          </Link>
        </div>

        {/* البطاقة الرئيسية */}
        <section
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "28px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
            marginBottom: "22px",
          }}
        >
          {/* العنوان */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "20px",
              flexWrap: "wrap",
              marginBottom: "28px",
            }}
          >
            <div style={{ flex: "1 1 500px" }}>
              <div
                style={{
                  color: "#6b7280",
                  fontSize: "16px",
                  marginBottom: "8px",
                  fontWeight: "600",
                }}
              >
                {product.brandAr || product.brand}
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: "clamp(28px, 5vw, 44px)",
                  lineHeight: "1.3",
                  fontWeight: "800",
                  color: "#111827",
                }}
              >
                {product.nameAr || product.name}
              </h1>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  marginTop: "16px",
                }}
              >
                <span style={tagStyle}>
                  {product.categoryAr || product.category}
                </span>

                {product.storage && (
                  <span style={tagStyle}>{product.storage}</span>
                )}

                {product.memory &&
                  product.memory !== "غير معلن رسميًا من Apple" && (
                    <span style={tagStyle}>
                      RAM {product.memory}
                    </span>
                  )}
              </div>
            </div>

            {/* السعر الحالي */}
            <div
              style={{
                minWidth: "220px",
                textAlign: "center",
                background: "#f8fafc",
                borderRadius: "18px",
                padding: "20px",
              }}
            >
              <div
                style={{
                  fontSize: "15px",
                  color: "#6b7280",
                  marginBottom: "8px",
                }}
              >
                السعر الحالي
              </div>

              <div
                style={{
                  fontSize: "clamp(30px, 5vw, 42px)",
                  fontWeight: "900",
                  color: "#2563eb",
                  lineHeight: "1.2",
                }}
              >
                {product.price !== null
                  ? product.price.toLocaleString("en-US")
                  : "غير متوفر"}
              </div>

              <div
                style={{
                  fontSize: "17px",
                  color: "#374151",
                  marginTop: "4px",
                  fontWeight: "700",
                }}
              >
                ريال
              </div>
            </div>
          </div>

          {/* الأسعار */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
              marginBottom: "18px",
            }}
          >
            <PriceBox
              title="أقل سعر"
              value={product.lowestPrice}
              color="#16a34a"
            />

            <PriceBox
              title="متوسط السوق"
              value={product.averagePrice}
              color="#2563eb"
            />

            <PriceBox
              title="أعلى سعر"
              value={product.highestPrice}
              color="#dc2626"
            />
          </div>

          {/* السعر العادل */}
          <div
            style={{
              borderRadius: "18px",
              padding: "22px",
              background:
                product.price !== null && product.fairPrice !== null
                  ? isGoodPrice
                    ? "#ecfdf5"
                    : "#fff7ed"
                  : "#f9fafb",
              border: `1px solid ${
                product.price !== null && product.fairPrice !== null
                  ? isGoodPrice
                    ? "#bbf7d0"
                    : "#fed7aa"
                  : "#e5e7eb"
              }`,
              marginBottom: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "15px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "16px",
                    fontWeight: "800",
                    color:
                      product.price !== null &&
                      product.fairPrice !== null
                        ? isGoodPrice
                          ? "#15803d"
                          : "#c2410c"
                        : "#6b7280",
                    marginBottom: "7px",
                  }}
                >
                  ⭐ السعر العادل
                </div>

                <div
                  style={{
                    fontSize: "clamp(28px, 5vw, 38px)",
                    fontWeight: "900",
                    color:
                      product.fairPrice !== null
                        ? isGoodPrice
                          ? "#15803d"
                          : "#c2410c"
                        : "#6b7280",
                  }}
                >
                  {product.fairPrice !== null
                    ? `${product.fairPrice.toLocaleString("en-US")} ريال`
                    : "غير متوفر"}
                </div>
              </div>

              <div
                style={{
                  textAlign: "right",
                  fontSize: "16px",
                  lineHeight: "1.8",
                  color: "#374151",
                }}
              >
                {product.price !== null && product.fairPrice !== null ? (
                  isGoodPrice ? (
                    <>
                      <strong style={{ color: "#15803d" }}>
                        ✅ سعر مناسب
                      </strong>
                      <br />
                      السعر الحالي ضمن السعر العادل.
                    </>
                  ) : (
                    <>
                      <strong style={{ color: "#c2410c" }}>
                        ⚠️ السعر أعلى من العادل
                      </strong>
                      <br />
                      حاول الحصول على سعر أقل.
                    </>
                  )
                ) : (
                  <>
                    <strong style={{ color: "#6b7280" }}>
                      ℹ️ لا تتوفر بيانات كافية
                    </strong>
                    <br />
                    لا يمكن تحديد حالة السعر حاليًا.
                  </>
                )}
              </div>
            </div>
          </div>

          {/* التوفير والثقة والمتجر */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
            }}
          >
            <InfoBox
              title="💰 التوفير"
              value={
                saving > 0
                  ? `${saving.toLocaleString("en-US")} ريال`
                  : "لا يوجد"
              }
              color="#16a34a"
            />

            <InfoBox
              title="🛡️ مستوى الثقة"
              value={`${product.confidence}%`}
              color="#111827"
            />

            <InfoBox
              title="🏪 المتجر"
              value={getMainStore(product)}
              color="#111827"
            />
          </div>
        </section>

        {/* المواصفات */}
        <section
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "28px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.07)",
            marginBottom: "22px",
          }}
        >
          <h2
            style={{
              margin: "0 0 24px",
              fontSize: "25px",
              fontWeight: "800",
            }}
          >
            مواصفات المنتج
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(260px, 1fr))",
              border: "1px solid #e5e7eb",
              borderRadius: "16px",
              overflow: "hidden",
            }}
          >
            <Spec title="الشاشة" value={product.screen} />
            <Spec title="المعالج" value={product.chip} />
            <Spec
              title="الكاميرا الخلفية"
              value={product.camera}
            />
            <Spec
              title="الكاميرا الأمامية"
              value={product.frontCamera}
            />
            <Spec title="الذاكرة" value={product.memory} />
            <Spec
              title="السعة التخزينية"
              value={product.storage}
            />
            <Spec title="البطارية" value={product.battery} />
            <Spec
              title="الاتصال"
              value={product.connectivity}
            />
            <Spec
              title="مقاومة الماء والغبار"
              value={product.waterResistance}
            />
            <Spec
              title="معدل التحديث"
              value={product.refreshRate}
            />
          </div>
        </section>

        {/* الألوان */}
        {product.colors && product.colors.length > 0 && (
          <section
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "28px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.07)",
              marginBottom: "22px",
            }}
          >
            <h2
              style={{
                margin: "0 0 18px",
                fontSize: "23px",
                fontWeight: "800",
              }}
            >
              الألوان المتوفرة
            </h2>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              {product.colors.map((color: string) => (
                <span
                  key={color}
                  style={{
                    background: "#f3f4f6",
                    border: "1px solid #e5e7eb",
                    padding: "10px 16px",
                    borderRadius: "999px",
                    fontSize: "15px",
                    fontWeight: "600",
                  }}
                >
                  {color}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* الوصف */}
        {product.description && (
          <section
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "28px",
              boxShadow: "0 8px 30px rgba(0,0,0,0.07)",
              marginBottom: "22px",
            }}
          >
            <h2
              style={{
                margin: "0 0 14px",
                fontSize: "23px",
                fontWeight: "800",
              }}
            >
              عن المنتج
            </h2>

            <p
              style={{
                margin: 0,
                fontSize: "17px",
                lineHeight: "2",
                color: "#374151",
              }}
            >
              {product.description}
            </p>
          </section>
        )}

        {/* العروض */}
        <section
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "28px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.07)",
            marginBottom: "22px",
          }}
        >
          <h2
            style={{
              margin: "0 0 22px",
              fontSize: "24px",
              fontWeight: "800",
            }}
          >
            أفضل الأسعار المتاحة
          </h2>

          {product.offers.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              {product.offers.map((offer, index) => (
                <div
                  key={`${offer.store}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "18px",
                    flexWrap: "wrap",
                    padding: "18px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "16px",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ minWidth: "180px" }}>
                    <div
                      style={{
                        fontSize: "18px",
                        fontWeight: "800",
                        color: "#111827",
                      }}
                    >
                      {offer.storeAr || offer.store}
                    </div>

                    {(offer.verified ?? offer.isVerified) && (
                      <div
                        style={{
                          color: "#16a34a",
                          fontSize: "14px",
                          marginTop: "5px",
                          fontWeight: "700",
                        }}
                      >
                        ✓ متجر موثق
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: "23px",
                      fontWeight: "900",
                      color: "#2563eb",
                    }}
                  >
                    {offer.price !== null
                      ? `${offer.price.toLocaleString("en-US")} ريال`
                      : "غير متوفر"}
                  </div>

                  {offer.url && (
                    <a
                      href={offer.url}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      style={{
                        background: "#2563eb",
                        color: "#ffffff",
                        padding: "12px 22px",
                        borderRadius: "10px",
                        textDecoration: "none",
                        fontWeight: "800",
                        fontSize: "15px",
                        minWidth: "130px",
                        textAlign: "center",
                      }}
                    >
                      الانتقال للمتجر →
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "30px 15px",
                color: "#6b7280",
                background: "#f9fafb",
                borderRadius: "16px",
              }}
            >
              لا توجد عروض متاحة حاليًا.
            </div>
          )}
        </section>

        {/* زر أمازون */}
        {product.amazonUrl && (
          <a
            href={product.amazonUrl}
            target="_blank"
            rel="noopener noreferrer sponsored"
            style={{
              display: "block",
              width: "100%",
              boxSizing: "border-box",
              background: "#2563eb",
              color: "#ffffff",
              padding: "17px 20px",
              borderRadius: "14px",
              textDecoration: "none",
              fontWeight: "800",
              fontSize: "18px",
              textAlign: "center",
              marginBottom: "18px",
            }}
          >
            البحث عن المنتج في Amazon ←
          </a>
        )}

        {/* آخر تحديث */}
        <div
          style={{
            textAlign: "center",
            color: "#6b7280",
            fontSize: "14px",
            padding: "10px",
          }}
        >
          آخر تحديث: {product.lastUpdated || "غير محدد"}
        </div>
      </div>
    </main>
  );
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
   PriceBox
========================= */

function PriceBox({
  title,
  value,
  color,
}: {
  title: string;
  value: number | null | undefined;
  color: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "20px",
        textAlign: "center",
        minHeight: "105px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: "15px",
          color: "#6b7280",
          marginBottom: "10px",
          fontWeight: "700",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "24px",
          fontWeight: "900",
          color,
        }}
      >
        {value !== null && value !== undefined
          ? value.toLocaleString("en-US")
          : "غير متوفر"}
      </div>

      {value !== null && value !== undefined && (
        <div
          style={{
            marginTop: "3px",
            fontSize: "13px",
            color: "#6b7280",
          }}
        >
          ريال
        </div>
      )}
    </div>
  );
}

/* =========================
   InfoBox
========================= */

function InfoBox({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "#f8fafc",
        borderRadius: "16px",
        padding: "18px",
        textAlign: "center",
        minHeight: "90px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: "14px",
          color: "#6b7280",
          marginBottom: "8px",
          fontWeight: "700",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "21px",
          fontWeight: "900",
          color,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* =========================
   Spec
========================= */

function Spec({
  title,
  value,
}: {
  title: string;
  value?: string | null;
}) {
  if (!value) return null;

  return (
    <div
      style={{
        padding: "20px",
        borderBottom: "1px solid #e5e7eb",
        minHeight: "92px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          color: "#6b7280",
          fontSize: "14px",
          marginBottom: "8px",
          fontWeight: "700",
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: "#111827",
          fontSize: "17px",
          fontWeight: "700",
          lineHeight: "1.7",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* =========================
   Tag
========================= */

const tagStyle: React.CSSProperties = {
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #dbeafe",
  borderRadius: "999px",
  padding: "7px 13px",
  fontSize: "14px",
  fontWeight: "700",
};