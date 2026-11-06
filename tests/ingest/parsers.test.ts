import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectDelimiter, parseCsv, parseCsvRows } from "@/app/lib/ingest/csv";
import {
  isValidGtin,
  normalizeAvailability,
  normalizeCondition,
  normalizeCurrency,
  normalizeGtin,
  parseDate,
  parsePrice,
  resolveColumns,
} from "@/app/lib/ingest/fields";
import { parseXml } from "@/app/lib/ingest/xml";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "../fixtures/feeds", name), "utf8");

describe("CSV", () => {
  it("يكتشف الفاصل ويتعامل مع الاقتباس والأسطر المتعددة و BOM", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    const rows = parseCsvRows('﻿name,desc\n"A, B","line1\nline2 ""q"""\r\nC,D\n\n');
    expect(rows).toEqual([
      ["name", "desc"],
      ["A, B", 'line1\nline2 "q"'],
      ["C", "D"],
    ]);
  });

  it("يعطي أرقام الصفوف كما في الملف (الرأس = 1)", () => {
    const { headers, records } = parseCsv(fixture("store-ar.csv"));
    expect(headers[0]).toBe("اسم المنتج");
    expect(records[0].row).toBe(2);
    expect(records[0].record["اسم المنتج"]).toBe("Test Phone X 256GB; Black");
  });
});

describe("XML", () => {
  it("Google Merchant RSS: يحذف بادئة g: ويقرأ CDATA وتاريخ الملف", () => {
    const r = parseXml(fixture("google-merchant.xml"));
    expect(r.format).toBe("google-merchant");
    expect(r.records).toHaveLength(4);
    expect(r.records[0].record).toMatchObject({
      id: "ALPHA-001",
      title: "Test Phone X 256GB - Black",
      price: "1,999.00 SAR",
      sale_price: "1,899.00 SAR",
      gtin: "4006381333931",
    });
    expect(r.meta.storeName).toBe("Test Store Alpha");
    expect(r.meta.feedUpdatedAt).toContain("2026");
  });

  it("Google Merchant Atom", () => {
    const r = parseXml(fixture("google-merchant-atom.xml"));
    expect(r.format).toBe("google-merchant");
    expect(r.records[0].record.title).toBe("Test Watch S 45mm");
    expect(r.meta.feedUpdatedAt).toBe("2026-11-04T12:30:00Z");
  });

  it("YML: يقرأ السمات (id/available) واسم المتجر وتاريخ الملف", () => {
    const r = parseXml(fixture("yml.xml"));
    expect(r.format).toBe("yml");
    expect(r.meta.storeName).toBe("Test Store Gamma");
    expect(r.meta.feedUpdatedAt).toBe("2026-11-03 18:45");
    expect(r.records[0].record).toMatchObject({
      id: "G-100",
      availability: "in_stock",
      vendor: "TestBrand",
      model: "TPX-256-BK",
      currencyId: "SAR",
    });
    // عملة المتجر الوحيدة تُستخدم إن لم تُذكر في العرض
    expect(r.records[1].record.currencyId).toBe("SAR");
    expect(r.records[1].record.availability).toBe("out_of_stock");
  });

  it("XML عام: يجد العناصر المتكررة", () => {
    const r = parseXml(
      "<products><product><name>A</name><price>10</price></product><product><name>B</name><price>20</price></product></products>"
    );
    expect(r.format).toBe("xml");
    expect(r.records.map((x) => x.record.name)).toEqual(["A", "B"]);
  });

  it("يرفض XML تالفًا برسالة واضحة", () => {
    expect(() => parseXml("<rss><channel><item>")).toThrow(/XML/);
  });
});

describe("توحيد الحقول", () => {
  it("يربط أسماء الأعمدة العربية والإنجليزية بالحقول الموحّدة", () => {
    const cols = resolveColumns(["اسم المنتج", "السعر", "الرابط", "g:gtin", "Merchant Name", "vendorCode"]);
    expect(cols).toMatchObject({
      name: "اسم المنتج",
      price: "السعر",
      url: "الرابط",
      gtin: "g:gtin",
      store: "Merchant Name",
      externalId: "vendorCode",
    });
  });

  it("ربط أعمدة خاص بالمصدر يتقدم على الأسماء الشائعة", () => {
    const cols = resolveColumns(["price", "price_incl_vat"], { columnMap: { price: "price_incl_vat" } });
    expect(cols.price).toBe("price_incl_vat");
  });

  it("يقرأ الأسعار بصيغ مختلفة", () => {
    expect(parsePrice("1,299.00 SAR")).toMatchObject({ amount: 1299, currency: "SAR" });
    expect(parsePrice("SAR 1299")).toMatchObject({ amount: 1299, currency: "SAR" });
    expect(parsePrice("١٬٩٤٩ ر.س")).toMatchObject({ amount: 1949, currency: "SAR" });
    expect(parsePrice("1.299,50")).toMatchObject({ amount: 1299.5 });
    expect(parsePrice("499 XYZ")).toMatchObject({ amount: 499, currency: null, unknownCurrency: "XYZ" });
    expect(parsePrice("abc").amount).toBeNull();
    expect(parsePrice("").amount).toBeNull();
  });

  it("العملات: الريال بكتاباته المختلفة، ورفض غير المعروف", () => {
    expect(normalizeCurrency("ر.س")).toBe("SAR");
    expect(normalizeCurrency("ريال")).toBe("SAR");
    expect(normalizeCurrency("usd")).toBe("USD");
    expect(normalizeCurrency("XYZ")).toBeNull();
  });

  it("التوفر والحالة", () => {
    expect(normalizeAvailability("in stock")).toBe("in_stock");
    expect(normalizeAvailability("غير متوفر")).toBe("out_of_stock");
    expect(normalizeAvailability("backorder")).toBe("preorder");
    expect(normalizeAvailability("")).toBe("unknown");
    expect(normalizeCondition("")).toBe("new");
    expect(normalizeCondition("مستعمل")).toBe("used");
    expect(normalizeCondition("renewed")).toBe("refurbished");
    expect(normalizeCondition("broken-ish")).toBeNull();
  });

  it("الباركود: يتحقق من رقم التحقق ويوحّد إلى 14 خانة", () => {
    expect(isValidGtin("4006381333931")).toBe(true);
    expect(isValidGtin("4006381333932")).toBe(false);
    expect(normalizeGtin("4006381333931")).toBe("04006381333931");
    expect(normalizeGtin("400-638-133-3931")).toBe("04006381333931");
    expect(normalizeGtin("1234567890123")).toBeNull();
  });

  it("التواريخ", () => {
    expect(parseDate("2026-11-03 18:45")).toBe(new Date("2026-11-03T18:45").toISOString());
    expect(parseDate("2026-11-05T08:00:00+03:00")).toBe("2026-11-05T05:00:00.000Z");
    expect(parseDate("not a date")).toBeNull();
  });
});
