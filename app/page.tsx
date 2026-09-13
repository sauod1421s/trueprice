"use client";

declare global {
  interface Window {
    truePriceRecordStoreVisit?: () => void;
  }
}

import { useEffect, useState, type CSSProperties } from "react";

const popularProducts = [
  "iPhone 17",
  "ايفون 17",
  "iPhone 16 Pro",
  "Galaxy S25 Ultra",
  "MacBook Air M4",
  "PlayStation 5",
  "Nintendo Switch 2",
];

const carBrands = [
  {
    name: "Toyota",
    nameAr: "تويوتا",
    description: "أسعار ومواصفات سيارات تويوتا في السعودية",
    initial: "T",
  },
  {
    name: "Hyundai",
    nameAr: "هيونداي",
    description: "أسعار ومواصفات سيارات هيونداي في السعودية",
    initial: "H",
  },
  {
    name: "Kia",
    nameAr: "كيا",
    description: "أسعار ومواصفات سيارات كيا في السعودية",
    initial: "K",
  },
  {
    name: "Nissan",
    nameAr: "نيسان",
    description: "أسعار ومواصفات سيارات نيسان في السعودية",
    initial: "N",
  },
  {
    name: "MG",
    nameAr: "MG",
    description: "أسعار ومواصفات سيارات MG في السعودية",
    initial: "MG",
  },
];

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

    window.location.assign(
      `/search?q=${encodeURIComponent(value)}`
    );
  }

  function searchPopularProduct(product: string) {
    recordSearch();

    window.location.assign(
      `/search?q=${encodeURIComponent(product)}`
    );
  }

  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#080D14",
        color: "#F8FAFC",
        fontFamily:
          '"Cairo", "IBM Plex Sans Arabic", Arial, sans-serif',
        overflowX: "hidden",
      }}
    >
      {/* ================= HEADER ================= */}

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(14,22,33,0.90)",
          backdropFilter: "blur(18px)",
          borderBottom: "1px solid #243244",
        }}
      >
        <div
          className="tp-header-inner"
          style={{
            maxWidth: "1280px",
            margin: "auto",
            padding: "13px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
          }}
        >
          <a
            href="#home"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              textDecoration: "none",
              color: "#F8FAFC",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background:
                  "linear-gradient(135deg,#10B981,#047857)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "21px",
                fontWeight: 900,
                boxShadow:
                  "0 8px 20px rgba(5,150,105,0.20)",
              }}
            >
              ✦
            </div>

            <div style={{ lineHeight: 1.1 }}>
              <div
                style={{
                  fontSize: "17px",
                  fontWeight: 900,
                  letterSpacing: "-0.4px",
                }}
              >
                TruePrice
              </div>

              <div
                style={{
                  fontSize: "10px",
                  color: "#A7B4C5",
                  marginTop: "4px",
                  fontWeight: 600,
                }}
              >
                ذكاء الأسعار
              </div>
            </div>
          </a>

          <nav
            className="tp-main-nav"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <a href="#home" style={headerLinkStyle}>
              الرئيسية
            </a>

            <a href="/search" style={headerLinkStyle}>
              المنتجات
            </a>

            <a
              href="/cars"
              style={{
                ...headerLinkStyle,
                color: "#6EE7B7",
                background: "rgba(16,185,129,0.12)",
              }}
            >
              <span style={{ fontSize: "15px" }}>🚗</span>
              السيارات
            </a>

            <a
              href="#how-it-works"
              style={headerLinkStyle}
            >
              كيف يعمل؟
            </a>

            <a href="#about" style={headerLinkStyle}>
              عن TruePrice
            </a>
          </nav>

          <a
            href="/search"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              background: "#172332",
              color: "white",
              padding: "10px 15px",
              borderRadius: "10px",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 700,
              flexShrink: 0,
              border: "1px solid #243244",
            }}
          >
            <span>⌕</span>
            بحث
          </a>
        </div>
      </header>

      {/* ================= HERO ================= */}

      <section
        id="home"
        style={{
          position: "relative",
          overflow: "hidden",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(5,150,105,0.12), transparent 60%), radial-gradient(ellipse 60% 40% at 90% 10%, rgba(30,64,175,0.08), transparent 60%)",
          padding: "95px 24px 70px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.55,
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "relative",
            maxWidth: "950px",
            margin: "auto",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "9px",
              padding: "8px 15px",
              borderRadius: "999px",
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.30)",
              color: "#6EE7B7",
              fontSize: "13px",
              fontWeight: 800,
              marginBottom: "24px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#10B981",
                boxShadow:
                  "0 0 0 4px rgba(16,185,129,0.15)",
              }}
            />

            منصة سعودية مستقلة لذكاء الأسعار
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(44px, 7vw, 78px)",
              lineHeight: 1.05,
              fontWeight: 900,
              letterSpacing: "-2px",
              color: "#F8FAFC",
            }}
          >
            اعرف{" "}
            <span
              style={{
                background:
                  "linear-gradient(135deg,#059669,#10B981)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              السعر الحقيقي
            </span>
            <br />
            قبل أن تشتري
          </h1>

          <p
            style={{
              maxWidth: "650px",
              margin: "22px auto 35px",
              color: "#A7B4C5",
              fontSize: "18px",
              lineHeight: 1.9,
            }}
          >
            قارن الأسعار، افهم السوق، واكتشف السعر العادل
            للمنتج أو السيارة قبل اتخاذ قرار الشراء.
          </p>

          {/* SEARCH */}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              goToSearch();
            }}
            style={{
              maxWidth: "850px",
              margin: "auto",
              display: "flex",
              alignItems: "stretch",
              background: "#0E1621",
              border: "1px solid #243244",
              borderRadius: "18px",
              overflow: "hidden",
              boxShadow:
                "0 20px 50px -25px rgba(0,0,0,0.55)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 18px",
                color: "#8FA0B5",
                fontSize: "25px",
              }}
            >
              ⌕
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن أي منتج... مثال: ايفون 17"
              aria-label="البحث عن منتج"
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "#F8FAFC",
                fontSize: "16px",
                padding: "19px 5px",
                textAlign: "right",
                fontFamily: "inherit",
              }}
            />

            <button
              type="submit"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                border: "none",
                background: "#059669",
                color: "white",
                padding: "0 25px",
                fontSize: "15px",
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              بحث
              <span style={{ fontSize: "18px" }}>←</span>
            </button>
          </form>

          <div
            style={{
              marginTop: "15px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              color: "#8FA0B5",
              fontSize: "12px",
            }}
          >
            <span>أمثلة:</span>

            {popularProducts.slice(0, 4).map((product) => (
              <button
                key={product}
                type="button"
                onClick={() =>
                  searchPopularProduct(product)
                }
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#6EE7B7",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {product}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ================= STATS ================= */}

      <section
        style={{
          maxWidth: "1050px",
          margin: "-15px auto 80px",
          padding: "0 24px",
          position: "relative",
        }}
      >
        <div
          className="trueprice-home-stats"
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(4,minmax(0,1fr))",
            gap: "12px",
          }}
        >
          <StatCard
            icon="▥"
            number="35"
            title="منتج"
          />

          <StatCard
            icon="▣"
            number="16"
            title="متجر"
          />

          <StatCard
            icon="⌕"
            number={formatNumber(searchCount)}
            title="عملية بحث"
          />

          <StatCard
            icon="↗"
            number={formatNumber(storeVisits)}
            title="زيارة متجر"
          />
        </div>
      </section>

      {/* ================= CARS ================= */}

      <section
        style={{
          maxWidth: "1180px",
          margin: "0 auto 100px",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            borderRadius: "28px",
            background:
              "linear-gradient(135deg,#0F172A,#111827)",
            color: "white",
            padding: "45px",
            overflow: "hidden",
            position: "relative",
            border: "1px solid #243244",
            boxShadow:
              "0 25px 60px rgba(0,0,0,0.25)",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "300px",
              height: "300px",
              borderRadius: "50%",
              background:
                "rgba(5,150,105,0.14)",
              filter: "blur(40px)",
              top: "-120px",
              left: "-70px",
            }}
          />

          <div
            className="tp-cars-heading"
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "30px",
              marginBottom: "30px",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "7px",
                  color: "#6EE7B7",
                  fontSize: "12px",
                  fontWeight: 800,
                  marginBottom: "12px",
                }}
              >
                🚗 قسم السيارات
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize: "clamp(28px,4vw,42px)",
                  fontWeight: 900,
                }}
              >
                مرجع أسعار السيارات
              </h2>

              <p
                style={{
                  margin: "10px 0 0",
                  color: "#94A3B8",
                  fontSize: "15px",
                  lineHeight: 1.8,
                  maxWidth: "600px",
                }}
              >
                تعرّف على أسعار السيارات الجديدة في السعودية
                وقارن الموديلات والفئات قبل التواصل مع الوكيل.
              </p>
            </div>

            <a
              href="/cars"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                color: "white",
                background: "#059669",
                textDecoration: "none",
                padding: "12px 18px",
                borderRadius: "11px",
                fontSize: "13px",
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              استعرض السيارات
              <span>←</span>
            </a>
          </div>

          <div
            className="trueprice-car-brands"
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns:
                "repeat(5,minmax(0,1fr))",
              gap: "12px",
            }}
          >
            {carBrands.map((brand) => (
              <a
                key={brand.name}
                href={`/cars/${brand.name.toLowerCase()}`}
                style={{
                  textDecoration: "none",
                  color: "white",
                  background:
                    "rgba(255,255,255,0.055)",
                  border:
                    "1px solid rgba(255,255,255,0.09)",
                  borderRadius: "17px",
                  padding: "20px 16px",
                }}
              >
                <div
                  style={{
                    width: "45px",
                    height: "45px",
                    borderRadius: "13px",
                    background:
                      "rgba(16,185,129,0.13)",
                    border:
                      "1px solid rgba(110,231,183,0.18)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6EE7B7",
                    fontSize:
                      brand.initial.length > 1
                        ? "12px"
                        : "19px",
                    fontWeight: 900,
                    marginBottom: "15px",
                  }}
                >
                  {brand.initial}
                </div>

                <div
                  style={{
                    fontSize: "17px",
                    fontWeight: 900,
                  }}
                >
                  {brand.nameAr}
                </div>

                <div
                  style={{
                    color: "#94A3B8",
                    fontSize: "11px",
                    marginTop: "4px",
                  }}
                >
                  {brand.name}
                </div>

                <div
                  style={{
                    color: "#64748B",
                    fontSize: "10px",
                    lineHeight: 1.7,
                    marginTop: "10px",
                  }}
                >
                  {brand.description}
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}

      <section
        id="how-it-works"
        style={{
          maxWidth: "1050px",
          margin: "0 auto 100px",
          padding: "0 24px",
          scrollMarginTop: "100px",
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
              padding: "7px 14px",
              borderRadius: "999px",
              background: "rgba(16,185,129,0.12)",
              border: "1px solid rgba(16,185,129,0.22)",
              color: "#6EE7B7",
              fontSize: "12px",
              fontWeight: 800,
              marginBottom: "13px",
            }}
          >
            طريقة العمل
          </div>

          <h2
            style={{
              fontSize: "36px",
              margin: 0,
              fontWeight: 900,
            }}
          >
            كيف يعمل TruePrice؟
          </h2>

          <p
            style={{
              color: "#A7B4C5",
              fontSize: "15px",
              marginTop: "10px",
            }}
          >
            أربع خطوات بسيطة لمعرفة السعر قبل الشراء
          </p>
        </div>

        <div
          className="trueprice-how-grid"
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(4,minmax(0,1fr))",
            gap: "14px",
          }}
        >
          <HowCard
            number="01"
            title="ابحث"
            text="اكتب اسم المنتج الذي تريد معرفة سعره، بالعربي أو بالإنجليزي."
          />

          <HowCard
            number="02"
            title="نقارن"
            text="نقارن الأسعار بين المصادر والمتاجر للحصول على صورة أوضح للسوق."
          />

          <HowCard
            number="03"
            title="نحلل"
            text="نحلل الأسعار ونحدد أقل سعر ومتوسط السوق والسعر العادل."
          />

          <HowCard
            number="04"
            title="قرر"
            text="اعرف إذا كان السعر مناسبًا قبل اتخاذ قرار الشراء."
          />
        </div>
      </section>

      {/* ================= POPULAR ================= */}

      <section
        style={{
          maxWidth: "1050px",
          margin: "0 auto 100px",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "20px",
            marginBottom: "25px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "30px",
                margin: 0,
                fontWeight: 900,
              }}
            >
              🔥 الأكثر بحثًا
            </h2>

            <p
              style={{
                color: "#A7B4C5",
                margin: "6px 0 0",
                fontSize: "13px",
              }}
            >
              ابدأ بأحد المنتجات الشائعة
            </p>
          </div>

          <a
            href="/search"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              color: "#6EE7B7",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 800,
            }}
          >
            كل المنتجات
            <span>‹</span>
          </a>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          {popularProducts.map((product) => (
            <button
              key={product}
              type="button"
              onClick={() =>
                searchPopularProduct(product)
              }
              style={{
                background: "#0E1621",
                color: "#CBD5E1",
                border: "1px solid #243244",
                borderRadius: "999px",
                padding: "12px 18px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow:
                  "0 5px 15px rgba(0,0,0,0.18)",
              }}
            >
              {product}
            </button>
          ))}
        </div>
      </section>

      {/* ================= ABOUT ================= */}

      <section
        id="about"
        style={{
          maxWidth: "1050px",
          margin: "0 auto 90px",
          padding: "0 24px",
          scrollMarginTop: "100px",
        }}
      >
        <div
          style={{
            borderRadius: "25px",
            background: "#0E1621",
            border: "1px solid #243244",
            padding: "45px 30px",
            textAlign: "center",
            boxShadow:
              "0 15px 40px -30px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              margin: "0 auto 15px",
              borderRadius: "15px",
              background: "rgba(16,185,129,0.12)",
              color: "#6EE7B7",
              border: "1px solid rgba(16,185,129,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "23px",
              fontWeight: 900,
            }}
          >
            ✓
          </div>

          <h2
            style={{
              fontSize: "34px",
              margin: "0 0 15px",
              fontWeight: 900,
            }}
          >
            عن TruePrice
          </h2>

          <p
            style={{
              color: "#A7B4C5",
              fontSize: "16px",
              lineHeight: 2,
              maxWidth: "760px",
              margin: "auto",
            }}
          >
            TruePrice منصة مستقلة تهدف إلى مساعدة المستهلك
            على فهم الأسعار ومقارنتها قبل الشراء، من خلال
            عرض بيانات الأسعار وتحليلها بطريقة بسيطة وواضحة.
          </p>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              marginTop: "20px",
              padding: "8px 14px",
              borderRadius: "999px",
              background: "rgba(16,185,129,0.10)",
              color: "#6EE7B7",
              border: "1px solid rgba(16,185,129,0.25)",
              fontSize: "11px",
              fontWeight: 800,
            }}
          >
            ✓ منصة مستقلة لمرجع الأسعار والمعلومات
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}

      <footer
        style={{
          background:
            "linear-gradient(180deg,#0B1120,#080D14)",
          color: "white",
          padding: "55px 24px 25px",
          borderTop: "1px solid #1C2938",
        }}
      >
        <div
          className="trueprice-footer-grid"
          style={{
            maxWidth: "1050px",
            margin: "auto",
            display: "grid",
            gridTemplateColumns:
              "2fr 1fr 1fr",
            gap: "45px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
                  background:
                    "rgba(16,185,129,0.15)",
                  border:
                    "1px solid rgba(52,211,153,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6EE7B7",
                  fontSize: "20px",
                  fontWeight: 900,
                }}
              >
                ✦
              </div>

              <div>
                <div
                  style={{
                    fontSize: "19px",
                    fontWeight: 900,
                  }}
                >
                  TruePrice
                </div>

                <div
                  style={{
                    color: "#8FA0B5",
                    fontSize: "11px",
                  }}
                >
                  منصة سعودية مستقلة لذكاء الأسعار
                </div>
              </div>
            </div>

            <p
              style={{
                color: "#8FA0B5",
                fontSize: "13px",
                lineHeight: 1.9,
                maxWidth: "520px",
                marginTop: "16px",
              }}
            >
              TruePrice منصة مرجعية مستقلة لعرض ومقارنة
              معلومات الأسعار، ولا تبيع المنتجات أو السيارات
              ولا تعمل كوكيل أو وسيط.
            </p>
          </div>

          <div>
            <div style={footerTitleStyle}>
              المنصة
            </div>

            <a href="/" style={footerLinkStyle}>
              الرئيسية
            </a>

            <a
              href="/search"
              style={footerLinkStyle}
            >
              المنتجات
            </a>

            <a
              href="/cars"
              style={footerLinkStyle}
            >
              السيارات
            </a>

            <a
              href="#how-it-works"
              style={footerLinkStyle}
            >
              كيف يعمل؟
            </a>
          </div>

          <div>
            <div style={footerTitleStyle}>
              المعلومات
            </div>

            <a
              href="#about"
              style={footerLinkStyle}
            >
              عن TruePrice
            </a>

            <a
              href="/methodology"
              style={footerLinkStyle}
            >
              المنهجية
            </a>

            <div
              style={{
                color: "#8FA0B5",
                fontSize: "12px",
                marginTop: "10px",
              }}
            >
              الأسعار قد تتغير حسب المصدر ووقت التحقق.
            </div>
          </div>
        </div>

        <div
          style={{
            maxWidth: "1050px",
            margin: "35px auto 0",
            paddingTop: "18px",
            borderTop:
              "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            justifyContent: "space-between",
            gap: "15px",
            flexWrap: "wrap",
            color: "#8FA0B5",
            fontSize: "11px",
          }}
        >
          <span>
            © {new Date().getFullYear()} TruePrice
          </span>

          <span>
            المرجع الذكي للأسعار — صنع في السعودية
          </span>
        </div>
      </footer>

      {/* ================= RESPONSIVE ================= */}

      <style jsx>{`
        @media (max-width: 900px) {
          .trueprice-car-brands {
            grid-template-columns: repeat(
              3,
              minmax(0, 1fr)
            ) !important;
          }

          .trueprice-how-grid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            ) !important;
          }

          .trueprice-footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }

        @media (max-width: 700px) {
          .trueprice-home-stats {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            ) !important;
          }

          .trueprice-car-brands {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            ) !important;
          }

          .trueprice-how-grid {
            grid-template-columns: 1fr !important;
          }

          .trueprice-footer-grid {
            grid-template-columns: 1fr !important;
          }

          .tp-cars-heading {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
        }

        @media (max-width: 560px) {
          .tp-main-nav {
            display: none !important;
          }

          .tp-header-inner {
            padding-left: 15px !important;
            padding-right: 15px !important;
          }

          form button {
            padding-left: 17px !important;
            padding-right: 17px !important;
          }
        }
      `}</style>
    </main>
  );
}

