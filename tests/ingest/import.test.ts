import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runImport } from "@/app/lib/ingest/importer";
import type { CatalogEntry } from "@/app/lib/ingest/matching";
import type { SourceConfig } from "@/app/lib/ingest/types";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "../fixtures/feeds", name), "utf8");

/** كتالوج اختبار خيالي */
const catalog: CatalogEntry[] = [
  { id: 1, label: "Test Phone X 256GB", brand: "TestBrand", names: ["Test Phone X 256GB"], gtins: ["04006381333931"], mpns: ["TPX256BK"] },
  { id: 2, label: "Test Phone X 512GB", brand: "TestBrand", names: ["Test Phone X 512GB"], gtins: [], mpns: [] },
  { id: 3, label: "Test Tablet 11", brand: "TestBrand", names: ["Test Tablet 11"], gtins: [], mpns: [] },
];

const src = (over: Partial<SourceConfig> = {}): SourceConfig => ({
  id: "test-source",
  name: "Test source",
  kind: "manual_upload",
  ...over,
});

const at = "2026-11-06T16:00:00.000Z";

describe("استيراد Google Merchant", () => {
  const r = runImport({ source: src(), fileName: "feed.xml", content: fixture("google-merchant.xml"), catalog, importedAt: at });

  it("يكتشف الصيغة ويقبل الصالح ويرفض الصفري والعملة غير المدعومة", () => {
    expect(r.format).toBe("google-merchant");
    expect(r.totalRows).toBe(4);
    expect(r.summary.accepted).toBe(2);
    expect(r.rejected.map((x) => x.issues.filter((i) => i.severity === "error").map((i) => i.code))).toEqual([["non_positive_price"], ["unsupported_currency"]]);
  });

  it("يستخدم سعر التخفيض ويحفظ السعر الأصلي، ويأخذ المتجر من عنوان الملف", () => {
    const o = r.accepted[0].offer;
    expect(o).toMatchObject({ price: 1899, listPrice: 1999, currency: "SAR", store: "Test Store Alpha", availability: "in_stock", condition: "new" });
    expect(o.sourceUpdatedAt).toBe("2026-11-05T09:00:00.000Z");
  });

  it("يفصل المجدد عن الجديد", () => {
    expect(r.summary.refurbished).toBe(1);
    expect(r.accepted[1].offer.condition).toBe("refurbished");
  });

  it("كل ملاحظة سعر تبدأ غير موثقة", () => {
    expect(r.accepted.every((a) => a.observation.initialStatus === "unverified")).toBe(true);
  });
});

describe("استيراد YML (صيغة شبكات العمولة)", () => {
  const r = runImport({ source: src(), fileName: "feed.xml", content: fixture("yml.xml"), catalog, importedAt: at });

  it("يقبل الصالح ويرفض السعر غير المقروء ويتجاهل الباركود الخاطئ مع تحذير", () => {
    expect(r.format).toBe("yml");
    expect(r.summary.accepted).toBe(2);
    expect(r.rejected[0].issues[0].code).toBe("missing_price");
    expect(r.warnings.some((w) => w.code === "invalid_gtin")).toBe(true);
    expect(r.accepted[1].offer.gtin).toBeNull();
  });

  it("رابط تتبع الشبكة لا يُعتبر اسم متجر — يُستخدم اسم المتجر من الملف", () => {
    expect(r.accepted[0].offer.store).toBe("Test Store Gamma");
    expect(r.accepted[0].offer.storeKey).toBe("teststoregamma");
  });

  it("يطابق بالباركود", () => {
    expect(r.accepted[0].match).toMatchObject({ status: "matched", method: "gtin", productId: 1 });
  });
});

