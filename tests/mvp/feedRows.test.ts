import { describe, expect, it } from "vitest";
import { feedOfferKey, feedSummary, feedToStageRows } from "@/app/lib/admin/feedRows";
import { runImport } from "@/app/lib/ingest/importer";
import { AT, csv, fixture, src, TEST_CATALOG, TEST_REGISTRY } from "../ingest/helpers";

/** ملف شريك خيالي بكل الحالات (نطاقات example محجوزة، والباركود رقم اختبار عام) */
const H = ["id", "title", "price", "sale_price", "currency", "link", "store", "gtin", "mpn", "brand", "condition", "updated_at"];
const FEED = csv([
  H,
  // 1) مطابق بالباركود، بخصم وتاريخ
  ["SKU-1", "Test Phone X 256GB Black", "1999", "1899", "SAR", "https://alpha.example.com/p/1?utm_source=n", "alpha", "4006381333931", "", "TestBrand", "new", "2026-11-05T08:00:00+03:00"],
  // 2) يشبه منتجًا بالاسم فقط → لا يُدمج تلقائيًا
  ["SKU-2", "Test Phone X 512GB", "2499", "", "SAR", "https://alpha.example.com/p/2", "alpha", "", "", "TestBrand", "new", "2026-11-05T08:00:00+03:00"],
  // 3) متجر غير مسجل في القاعدة (موجود في السجل لكن غير نشط)
  ["SKU-3", "Test Phone X 256GB", "1950", "", "SAR", "https://gamma.example.com/p/3", "gamma", "4006381333931", "", "TestBrand", "new", "2026-11-05T08:00:00+03:00"],
  // 4) عملة أجنبية
  ["SKU-4", "Test Phone X 256GB", "499", "", "USD", "https://alpha.example.com/p/4", "alpha", "4006381333931", "", "TestBrand", "new", "2026-11-05T08:00:00+03:00"],
  // 5) مستعمل
  ["SKU-5", "Test Phone X 256GB", "1300", "", "SAR", "https://alpha.example.com/p/5", "alpha", "4006381333931", "", "TestBrand", "used", "2026-11-05T08:00:00+03:00"],
  // 6) مطابق برقم الموديل وبلا تاريخ → تاريخ غير مؤكد
  ["bad id with spaces", "Some phone", "1888", "", "SAR", "https://alpha.example.com/p/6", "alpha", "", "TPX-256-BK", "TestBrand", "new", ""],
  // 7) سعر غير صالح
  ["SKU-7", "Broken", "abc", "", "SAR", "https://alpha.example.com/p/7", "alpha", "", "", "", "new", ""],
  // 8) غير موجود في الكتالوج
  ["SKU-8", "Unknown Gadget 3000", "100", "", "SAR", "https://alpha.example.com/p/8", "alpha", "", "", "OtherBrand", "new", "2026-11-05T08:00:00+03:00"],
]);

const result = runImport({
  source: src({ timeZone: "Asia/Riyadh" }), fileName: "partner.csv", content: FEED, catalog: TEST_CATALOG,
  importedAt: AT, registry: TEST_REGISTRY,
});
const active = new Set(["alpha", "delta", "market"]);
const staged = feedToStageRows(result, { activeStores: active });

