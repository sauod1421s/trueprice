import { describe, expect, it } from "vitest";
import {
  appendVerification,
  applyImport,
  EMPTY_HISTORY,
  effectiveStatus,
  type HistoryState,
  valuationOffersFor,
} from "@/app/lib/ingest/history";
import { runImport, type ImportResult } from "@/app/lib/ingest/importer";
import { buildCatalogIndex, matchOffer } from "@/app/lib/ingest/matching";
import { canonicalProductUrl, resolveStore, sellerKeyFor } from "@/app/lib/ingest/stores";
import type { ApprovedAliases } from "@/app/lib/ingest/stores";
import { electronicsFairPrice } from "@/app/lib/valuation/electronics";
import { csv, src, TEST_CATALOG, TEST_REGISTRY } from "./helpers";

const HEAD = ["id", "title", "price", "sale_price", "currency", "link", "store", "seller", "gtin", "availability", "condition", "updated_at"];

function imp(rows: (string | number)[][], at: string, aliases: ApprovedAliases = {}): ImportResult {
  return runImport({
    source: src({ timeZone: "Asia/Riyadh" }),
    fileName: "f.csv",
    content: csv([HEAD, ...rows]),
    catalog: TEST_CATALOG,
    importedAt: at,
    registry: TEST_REGISTRY,
    approvedAliases: aliases,
  });
}

function apply(state: HistoryState, r: ImportResult) {
  return applyImport(state, {
    sourceId: r.sourceId,
    contentHash: r.contentHash,
    importId: r.importId,
    importedAt: r.importedAt,
    rows: r.accepted.map((a) => ({ offer: a.offer, productId: a.match.status === "matched" ? a.match.productId : null })),
  });
}

const row = (over: Partial<Record<(typeof HEAD)[number], string | number>> = {}) => {
  const base: Record<string, string | number> = {
    id: "A-1",
    title: "Test Phone X 256GB",
    price: "1999",
    sale_price: "",
    currency: "SAR",
    link: "https://alpha.example.com/p/1",
    store: "Test Store Alpha",
    seller: "",
    gtin: "4006381333931",
    availability: "in stock",
    condition: "new",
    updated_at: "2026-11-05T10:00:00+03:00",
    ...over,
  };
  return HEAD.map((h) => base[h]);
};

describe("هوية المتجر: معرّف ثابت وأسماء بديلة يعتمدها المشرف", () => {
  it("الاسم المعروف أو النطاق يعطي نفس المعرّف الثابت", () => {
    expect(resolveStore({ storeName: "TEST STORE  alpha", canonicalUrl: null, registry: TEST_REGISTRY })).toMatchObject({ status: "resolved", storeId: "alpha" });
    expect(resolveStore({ storeName: "", canonicalUrl: "https://www.alpha.example.com/x", registry: TEST_REGISTRY })).toMatchObject({ status: "resolved", storeId: "alpha", via: "domain" });
  });

  it("'Gamma Electronics' لا يُدمج تلقائيًا مع 'Gamma' — يبقى بانتظار المشرف مع اقتراح", () => {
    const r = resolveStore({ storeName: "Gamma Electronics", canonicalUrl: "https://shop.other.example.net/p", registry: TEST_REGISTRY });
    expect(r).toMatchObject({ status: "pending", suggestedStoreId: "gamma" });
  });

  it("بعد اعتماد الاسم البديل يُحسب المتجران متجرًا واحدًا في التقييم", () => {
    const rows = [
      row({ id: "G1", store: "Gamma", link: "https://gamma.example.com/p/1", price: "1900" }),
      row({ id: "G2", store: "Gamma Electronics", link: "https://gamma-electronics.example.net/p/1", price: "1950" }),
    ];
    const before = imp(rows, "2026-11-06T10:00:00.000Z");
    expect(before.summary.storePending).toBe(1);
    expect(before.storeProposals[0]).toMatchObject({ rawName: "Gamma Electronics", suggestedStoreId: "gamma" });
    const s1 = apply(EMPTY_HISTORY, before);
    expect(s1.stats.skippedPendingStore).toBe(1);

    const after = imp(rows, "2026-11-06T11:00:00.000Z", { gammaelectronics: "gamma" });
    expect(after.summary.storePending).toBe(0);
    const { state } = apply(EMPTY_HISTORY, after);
    const stores = valuationOffersFor(1, state, { now: "2026-11-06T12:00:00.000Z" }).offers.map((o) => o.store);
    expect(new Set(stores)).toEqual(new Set(["gamma"]));
  });

  it("الاسم والنطاق المتعارضان لا يُحسمان تلقائيًا", () => {
    const r = resolveStore({ storeName: "Gamma", canonicalUrl: "https://alpha.example.com/p", registry: TEST_REGISTRY });
    expect(r).toMatchObject({ status: "pending", suggestedStoreId: "alpha" });
  });

  it("معرّف متجر المصدر غير الموجود لا يُقبل", () => {
    expect(resolveStore({ storeName: "x", canonicalUrl: null, sourceStoreId: "ghost", registry: TEST_REGISTRY }).status).toBe("pending");
  });
});

