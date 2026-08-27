"use client";

import Link from "next/link";

type PriceOffer = {
  store: string;
  storeAr: string;
  price: number;
  url: string;
  isVerified?: boolean;
  checkedAt?: string;
};

type Product = {
  id: number;
  name: string;
  nameAr: string;
  brand: string;
  brandAr: string;
  category: string;
  categoryAr: string;
  memory: string;
  storage: string;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  fairPrice: number;
  offers: PriceOffer[];
  screen?: string;
  chip?: string;
  camera?: string;
};

export default function ProductCard({
  product,
}: {
  product: Product;
}) {
  return (
    <article
      style={{
        background: "#111",
        border: "1px solid #292929",
        borderRadius: 20,
        padding: 22,
        color: "#fff",
        direction: "rtl",
      }}
    >
      {/* اسم المنتج */}
      <Link
        href={`/product/${product.id}`}
        style={{
          display: "block",
          color: "#fff",
          textDecoration: "none",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            color: "#777",
            fontSize: 13,
            marginBottom: 7,
          }}
        >
          {product.brandAr} • {product.categoryAr}
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: 21,
            fontWeight: 700,
          }}
        >
          {product.nameAr}
        </h2>

        <div
          style={{
            color: "#777",
            fontSize: 13,
            marginTop: 6,
            direction: "ltr",
            textAlign: "right",
          }}
        >
          {product.name}
        </div>
      </Link>

      {/* المواصفات */}
      {(product.storage !== "—" ||
        product.memory !== "—" ||
        product.screen ||
        product.chip ||
        product.camera) && (
        <div
          style={{
            background: "#0b0b0b",
            borderRadius: 12,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
            color: "#aaa",
            lineHeight: 1.9,
          }}
        >
          {product.storage !== "—" && (
            <div>
              التخزين:{" "}
              <strong style={{ color: "#fff" }}>
                {product.storage}
              </strong>
            </div>
          )}

          {product.memory !== "—" && (
            <div>
              الذاكرة:{" "}
              <strong style={{ color: "#fff" }}>
                {product.memory}
              </strong>
            </div>
          )}

          {product.screen && (
            <div>
              الشاشة:{" "}
              <strong style={{ color: "#fff" }}>
                {product.screen}
              </strong>
            </div>
          )}

          {product.chip && (
            <div>
              المعالج:{" "}
              <strong style={{ color: "#fff" }}>
                {product.chip}
              </strong>
            </div>
          )}

          {product.camera && (
            <div>
              الكاميرا:{" "}
              <strong style={{ color: "#fff" }}>
                {product.camera}
              </strong>
            </div>
          )}
        </div>
      )}

      {/* الأسعار */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 18,
        }}
      >
        <PriceBox
          title="أقل سعر"
          value={product.lowestPrice}
        />

        <PriceBox
          title="أعلى سعر"
          value={product.highestPrice}
        />

        <PriceBox
          title="متوسط السعر"
          value={product.averagePrice}
        />

        <PriceBox
          title="السعر العادل"
          value={product.fairPrice}
          highlight
        />
      </div>

      {/* مراجع الأسعار */}
      <div
        style={{
          borderTop: "1px solid #292929",
          paddingTop: 18,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <strong style={{ fontSize: 16 }}>
            مراجع الأسعار
          </strong>

          <span
            style={{
              background: "#222",
              color: "#aaa",
              padding: "5px 9px",
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            {product.offers.length}{" "}
            {product.offers.length === 1 ? "مرجع" : "مراجع"}
          </span>
        </div>

        {product.offers.length === 0 ? (
          <div
            style={{
              color: "#777",
              padding: 12,
              background: "#0b0b0b",
              borderRadius: 10,
            }}
          >
            لا توجد أسعار متاحة حاليًا
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {product.offers.map((offer, index) => (
              <div
                key={`${product.id}-${offer.store}-${index}`}
                style={{
                  background: "#0b0b0b",
                  border: "1px solid #202020",
                  borderRadius: 12,
                  padding: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 14,
                      }}
                    >
                      {offer.storeAr}
                    </div>

                    <div
                      style={{
                        color: "#666",
                        fontSize: 11,
                        marginTop: 3,
                      }}
                    >
                      {offer.store}
                    </div>

                    {offer.isVerified && (
                      <div
                        style={{
                          color: "#888",
                          fontSize: 10,
                          marginTop: 4,
                        }}
                      >
                        ✓ مصدر موثق
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      textAlign: "left",
                    }}
                  >
                    <strong
                      style={{
                        fontSize: 17,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {offer.price.toLocaleString("ar-SA")} ر.س
                    </strong>
                  </div>
                </div>

                {/* رابط المرجع */}
                <a
                  href={offer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    marginTop: 10,
                    background: "#fff",
                    color: "#000",
                    textDecoration: "none",
                    textAlign: "center",
                    padding: "9px",
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  فتح المرجع في المتجر
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* تفاصيل المنتج */}
      <Link
        href={`/product/${product.id}`}
        style={{
          display: "block",
          marginTop: 16,
          textAlign: "center",
          padding: 12,
          borderRadius: 10,
          background: "#1b1b1b",
          color: "#fff",
          textDecoration: "none",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        عرض تفاصيل المنتج والمقارنة
      </Link>
    </article>
  );
}

function PriceBox({
  title,
  value,
  highlight = false,
}: {
  title: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? "#171717" : "#0b0b0b",
        border: highlight
          ? "1px solid #444"
          : "1px solid #202020",
        borderRadius: 12,
        padding: 12,
      }}
    >
      <div
        style={{
          color: "#777",
          fontSize: 11,
          marginBottom: 5,
        }}
      >
        {title}
      </div>

      <strong
        style={{
          fontSize: 15,
        }}
      >
        {value.toLocaleString("ar-SA")} ر.س
      </strong>
    </div>
  );
}