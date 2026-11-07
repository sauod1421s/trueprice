import { describe, expect, it } from "vitest";
import {
  checkFormToken,
  friendlySupportError,
  issueFormToken,
  normalizePhone,
  normalizeReference,
  normalizeTrackingCode,
  parseContactForm,
} from "@/app/lib/support/validate";
import { searchCars } from "@/app/lib/search";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const OK = { kind: "complaint", subject: "سعر غير صحيح", message: "السعر المعروض أعلى من سعر المتجر بكثير" };

describe("نموذج التواصل: التحقق من المدخلات", () => {
  it("يقبل طلبًا صحيحًا وينظف الحقول الاختيارية", () => {
    const r = parseContactForm(fd({ ...OK, name: "  أحمد ", email: "A@Example.COM", phone: "+966 (55) 123-4567", relatedRef: "12" }));
    expect(r).toEqual({ ok: true, value: { kind: "complaint", name: "أحمد", email: "a@example.com", phone: "+966551234567", subject: OK.subject, message: OK.message, relatedRef: "12" } });
  });

  it("يرفض المدخلات غير الصالحة برسائل واضحة", () => {
    expect(parseContactForm(fd({ ...OK, kind: "hack" }))).toMatchObject({ ok: false, error: "اختر نوع الطلب" });
    expect(parseContactForm(fd({ ...OK, subject: "ab" }))).toMatchObject({ ok: false });
    expect(parseContactForm(fd({ ...OK, message: "قصير" }))).toMatchObject({ ok: false });
    expect(parseContactForm(fd({ ...OK, message: "x".repeat(4001) }))).toMatchObject({ ok: false });
    expect(parseContactForm(fd({ ...OK, email: "not-an-email" }))).toMatchObject({ ok: false, error: "البريد الإلكتروني غير صحيح" });
    expect(parseContactForm(fd({ ...OK, phone: "abc" }))).toMatchObject({ ok: false });
    expect(parseContactForm(fd({ ...OK, message: "روابط https://a.com https://b.com https://c.com https://d.com" }))).toMatchObject({ ok: false });
  });

  it("المرجع المرتبط يُقبل فقط بصيغة رقم منتج أو مسار داخلي", () => {
    const ref = (relatedRef: string) => (parseContactForm(fd({ ...OK, relatedRef })) as { value: { relatedRef: string | null } }).value.relatedRef;
    expect(ref("/cars/toyota")).toBe("/cars/toyota");
    expect(ref("https://evil.com")).toBeNull();
    expect(ref("<script>")).toBeNull();
  });

  it("الأرقام العربية في الجوال تتحول للاتينية، وحروف التحكم تُحذف", () => {
    expect(normalizePhone("٠٥٥ ١٢٣ ٤٥٦٧")).toBe("0551234567");
    const r = parseContactForm(fd({ ...OK, subject: "عنوان\u0007 مع رمز" }));
    expect(r.ok && r.value.subject).toBe("عنوان مع رمز");
  });
});

describe("رمز زمن التعبئة (منع الإرسال الآلي)", () => {
  const env = { TP_FORM_SECRET: "s".repeat(40) };
  it("صالح بين 3 ثوانٍ وساعتين، وموقّع لا يمكن تزويره", () => {
    const t0 = 1_800_000_000_000;
    const t = issueFormToken(t0, env);
    expect(checkFormToken(t, t0 + 1000, env)).toBe("too_fast");
    expect(checkFormToken(t, t0 + 5000, env)).toBe("ok");
    expect(checkFormToken(t, t0 + 3 * 3600_000, env)).toBe("expired");
    const forged = `${t0 - 10_000}.${t.split(".")[1]}`;
    expect(checkFormToken(forged, t0 + 5000, env)).toBe("invalid");
    expect(checkFormToken(t, t0 + 5000, { TP_FORM_SECRET: "o".repeat(40) })).toBe("invalid");
    expect(checkFormToken(null, t0, env)).toBe("invalid");
    expect(checkFormToken("garbage", t0, env)).toBe("invalid");
  });
  it("بدون TP_FORM_SECRET يُشتق المفتاح من سر القاعدة (يختلف باختلافه)", () => {
    const t0 = 1_800_000_000_000;
    const a = issueFormToken(t0, { DATABASE_URL: "postgres://a" });
    expect(checkFormToken(a, t0 + 5000, { DATABASE_URL: "postgres://a" })).toBe("ok");
    expect(checkFormToken(a, t0 + 5000, { DATABASE_URL: "postgres://b" })).toBe("invalid");
  });
});

describe("الرقم المرجعي ورمز المتابعة وأخطاء القاعدة", () => {
  it("يطبّع ما يكتبه الزائر", () => {
    expect(normalizeReference(" tp-abcd2345 ")).toBe("TP-ABCD2345");
    expect(normalizeReference("TPABCD2345")).toBe("TP-ABCD2345");
    expect(normalizeReference("TP-ABCD1234")).toBeNull(); // 1 غير مستخدم في الرموز
    expect(normalizeTrackingCode("abcd-efgh-jkmn-pqrs")).toBe("ABCDEFGHJKMNPQRS");
    expect(normalizeTrackingCode("short")).toBeNull();
  });
  it("لا يكشف تفاصيل داخلية", () => {
    expect(friendlySupportError({ code: "TP429" })).toMatch(/الحد المسموح/);
    expect(friendlySupportError({ code: "TP409" })).toMatch(/نفس الرسالة/);
    expect(friendlySupportError(new Error("connection to 10.0.0.5 failed password=x"))).toBe("تعذر حفظ الطلب الآن. حاول بعد قليل.");
  });
});

describe("البحث عن السيارات", () => {
  const cars = [
    { brandId: "toyota", brandAr: "تويوتا", brand: "Toyota", name: "Camry", years: [2025, 2026] },
    { brandId: "toyota", brandAr: "تويوتا", brand: "Toyota", name: "Land Cruiser", years: [2026] },
    { brandId: "hyundai", brandAr: "هيونداي", brand: "Hyundai", name: "Elantra", years: [2026] },
  ];
  it("بالعربي والإنجليزي وبالسنة", () => {
    expect(searchCars(cars, "كامري").length).toBe(0); // الموديلات بالإنجليزية فقط في البيانات
    expect(searchCars(cars, "تويوتا").map((c) => c.name)).toEqual(["Camry", "Land Cruiser"]);
    expect(searchCars(cars, "toyota land").map((c) => c.name)).toEqual(["Land Cruiser"]);
    expect(searchCars(cars, "elantra 2026").map((c) => c.brandId)).toEqual(["hyundai"]);
    expect(searchCars(cars, "camry 2024")).toEqual([]);
    expect(searchCars(cars, "")).toEqual([]);
  });
});
