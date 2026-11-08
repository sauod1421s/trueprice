import { describe, expect, it } from "vitest";
import { fairStatusText, MIN_SOURCES, OUTLIER_PERCENT, summarizeMarket, type MarketInput } from "@/app/lib/valuation/market";

const v = (storeId: string, price: number | null, extra: Partial<MarketInput> = {}): MarketInput => ({ storeId, storeAr: storeId, price, verified: true, ...extra });
const u = (storeId: string, price: number | null): MarketInput => ({ storeId, storeAr: storeId, price, verified: false });

describe("summarizeMarket — مقارنة السوق والسعر العادل", () => {
  it("بلا أسعار موثقة: السعر العادل مخفي والإحصاءات فارغة، وغير الموثق يظهر في الرسم فقط", () => {
    const m = summarizeMarket([u("jarir", 5000), u("noon", 4800)]);
    expect(m).toMatchObject({ fairPrice: null, status: "unverified-data", verifiedSources: 0, usedSources: 0, lowest: null, average: null });
    expect(m.points.map((p) => p.role)).toEqual(["unverified", "unverified"]);
  });

  it("أقل من 3 مصادر موثقة: غير متاح مع ذكر العدد", () => {
    const m = summarizeMarket([v("a", 100), v("b", 110), u("c", 90)]);
    expect(m.status).toBe("not-enough-data");
    expect(m.lowest).toBe(100);
    expect(m.average).toBe(105);
    expect(fairStatusText(m)).toContain(`${MIN_SOURCES}`);
  });

  it("3 مصادر: السعر العادل = متوسط غير الشاذ، وليس أحد الأسعار بالضرورة", () => {
    const m = summarizeMarket([v("a", 1000), v("b", 1060), v("c", 1100)]);
    expect(m).toMatchObject({ status: "available", fairPrice: 1053, lowest: 1000, highest: 1100, average: 1053, usedSources: 3 });
  });

  it("السعر الشاذ (> 15% عن الوسيط) يُستبعد من العادل ويبقى في متوسط السوق", () => {
    const m = summarizeMarket([v("a", 1000), v("b", 1020), v("c", 1040), v("d", 1500)]);
    expect(m.points.find((p) => p.storeId === "d")?.role).toBe("outlier");
    expect(m.usedSources).toBe(3);
    expect(m.fairPrice).toBe(1020);
    expect(m.average).toBe(1140);
    expect(OUTLIER_PERCENT).toBe(15);
  });

  it("استبعاد الشاذ قد يُنزل العدد تحت الحد: يُخفى العادل", () => {
    const m = summarizeMarket([v("a", 1000), v("b", 1010), v("c", 2000)]);
    expect(m.status).toBe("not-enough-data");
    expect(m.fairPrice).toBeNull();
  });

  it("سعر واحد لكل متجر (الأقل)، وأسماء المتجر تُوحَّد", () => {
    const m = summarizeMarket([v("Jarir", 1200), v("jarir ", 1100), v("noon", 1150), v("amazon", 1180)]);
    expect(m.verifiedSources).toBe(3);
    expect(m.points.filter((p) => p.role !== "unverified").map((p) => p.price)).toEqual([1100, 1150, 1180]);
  });

  it("أسعار متطابقة حرفيًا: غير مستقلة فيُخفى العادل", () => {
    expect(summarizeMarket([v("a", 999), v("b", 999), v("c", 999)]).status).toBe("not-independent");
  });

  it("الأسعار غير الصالحة تُتجاهل", () => {
    const m = summarizeMarket([v("a", null), v("b", 0), v("c", -5), v("d", Number.NaN), v("e", 100)]);
    expect(m.verifiedSources).toBe(1);
  });

  it("النقاط مرتبة تصاعديًا وتحمل الرابط والتاريخ", () => {
    const m = summarizeMarket([v("b", 200, { url: "https://b.example/x", asOf: "2026-11-08" }), v("a", 100)]);
    expect(m.points.map((p) => p.storeId)).toEqual(["a", "b"]);
    expect(m.points[1]).toMatchObject({ url: "https://b.example/x", asOf: "2026-11-08" });
  });
});
