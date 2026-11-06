import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, parseCsvRows } from "@/app/lib/ingest/csv";
import {
  isValidGtin,
  isValidTimeZone,
  normalizeAvailability,
  normalizeCondition,
  normalizeCurrency,
  normalizeGtin,
  normalizeMpn,
  parsePrice,
  parseTimestamp,
} from "@/app/lib/ingest/fields";
import { DEFAULT_LIMITS, ImportFatalError } from "@/app/lib/ingest/limits";

const ok = (raw: string, hint?: string) => {
  const r = parsePrice(raw, hint);
  if (!r.ok) throw new Error(`expected ok for "${raw}", got ${r.reason}`);
  return [r.amount, r.currency];
};
const fail = (raw: string, hint?: string) => {
  const r = parsePrice(raw, hint);
  if (r.ok) throw new Error(`expected failure for "${raw}", got ${r.amount}`);
  return r.reason;
};

describe("قراءة السعر الصارمة", () => {
  it("يقرأ الصيغ الشائعة بأرقام عربية وإنجليزية", () => {
    expect(ok("1,299.00 SAR")).toEqual([1299, "SAR"]);
    expect(ok("1.299,50 EUR")).toEqual([1299.5, "EUR"]);
    expect(ok("١٬٢٩٩٫٥٠ ر.س")).toEqual([1299.5, "SAR"]);
    expect(ok("SAR 4999")).toEqual([4999, "SAR"]);
    expect(ok("1 299,00 SAR")).toEqual([1299, "SAR"]);
    expect(ok("2,049.00", "SAR")).toEqual([2049, null]); // العملة من النص فقط؛ التلميح لقواعد الخانات
    expect(ok("899", "SAR")).toEqual([899, null]);
    expect(ok("12,345,678.9 SAR")).toEqual([12345678.9, "SAR"]);
  });

  it("يرفض الصيغة العلمية", () => {
    expect(fail("1e3")).toBe("scientific");
    expect(fail("1.2E+3 SAR")).toBe("scientific");
  });

  it("يرفض النص الزائد وتعدد الأرقام", () => {
    expect(fail("من 999 ريال")).toBe("extra_text");
    expect(fail("999 SAR only")).toBe("extra_text");
    expect(fail("999 - 1299 SAR")).toBe("multiple_numbers");
    expect(fail("approx 999")).toBe("extra_text");
  });

  it("يرفض الأرقام الملتبسة بدل تخمينها", () => {
    // فاصل واحد + 3 أرقام في عملة بثلاث خانات عشرية: لا يُعرف هل هو ألف أم كسر
    expect(fail("1.299", "KWD")).toBe("ambiguous");
    expect(fail("1,299 KWD")).toBe("ambiguous");
    // في عملة بخانتين يُقرأ كفاصل آلاف
    expect(ok("1.299", "SAR")).toEqual([1299, null]);
    // بلا عملة نهائيًا لا يُحسم
    expect(fail("1.299")).toBe("ambiguous");
  });

  it("يرفض الصيغ المكسورة والخانات العشرية الزائدة", () => {
    expect(fail("1,29,9.00 SAR")).toBe("invalid_format");
    // في الريال (خانتان) "12.345" تعني 12345 وليست كسرًا مستحيلًا
    expect(ok("12.345 SAR")).toEqual([12345, "SAR"]);
    expect(fail("12.3456 SAR")).toBe("too_many_decimals");
    expect(fail("")).toBe("empty");
    expect(fail("SAR")).toBe("empty");
  });

  it("يكشف تعارض العملة داخل النص ويعيد العملة غير المعروفة", () => {
    expect(fail("999 USD SAR")).toBe("conflicting_currency");
    const r = parsePrice("999 XYZ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unknownCurrency).toBe("XYZ");
  });

  it("يقبل عملات بثلاث خانات بدقة", () => {
    expect(ok("1,234.567 KWD")).toEqual([1234.567, "KWD"]);
    expect(ok("12.5 KWD")).toEqual([12.5, "KWD"]);
    expect(normalizeCurrency("ريال")).toBe("SAR");
    expect(normalizeCurrency("﷼")).toBe("SAR");
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("abc")).toBe(null);
  });
});

