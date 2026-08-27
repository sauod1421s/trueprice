"use client";

import { useMemo, useState } from "react";
import products from "../data/products";

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/[ًٌٍَُِّْ]/g, "")
    .trim();
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const results = useMemo(() => {
    const q = normalize(query);

    return products.filter((product) => {
      const text = normalize(
        [
          product.name,
          product.nameAr,
          product.brand,
          product.brandAr,
          product.category,
          product.categoryAr,
          product.storage,
          product.memory,
        ].join(" ")
      );

      const matchesSearch = !q || text.includes(q);

      const matchesCategory =
        category === "all" || product.category === category;

      return matchesSearch && matchesCategory;
    });
  }, [query, category]);

  const categories = Array.from(
    new Set(products.map((p) => p.category))
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setQuery(query.trim());
              }
            }}
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
            onClick={() => setQuery(query.trim())}
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

          {categories.map((cat) => (
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
              {cat}
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
            لا توجد منتجات مطابقة للبحث.
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
              const fairPrice = product.fairPrice ?? 0;

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
                    {product.nameAr}
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
                        السعر العادل
                      </small>
                      <div style={{ fontWeight: "bold" }}>
                        {fairPrice.toLocaleString("ar-SA")} ريال
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}