import { describe, expect, it } from "vitest";
import products from "@/app/data/products";
import { allPricesIdentical, priceSpread } from "@/app/lib/pricing";

describe("priceSpread (التوفير)", () => {
  it("التوفير = أعلى سعر − أقل سعر", () => {
    const s = priceSpread([3799, 3749, 3787, 3799]);
    expect(s).toMatchObject({ lowest: 3749, highest: 3799, saving: 50, count: 4 });
    expect(s!.savingPercent).toBeCloseTo((50 / 3799) * 100);
  });

  it("يتجاهل القيم غير الصالحة", () => {
    expect(priceSpread([null, undefined, 0, NaN, 100, 150])?.saving).toBe(50);
  });

  it("يعيد null عند أقل من سعرين", () => {
    expect(priceSpread([100])).toBeNull();
    expect(priceSpread([])).toBeNull();
  });

  it("التوفير لا يكون سالبًا لأي منتج", () => {
    for (const p of products) {
      const s = priceSpread(p.offers.map((o) => o.price));
      if (s) expect(s.saving).toBeGreaterThanOrEqual(0);
    }
  });

  it("الحساب القديم (أقل سعر − الوسيط) كان دائمًا ≤ 0 — سبب الإصلاح", () => {
    for (const p of products) expect(p.price - p.fairPrice).toBeLessThanOrEqual(0);
  });
});

describe("allPricesIdentical", () => {
  it("يكتشف الأسعار المتطابقة", () => {
    expect(allPricesIdentical([5, 5, 5])).toBe(true);
    expect(allPricesIdentical([5, 6, 5])).toBe(false);
    expect(allPricesIdentical([5])).toBe(false);
  });
});
