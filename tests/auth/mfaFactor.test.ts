import { describe, expect, it } from "vitest";
import { chooseFactor, describeAuthError, FlowError } from "../../app/lib/auth/mfaFactor";

const f = (id: string, status: string, created_at: string) => ({ id, factor_type: "totp", status, created_at });

describe("chooseFactor — المعرّف من الخادم لا من ذاكرة الصفحة", () => {
  it("حادثة 2026-11-11: الصفحة تحمل عاملًا محذوفًا → يُختار العامل الحالي على الخادم", () => {
    const server = [f("8c5efaa0", "unverified", "2026-11-11T16:04:32Z")];
    expect(chooseFactor(server, "66a81fee")).toEqual({ kind: "pending", factorId: "8c5efaa0" });
  });

  it("عامل مفعّل يتقدم على أي عامل غير مكتمل وعلى ذاكرة الصفحة", () => {
    const server = [f("p1", "unverified", "2026-11-11T16:05:00Z"), f("v1", "verified", "2026-11-01T00:00:00Z")];
    expect(chooseFactor(server, "p1")).toEqual({ kind: "verified", factorId: "v1" });
  });

  it("العامل الذي عرضت الصفحة رمزه يُستخدم ما دام موجودًا", () => {
    const server = [f("old", "unverified", "2026-11-11T16:00:00Z"), f("mine", "unverified", "2026-11-11T15:00:00Z")];
    expect(chooseFactor(server, "mine")).toEqual({ kind: "pending", factorId: "mine" });
  });

  it("بلا ذاكرة (إعادة تحميل): الأحدث على الخادم — لا حذف ولا إنشاء", () => {
    const server = [f("a", "unverified", "2026-11-11T15:00:00Z"), f("b", "unverified", "2026-11-11T16:00:00Z")];
    expect(chooseFactor(server, null)).toEqual({ kind: "pending", factorId: "b" });
  });

  it("لا عوامل → none (يلزم إنشاء رمز)، وعوامل غير TOTP تُتجاهل", () => {
    expect(chooseFactor([], "x")).toEqual({ kind: "none" });
    expect(chooseFactor([{ id: "p", factor_type: "phone", status: "verified" }], null)).toEqual({ kind: "none" });
  });
});

describe("describeAuthError — الرمز الحقيقي بدل الرسالة العامة", () => {
  it("يعرض رمز Supabase", () => {
    const r = describeAuthError({ name: "AuthApiError", code: "mfa_factor_not_found", status: 404, message: "Factor not found" });
    expect(r.code).toBe("mfa_factor_not_found");
    expect(r.text).toContain("حدّث الصفحة");
  });
  it("رمز خاطئ", () => {
    expect(describeAuthError({ code: "mfa_verification_failed", status: 422 }).text).toContain("غير صحيح");
  });
  it("أخطاء التدفق الداخلية", () => {
    expect(describeAuthError(new FlowError("aal_not_upgraded")).code).toBe("aal_not_upgraded");
  });
  it("خطأ غير معروف يُظهر رسالته ورمز HTTP بدل الرسالة العامة فقط", () => {
    const r = describeAuthError({ status: 500, message: "boom" });
    expect(r.code).toBe("http_500");
    expect(r.text).toContain("boom");
  });
});
