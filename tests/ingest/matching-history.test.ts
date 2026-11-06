import { describe, expect, it } from "vitest";
import products from "@/app/data/products";
import {
  appendObservations,
  appendVerification,
  effectiveStatus,
  toObservation,
  valuationOffersFor,
} from "@/app/lib/ingest/history";
import { catalogFromProducts, matchOffer, type CatalogEntry } from "@/app/lib/ingest/matching";
import { resolveStoreKey } from "@/app/lib/ingest/stores";
import type { NormalizedOffer, VerificationEvent } from "@/app/lib/ingest/types";
import { electronicsFairPrice } from "@/app/lib/valuation/electronics";

const offer = (over: Partial<NormalizedOffer> = {}): NormalizedOffer => ({
  row: 2,
  sourceId: "s1",
  externalId: "X1",
  name: "Test Phone X 256GB",
  price: 1000,
  listPrice: null,
  currency: "SAR",
  url: "https://a.example.com/1",
  store: "Store A",
  storeKey: "storea",
  gtin: null,
  mpn: null,
  brand: "TestBrand",
  availability: "in_stock",
  condition: "new",
  sourceUpdatedAt: "2026-11-05T10:00:00.000Z",
  ...over,
});

const catalog: CatalogEntry[] = [
  { id: 1, label: "Phone 256", brand: "TestBrand", names: ["Test Phone X 256GB"], gtins: ["04006381333931"], mpns: ["TPX256"] },
  { id: 2, label: "Phone 512", brand: "TestBrand", names: ["Test Phone X 512GB"], gtins: [], mpns: ["TPX512"] },
  { id: 3, label: "Other 256", brand: "OtherBrand", names: ["Other Phone 256GB"], gtins: [], mpns: ["TPX256"] },
];

describe("المطابقة", () => {
  it("1) الباركود أولًا", () => {
    expect(matchOffer(offer({ gtin: "04006381333931" }), catalog)).toMatchObject({ status: "matched", method: "gtin", productId: 1 });
  });

  it("الباركود مع شركة مختلفة = مراجعة وليس دمجًا", () => {
    expect(matchOffer(offer({ gtin: "04006381333931", brand: "OtherBrand" }), catalog).status).toBe("needs_review");
  });

  it("2) رقم الموديل + الشركة", () => {
    expect(matchOffer(offer({ mpn: "TPX256" }), catalog)).toMatchObject({ status: "matched", method: "model", productId: 1 });
  });

  it("رقم موديل بدون شركة = مراجعة (قد يتكرر بين الشركات)", () => {
    expect(matchOffer(offer({ mpn: "TPX256", brand: null }), catalog).status).toBe("needs_review");
  });

  it("3) الاسم وحده لا يُدمج تلقائيًا أبدًا", () => {
    const r = matchOffer(offer(), catalog);
    expect(r.status).toBe("needs_review");
    if (r.status === "needs_review") expect(r.candidates[0].productId).toBe(1);
  });

  it("اختلاف السعة (256 مقابل 512) لا يُعتبر مرشحًا", () => {
    const r = matchOffer(offer({ name: "Test Phone X 1TB" }), catalog);
    expect(r.status).toBe("unmatched");
  });

  it("الكتالوج الحالي بلا باركود: المطابقة تذهب للمراجعة ولا تُدمج", () => {
    const real = catalogFromProducts(products);
    const p = products[0];
    const r = matchOffer(offer({ name: p.name, brand: p.brand }), real);
    expect(r.status).toBe("needs_review");
    if (r.status === "needs_review") expect(r.candidates[0].productId).toBe(p.id);
  });
});

describe("مفتاح المتجر", () => {
  it("نفس المتجر بكتابات مختلفة = مفتاح واحد", () => {
    expect(resolveStoreKey("نون", "")).toBe("noon");
    expect(resolveStoreKey("noon.com", "")).toBe("noon");
    expect(resolveStoreKey("", "https://www.noon.com/saudi-ar/p/1")).toBe("noon");
    expect(resolveStoreKey("مكتبة جرير", "")).toBe("jarir");
    expect(resolveStoreKey("", "https://www.amazon.sa/dp/X")).toBe("amazon");
  });

  it("رابط تتبع شبكة العمولة لا يحدد المتجر", () => {
    expect(resolveStoreKey("", "https://ad.admitad.com/goto/abc")).toBeNull();
    expect(resolveStoreKey("", "https://go.arabclicks.com/aff_c?offer=1")).toBeNull();
  });
});