describe("التواريخ: UTC مع حفظ المنطقة الأصلية", () => {
  it("يحوّل الإزاحة الصريحة إلى UTC ويحفظها", () => {
    const r = parseTimestamp("2026-11-05T08:00:00+03:00");
    expect(r).toEqual({ ok: true, value: { utc: "2026-11-05T05:00:00.000Z", originalOffset: "+03:00", assumedTimeZone: null } });
    const z = parseTimestamp("2026-11-05T05:00:00Z");
    expect(z.ok && z.value).toMatchObject({ utc: "2026-11-05T05:00:00.000Z", originalOffset: "Z" });
    const rfc = parseTimestamp("Thu, 05 Nov 2026 09:00:00 GMT");
    expect(rfc.ok && rfc.value.utc).toBe("2026-11-05T09:00:00.000Z");
  });

  it("التاريخ بلا منطقة لا يُفسر بتوقيت جهاز المستخدم", () => {
    expect(parseTimestamp("2026-11-05 10:00")).toEqual({ ok: false, reason: "no_timezone" });
    const riyadh = parseTimestamp("2026-11-05 10:00", "Asia/Riyadh");
    expect(riyadh.ok && riyadh.value).toEqual({ utc: "2026-11-05T07:00:00.000Z", originalOffset: "+03:00", assumedTimeZone: "Asia/Riyadh" });
    const utc = parseTimestamp("2026-11-05 10:00", "UTC");
    expect(utc.ok && utc.value.utc).toBe("2026-11-05T10:00:00.000Z");
  });

  it("يحسب التوقيت الصيفي للمناطق التي تستخدمه (حتمي)", () => {
    const summer = parseTimestamp("2026-07-01T12:00:00", "Europe/London");
    const winter = parseTimestamp("2026-12-01T12:00:00", "Europe/London");
    expect(summer.ok && summer.value.utc).toBe("2026-07-01T11:00:00.000Z");
    expect(winter.ok && winter.value.utc).toBe("2026-12-01T12:00:00.000Z");
  });

  it("يرفض الصيغ غير المعروفة والتواريخ المستحيلة والمنطقة الخاطئة", () => {
    expect(parseTimestamp("05/11/2026", "UTC")).toEqual({ ok: false, reason: "unrecognized" });
    expect(parseTimestamp("2026-02-30T10:00:00Z")).toEqual({ ok: false, reason: "invalid" });
    expect(parseTimestamp("2026-11-05 10:00", "Mars/Base")).toEqual({ ok: false, reason: "invalid_timezone" });
    expect(parseTimestamp("")).toEqual({ ok: false, reason: "empty" });
    expect(isValidTimeZone("Asia/Riyadh")).toBe(true);
    expect(isValidTimeZone("nope")).toBe(false);
  });
});

describe("CSV حسب RFC 4180", () => {
  it("يدعم الاقتباس والفواصل المنقوطة والأسطر داخل الحقول", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    const r = parseCsv('name,price\n"Phone, 256GB ""Black""",999\n"multi\nline",5');
    expect(r.records.map((x) => x.record.name)).toEqual(['Phone, 256GB "Black"', "multi\nline"]);
    expect(r.records.map((x) => x.row)).toEqual([2, 3]);
  });

  it("علامة اقتباس غير مغلقة = خطأ قاتل برقم السطر بدل دمج الصفوف بصمت", () => {
    const input = 'name,price\nA,1\n"B broken,2\nC,3\nD,4';
    try {
      parseCsvRows(input);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ImportFatalError);
      expect((e as ImportFatalError).code).toBe("unterminated_quote");
      expect((e as ImportFatalError).line).toBe(3);
    }
  });

  it("الصف الناقص أو الزائد يُرفض ولا يُدمج", () => {
    const r = parseCsv("name,price,currency\nA,1,SAR\nB,2\nC,3,SAR,extra\nD,4,SAR,");
    expect(r.records.map((x) => x.record.name)).toEqual(["A", "D"]);
    expect(r.rowErrors.map((e) => [e.row, e.code])).toEqual([
      [3, "column_count_mismatch"],
      [4, "column_count_mismatch"],
    ]);
  });

  it("السجلات بلا نموذج أولي (لا تلوث prototype)", () => {
    const r = parseCsv("__proto__,constructor\nx,y");
    expect(Object.getPrototypeOf(r.records[0].record)).toBe(null);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe("المعرّفات والحقول", () => {
  it("يتحقق من رقم الباركود ويوحّده إلى GTIN-14", () => {
    expect(isValidGtin("4006381333931")).toBe(true);
    expect(isValidGtin("4006381333932")).toBe(false);
    expect(normalizeGtin("400-638-133-3931")).toBe("04006381333931");
    expect(normalizeGtin("123")).toBe(null);
    expect(normalizeMpn("TPX-256 bk")).toBe("TPX256BK");
  });

  it("يوحّد التوفر والحالة", () => {
    expect(normalizeAvailability("متوفر")).toBe("in_stock");
    expect(normalizeAvailability("out of stock")).toBe("out_of_stock");
    expect(normalizeCondition("مستعمل")).toBe("used");
    expect(normalizeCondition("")).toBe("new");
    expect(normalizeCondition("broken-ish")).toBe(null);
  });

  it("الحدود الافتراضية معقولة", () => {
    expect(DEFAULT_LIMITS.maxBytes).toBe(15 * 1024 * 1024);
    expect(DEFAULT_LIMITS.maxRows).toBe(50_000);
  });
});
