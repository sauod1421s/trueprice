import { describe, expect, it } from "vitest";
import { DbConfigError, poolConfig } from "../../app/lib/db/connection";
import { classifyDbError } from "../../app/lib/db/health";

const pgErr = (code: string, message = "x") => Object.assign(new Error(message), { code });

describe("classifyDbError — رموز تشخيص بلا أسرار", () => {
  it("أخطاء الإعداد", () => {
    expect(classifyDbError(new DbConfigError("DATABASE_URL غير صالح"))).toBe("config");
    let thrown: unknown;
    try {
      poolConfig({ DATABASE_URL: "postgresql://tp_app.ref:pw@aws-1-eu-central-1.pooler.supabase.com:6543/postgres" });
    } catch (e) {
      thrown = e;
    }
    expect(classifyDbError(thrown)).toBe("config"); // بلا DATABASE_CA_CERT
  });
  it("الشبكة والمهلة", () => {
    expect(classifyDbError(pgErr("ENOTFOUND"))).toBe("dns");
    expect(classifyDbError(pgErr("EAI_AGAIN"))).toBe("dns");
    expect(classifyDbError(pgErr("ECONNREFUSED"))).toBe("network");
    expect(classifyDbError(pgErr("ECONNRESET"))).toBe("network");
    expect(classifyDbError(pgErr("ETIMEDOUT"))).toBe("timeout");
    expect(classifyDbError(new Error("Connection terminated due to connection timeout"))).toBe("timeout");
  });
  it("الشهادة", () => {
    expect(classifyDbError(pgErr("SELF_SIGNED_CERT_IN_CHAIN"))).toBe("tls");
    expect(classifyDbError(pgErr("UNABLE_TO_VERIFY_LEAF_SIGNATURE"))).toBe("tls");
    expect(classifyDbError(pgErr("ERR_TLS_CERT_ALTNAME_INVALID"))).toBe("tls");
    expect(classifyDbError(new Error("self-signed certificate in certificate chain"))).toBe("tls");
  });
  it("الدخول وSupavisor", () => {
    expect(classifyDbError(pgErr("28P01"))).toBe("auth_failed");
    expect(classifyDbError(pgErr("XX000", "Tenant or user not found"))).toBe("tenant_not_found");
  });
  it("المخطط والصلاحيات", () => {
    expect(classifyDbError(pgErr("3F000"))).toBe("schema_missing");
    expect(classifyDbError(pgErr("42P01"))).toBe("schema_missing");
    expect(classifyDbError(pgErr("22023"))).toBe("schema_missing");
    expect(classifyDbError(pgErr("42501"))).toBe("permission");
  });
  it("غير المعروف وغير الكائنات", () => {
    expect(classifyDbError(pgErr("XX000", "something else"))).toBe("unknown");
    expect(classifyDbError(null)).toBe("unknown");
    expect(classifyDbError("boom")).toBe("unknown");
  });
});