describe("سجل الأسعار الإلحاقي", () => {
  const o1 = toObservation(offer({ productId: undefined } as Partial<NormalizedOffer>), 1, "imp1", "2026-11-06T10:00:00.000Z");

  it("لا يستبدل القديم ولا يكرر نفس الملاحظة", () => {
    const first = appendObservations([], [o1]);
    const again = appendObservations(first.history, [o1]);
    expect(again.added).toBe(0);
    expect(again.duplicates).toBe(1);
    expect(again.history).toHaveLength(1);
  });

  it("سعر جديد لنفس المنتج = ملاحظة إضافية، والقديمة تبقى كما هي", () => {
    const o2 = toObservation(offer({ price: 950, sourceUpdatedAt: "2026-11-06T10:00:00.000Z" }), 1, "imp2", "2026-11-06T12:00:00.000Z");
    const h1 = appendObservations([], [o1]).history;
    const h2 = appendObservations(h1, [o2]).history;
    expect(h2).toHaveLength(2);
    expect(h2[0]).toEqual(o1);
    expect(h1).toHaveLength(1); // المصفوفة القديمة لم تتغير
    expect(Object.isFrozen(h2[1])).toBe(true);
  });

  it("تغيير حالة التحقق = حدث جديد، والحالة الفعلية = آخر حدث", () => {
    let events: VerificationEvent[] = [];
    expect(effectiveStatus(o1.id, events)).toBe("unverified");
    events = appendVerification(events, { observationId: o1.id, status: "verified", at: "2026-11-06T13:00:00Z", by: "admin" });
    events = appendVerification(events, { observationId: o1.id, status: "rejected", at: "2026-11-06T14:00:00Z", by: "admin" });
    expect(events).toHaveLength(2);
    expect(effectiveStatus(o1.id, events)).toBe("rejected");
  });
});

describe("الربط مع محرك السعر العادل", () => {
  const mk = (storeKey: string, price: number, updated: string, imp = "i") =>
    toObservation(offer({ storeKey, store: storeKey, externalId: `${storeKey}-${price}`, price, sourceUpdatedAt: updated }), 1, imp, "2026-11-06T10:00:00.000Z");

  it("الأسعار المستوردة غير الموثقة لا تدخل في السعر العادل", () => {
    const history = [mk("a", 1000, "2026-11-05"), mk("b", 1100, "2026-11-05"), mk("c", 1200, "2026-11-05")];
    const r = electronicsFairPrice(valuationOffersFor(1, history, []));
    expect(r.fairPrice).toBeNull();
    expect(r.status).toBe("unverified-data");
  });

  it("المتجر نفسه من شبكتين يُحتسب مرة واحدة (آخر سعر)", () => {
    const viaAdmitad = mk("noon", 1000, "2026-11-04");
    const viaArabClicks = mk("noon", 990, "2026-11-05");
    const offers = valuationOffersFor(1, [viaAdmitad, viaArabClicks], []);
    expect(offers).toHaveLength(1);
    expect(offers[0].price).toBe(990);
  });

  it("بعد التحقق من 3 متاجر مختلفة يظهر السعر العادل", () => {
    const history = [mk("a", 1000, "2026-11-05"), mk("b", 1100, "2026-11-05"), mk("c", 1200, "2026-11-05")];
    const events = history.map((o) => ({ observationId: o.id, status: "verified" as const, at: "2026-11-06T00:00:00Z", by: "admin" }));
    expect(electronicsFairPrice(valuationOffersFor(1, history, events))).toMatchObject({ fairPrice: 1100, status: "available" });
  });

  it("المستعمل لا يختلط بالجديد", () => {
    const usedObs = toObservation(offer({ condition: "used", storeKey: "d", price: 500 }), 1, "i", "2026-11-06T10:00:00.000Z");
    expect(valuationOffersFor(1, [usedObs], [])).toHaveLength(0);
    expect(valuationOffersFor(1, [usedObs], [], "used")).toHaveLength(1);
  });
});
