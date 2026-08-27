"use client";

import { useEffect, useState, type CSSProperties } from "react";

declare global {
  interface Window {
    truePriceRecordStoreVisit?: () => void;
  }
}

const popularProducts = [
  "iPhone 17",
  "ايفون 17",
  "iPhone 16 Pro",
  "Galaxy S25 Ultra",
  "MacBook Air M4",
  "PlayStation 5",
  "Nintendo Switch 2",
];

const navLinkStyle: CSSProperties = {
  color: "#fff",
  fontSize: "18px",
  fontWeight: "700",
  textDecoration: "none",
  cursor: "pointer",
};

export default function Home() {
  const [search, setSearch] = useState("");
  const [searchCount, setSearchCount] = useState(0);
  const [storeVisits, setStoreVisits] = useState(0);

  useEffect(() => {
    const savedSearches = Number(
      localStorage.getItem("trueprice_searches") || "0"
    );
    const savedStoreVisits = Number(
      localStorage.getItem("trueprice_store_visits") || "0"
    );

    setSearchCount(savedSearches);
    setStoreVisits(savedStoreVisits);

    window.truePriceRecordStoreVisit = () => {
      const current = Number(
        localStorage.getItem("trueprice_store_visits") || "0"
      );
      const next = current + 1;

      localStorage.setItem("trueprice_store_visits", String(next));
      setStoreVisits(next);
    };
  }, []);

  function recordSearch() {
    const current = Number(
      localStorage.getItem("trueprice_searches") || "0"
    );
    const next = current + 1;

    localStorage.setItem("trueprice_searches", String(next));
    setSearchCount(next);
  }

  function goToSearch() {
    const value = search.trim();

    if (!value) return;

    recordSearch();

    const encoded = encodeURIComponent(value);
    window.location.assign(`/search?q=${encoded}`);
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#fff",
        fontFamily: "Arial, sans-serif",
        overflowX: "hidden",
      }}
    >
      <header
        style={{
          background: "#2563eb",
          padding: "22px 7%",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "25px",
            flexWrap: "wrap",
          }}
        >
          <a
            href="#home"
            style={{
              textDecoration: "none",
              color: "#fff",
              textAlign: "right",
            }}
          >
            <div
              style={{
                fontSize: "38px",
                fontWeight: "800",
                lineHeight: 1,
              }}
            >
              TruePrice
            </div>

            <div
              style={{
                fontSize: "16px",
                marginTop: "8px",
                opacity: 0.9,
              }}
            >
              المرجع الذكي للأسعار
            </div>
          </a>

          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: "35px",
              flexWrap: "wrap",
            }}
          >
            <a href="#home" style={navLinkStyle}>
              الرئيسية
            </a>

            <a href="#how-it-works" style={navLinkStyle}>
              كيف يعمل؟
            </a>

            <a href="#about" style={navLinkStyle}>
              عن TruePrice
            </a>
          </nav>
        </div>
      </header>

      <section
        id="home"
        style={{
          maxWidth: "1100px",
          margin: "auto",
          padding: "90px 25px 60px",
          textAlign: "center",
          scrollMarginTop: "120px",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "10px 22px",
            borderRadius: "30px",
            background: "#07162d",
            color: "#60a5fa",
            fontSize: "18px",
            marginBottom: "25px",
          }}
        >
          قارن قبل أن تشتري
        </div>

        <h1
          style={{
            fontSize: "72px",
            margin: "0 0 20px",
            fontWeight: "800",
          }}
        >
          TruePrice
        </h1>

        <p
          style={{
            color: "#aaa",
            fontSize: "26px",
            margin: "0 0 45px",
          }}
        >
          اعرف السعر الحقيقي قبل أن تشتري
        </p>

        <div
          style={{
            maxWidth: "850px",
            margin: "auto",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "8px",
            border: "2px solid #444",
            borderRadius: "22px",
            background: "#101010",
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                goToSearch();
              }
            }}
            placeholder="ابحث عن أي منتج..."
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#fff",
              fontSize: "20px",
              padding: "18px",
              textAlign: "right",
            }}
          />

          <button
            type="button"
            onClick={goToSearch}
            style={{
              background: "#16a34a",
              color: "#fff",
              border: "none",
              borderRadius: "16px",
              padding: "18px 35px",
              fontSize: "20px",
              fontWeight: "700",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            بحث
          </button>
        </div>

        <p
          style={{
            color: "#666",
            fontSize: "16px",
            marginTop: "15px",
          }}
        >
          مثال: ايفون 17 أو iPhone 17 أو Galaxy S25 Ultra
        </p>
      </section>

      <section
        style={{
          maxWidth: "820px",
          margin: "0 auto 70px",
          padding: "0 25px",
        }}
      >
        <div
          className="trueprice-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "10px",
          }}
        >
          <StatCard number="35" title="منتج" />
          <StatCard number="16" title="متجر" />
          <StatCard number={formatNumber(searchCount)} title="عملية بحث" />
          <StatCard number={formatNumber(storeVisits)} title="زيارة متجر" />
        </div>
      </section>

      <section
        id="how-it-works"
        style={{
          maxWidth: "1000px",
          margin: "0 auto 100px",
          padding: "80px 25px 0",
          scrollMarginTop: "120px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "40px",
          }}
        >
          <div
            style={{
              display: "inline-block",
              color: "#60a5fa",
              background: "#07162d",
              padding: "9px 20px",
              borderRadius: "30px",
              marginBottom: "15px",
              fontSize: "17px",
            }}
          >
            طريقة العمل
          </div>

          <h2
            style={{
              fontSize: "42px",
              margin: 0,
            }}
          >
            كيف يعمل TruePrice؟
          </h2>

          <p
            style={{
              color: "#777",
              fontSize: "18px",
              marginTop: "12px",
            }}
          >
            أربع خطوات بسيطة لمعرفة السعر الحقيقي قبل الشراء
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "18px",
          }}
        >
          <HowCard
            number="01"
            title="ابحث"
            text="اكتب اسم المنتج الذي تريد معرفة سعره، سواء بالعربي أو بالإنجليزي."
          />

          <HowCard
            number="02"
            title="نقارن"
            text="نقارن أسعار المنتج بين المتاجر المختلفة للحصول على صورة أوضح."
          />

          <HowCard
            number="03"
            title="نحلل"
            text="نحلل الأسعار ونحدد أقل سعر ومتوسط السوق والسعر العادل."
          />

          <HowCard
            number="04"
            title="قرر"
            text="اعرف إذا كان العرض مناسبًا قبل اتخاذ قرار الشراء."
          />
        </div>
      </section>

      <section
        style={{
          maxWidth: "1000px",
          margin: "0 auto 100px",
          padding: "0 25px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "25px",
            gap: "20px",
          }}
        >
          <h2
            style={{
              fontSize: "36px",
              margin: 0,
            }}
          >
            🔥 الأكثر بحثًا
          </h2>

          <span style={{ color: "#666" }}>اختر منتجًا</span>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "15px",
          }}
        >
          {popularProducts.map((product) => (
            <button
              key={product}
              type="button"
              onClick={() => {
                recordSearch();
                window.location.href =
                  "/search?q=" + encodeURIComponent(product);
              }}
              style={{
                background: "#fff",
                color: "#222",
                border: "none",
                borderRadius: "40px",
                padding: "17px 28px",
                fontSize: "18px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              {product}
            </button>
          ))}
        </div>
      </section>

      <section
        id="about"
        style={{
          maxWidth: "1000px",
          margin: "0 auto 100px",
          padding: "80px 25px 0",
          scrollMarginTop: "120px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            background: "#101010",
            border: "1px solid #292929",
            borderRadius: "25px",
            padding: "45px 30px",
          }}
        >
          <h2
            style={{
              fontSize: "40px",
              margin: "0 0 18px",
            }}
          >
            عن TruePrice
          </h2>

          <p
            style={{
              color: "#999",
              fontSize: "19px",
              lineHeight: "2",
              maxWidth: "750px",
              margin: "auto",
            }}
          >
            TruePrice منصة تهدف إلى مساعدة المستهلك على فهم أسعار المنتجات
            ومقارنتها قبل الشراء، من خلال عرض بيانات الأسعار وتحليلها بطريقة
            بسيطة وواضحة.
          </p>
        </div>
      </section>

      <style jsx>{`
        @media (max-width: 700px) {
          .trueprice-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }
      `}</style>

      <footer
        style={{
          borderTop: "1px solid #222",
          padding: "50px 25px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "24px",
            fontWeight: "700",
          }}
        >
          TruePrice
        </div>

        <p
          style={{
            color: "#666",
            marginTop: "10px",
          }}
        >
          المرجع الذكي للأسعار
        </p>
      </footer>
    </main>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-SA").format(value);
}

function StatCard({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        color: "#111",
        borderRadius: "13px",
        padding: "10px 8px",
        textAlign: "center",
        minWidth: 0,
      }}
    >
      <div
        style={{
          color: "#16a34a",
          fontSize: "24px",
          fontWeight: "700",
        }}
      >
        {number}
      </div>

      <div
        style={{
          color: "#555",
          fontSize: "12px",
          marginTop: "4px",
        }}
      >
        {title}
      </div>
    </div>
  );
}

function HowCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div
      style={{
        background: "#101010",
        border: "1px solid #292929",
        borderRadius: "20px",
        padding: "28px",
        minHeight: "170px",
      }}
    >
      <div
        style={{
          color: "#2563eb",
          fontSize: "18px",
          fontWeight: "700",
        }}
      >
        {number}
      </div>

      <h3
        style={{
          fontSize: "27px",
          margin: "14px 0 8px",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          color: "#888",
          fontSize: "17px",
          lineHeight: "1.8",
          margin: 0,
        }}
      >
        {text}
      </p>
    </div>
  );
}