describe("استيراد CSV عربي", () => {
  const r = runImport({ source: src(), fileName: "store.csv", content: fixture("store-ar.csv"), catalog, importedAt: at });

  it("يقرأ الفاصلة المنقوطة والأرقام العربية ورمز ر.س", () => {
    expect(r.accepted[0].offer).toMatchObject({ price: 1949, currency: "SAR", store: "متجر دلتا التجريبي", condition: "new" });
  });

  it("يفصل المستعمل عن الجديد", () => {
    expect(r.summary.new).toBe(1);
    expect(r.summary.used).toBe(1);
  });

  it("يرفض: السعر المفقود، الرابط الخاطئ، العملة غير المعروفة، الحالة غير المفهومة", () => {
    const codes = r.rejected.map((x) => x.issues.filter((i) => i.severity === "error").map((i) => i.code)[0]);
    expect(codes).toEqual(["missing_price", "invalid_url", "unknown_currency", "unknown_condition"]);
    expect(r.rejected.map((x) => x.row)).toEqual([4, 5, 6, 7]);
  });

  it("المستعمل بدون معرّفات يذهب للمراجعة ولا يُدمج تلقائيًا", () => {
    const used = r.accepted.find((a) => a.offer.condition === "used")!;
    expect(used.match.status).toBe("needs_review");
  });
});

describe("استيراد CSV من شبكة عمولة", () => {
  it("يتجاهل الصف المكرر داخل الملف نفسه", () => {
    const r = runImport({ source: src(), fileName: "net.csv", content: fixture("network.csv"), catalog, importedAt: at });
    expect(r.duplicatesInFile).toBe(1);
  });

  it("رابط تتبع بدون اسم متجر = مرفوض (لا نخمّن المتجر)", () => {
    const r = runImport({ source: src(), fileName: "net.csv", content: fixture("network.csv"), catalog, importedAt: at });
    const rej = r.rejected.find((x) => x.record.id === "N-2")!;
    expect(rej.issues.map((i) => i.code)).toContain("unknown_store");
  });

  it("اسم المتجر الافتراضي للمصدر يحل المشكلة عند تحديده صراحة", () => {
    const r = runImport({ source: src({ defaultStore: "Test Store Epsilon" }), fileName: "net.csv", content: fixture("network.csv"), catalog, importedAt: at });
    expect(r.rejected).toHaveLength(0);
  });

  it("إعادة استيراد نفس الملف تعطي نفس معرّفات الملاحظات", () => {
    const a = runImport({ source: src(), fileName: "net.csv", content: fixture("network.csv"), catalog, importedAt: at });
    const b = runImport({ source: src(), fileName: "net.csv", content: fixture("network.csv"), catalog, importedAt: "2026-11-07T00:00:00.000Z" });
    expect(a.accepted.map((x) => x.observation.id)).toEqual(b.accepted.map((x) => x.observation.id));
  });
});

describe("حالات أخرى", () => {
  it("العملة مفقودة بلا عملة افتراضية = مرفوض؛ ومع عملة المصدر = مقبول بتحذير", () => {
    const csv = "name,price,link,store\nItem,100,https://x.example.com/1,Shop";
    expect(runImport({ source: src(), fileName: "a.csv", content: csv, catalog, importedAt: at }).rejected[0].issues[0].code).toBe("missing_currency");
    const ok = runImport({ source: src({ defaultCurrency: "SAR" }), fileName: "a.csv", content: csv, catalog, importedAt: at });
    expect(ok.summary.accepted).toBe(1);
    expect(ok.warnings.some((w) => w.code === "default_currency")).toBe(true);
  });

  it("سعر غير منطقي (مثل الهللات) يُرفض", () => {
    const csv = "name,price,currency,link,store\nItem,199900000,SAR,https://x.example.com/1,Shop";
    expect(runImport({ source: src(), fileName: "a.csv", content: csv, catalog, importedAt: at }).rejected[0].issues[0].code).toBe("implausible_price");
  });

  it("ملف فارغ لا يسبب خطأ", () => {
    const r = runImport({ source: src(), fileName: "a.csv", content: "", catalog, importedAt: at });
    expect(r.totalRows).toBe(0);
  });
});