describe("ملفات الشركاء → صفوف المعاينة", () => {
  it("يرفع فقط المطابق بباركود أو رقم موديل، بالريال، جديد، ومتجره نشط", () => {
    expect(result.fatal).toBeNull();
    expect(staged.rows.map((r) => r.offer_key)).toEqual(["SKU-1", expect.stringMatching(/^f-[0-9a-f]{16}$/)]);
    expect(staged.rows.every((r) => r.product_id === "1" && r.currency === "SAR" && r.condition === "new")).toBe(true);
    expect(staged.counts).toMatchObject({
      total: 8, staged: 2, rejected: 1, needsReview: 1, unmatched: 1, storeUnknown: 1, foreignCurrency: 1, notNew: 1, undated: 1,
    });
  });

  it("يحفظ سعر الخصم والسعر قبل الخصم والرابط الفعلي وتاريخ الصف بتوقيت UTC", () => {
    expect(staged.rows[0]).toMatchObject({
      store_id: "alpha", amount: "1899.00", list_amount: "1999.00",
      canonical_url: "https://alpha.example.com/p/1", url: "https://alpha.example.com/p/1?utm_source=n",
      as_of: "2026-11-05T05:00:00.000Z", source_updated_at: "2026-11-05T05:00:00.000Z", source_offset: "+03:00",
      date_confirmed: true, external_id: "SKU-1",
    });
  });

  it("بلا تاريخ في الملف: يُعلَّم تاريخًا غير مؤكد (يُستبعد من السعر العادل)", () => {
    expect(staged.rows[1]).toMatchObject({ as_of: AT, date_confirmed: false });
    expect(staged.rows[1].source_updated_at).toBeUndefined();
  });

  it("كل صف لم يُرفع له ملاحظة بسببه، والمطابقة بالاسم تعرض أقرب منتج دون دمج", () => {
    const codes = staged.issues.map((i) => [i.row, i.code]);
    expect(codes).toEqual(expect.arrayContaining([
      [3, "needs_review"], [4, "store_unknown"], [5, "currency_not_supported"], [6, "condition_not_supported"],
      [8, "row_rejected"], [9, "unmatched"],
    ]));
    const review = staged.issues.find((i) => i.code === "needs_review")!;
    expect(review.message).toMatch(/أضف الباركود/);
    expect(review.excerpt?.candidates).toEqual(expect.arrayContaining(["Test Phone X 512GB"]));
    // الملاحظات صالحة لقيود القاعدة
    for (const i of staged.issues) {
      expect(i.code).toMatch(/^[a-z_]{2,60}$/);
      expect(i.message.length).toBeLessThanOrEqual(1000);
      expect(Buffer.byteLength(JSON.stringify(i.excerpt ?? null))).toBeLessThan(2048);
    }
  });

  it("مفتاح العرض ثابت بين الرفعات (فيتراكم سجل الأسعار ولا يبدأ من جديد)", () => {
    const again = runImport({
      source: src({ timeZone: "Asia/Riyadh" }), fileName: "partner-2.csv", content: FEED, catalog: TEST_CATALOG,
      importedAt: "2026-11-07T00:00:00.000Z", registry: TEST_REGISTRY,
    });
    const a = result.accepted.map(feedOfferKey);
    const b = again.accepted.map(feedOfferKey);
    expect(b).toEqual(a);
  });

  it("المكرر داخل الملف يؤخذ أول ظهور فقط، والملاحظات الزائدة تُختصر", () => {
    const dup = csv([H, ...[1, 2].map((n) => ["SKU-1", "Test Phone X 256GB", String(1800 + n), "", "SAR", "https://alpha.example.com/p/1", "alpha", "4006381333931", "", "TestBrand", "new", "2026-11-05T08:00:00+03:00"])]);
    const r = runImport({ source: src(), fileName: "d.csv", content: dup, catalog: TEST_CATALOG, importedAt: AT, registry: TEST_REGISTRY });
    const s = feedToStageRows(r, { activeStores: active });
    expect(s.rows).toHaveLength(1);
    expect(s.issues.map((i) => i.code)).toContain("duplicate_offer");

    const few = feedToStageRows(result, { activeStores: new Set(), maxIssues: 3 });
    expect(few.issues).toHaveLength(3);
    expect(few.issues[2].code).toBe("issues_truncated");
  });

  it("ملف Google Merchant الحقيقي الصيغة يمر بنفس القواعد", () => {
    const r = runImport({ source: src(), fileName: "gm.xml", content: fixture("google-merchant.xml"), catalog: TEST_CATALOG, importedAt: AT, registry: TEST_REGISTRY });
    const s = feedToStageRows(r, { activeStores: active });
    expect(s.counts.foreignCurrency).toBe(1);
    expect(s.rows.every((x) => x.currency === "SAR" && x.product_id)).toBe(true);
    expect(feedSummary(s.counts)).toMatch(/جاهز للمعاينة/);
  });
});