describe("البائع منفصل عن المتجر", () => {
  it("بائعان في متجر متعدد البائعين = مساران سعريان لكن متجر واحد في التقييم", () => {
    const r = imp(
      [
        row({ id: "M1", store: "Test Market", seller: "Seller One", link: "https://market.example.com/p/1", price: "1800" }),
        row({ id: "M1", store: "Test Market", seller: "Seller Two", link: "https://market.example.com/p/1", price: "1850" }),
        row({ id: "M1", store: "Test Market", seller: "Test Market", link: "https://market.example.com/p/1", price: "1900" }),
      ],
      AT_DAY
    );
    expect(r.accepted.map((a) => a.offer.sellerKey)).toEqual(["sellerone", "sellertwo", null]);
    expect(new Set(r.accepted.map((a) => a.streamKey)).size).toBe(3);
    const { state } = apply(EMPTY_HISTORY, r);
    const offers = valuationOffersFor(1, state, { now: AT_DAY }).offers;
    expect(offers).toHaveLength(3);
    expect(new Set(offers.map((o) => o.store))).toEqual(new Set(["market"]));
  });

  it("البائع الذي يحمل اسم المتجر نفسه ليس بائعًا خارجيًا", () => {
    expect(sellerKeyFor("Test Market", "market", TEST_REGISTRY)).toBe(null);
    expect(sellerKeyFor("  ", "market", TEST_REGISTRY)).toBe(null);
  });
});

const AT_DAY = "2026-11-06T12:00:00.000Z";

