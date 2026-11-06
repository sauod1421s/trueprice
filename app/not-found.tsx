import Link from "next/link";

export default function NotFound() {
  return (
    <main
      dir="rtl"
      style={{
        minHeight: "70vh",
        background: "#080D14",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 32, marginBottom: 12 }}>الصفحة غير موجودة</h1>
        <p style={{ color: "#94A3B8", marginBottom: 20 }}>
          قد يكون الرابط غير صحيح أو أن المنتج أو العلامة غير متوفرة.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
          <Link href="/" style={{ color: "#34D399" }}>
            الرئيسية
          </Link>
          <Link href="/search" style={{ color: "#34D399" }}>
            البحث
          </Link>
          <Link href="/cars" style={{ color: "#34D399" }}>
            السيارات
          </Link>
        </div>
      </div>
    </main>
  );
}
