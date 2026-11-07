"use client";

/** خطأ في التخطيط الجذري نفسه: صفحة مستقلة بسيطة (بلا تفاصيل داخلية) */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <main style={{ textAlign: "center", padding: 24 }} role="alert">
          <h1 style={{ fontSize: 24 }}>الخدمة غير متاحة مؤقتًا</h1>
          <p>تعذر تحميل الموقع الآن. حاول مرة أخرى بعد لحظات.</p>
          <button type="button" onClick={() => retry()} style={{ minHeight: 44, padding: "0 20px", borderRadius: 12 }}>
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
