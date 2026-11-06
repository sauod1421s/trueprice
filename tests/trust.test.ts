import { describe, expect, it } from "vitest";
import products from "@/app/data/products";
import brands from "@/app/data/cars";
import { marketPrices } from "@/app/data/priceSources";
import { calculateFairPrice } from "@/app/data/priceUtils";
import { describeEntryDate } from "@/app/lib/trust";

describe("قواعد الثقة — الإلكترونيات", () => {
  it("لا يوجد أي سعر معلَّم كموثق", () => {
    for (const p of products)
      for (const o of p.offers) {
        expect(o.isVerified).toBe(false);
        expect(o.verificationStatus).toBe("unverified");
        expect(o.entryMethod).toBe("manual");
      }
  });

  it("تاريخ 2026-08-27 يُعرض كغير مؤكد", () => {
    for (const p of products) {
      for (const o of p.offers) expect(o.dateConfirmed).toBe(false);
      expect(p.lastUpdatedConfirmed).toBe(false);
    }
    expect(describeEntryDate("2026-08-27", false)).toBe("2026-08-27 (غير مؤكد)");
    expect(describeEntryDate(null, false)).toBe("تاريخ الجمع غير معروف");
  });
});

describe("قواعد الثقة — السيارات", () => {
  const groups = new Map<string, typeof marketPrices>();
  for (const m of marketPrices) {
    const k = `${m.model}|${m.year}|${m.trim}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }

  it("المجموعات الـ15 ذات الأسعار المتطابقة لا يظهر لها سعر عادل", () => {
    let hidden = 0;
    for (const items of groups.values()) {
      const { model, year, trim } = items[0];
      const r = calculateFairPrice(model, year, items[0].price, trim);
      if (new Set(items.map((i) => i.price)).size === 1 && items.length > 1) {
        expect(r.fairPrice).toBeNull();
        expect(r.status).toBe("not-independent");
        hidden++;
      }
    }
    expect(hidden).toBe(15);
  });

  it("المجموعات غير المتطابقة بثلاثة مصادر يظهر لها تقدير", () => {
    const r = calculateFairPrice("Accent", 2026, 70000, "base");
    expect(r.fairPrice).not.toBeNull();
    expect(r.sourceCount).toBe(3);
  });

  it("أقل من 3 مصادر = بيانات غير كافية", () => {
    expect(calculateFairPrice("NoSuchModel", 2026, 1).status).toBe("not-enough-data");
  });

  it("كل علامة لها موديل واحد على الأقل", () => {
    for (const b of Object.values(brands)) expect(b.models.length).toBeGreaterThan(0);
  });
});