/* ================= HELPERS ================= */

function formatNumber(value: number) {
  return new Intl.NumberFormat("ar-SA").format(value);
}

function StatCard({
  icon,
  number,
  title,
}: {
  icon: string;
  number: string;
  title: string;
}) {
  return (
    <div
      style={{
        background: "#0E1621",
        border: "1px solid #243244",
        borderRadius: "16px",
        padding: "18px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        boxShadow:
          "0 8px 25px -20px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          width: "42px",
          height: "42px",
          borderRadius: "12px",
          background: "rgba(16,185,129,0.12)",
          color: "#10B981",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: "20px",
          fontWeight: 900,
        }}
      >
        {icon}
      </div>

      <div>
        <div
          style={{
            color: "#F8FAFC",
            fontSize: "20px",
            fontWeight: 900,
          }}
        >
          {number}
        </div>

        <div
          style={{
            color: "#A7B4C5",
            fontSize: "11px",
            marginTop: "2px",
          }}
        >
          {title}
        </div>
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
        background: "#0E1621",
        border: "1px solid #243244",
        borderRadius: "19px",
        padding: "25px",
        minHeight: "165px",
        boxShadow:
          "0 10px 30px rgba(0,0,0,0.15)",
      }}
    >
      <div
        style={{
          color: "#10B981",
          fontSize: "13px",
          fontWeight: 900,
          fontFamily: "monospace",
        }}
      >
        {number}
      </div>

      <h3
        style={{
          fontSize: "22px",
          margin: "12px 0 7px",
          fontWeight: 900,
          color: "#F8FAFC",
        }}
      >
        {title}
      </h3>

      <p
        style={{
          color: "#A7B4C5",
          fontSize: "13px",
          lineHeight: 1.9,
          margin: 0,
        }}
      >
        {text}
      </p>
    </div>
  );
}

const headerLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  color: "#CBD5E1",
  fontSize: "13px",
  fontWeight: 700,
  textDecoration: "none",
  padding: "9px 12px",
  borderRadius: "9px",
};

const footerTitleStyle: CSSProperties = {
  color: "#CBD5E1",
  fontSize: "11px",
  fontWeight: 800,
  marginBottom: "13px",
};

const footerLinkStyle: CSSProperties = {
  display: "block",
  color: "#8FA0B5",
  textDecoration: "none",
  fontSize: "12px",
  marginBottom: "9px",
};