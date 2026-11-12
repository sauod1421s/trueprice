import { describe, expect, it } from "vitest";
import { normalizeIdentifier } from "@/app/lib/admin/identifiers";

describe("توحيد المعرّفات", () => {
  it("رمز المتجر: أحرف كبيرة بلا مسافات، ويرفض الرموز الغريبة", () => {
    expect(normalizeIdentifier("store_sku", " b0test0001 ")).toBe("B0TEST0001");
    expect(normalizeIdentifier("store_sku", "N12345678A.V1")).toBe("N12345678A.V1");
    expect(normalizeIdentifier("store_sku", "a b")).toBeNull();
    expect(normalizeIdentifier("store_sku", "<script>")).toBeNull();
  });
  it("الباركود ورقم الموديل كما كانا", () => {
    expect(normalizeIdentifier("gtin", "4006381333931")).toBe("04006381333931");
    expect(normalizeIdentifier("mpn", "tpx-256")).toBe("TPX256");
  });
});
