import { describe, expect, it } from "vitest";
import { AuthorizationError, authorize, permissionsOf, withPermission, type Principal } from "@/app/lib/auth/authz";

const NOW = "2026-11-06T12:00:00.000Z";
const user = (over: Partial<Principal> = {}): Principal => ({ userId: "u1", roles: ["admin"], mfa: true, sessionExpiresAt: "2026-11-06T13:00:00.000Z", ...over });

describe("التفويض: الرفض افتراضيًا", () => {
  it("بلا هوية = مرفوض", () => {
    expect(authorize(null, "import:commit", { now: NOW })).toEqual({ allowed: false, reason: "unauthenticated" });
    expect(authorize({ ...user(), userId: "" }, "import:preview", { now: NOW }).allowed).toBe(false);
  });
  it("الجلسة المنتهية أو التاريخ غير الصالح = مرفوض", () => {
    expect(authorize(user({ sessionExpiresAt: "2026-11-06T11:59:59Z" }), "import:preview", { now: NOW })).toMatchObject({ reason: "session_expired" });
    expect(authorize(user({ sessionExpiresAt: "garbage" }), "import:preview", { now: NOW })).toMatchObject({ reason: "session_expired" });
  });
  it("الأدوار غير المعروفة لا تمنح شيئًا", () => {
    expect(permissionsOf(["superuser", "__proto__", "constructor"]).size).toBe(0);
    expect(authorize(user({ roles: ["root"] }), "import:preview", { now: NOW })).toMatchObject({ reason: "forbidden" });
  });
  it("المشاهد لا يحفظ، والمراجع لا يعتمد الاستيراد", () => {
    expect(authorize(user({ roles: ["viewer"] }), "import:commit", { now: NOW })).toMatchObject({ reason: "forbidden" });
    expect(authorize(user({ roles: ["reviewer"] }), "import:commit", { now: NOW })).toMatchObject({ reason: "forbidden" });
    expect(authorize(user({ roles: ["reviewer"] }), "price:verify", { now: NOW }).allowed).toBe(true);
  });
  it("العمليات الحساسة تتطلب تحققًا ثنائيًا", () => {
    expect(authorize(user({ mfa: false }), "import:commit", { now: NOW })).toMatchObject({ reason: "mfa_required" });
    expect(authorize(user(), "import:commit", { now: NOW }).allowed).toBe(true);
  });
  it("لا يوثق المستخدم سعرًا رفعه بنفسه", () => {
    expect(authorize(user(), "price:verify", { now: NOW, resourceCreatedBy: "u1" })).toMatchObject({ reason: "self_review" });
    expect(authorize(user(), "price:verify", { now: NOW, resourceCreatedBy: "u2" }).allowed).toBe(true);
  });
});

describe("withPermission: لا حفظ بدون هوية وتفويض على الخادم", () => {
  it("بدون نظام دخول (الوضع الحالي) كل حفظ مرفوض ولا يُنفذ المعالج", async () => {
    let ran = false;
    const save = withPermission("import:commit", async () => { ran = true; return "saved"; });
    await expect(save()).rejects.toBeInstanceOf(AuthorizationError);
    expect(ran).toBe(false);
  });
  it("مع هوية مخولة يُنفذ", async () => {
    const save = withPermission("import:commit", async (p, x: number) => `${p.userId}:${x}`, { resolve: async () => user(), now: () => NOW });
    await expect(save(5)).resolves.toBe("u1:5");
  });
  it("يمرر منشئ السجل لمنع المراجعة الذاتية", async () => {
    const verify = withPermission("price:verify", async (_p, owner: string) => `ok:${owner}`, { resolve: async () => user(), now: () => NOW, createdBy: (owner: string) => owner });
    await expect(verify("u1")).rejects.toMatchObject({ reason: "self_review" });
    await expect(verify("u2")).resolves.toBe("ok:u2");
  });
});
