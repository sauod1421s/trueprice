import { describe, expect, it } from "vitest";
import { authMode, isSecretSupabaseKey, supabasePublicConfig } from "@/app/lib/auth/config";
import { DbConfigError, poolConfig, TRANSACTION_SETTINGS } from "@/app/lib/db/connection";

/** رمز JWT غير موقّع بحمولة معيّنة (لاختبار كشف المفاتيح فقط) */
const jwt = (payload: Record<string, unknown>) =>
  ["eyJhbGciOiJIUzI1NiJ9", Buffer.from(JSON.stringify(payload)).toString("base64url"), "sig"].join(".");

const URL_OK = "https://abcdefghijklmnopqrst.supabase.co";
const PUBLISHABLE = "sb_publishable_test_0000000000000000";
const SECRET_32 = "x".repeat(32);

describe("مفاتيح Supabase: السري لا يصل للمتصفح", () => {
  it("يكشف مفاتيح sb_secret_ و JWT بدور service_role", () => {
    expect(isSecretSupabaseKey("sb_secret_abc")).toBe(true);
    expect(isSecretSupabaseKey(jwt({ role: "service_role" }))).toBe(true);
    expect(isSecretSupabaseKey(jwt({ role: "anon" }))).toBe(false);
    expect(isSecretSupabaseKey(PUBLISHABLE)).toBe(false);
    expect(isSecretSupabaseKey("a.%%%.c")).toBe(false);
  });

  it("يقبل المفتاح العام فقط، ويرفض السري حتى لو وُضع في متغير عام", () => {
    expect(supabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: `${URL_OK}/`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE }))
      .toEqual({ url: URL_OK, key: PUBLISHABLE });
    expect(supabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon" }) }))
      ?.toMatchObject({ url: URL_OK });
    expect(supabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" })).toBeNull();
    expect(supabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "service_role" }) })).toBeNull();
  });

  it("يرفض رابطًا غير https أو ناقص الإعداد", () => {
    expect(supabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://abc.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toBeNull();
    expect(supabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co/x?y", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE })).toBeNull();
    expect(supabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: URL_OK })).toBeNull();
    expect(supabasePublicConfig({})).toBeNull();
  });
});

describe("وضع دخول اللوحة", () => {
  const sb = { NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE };

  it("بدون قاعدة بيانات: اللوحة مغلقة دائمًا", () => {
    expect(authMode({})).toBe("off");
    expect(authMode({ ...sb })).toBe("off");
    expect(authMode({ TP_PREVIEW_AUTH: "on", TP_PREVIEW_SESSION_SECRET: SECRET_32 })).toBe("off");
  });

  it("الدخول التجريبي محلي فقط: لا يعمل على Vercel ولا بسر قصير", () => {
    const local = { TP_DATA_SOURCE: "db", TP_PREVIEW_AUTH: "on", TP_PREVIEW_SESSION_SECRET: SECRET_32 };
    expect(authMode(local)).toBe("local-preview");
    expect(authMode({ ...local, VERCEL: "1" })).toBe("off");
    expect(authMode({ ...local, VERCEL: "1", ...sb })).toBe("supabase");
    expect(authMode({ ...local, TP_PREVIEW_SESSION_SECRET: "short" })).toBe("off");
  });

  it("Supabase Auth عند وجود قاعدة ومفتاح عام صالح فقط", () => {
    expect(authMode({ TP_DATA_SOURCE: "db", ...sb })).toBe("supabase");
    expect(authMode({ TP_DATA_SOURCE: "db", ...sb, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_x" })).toBe("off");
  });
});

describe("اتصال القاعدة", () => {
  const CA = "-----BEGIN CERTIFICATE-----\\nMIIBfake\\n-----END CERTIFICATE-----";

  it("محليًا: بلا SSL وحجم مجموعة افتراضي 5", () => {
    const c = poolConfig({ DATABASE_URL: "postgresql://tp_app:pw@127.0.0.1:54329/trueprice" });
    expect(c.ssl).toBeUndefined();
    expect(c.max).toBe(5);
    expect(c.application_name).toBe("trueprice");
  });

  it("بعيدًا: يشترط شهادة Supabase ويتحقق من هوية الخادم دائمًا", () => {
    const remote = "postgresql://tp_app.ref:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&sslrootcert=x";
    expect(() => poolConfig({ DATABASE_URL: remote })).toThrow(DbConfigError);
    const c = poolConfig({ DATABASE_URL: remote, DATABASE_CA_CERT: CA });
    expect(c.ssl).toEqual({
      ca: "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----",
      rejectUnauthorized: true,
      servername: "aws-0-eu-central-1.pooler.supabase.com",
    });
    // معاملات SSL في الرابط تُحذف حتى لا تتغلب على التحقق
    expect(c.connectionString).not.toMatch(/ssl/);
    expect(c.max).toBe(3);
  });

  it("يحد حجم المجموعة بين 1 و 10، ويرفض الروابط غير الصالحة", () => {
    const u = "postgresql://a:b@localhost/x";
    expect(poolConfig({ DATABASE_URL: u, TP_DB_POOL_MAX: "50" }).max).toBe(10);
    expect(poolConfig({ DATABASE_URL: u, TP_DB_POOL_MAX: "0" }).max).toBe(3);
    expect(poolConfig({ DATABASE_URL: u, TP_DB_POOL_MAX: "-4" }).max).toBe(1);
    expect(() => poolConfig({ DATABASE_URL: "" })).toThrow(DbConfigError);
    expect(() => poolConfig({ DATABASE_URL: "mysql://a:b@h/x" })).toThrow(/postgresql/);
  });

  it("مهلات كل معاملة تُضبط داخل المعاملة (تعمل مع وضع المعاملات في Supavisor)", () => {
    expect(TRANSACTION_SETTINGS.every((s) => s.startsWith("set local "))).toBe(true);
  });
});
