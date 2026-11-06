import { describe, expect, it } from "vitest";
import products from "@/app/data/products";
import { popularProducts } from "@/app/lib/examples";
import { normalizeText, searchProducts } from "@/app/lib/search";

const names = (q: string) => searchProducts(products, q).map((p) => p.name);

describe("normalizeText", () => {
  it("يوحّد الحروف العربية والأرقام ويفصل الحروف عن الأرقام", () => {
    expect(normalizeText("آيفون ١٧")).toBe("ايفون 17");
    expect(normalizeText("Galaxy S26+")).toBe("galaxy s 26 plus");
    expect(normalizeText("مُجَرَّب")).toBe("مجرب");
  });
});

describe("searchProducts", () => {
  it("بحث فارغ يعيد كل المنتجات", () => {
    expect(searchProducts(products, "  ")).toHaveLength(products.length);
  });

  it("العربي والإنجليزي يعطيان النتيجة نفسها", () => {
    expect(names("ايفون 17 برو")).toEqual(names("iPhone 17 Pro"));
    expect(names("iPhone 17 Pro")).toEqual([
      "iPhone 17 Pro 256GB",
      "iPhone 17 Pro Max 256GB",
    ]);
  });

  it("لا يشترط ترتيب الكلمات أو المسافات", () => {
    expect(names("pro 17 iphone")).toHaveLength(2);
    expect(names("iphone17pro")).toHaveLength(2);
  });

  it("يدعم الأرقام العربية والمرادفات", () => {
    expect(names("آيفون ١٧ برو ماكس")).toEqual(["iPhone 17 Pro Max 256GB"]);
    expect(names("جالكسي s26 الترا")).toHaveLength(3);
    expect(names("ماك بوك")).toHaveLength(2);
    expect(names("ps5")).toEqual(["Sony PlayStation 5"]);
  });

  it("يتجاهل كلمات مثل «سعر»", () => {
    expect(names("سعر بلايستيشن 5")).toEqual(["Sony PlayStation 5"]);
  });

  it("الرقم يطابق رقمًا كاملًا فقط", () => {
    expect(names("iphone 1")).toHaveLength(0);
  });

  it("يبحث بالفئة بالعربي", () => {
    const phones = products.filter((p) => p.category === "Smartphones");
    expect(names("جوالات")).toHaveLength(phones.length);
    expect(names("جوال")).toHaveLength(phones.length);
  });

  it("لا يعيد نتائج لكلمات غير موجودة", () => {
    expect(names("xyz123abc")).toHaveLength(0);
  });

  it("كل أمثلة البحث في الصفحة الرئيسية تعطي نتائج", () => {
    for (const q of popularProducts) {
      expect(names(q).length, q).toBeGreaterThan(0);
    }
  });
});
