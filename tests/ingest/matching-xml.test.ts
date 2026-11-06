import { describe, expect, it } from "vitest";
import { runImport } from "@/app/lib/ingest/importer";
import { buildCatalogIndex, type CatalogEntry } from "@/app/lib/ingest/matching";
import { AT, csv, src, TEST_CATALOG, TEST_REGISTRY } from "./helpers";

const H = ["title", "price", "currency", "link", "store", "brand", "gtin", "mpn"];
const run = (rows: (string | number)[][], catalog: CatalogEntry[] = TEST_CATALOG) =>
  runImport({ source: src(), fileName: "m.csv", content: csv([H, ...rows]), catalog: buildCatalogIndex(catalog), importedAt: AT, registry: TEST_REGISTRY });
const base = (over: Partial<Record<string, string>>) => H.map((h) => ({ title: "Item", price: "100", currency: "SAR", link: "https://alpha.example.com/1", store: "alpha", brand: "", gtin: "", mpn: "", ...over })[h]!);
const m = (over: Partial<Record<string, string>>, catalog?: CatalogEntry[]) => run([base(over)], catalog).accepted[0].match;

describe("ترتيب المطابقة وحالات التعارض", () => {
  it("رقم الموديل + الشركة يطابق تلقائيًا", () => {
    expect(m({ mpn: "TPX-256-BK", brand: "TestBrand" })).toMatchObject({ status: "matched", method: "model", productId: 1 });
  });
  it("رقم الموديل بدون شركة أو بشركة مختلفة = مراجعة", () => {
    expect(m({ mpn: "TPX-256-BK" })).toMatchObject({ status: "needs_review" });
    expect(m({ mpn: "TPX-256-BK", brand: "OtherCo" })).toMatchObject({ status: "needs_review" });
  });
  it("الباركود مع شركة مختلفة = مراجعة", () => {
    expect(m({ gtin: "4006381333931", brand: "OtherCo" })).toMatchObject({ status: "needs_review" });
  });
  it("الباركود المسجل لمنتجين = مراجعة", () => {
    const dup: CatalogEntry[] = [...TEST_CATALOG, { id: 9, label: "Clone", brand: "TestBrand", names: ["Clone"], gtins: ["04006381333931"], mpns: [] }];
    const r = m({ gtin: "4006381333931" }, dup);
    expect(r.status).toBe("needs_review");
    if (r.status === "needs_review") expect(r.candidates.map((c) => c.productId).sort()).toEqual([1, 9]);
  });
  it("الاسم البعيد = غير موجود", () => {
    expect(m({ title: "Garden hose 20m" }).status).toBe("unmatched");
  });
});

describe("XML عام", () => {
  it("يكتشف القائمة المتكررة ويقرأها", () => {
    const xml = `<?xml version="1.0"?><catalog><products><product><title>Test Tablet 11</title><price>1599 SAR</price><link>https://alpha.example.com/t</link><store>alpha</store></product><product><title>Test Phone X 512GB</title><price>2599 SAR</price><link>https://alpha.example.com/p</link><store>alpha</store></product></products></catalog>`;
    const r = runImport({ source: src(), fileName: "g.xml", content: xml, catalog: TEST_CATALOG, importedAt: AT, registry: TEST_REGISTRY });
    expect(r.format).toBe("xml");
    expect(r.summary.accepted).toBe(2);
    expect(r.accepted.every((a) => a.match.status !== "matched")).toBe(true);
  });
  it("عدد العناصر في XML محدود", () => {
    const items = Array.from({ length: 20 }, (_, i) => `<item><title>P${i}</title><price>1 SAR</price></item>`).join("");
    const r = runImport({ source: src(), fileName: "g.xml", content: `<?xml version="1.0"?><root>${items}</root>`, catalog: TEST_CATALOG, importedAt: AT, limits: { maxRows: 5 } });
    expect(r.fatal?.code).toBe("too_many_rows");
  });
});
