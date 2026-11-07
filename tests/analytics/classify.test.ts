import { describe, expect, it } from "vitest";
import { classifyPath, cleanSearchQuery, clientIp, deviceOf, isBotUserAgent, referrerHost } from "@/app/lib/analytics/classify";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID_TAB = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

describe("تصنيف الصفحات", () => {
  it("يتعرف على أنواع الصفحات ويستخرج رقم المنتج أو العلامة", () => {
    expect(classifyPath("/")).toEqual({ path: "/", kind: "home", ref: null, query: null });
    expect(classifyPath("/product/0012")).toMatchObject({ kind: "product", ref: "12" });
    expect(classifyPath("/cars/toyota/")).toMatchObject({ path: "/cars/toyota", kind: "car_brand", ref: "toyota" });
    expect(classifyPath("/cars")).toMatchObject({ kind: "cars" });
    expect(classifyPath("/methodology")).toMatchObject({ kind: "methodology" });
    expect(classifyPath("/contact")).toMatchObject({ kind: "contact" });
    expect(classifyPath("/track")).toMatchObject({ kind: "contact" });
    expect(classifyPath("/unknown/page")).toMatchObject({ kind: "other", ref: null });
  });

  it("لا يحصي اللوحة والواجهات الداخلية ولا المسارات المشوهة", () => {
    for (const p of ["/admin", "/admin/review", "/api/v", "/_next/static/x.js", "//evil.com", "nope", "/a\u0000b"]) {
      expect(classifyPath(p)).toBeNull();
    }
    expect(classifyPath(`/${"x".repeat(250)}`)).toBeNull();
  });

  it("كلمة البحث تُستخرج من /search فقط، والمسار يُحفظ بلا معاملات", () => {
    expect(classifyPath("/search?q=ايفون 17", "?q=ايفون%2017")).toEqual({ path: "/search", kind: "search", ref: null, query: "ايفون 17" });
    expect(classifyPath("/product/5?utm_source=x")).toMatchObject({ path: "/product/5" });
  });

  it("كلمات بحث قد تكون بيانات شخصية لا تُحفظ", () => {
    expect(cleanSearchQuery("  Galaxy   S25 ")).toBe("galaxy s25");
    expect(cleanSearchQuery("someone@mail.com")).toBeNull();
    expect(cleanSearchQuery("0555 123 456")).toBeNull();
    expect(cleanSearchQuery("٠٥٥٥١٢٣٤٥٦")).toBeNull();
    expect(cleanSearchQuery("https://x.com")).toBeNull();
    expect(cleanSearchQuery("a")).toBeNull();
    expect(cleanSearchQuery("x".repeat(81))).toBeNull();
    expect(cleanSearchQuery("iPhone 17 Pro 256")).toBe("iphone 17 pro 256");
  });
});

describe("الزيارات الآلية والأجهزة والإحالة", () => {
  it("يستبعد الزوار الآليين المعروفين والمتصفحات المؤتمتة ويقبل المتصفحات الحقيقية", () => {
    expect(isBotUserAgent(CHROME)).toBe(false);
    expect(isBotUserAgent(IPHONE)).toBe(false);
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36",
      "curl/8.5.0", "python-requests/2.32", "facebookexternalhit/1.1", "WhatsApp/2.24", "", null,
    ]) {
      expect(isBotUserAgent(ua)).toBe(true);
    }
  });

  it("نوع الجهاز", () => {
    expect(deviceOf(IPHONE)).toBe("mobile");
    expect(deviceOf(IPAD)).toBe("tablet");
    expect(deviceOf(ANDROID_TAB)).toBe("tablet");
    expect(deviceOf(CHROME)).toBe("desktop");
  });

  it("الإحالة: اسم الموقع فقط، والتنقل الداخلي ليس إحالة", () => {
    expect(referrerHost("https://www.google.com/search?q=secret", "trueprice.sa")).toBe("google.com");
    expect(referrerHost("https://trueprice.sa/product/1", "trueprice.sa")).toBeNull();
    expect(referrerHost("https://www.trueprice.sa/x", "trueprice.sa:443")).toBeNull();
    expect(referrerHost("javascript:alert(1)", "x")).toBeNull();
    expect(referrerHost("not a url", "x")).toBeNull();
    expect(referrerHost("", "x")).toBeNull();
  });

  it("عنوان الزائر من رأس المضيف فقط، والقيم المشوهة تُهمل", () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(h({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIp(h({ "x-forwarded-for": "<script>" }))).toBe("");
    expect(clientIp(h({}))).toBe("");
  });
});
