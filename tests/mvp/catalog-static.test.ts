import { afterAll, beforeAll, describe, expect, it } from "vitest";
import products from "../../app/data/products";
import { dataSource, getProduct, getProducts, getSiteStats, publicIdOf } from "../../app/lib/catalog";

describe("طبقة البيانات: الوضع الافتراضي لا يغيّر الموقع الحالي", () => {
  const saved = process.env.TP_DATA_SOURCE;
  beforeAll(() => {
    delete process.env.TP_DATA_SOURCE;
  });
  afterAll(() => {
    if (saved !== undefined) process.env.TP_DATA_SOURCE = saved;
  });

  it("بدون TP_DATA_SOURCE=db المصدر static ويعيد نفس المنتجات حرفيًا", async () => {
    expect(dataSource()).toBe("static");
    expect(await getProducts()).toBe(products);
    const p = await getProduct(1);
    expect(p?.offers).toEqual(products.find((x) => x.id === 1)?.offers);
    expect(p?.history).toEqual([]);
    expect(await getProduct(999999)).toBeNull();
  });

  it("أرقام الصفحة الرئيسية من نفس البيانات", async () => {
    const s = await getSiteStats();
    expect(s.products).toBe(products.length);
    expect(s.carBrands).toBeGreaterThan(0);
  });

  it("المعرّف العام: legacy_id للمنتجات الحالية، و900000+ للجديدة (لا تصادم)", () => {
    expect(publicIdOf(5, 1)).toBe(1);
    expect(publicIdOf(53, null)).toBe(900053);
    expect(Math.max(...products.map((p) => p.id))).toBeLessThan(900000);
  });
});
