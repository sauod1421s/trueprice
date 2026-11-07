"use client";

/**
 * إشارة مشاهدة الصفحة (وضع قاعدة البيانات فقط). بلا ملفات تعريف ولا تخزين في المتصفح:
 * يُرسل المسار وكلمة البحث (إن وُجدت) وموقع الإحالة فقط، مرة لكل تنقل.
 * المتصفح المؤتمت (navigator.webdriver) لا يُرسل شيئًا.
 */
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export default function AnalyticsBeacon() {
  const pathname = usePathname();
  const params = useSearchParams();
  const last = useRef<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    const search = pathname === "/search" ? params.toString() : "";
    const key = `${pathname}?${search}`;
    if (last.current === key) return;
    last.current = key;
    // موقع الإحالة يُرسل لأول صفحة فقط (التنقل الداخلي ليس إحالة)
    const referrer = first.current ? document.referrer : "";
    first.current = false;
    const body = JSON.stringify({ p: pathname, s: search, r: referrer });
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (!navigator.sendBeacon?.("/api/v", blob)) {
        void fetch("/api/v", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
      }
    } catch {
      /* الإحصائيات لا تؤثر على الصفحة */
    }
  }, [pathname, params]);

  return null;
}
