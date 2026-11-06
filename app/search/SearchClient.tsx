"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import products from "../data/products";
import { searchProducts } from "../lib/search";
import { TRUST_TEXT } from "../lib/trust";

export default function SearchClient({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState("all");

  function submit() {
    const value = input.trim();
    setQuery(value);
    router.replace(
      value ? `/search?q=${encodeURIComponent(value)}` : "/search",
      { scroll: false }
    );
  }

  const results = useMemo(() => {
    return searchProducts(products, query).filter(
      (product) => category === "all" || product.category === category
    );
  }, [query, category]);

  const categories = Array.from(
    new Map(products.map((p) => [p.category, p.categoryAr])).entries()
  );

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#fff",
        padding: "30px 20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            fontSize: 34,
            marginBottom: 10,
          }}
        >
          البحث في TruePrice
        </h1>

        <p
          style={{
            color: "#aaa",
            marginBottom: 25,
          }}
        >
          ابحث عن أي جهاز أو شركة أو فئة
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 30,
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            aria-label="البحث عن منتج"
            placeholder="مثال: آيفون، سامسونج، آيباد، شاومي..."
            style={{
              flex: 1,
              minWidth: 280,
              padding: "16px 18px",
              borderRadius: 12,
              border: "1px solid #333",
              background: "#111",
              color: "#fff",
              fontSize: 16,
              outline: "none",
            }}
          />

          <button
            onClick={submit}
            style={{
              padding: "0 25px",
              borderRadius: 12,
              border: "none",
              background: "#fff",
              color: "#000",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            بحث
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 30,
          }}
        >
          <button
            onClick={() => setCategory("all")}
            style={{
              padding: "9px 15px",
              borderRadius: 20,
              border: "1px solid #444",
              background: category === "all" ? "#fff" : "#111",
              color: category === "all" ? "#000" : "#fff",
              cursor: "pointer",
            }}
          >
            الكل
          </button>

          {categories.map(([cat, catAr]) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: "9px 15px",
                borderRadius: 20,
                border: "1px solid #444",
                background: category === cat ? "#fff" : "#111",
                color: category === cat ? "#000" : "#fff",
                cursor: "pointer",
              }}
            >
              {catAr}
            </button>
          ))}
        </div>

        <div
          style={{
            marginBottom: 20,
            color: "#aaa",
          }}
        >
          عدد النتائج:{" "}
          <strong style={{ color: "#fff" }}>
            {results.length}
          </strong>
          {query && (
            <>
              {" "}
              لـ «<span style={{ color: "#fff" }}>{query}</span>»
            </>
          )}
        </div>

        <div
          role="note"
          style={{
            marginBottom: 20,
            padding: "10px 14px",
            borderRadius: 12,
            background: "#1c1503",
            border: "1px solid #4a3a0a",
            color: "#fcd34d",
            fontSize: 13,
            lineHeight: 1.8,
          }}
        >
          ⚠️ جميع الأسعار {TRUST_TEXT.manualEntry} و{TRUST_TEXT.unverified}،
          و{TRUST_TEXT.dateUnconfirmed}. تحقّق من السعر لدى المتجر قبل الشراء.
        </div>

        {results.length === 0 ? (
          <div
            style={{
              padding: 40,
              background: "#111",
              border: "1px solid #222",
              borderRadius: 18,
              textAlign: "center",
              color: "#aaa",
            }}
          >
            لا توجد منتجات مطابقة للبحث. جرّب كلمات أقل أو اسم الشركة فقط
            (مثال: «سامسونج» أو «iPhone»).
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 18,
            }}
          >
            {results.map((product) => {
              const lowestPrice = product.lowestPrice ?? 0;
              const highestPrice = product.highestPrice ?? 0;
              const averagePrice = product.averagePrice ?? 0;
              const fairPrice = product.fairPrice;

              return (
                <div
                  key={product.id}
                  style={{
                    background: "#111",
                    border: "1px solid #252525",
                    borderRadius: 18,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      color: "#999",
                      fontSize: 13,
                      marginBottom: 8,
                    }}
                  >
                    {product.brandAr} • {product.categoryAr}
                  </div>

                  <h2
                    style={{
                      fontSize: 20,
                      margin: "0 0 8px",
                    }}
                  >
                    <Link
                      href={`/product/${product.id}`}
                      style={{ color: "#fff", textDecoration: "none" }}
                    >
                      {product.nameAr}
                    </Link>
                  </h2>

                  <div
                    style={{
                      color: "#999",
                      fontSize: 14,
                      marginBottom: 18,
                    }}
                  >
                    {product.name}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 8,
                      marginBottom: 18,
                    }}
                  >
                    <div>
                      <small style={{ color: "#777" }}>
                        أقل سعر
                      </small>
                      <div>
                        {lowestPrice.toLocaleString("ar-SA")} ريال
                      </div>
                    </div>

                    <div>
                      <small style={{ color: "#777" }}>
                        أعلى سعر
                      </small>
                      <div>
                        {highestPrice.toLocaleString("ar-SA")} ريال
                      </div>
                    </div>

                    <div>
                      <small style={{ color: "#777" }}>
                        المتوسط
                      </small>
                      <div>
                        {averagePrice.toLocaleString("ar-SA")} ريال
                      </div>
                    </div>

                    <div>
                      <small style={{ color: "#777" }}>
                        السعر العادل (تقدير أولي)
                      </small>
                      <div style={{ fontWeight: "bold" }}>
                        {fairPrice !== null
                          ? `${fairPrice.toLocaleString("ar-SA")} ريال`
                          : TRUST_TEXT.dataUnavailable}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      color: "#777",
                      fontSize: 13,
                      marginBottom: 15,
                    }}
                  >
                    {product.storage !== "—" &&
                      `التخزين: ${product.storage}`}

                    {product.memory !== "—" &&
                      ` • الذاكرة: ${product.memory}`}
                  </div>

                  <div
                    style={{
                      borderTop: "1px solid #222",
                      paddingTop: 15,
                    }}
                  >
                    <div
                      style={{
                        color: "#aaa",
                        fontSize: 13,
                        marginBottom: 10,
                      }}
                    >
                      مراجع الأسعار: {product.offers.length}
                    </div>

                    {product.offers.length === 0 ? (
                      <div
                        style={{
                          color: "#666",
                          fontSize: 13,
                        }}
                      >
                        لا توجد أسعار متاحة حاليًا
                      </div>
                    ) : (
                      product.offers.map((offer, index) => {
                        const offerPrice = offer.price ?? null;

                        return (
                          <a
                            key={`${product.id}-${index}`}
                            href={offer.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "8px 0",
                              color: "#fff",
                              textDecoration: "none",
                              borderBottom:
                                index <
                                product.offers.length - 1
                                  ? "1px solid #1d1d1d"
                                  : "none",
                            }}
                          >
                            <span>
                              {offer.storeAr}
                            </span>

                            <strong>
                              {offerPrice !== null
                                ? `${offerPrice.toLocaleString(
                                    "ar-SA"
                                  )} ريال`
                                : "السعر غير متاح حاليًا"}
                            </strong>
                          </a>
                        );
                      })
                    )}
                  </div>

                  <Link
                    href={`/product/${product.id}`}
                    style={{
                      display: "block",
                      marginTop: 14,
                      textAlign: "center",
                      padding: 11,
                      borderRadius: 10,
                      background: "#1b1b1b",
                      color: "#fff",
                      textDecoration: "none",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    عرض التفاصيل والمقارنة
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}