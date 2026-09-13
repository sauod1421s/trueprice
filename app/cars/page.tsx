"use client";

import type { CSSProperties } from "react";

const carBrands = [
  {
    id: "toyota",
    name: "Toyota",
    nameAr: "تويوتا",
    description: "أسعار ومواصفات سيارات تويوتا في السعودية",
    initial: "T",
  },
  {
    id: "hyundai",
    name: "Hyundai",
    nameAr: "هيونداي",
    description: "أسعار ومواصفات سيارات هيونداي في السعودية",
    initial: "H",
  },
  {
    id: "kia",
    name: "Kia",
    nameAr: "كيا",
    description: "أسعار ومواصفات سيارات كيا في السعودية",
    initial: "K",
  },
  {
    id: "nissan",
    name: "Nissan",
    nameAr: "نيسان",
    description: "أسعار ومواصفات سيارات نيسان في السعودية",
    initial: "N",
  },
  {
    id: "mg",
    name: "MG",
    nameAr: "MG",
    description: "أسعار ومواصفات سيارات MG في السعودية",
    initial: "MG",
  },
];

export default function Page() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: "100vh",
        background: "#080D14",
        color: "#F8FAFC",
        fontFamily:
          '"Cairo", "IBM Plex Sans Arabic", Arial, sans-serif',
        paddingBottom: "70px",
      }}
    >
      {/* ================= HERO ================= */}

      <section
        style={{
          position: "relative",
          overflow: "hidden",
          borderBottom: "1px solid #243244",
          background:
            "radial-gradient(circle at 50% 0%, rgba(16,185,129,0.13), transparent 42%), linear-gradient(180deg,#0B1220 0%,#080D14 100%)",
          padding: "42px 24px 48px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.35,
            backgroundImage:
              "linear-gradient(rgba(148,163,184,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.04) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />

        <div
          style={{
            position: "relative",
            maxWidth: "1100px",
            margin: "auto",
          }}
        >
          <a
            href="/"
            style={{
              color: "#94A3B8",
              textDecoration: "none",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            ← العودة إلى TruePrice
          </a>

          <div
            style={{
              textAlign: "center",
              marginTop: "30px",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 14px",
                borderRadius: "999px",
                background: "rgba(16,185,129,0.10)",
                border: "1px solid rgba(52,211,153,0.30)",
                color: "#6EE7B7",
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              <span>🚗</span>
              قسم السيارات · المرحلة الأولى
            </div>

            <h1
              style={{
                margin: "18px 0 0",
                fontSize: "clamp(34px,5vw,54px)",
                lineHeight: 1.2,
                fontWeight: 900,
                letterSpacing: "-1px",
                color: "#F8FAFC",
              }}
            >
              مرجع أسعار السيارات
            </h1>

            <p
              style={{
                maxWidth: "680px",
                margin: "13px auto 0",
                color: "#94A3B8",
                fontSize: "14px",
                lineHeight: 1.9,
              }}
            >
              استعرض أسعار السيارات الجديدة في السعودية،
              وتعرّف على الموديلات والفئات قبل التواصل مع
              الوكيل أو البائع.
            </p>
          </div>
        </div>
      </section>

      {/* ================= STATS ================= */}

      <section
        style={{
          maxWidth: "900px",
          margin: "-1px auto 0",
          padding: "0 24px",
          position: "relative",
        }}
      >
        <div
          className="cars-stats"
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: "12px",
          }}
        >
          <StatCard
            number="5"
            title="علامات تجارية"
            icon="▣"
          />

          <StatCard
            number="—"
            title="موديل"
            icon="▦"
          />

          <StatCard
            number="—"
            title="فئة"
            icon="◆"
          />
        </div>
      </section>

      {/* ================= BRANDS ================= */}

      <section
        style={{
          maxWidth: "1180px",
          margin: "55px auto 0",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              color: "#10B981",
              fontSize: "11px",
              fontWeight: 900,
              marginBottom: "7px",
            }}
          >
            العلامات التجارية
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: "30px",
              fontWeight: 900,
              color: "#F8FAFC",
            }}
          >
            اختر الشركة
          </h2>

          <p
            style={{
              margin: "7px 0 0",
              color: "#94A3B8",
              fontSize: "13px",
            }}
          >
            اختر علامة تجارية لاستعراض سياراتها وأسعارها.
          </p>
        </div>

        <div
          className="cars-brand-grid"
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(5, minmax(0, 1fr))",
            gap: "14px",
          }}
        >
          {carBrands.map((brand) => (
            <a
              key={brand.id}
              href={`/cars/${brand.id}`}
              className="car-brand-card"
              style={{
                textDecoration: "none",
                color: "#F8FAFC",
                background:
                  "linear-gradient(180deg,#111B29,#0E1621)",
                border: "1px solid #243244",
                borderRadius: "18px",
                padding: "22px 18px",
                display: "flex",
                flexDirection: "column",
                minHeight: "215px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* glow */}

              <div
                style={{
                  position: "absolute",
                  width: "100px",
                  height: "100px",
                  borderRadius: "50%",
                  background:
                    "rgba(16,185,129,0.08)",
                  filter: "blur(30px)",
                  top: "-35px",
                  left: "-25px",
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  position: "relative",
                  width: "52px",
                  height: "52px",
                  borderRadius: "15px",
                  background:
                    "linear-gradient(135deg,#10B981,#047857)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize:
                    brand.initial.length > 1
                      ? "13px"
                      : "20px",
                  fontWeight: 900,
                  boxShadow:
                    "0 10px 25px rgba(5,150,105,0.20)",
                }}
              >
                {brand.initial}
              </div>

              <div
                style={{
                  position: "relative",
                  marginTop: "18px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "19px",
                    fontWeight: 900,
                    color: "#F8FAFC",
                  }}
                >
                  {brand.nameAr}
                </h3>

                <div
                  style={{
                    color: "#64748B",
                    fontSize: "10px",
                    fontWeight: 700,
                    marginTop: "3px",
                  }}
                >
                  {brand.name}
                </div>
              </div>

              <p
                style={{
                  position: "relative",
                  color: "#94A3B8",
                  fontSize: "10px",
                  lineHeight: 1.8,
                  margin: "11px 0 0",
                  flex: 1,
                }}
              >
                {brand.description}
              </p>

              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: "17px",
                  paddingTop: "13px",
                  borderTop: "1px solid #1E2B3B",
                  color: "#6EE7B7",
                  fontSize: "11px",
                  fontWeight: 800,
                }}
              >
                <span>استعراض السيارات</span>

                <span
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "9px",
                    background:
                      "rgba(16,185,129,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                  }}
                >
                  ←
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ================= INFO ================= */}

      <section
        style={{
          maxWidth: "1180px",
          margin: "45px auto 0",
          padding: "0 24px",
        }}
      >
        <div
          style={{
            borderRadius: "18px",
            background:
              "linear-gradient(180deg,#111B29,#0E1621)",
            border: "1px solid #243244",
            padding: "20px 22px",
            display: "flex",
            alignItems: "flex-start",
            gap: "13px",
          }}
        >
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "11px",
              background:
                "rgba(16,185,129,0.11)",
              color: "#6EE7B7",
              border:
                "1px solid rgba(16,185,129,0.18)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            ✓
          </div>

          <div>
            <div
              style={{
                color: "#F8FAFC",
                fontWeight: 900,
                fontSize: "13px",
                marginBottom: "5px",
              }}
            >
              ملاحظة حول الأسعار
            </div>

            <div
              style={{
                color: "#94A3B8",
                fontSize: "11px",
                lineHeight: 1.9,
              }}
            >
              أسعار السيارات والمواصفات قد تتغير حسب
              الموديل والفئة ووقت التحقق والمصدر. يجب
              التأكد من السعر النهائي والمواصفات من المصدر
              الرسمي أو الوكيل قبل اتخاذ قرار الشراء.
            </div>
          </div>
        </div>
      </section>

      {/* ================= RESPONSIVE ================= */}

      <style jsx>{`
        .car-brand-card {
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
        }

        .car-brand-card:hover {
          transform: translateY(-5px);
          border-color: rgba(16, 185, 129, 0.45) !important;
          box-shadow:
            0 20px 45px rgba(0, 0, 0, 0.30),
            0 0 0 1px rgba(16, 185, 129, 0.05);
        }

        @media (max-width: 1050px) {
          .cars-brand-grid {
            grid-template-columns: repeat(
              3,
              minmax(0, 1fr)
            ) !important;
          }
        }

        @media (max-width: 700px) {
          .cars-brand-grid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            ) !important;
          }

          .cars-stats {
            gap: 8px !important;
          }
        }

        @media (max-width: 500px) {
          .cars-brand-grid {
            grid-template-columns: 1fr !important;
          }

          .cars-stats {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

function StatCard({
  number,
  title,
  icon,
}: {
  number: string;
  title: string;
  icon: string;
}) {
  return (
    <div
      style={{
        background:
          "linear-gradient(180deg,#111B29,#0E1621)",
        border: "1px solid #243244",
        borderRadius: "15px",
        padding: "15px 17px",
        minHeight: "82px",
        display: "flex",
        alignItems: "center",
        gap: "11px",
      }}
    >
      <div
        style={{
          width: "38px",
          height: "38px",
          borderRadius: "11px",
          background:
            "rgba(16,185,129,0.11)",
          border:
            "1px solid rgba(16,185,129,0.16)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#10B981",
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      <div>
        <div
          style={{
            fontSize: "21px",
            fontWeight: 900,
            color: "#F8FAFC",
            lineHeight: 1,
          }}
        >
          {number}
        </div>

        <div
          style={{
            color: "#94A3B8",
            fontSize: "10px",
            fontWeight: 700,
            marginTop: "6px",
          }}
        >
          {title}
        </div>
      </div>
    </div>
  );
}