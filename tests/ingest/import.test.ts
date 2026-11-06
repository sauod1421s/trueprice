import { describe, expect, it } from "vitest";
import { isValidSourceId, runImport } from "@/app/lib/ingest/importer";
import { AT, csv, fixture, src, TEST_CATALOG, TEST_REGISTRY } from "./helpers";

const run = (file: string, over = {}) =>
  runImport({ source: src(over), fileName: file, content: fixture(file), catalog: TEST_CATALOG, importedAt: AT, registry: TEST_REGISTRY });

const errors = (r: ReturnType<typeof run>) => r.rejected.map((x) => [x.row, x.issues.filter((i) => i.severity === "error").map((i) => i.code)]);

describe("Google Merchant RSS", () => {
  const r = run("google-merchant.xml");

  it("يكتشف الصيغة ويقبل الصالح ويرفض السعر الصفري", () => {
    expect(r.fatal).toBe(null);
    expect(r.format).toBe("google-merchant");
    expect(r.totalRows).toBe(4);
    expect(errors(r)).toEqual([[3, ["non_positive_price"]]]);
  });

  it("يستخدم سعر الخصم ويحفظ السعر قبل الخصم والعملة", () => {
    const o = r.accepted[0].offer;
    expect(o).toMatchObject({
      price: { amount: 1899, currency: "SAR" },
      listPrice: { amount: 1999, currency: "SAR" },
      sarPrice: 1899,
      sarListPrice: 1999,
      fx: null,
      storeId: "alpha",
      condition: "new",
    });
    expect(r.accepted[0].match).toMatchObject({ status: "matched", method: "gtin", productId: 1 });
  });

  it("العملة الأجنبية تُحفظ كما هي بلا تحويل ولا تُحسب بالريال", () => {
    const usd = r.accepted.find((a) => a.offer.price.currency === "USD")!.offer;
    expect(usd).toMatchObject({ price: { amount: 499, currency: "USD" }, sarPrice: null, fx: null });
    expect(r.summary.foreignCurrency).toBe(1);
    expect(r.warnings.some((w) => w.code === "foreign_currency_unconverted")).toBe(true);
  });

  it("تاريخ الملف يُقرأ بتوقيت UTC", () => {
    expect(r.feedGeneratedAt).toEqual({ utc: "2026-11-05T09:00:00.000Z", originalOffset: "Z", assumedTimeZone: null });
  });
});

describe("Atom وYML", () => {
  it("Atom: يقرأ المستعمل منفصلًا", () => {
    const r = run("google-merchant-atom.xml");
    expect(r.format).toBe("google-merchant");
    expect(r.summary).toMatchObject({ accepted: 1, used: 1 });
  });

  it("YML: price = السعر الحالي و oldprice = السعر قبل الخصم", () => {
    const r = run("yml.xml");
    expect(r.format).toBe("yml");
    expect(r.accepted[0].offer).toMatchObject({ price: { amount: 2149 }, listPrice: { amount: 2299 }, storeId: "gamma" });
    expect(errors(r)).toEqual([[3, ["unknown_currency"]]]);
  });
});

describe("CSV عربي بفاصلة منقوطة", () => {
  const r = run("store-ar.csv");
  it("يقرأ الأرقام العربية والرموز المحلية ويحفظ المنطقة الأصلية", () => {
    expect(r.accepted[0].offer).toMatchObject({
      price: { amount: 1949, currency: "SAR" },
      storeId: "delta",
      sourceUpdatedAt: { utc: "2026-11-05T05:00:00.000Z", originalOffset: "+03:00", assumedTimeZone: null },
    });
    expect(r.accepted[1].offer.condition).toBe("used");
  });
  it("يرفض الصفوف الناقصة ويذكر السبب ورقم السطر", () => {
    expect(errors(r)).toEqual([
      [4, ["missing_price"]],
      [5, ["invalid_url"]],
      [6, ["unknown_currency"]],
      [7, ["unknown_condition"]],
    ]);
  });
});

describe("CSV شبكة عمولة", () => {
  it("التاريخ بلا منطقة يُتجاهل ما لم يحدد المصدر منطقته", () => {
    const none = run("network.csv");
    expect(none.accepted.every((a) => a.offer.sourceUpdatedAt === null)).toBe(true);
    expect(none.warnings.some((w) => w.code === "date_no_timezone")).toBe(true);
    const riyadh = run("network.csv", { timeZone: "Asia/Riyadh" });
    expect(riyadh.accepted[0].offer.sourceUpdatedAt).toEqual({ utc: "2026-11-05T07:00:00.000Z", originalOffset: "+03:00", assumedTimeZone: "Asia/Riyadh" });
    // نفس الملف بنفس الإعداد = نفس النتيجة على أي جهاز
    expect(run("network.csv", { timeZone: "Asia/Riyadh" }).accepted.map((a) => a.offer.sourceUpdatedAt)).toEqual(riyadh.accepted.map((a) => a.offer.sourceUpdatedAt));
  });

  it("يكتشف التكرار داخل الملف ويستخرج الوجهة من رابط التتبع", () => {
    const r = run("network.csv");
    expect(r.duplicatesInFile).toBe(1);
    expect(r.accepted[0].offer.canonicalUrl).toBe("https://epsilon.example.com/");
    expect(r.warnings.some((w) => w.code === "redirect_without_target")).toBe(true);
  });

  it("المتجر غير المعروف يُقترح للمراجعة ولا يُخمَّن", () => {
    const r = run("network.csv");
    expect(r.summary.storePending).toBe(2);
    expect(r.storeProposals.map((p) => p.rawName).sort()).toEqual(["", "Test Store Epsilon"]);
    expect(r.accepted.find((a) => a.offer.storeName === "Test Store Alpha")!.offer.storeId).toBe("alpha");
  });
});

