import { describe, expect, it } from "vitest";
import { draftRow, draftRowsFromCsv, MVP_MAX_ROWS, type ProductRef } from "../../app/lib/admin/priceRows";

const ctx = {
  products: new Map<number, ProductRef>([
    [1, { publicId: 1, name: "iPhone 17 256GB" }],
    [900007, { publicId: 900007, name: "Demo Phone X1" }],
  ]),
  stores: new Set(["jarir", "demo-store-a"]),
  now: new Date("2026-11-07T10:00:00Z"),
};
const base = { line: 1, productId: "900007", storeId: "demo-store-a", price: "1,050", url: "https://demo-store-a.example.com/p/x1?utm_source=x" };

describe("MVP: صفوف الأسعار من اللوحة", () => {
  it("صف صالح بالريال: يحوّل السعر ويوحّد الرابط ويضع تاريخًا مؤكدًا", () => {
    const { row, errors } = draftRow(base, ctx);
    expect(errors).toEqual([]);
    expect(row).toMatchObject({
      publicProductId: 900007, store_id: "demo-store-a", amount: "1050.00", currency: "SAR",
      canonical_url: "https://demo-store-a.example.com/p/x1", availability: "in_stock", date_confirmed: true,
      as_of: "2026-11-07T10:00:00.000Z", offer_key: "demo-store-a-p900007", name: "Demo Phone X1",
    });
  });

  it("العملة الأجنبية تُرفض (تحويل العملات معطّل مؤقتًا)", () => {
    expect(draftRow({ ...base, currency: "USD" }, ctx).errors[0].message).toMatch(/الريال/);
    expect(draftRow({ ...base, price: "300 USD" }, ctx).row).toBeNull();
  });

  it("منتج أو متجر غير موجود، رابط غير https، تاريخ مستقبلي، سعر غير صالح: كلها مرفوضة", () => {
    expect(draftRow({ ...base, productId: "42" }, ctx).errors[0].message).toMatch(/غير موجود/);
    expect(draftRow({ ...base, storeId: "noon" }, ctx).errors[0].message).toMatch(/غير مسجل/);
    expect(draftRow({ ...base, url: "http://x.example.com" }, ctx).errors[0].message).toMatch(/https/);
    expect(draftRow({ ...base, asOf: "2026-11-09T10:00+03:00" }, ctx).errors[0].message).toMatch(/المستقبل/);
    expect(draftRow({ ...base, price: "abc" }, ctx).row).toBeNull();
    expect(draftRow({ ...base, price: "-5" }, ctx).row).toBeNull();
  });

  it("التاريخ بلا منطقة يُفسَّر بتوقيت الرياض", () => {
    const { row } = draftRow({ ...base, asOf: "2026-11-07T09:30" }, ctx);
    expect(row?.as_of).toBe("2026-11-07T06:30:00.000Z");
  });

  it("CSV: أعمدة صريحة، وأرقام الأسطر في الأخطاء", () => {
    const csv = "product_id,store_id,price,url\n1,jarir,3899,https://www.jarir.com/p/1\n1,noon,3800,https://noon.example.com/p/1\n";
    const r = draftRowsFromCsv(csv, ctx);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([{ line: 3, message: expect.stringMatching(/noon/) }]);
  });

  it("CSV بدون الأعمدة المطلوبة يُرفض", () => {
    expect(draftRowsFromCsv("name,price\nx,1\n", ctx).errors[0].message).toMatch(/أعمدة مطلوبة/);
  });

  it(`الاستيراد الضخم معطّل: أكثر من ${MVP_MAX_ROWS} صف يُرفض قبل أي حفظ`, () => {
    const lines = ["product_id,store_id,price,url"];
    for (let i = 0; i <= MVP_MAX_ROWS; i++) lines.push(`1,jarir,${1000 + i},https://www.jarir.com/p/${i}`);
    const r = draftRowsFromCsv(lines.join("\n"), ctx);
    expect(r.rows).toEqual([]);
    expect(r.errors[0].message).toMatch(/الاستيراد الضخم/);
  });
});