describe("سجل الأسعار: إضافة فقط وبلا تكرار غير ضروري", () => {
  const day1 = imp([row()], "2026-11-06T08:00:00.000Z");
  const s1 = apply(EMPTY_HISTORY, day1);

  it("أول ظهور ينشئ حالة سعر وحدث first_seen", () => {
    expect(s1.stats).toMatchObject({ newObservations: 1, priceChanges: 0 });
    expect(s1.state.events.map((e) => e.kind)).toEqual(["first_seen"]);
    expect(s1.state.observations[0]).toMatchObject({ storeId: "alpha", initialStatus: "unverified", price: { amount: 1999, currency: "SAR" } });
    expect(Object.isFrozen(s1.state.observations[0])).toBe(true);
  });

  it("الملف نفسه مرتين لا يغيّر شيئًا", () => {
    const again = apply(s1.state, day1);
    expect(again.stats.duplicateFile).toBe(true);
    expect(again.state).toBe(s1.state);
  });

  it("نفس السعر في ملف أحدث يحدّث آخر ظهور فقط", () => {
    const day2 = imp([row({ updated_at: "2026-11-06T10:00:00+03:00" })], "2026-11-06T09:00:00.000Z");
    const s2 = apply(s1.state, day2);
    expect(s2.stats).toMatchObject({ newObservations: 0, refreshed: 1 });
    expect(s2.state.observations).toHaveLength(1);
    expect(s2.state.events).toHaveLength(1);
    const p = Object.values(s2.state.pointers)[0];
    expect(p.lastSeenAt).toBe("2026-11-06T09:00:00.000Z");
    expect(p.lastAsOf).toBe("2026-11-06T07:00:00.000Z");
  });

  it("تغيّر السعر ينشئ حالة جديدة ويحتفظ بالقديمة", () => {
    const day2 = imp([row({ price: "1899", updated_at: "2026-11-06T10:00:00+03:00" })], "2026-11-06T09:00:00.000Z");
    const s2 = apply(s1.state, day2);
    expect(s2.stats.priceChanges).toBe(1);
    expect(s2.state.observations.map((o) => o.price.amount)).toEqual([1999, 1899]);
    expect(s2.state.events[1]).toMatchObject({ kind: "price_changed", previousObservationId: s1.state.observations[0].id });
    // الحالة السابقة لم تتغير
    expect(s1.state.observations).toHaveLength(1);
  });

  it("تغيّر السعر قبل الخصم وحده يُسجل كتغيّر سعر", () => {
    const day2 = imp([row({ price: "2199", sale_price: "1999", updated_at: "2026-11-06T10:00:00+03:00" })], "2026-11-06T09:00:00.000Z");
    const s2 = apply(s1.state, day2);
    expect(s2.stats.priceChanges).toBe(1);
    expect(s2.state.observations[1]).toMatchObject({ price: { amount: 1999 }, listPrice: { amount: 2199 } });
  });

  it("تغيّر بارامترات التتبع فقط لا ينشئ حدثًا؛ تغيّر الرابط الفعلي ينشئ url_changed", () => {
    const tracked = imp([row({ link: "https://alpha.example.com/p/1?utm_source=x&gclid=1" })], "2026-11-06T09:00:00.000Z");
    const sT = apply(s1.state, tracked);
    expect(sT.stats.urlChanges).toBe(0);
    const moved = imp([row({ link: "https://alpha.example.com/p/1-new" })], "2026-11-06T09:30:00.000Z");
    const sM = apply(sT.state, moved);
    expect(sM.stats.urlChanges).toBe(1);
    expect(sM.state.events.at(-1)).toMatchObject({ kind: "url_changed", from: "https://alpha.example.com/p/1", to: "https://alpha.example.com/p/1-new" });
  });

  it("تغيّر التوفر يُسجل كحدث دون حالة سعر جديدة", () => {
    const oos = imp([row({ availability: "out of stock", updated_at: "2026-11-06T10:00:00+03:00" })], "2026-11-06T09:00:00.000Z");
    const s2 = apply(s1.state, oos);
    expect(s2.stats).toMatchObject({ availabilityChanges: 1, newObservations: 0 });
    expect(s2.state.events.at(-1)).toMatchObject({ kind: "availability_changed", from: "in_stock", to: "out_of_stock" });
  });

  it("ملف أقدم مما لدينا لا يعيد السعر للخلف", () => {
    const old = imp([row({ price: "2500", updated_at: "2026-11-01T10:00:00+03:00" })], "2026-11-06T09:00:00.000Z");
    const s2 = apply(s1.state, old);
    expect(s2.stats.staleIgnored).toBe(1);
    expect(s2.state.observations).toHaveLength(1);
  });

  it("الاسم المختلف للمتجر نفسه لا ينشئ مسارًا جديدًا", () => {
    const alias = imp([row({ store: "ALPHA", updated_at: "2026-11-06T10:00:00+03:00" })], "2026-11-06T09:00:00.000Z");
    const s2 = apply(s1.state, alias);
    expect(s2.stats).toMatchObject({ newObservations: 0, refreshed: 1 });
  });
});