describe("قواعد الصف", () => {
  const H = ["title", "price", "sale_price", "currency", "link", "store", "updated_at"];
  const one = (vals: (string | number)[], over = {}) =>
    runImport({ source: src(over), fileName: "x.csv", content: csv([H, vals]), catalog: TEST_CATALOG, importedAt: AT, registry: TEST_REGISTRY });

  it("ترفض الأسعار العلمية والملتبسة والنص الزائد", () => {
    expect(one(["P", "1e3", "", "SAR", "https://alpha.example.com/1", "alpha", ""]).rejected[0].issues.map((i) => i.code)).toContain("price_scientific");
    expect(one(["P", "1.299", "", "KWD", "https://alpha.example.com/1", "alpha", ""]).rejected[0].issues.map((i) => i.code)).toContain("price_ambiguous");
    expect(one(["P", "من 999", "", "SAR", "https://alpha.example.com/1", "alpha", ""]).rejected[0].issues.map((i) => i.code)).toContain("price_extra_text");
  });

  it("ترفض تعارض العملة بين النص والعمود", () => {
    expect(one(["P", "999 USD", "", "SAR", "https://alpha.example.com/1", "alpha", ""]).rejected[0].issues.map((i) => i.code)).toContain("conflicting_currency");
  });

  it("سعر الخصم الأعلى من الأصلي يُتجاهل مع تحذير", () => {
    const r = one(["P", "1000", "1200", "SAR", "https://alpha.example.com/1", "alpha", ""]);
    expect(r.accepted[0].offer).toMatchObject({ price: { amount: 1000 }, listPrice: null });
    expect(r.warnings.map((w) => w.code)).toContain("sale_above_regular");
  });

  it("سعر خصم غير صالح يرفض الصف بدل تجاهله", () => {
    expect(one(["P", "1000", "abc", "SAR", "https://alpha.example.com/1", "alpha", ""]).summary.rejected).toBe(1);
  });

  it("السعر غير المنطقي (هللات) يُرفض", () => {
    expect(one(["P", "199900000", "", "SAR", "https://alpha.example.com/1", "alpha", ""]).rejected[0].issues.map((i) => i.code)).toContain("implausible_price");
  });

  it("التاريخ المستقبلي يُتجاهل", () => {
    const r = one(["P", "1000", "", "SAR", "https://alpha.example.com/1", "alpha", "2027-01-01T00:00:00Z"]);
    expect(r.accepted[0].offer.sourceUpdatedAt).toBe(null);
    expect(r.warnings.map((w) => w.code)).toContain("future_date");
  });

  it("العملة الافتراضية للمصدر تُستخدم مع تحذير", () => {
    const r = one(["P", "1000", "", "", "https://alpha.example.com/1", "alpha", ""], { defaultCurrency: "SAR" });
    expect(r.accepted[0].offer.price.currency).toBe("SAR");
    expect(r.warnings.map((w) => w.code)).toContain("default_currency");
    expect(one(["P", "1000", "", "", "https://alpha.example.com/1", "alpha", ""]).rejected[0].issues.map((i) => i.code)).toContain("missing_currency");
  });

  it("الأعمدة الناقصة تُرفض كصف ولا تُدمج", () => {
    const r = runImport({ source: src(), fileName: "x.csv", content: `${H.join(",")}\nP,1000,,SAR\nQ,900,,SAR,https://alpha.example.com/2,alpha,`, catalog: TEST_CATALOG, importedAt: AT, registry: TEST_REGISTRY });
    expect(r.rejected.map((x) => [x.row, x.issues[0].code])).toEqual([[2, "column_count_mismatch"]]);
    expect(r.accepted.map((a) => a.offer.name)).toEqual(["Q"]);
  });
});

describe("معرّف المصدر", () => {
  it("يجب أن يكون ثابتًا وآمنًا", () => {
    expect(isValidSourceId("admitad-store-x")).toBe(true);
    expect(isValidSourceId("Admitad Store")).toBe(false);
    expect(isValidSourceId("../etc")).toBe(false);
    const r = runImport({ source: src({ id: "BAD ID" }), fileName: "x.csv", content: "a\n1", catalog: TEST_CATALOG, importedAt: AT });
    expect(r.fatal?.code).toBe("invalid_source");
    expect(r.accepted).toEqual([]);
  });
});
