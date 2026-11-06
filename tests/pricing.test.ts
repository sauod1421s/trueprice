import { describe, expect, it } from "vitest";
import products from "@/app/data/products";
import { allPricesIdentical } from "@/app/lib/pricing";
import {
  computeSaving,
  electronicsFairPrice,
  MIN_VERIFIED_STORES,
  type ValuationOffer,
} from "@/app/lib/valuation/electronics";

const v = (store: string, price: number | null): ValuationOffer => ({
  store,
  price,
  verificationStatus: "verified",
});
const u = (store: string, price: number): ValuationOffer => ({
  store,
  price,
  verificationStatus: "unverified",
});

describe("electronicsFairPrice — من الأسعار الموثقة فقط", () => {
  it("مخفي لكل المنتجات الحالية لأن كل الأسعار غير موثقة", () => {
    for (const p of products) {
      const r = electronicsFairPrice(p.offers);
      expect(r.fairPrice).toBeNull();
      expect(r.status).toBe("unverified-data");
    }
  });

  it("يتجاهل الأسعار غير الموثقة", () => {
    const r = electronicsFairPrice([v("A", 100), v("B", 110), u("C", 1), u("D", 1)]);
    expect(r.status).toBe("not-enough-data");
    expect(r.verifiedStores).toBe(2);
  });

  it(`يظهر عند توفر ${MIN_VERIFIED_STORES} متاجر موثقة (الوسيط)`, () => {
    const r = electronicsFairPrice([v("A", 100), v("B", 120), v("C", 110), u("D", 50)]);
    expect(r).toMatchObject({ fairPrice: 110, status: "available", verifiedStores: 3 });
  });

  it("المتجر نفسه لا يُحسب مرتين", () => {
    const r = electronicsFairPrice([v("A", 100), v("a ", 90), v("B", 120)]);
    expect(r.verifiedStores).toBe(2);
    expect(r.fairPrice).toBeNull();
  });

  it("الأسعار المتطابقة تعتبر غير مستقلة", () => {
    const r = electronicsFairPrice([v("A", 100), v("B", 100), v("C", 100)]);
    expect(r.status).toBe("not-independent");
    expect(r.fairPrice).toBeNull();
  });

  it("يتجاهل الأسعار غير الصالحة", () => {
    const r = electronicsFairPrice([v("A", null), v("B", 0), v("C", 100)]);
    expect(r.verifiedStores).toBe(1);
  });
});

describe("computeSaving — السعر العادل الموثوق − السعر المعروض", () => {
  it("لا يظهر بدون سعر عادل موثوق", () => {
    expect(computeSaving(null, 100)).toBeNull();
  });

  it("لا يظهر بدون سعر معروض صالح", () => {
    expect(computeSaving(100, null)).toBeNull();
    expect(computeSaving(100, 0)).toBeNull();
  });

  it("توفير موجب عندما يكون المعروض أقل من العادل", () => {
    expect(computeSaving(1000, 900)).toMatchObject({ amount: 100, verdict: "below-fair" });
    expect(computeSaving(1000, 900)!.percent).toBeCloseTo(10);
  });

  it("ضمن هامش ±2% يعتبر ضمن السعر العادل", () => {
    expect(computeSaving(1000, 985)!.verdict).toBe("at-fair");
    expect(computeSaving(1000, 1015)!.verdict).toBe("at-fair");
  });

  it("سالب عندما يكون المعروض أعلى من العادل", () => {
    expect(computeSaving(1000, 1100)).toMatchObject({ amount: -100, verdict: "above-fair" });
  });

  it("لا يظهر أي توفير لأي منتج حاليًا", () => {
    for (const p of products) {
      const fair = electronicsFairPrice(p.offers).fairPrice;
      expect(computeSaving(fair, p.lowestPrice)).toBeNull();
    }
  });
});

describe("allPricesIdentical", () => {
  it("يكتشف الأسعار المتطابقة", () => {
    expect(allPricesIdentical([5, 5, 5])).toBe(true);
    expect(allPricesIdentical([5, 6, 5])).toBe(false);
    expect(allPricesIdentical([5])).toBe(false);
  });
});