describe("سياسة عمر السعر والتقييم", () => {
  const stores = ["alpha", "gamma", "delta"];
  const links = ["https://alpha.example.com/p/1", "https://gamma.example.com/p/1", "https://delta.example.sa/p/1"];
  const r = imp(
    stores.map((_, i) => row({ id: `S${i}`, store: "", link: links[i], price: String(2000 + i * 10), updated_at: "2026-11-01T10:00:00+03:00" })),
    "2026-11-01T08:00:00.000Z"
  );
  const { state } = apply(EMPTY_HISTORY, r);
  const verified = state.observations.reduce(
    (s, o) => appendVerification(s, { observationId: o.id, status: "verified", at: "2026-11-01T09:00:00.000Z", by: "reviewer-1" }),
    state
  );

  it("الأسعار الحديثة الموثقة من 3 متاجر تعطي سعرًا عادلًا", () => {
    const { offers, excluded } = valuationOffersFor(1, verified, { now: "2026-11-06T00:00:00.000Z" });
    expect(excluded).toEqual([]);
    expect(electronicsFairPrice(offers).status).toBe("available");
  });

  it("الأسعار الأقدم من 14 يومًا تُستبعد من السعر العادل", () => {
    const { offers, excluded } = valuationOffersFor(1, verified, { now: "2026-11-20T00:00:00.000Z" });
    expect(offers).toEqual([]);
    expect(excluded.map((e) => e.reason)).toEqual(["stale", "stale", "stale"]);
    expect(electronicsFairPrice(offers).status).not.toBe("available");
  });

  it("الحد قابل للضبط", () => {
    expect(valuationOffersFor(1, verified, { now: "2026-11-06T00:00:00.000Z", maxAgeDays: 2 }).offers).toEqual([]);
  });

  it("غير الموثق لا يدخل السعر العادل", () => {
    const { offers } = valuationOffersFor(1, state, { now: "2026-11-06T00:00:00.000Z" });
    expect(offers.every((o) => o.verificationStatus === "unverified")).toBe(true);
    expect(electronicsFairPrice(offers).status).not.toBe("available");
  });

  it("المستعمل والعملة الأجنبية وغير المتوفر لا تدخل تقييم الجديد", () => {
    const mixed = imp(
      [
        row({ id: "U", condition: "used", price: "1200" }),
        row({ id: "F", currency: "USD", price: "500", link: "https://gamma.example.com/p/2", store: "" }),
        row({ id: "O", availability: "out of stock", link: "https://delta.example.sa/p/9", store: "" }),
      ],
      "2026-11-06T08:00:00.000Z"
    );
    const s = apply(EMPTY_HISTORY, mixed).state;
    const ex = valuationOffersFor(1, s, { now: "2026-11-06T09:00:00.000Z" }).excluded.map((e) => e.reason).sort();
    expect(ex).toEqual(["not_sar", "other_condition", "out_of_stock"]);
    expect(valuationOffersFor(1, s, { now: "2026-11-06T09:00:00.000Z", condition: "used" }).offers).toHaveLength(1);
  });
});

describe("التحقق كأحداث مضافة", () => {
  it("الحالة الفعلية = آخر حدث زمنيًا (مقارنة زمنية لا نصية)", () => {
    const ev = [
      { observationId: "o1", status: "verified" as const, at: "2026-11-06T10:00:00+03:00", by: "a" },
      { observationId: "o1", status: "rejected" as const, at: "2026-11-06T08:00:00.000Z", by: "b" },
    ];
    // 10:00+03:00 = 07:00Z، إذن الرفض (08:00Z) هو الأحدث
    expect(effectiveStatus("o1", ev)).toBe("rejected");
    expect(effectiveStatus("o2", ev)).toBe("unverified");
  });
});

describe("الروابط", () => {
  it("يستخرج الوجهة من روابط التتبع ويحذف بارامترات التتبع ويرتب البقية", () => {
    expect(canonicalProductUrl("https://ad.admitad.com/g/abc/?ulp=https%3A%2F%2Fwww.jarir.com%2Fp%2F1%3Futm_source%3Dx%26b%3D2%26a%3D1")).toBe("https://jarir.com/p/1?a=1&b=2");
    expect(canonicalProductUrl("https://go.arabclicks.com/aff_c?offer=2")).toBe(null);
    expect(canonicalProductUrl("javascript:alert(1)")).toBe(null);
  });
});

describe("المطابقة", () => {
  const index = buildCatalogIndex(TEST_CATALOG);
  const offerOf = (name: string, gtin: string | null = null, mpn: string | null = null) => {
    const r = imp([row({ title: name, gtin: gtin ?? "" })], AT_DAY);
    const o = r.accepted[0].offer;
    return { ...o, mpn };
  };

  it("الباركود يطابق تلقائيًا", () => {
    expect(matchOffer(offerOf("whatever", "4006381333931"), index)).toMatchObject({ status: "matched", method: "gtin", productId: 1 });
  });

  it("الاسم وحده لا يدمج تلقائيًا أبدًا، والأرقام يجب أن تتطابق", () => {
    const m = matchOffer(offerOf("TestBrand Test Phone X 256GB"), index);
    expect(m.status).toBe("needs_review");
    if (m.status === "needs_review") expect(m.candidates[0].productId).toBe(1);
    const n = matchOffer(offerOf("Test Phone X 1TB"), index);
    if (n.status === "needs_review") expect(n.candidates.map((c) => c.productId)).not.toContain(1);
  });
});
