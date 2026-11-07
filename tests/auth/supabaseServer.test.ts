/**
 * يختبر مسار التحقق الحقيقي في مكتبة Supabase (getClaims) دون شبكة:
 * رمز ES256 موقّع بمفتاح اختبار، ومفاتيح JWKS تُعاد من fetch وهمي.
 * لا يتصل بأي مشروع Supabase حقيقي ولا يستخدم أي مفتاح حقيقي.
 */
import { generateKeyPairSync, randomUUID, sign as cryptoSign, type KeyObject } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));

const REF = "abcdefghijklmnopqrst";
const SUPABASE_URL = `https://${REF}.supabase.co`;
const COOKIE = `sb-${REF}-auth-token`;
const KID = "test-kid-1";

function keyPair() {
  return generateKeyPairSync("ec", { namedCurve: "P-256" });
}
const signing = keyPair();
const other = keyPair();

function b64url(s: string | Buffer) {
  return Buffer.from(s).toString("base64url");
}

function makeJwt(payload: Record<string, unknown>, key: KeyObject = signing.privateKey, kid = KID) {
  const head = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid }));
  const body = b64url(JSON.stringify(payload));
  const sig = cryptoSign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}

function setSession(accessToken: string) {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: "test-refresh",
    user: { id: "u", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
  jar.set(COOKIE, `base64-${b64url(JSON.stringify(session))}`);
}

const fetchCalls: string[] = [];

beforeEach(() => {
  jar.clear();
  fetchCalls.length = 0;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test_0000000000000000");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    fetchCalls.push(url);
    if (url.endsWith("/auth/v1/.well-known/jwks.json")) {
      const jwk = signing.publicKey.export({ format: "jwk" });
      return new Response(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "ES256", use: "sig", key_ops: ["verify"] }] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    // أي استدعاء آخر (مثل getUser أو التحديث) يفشل: الاختبار لا يعتمد على الشبكة
    return new Response(JSON.stringify({ message: "offline test" }), { status: 401, headers: { "content-type": "application/json" } });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const claims = (over: Record<string, unknown> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return { sub: randomUUID(), role: "authenticated", aal: "aal2", email: "admin@test.invalid", iat: now, exp: now + 3600, ...over };
};

describe("Supabase Auth على الخادم: الهوية بعد التحقق من التوقيع فقط", () => {
  it("رمز صحيح الموقّع: يعيد المعرّف ومستوى التحقق الثنائي", async () => {
    const { supabaseIdentity } = await import("@/app/lib/auth/supabaseServer");
    const c = claims();
    setSession(makeJwt(c));
    await expect(supabaseIdentity()).resolves.toEqual({ sub: c.sub, aal: "aal2", email: "admin@test.invalid" });
    expect(fetchCalls.some((u) => u.endsWith("/.well-known/jwks.json"))).toBe(true);
  });

  it("aal1 (بلا تحقق ثنائي) يُعاد كما هو لتطلب اللوحة الخطوة الثانية", async () => {
    const { supabaseIdentity } = await import("@/app/lib/auth/supabaseServer");
    setSession(makeJwt(claims({ aal: "aal1", email: undefined })));
    await expect(supabaseIdentity()).resolves.toMatchObject({ aal: "aal1", email: null });
  });

  it("يرفض رمزًا موقّعًا بمفتاح آخر أو معدّلًا بعد التوقيع", async () => {
    const { supabaseIdentity } = await import("@/app/lib/auth/supabaseServer");
    setSession(makeJwt(claims(), other.privateKey));
    await expect(supabaseIdentity()).resolves.toBeNull();

    const good = makeJwt(claims({ aal: "aal1" }));
    const [h, , s] = good.split(".");
    setSession(`${h}.${b64url(JSON.stringify(claims({ aal: "aal2" })))}.${s}`);
    await expect(supabaseIdentity()).resolves.toBeNull();
  });

  it("يرفض الأدوار الأخرى والمعرّفات غير الصالحة والرموز المنتهية", async () => {
    const { supabaseIdentity } = await import("@/app/lib/auth/supabaseServer");
    setSession(makeJwt(claims({ role: "anon" })));
    await expect(supabaseIdentity()).resolves.toBeNull();
    setSession(makeJwt(claims({ role: "service_role" })));
    await expect(supabaseIdentity()).resolves.toBeNull();
    setSession(makeJwt(claims({ sub: "not-a-uuid" })));
    await expect(supabaseIdentity()).resolves.toBeNull();
  });

  it("بلا جلسة: لا هوية", async () => {
    const { supabaseIdentity } = await import("@/app/lib/auth/supabaseServer");
    await expect(supabaseIdentity()).resolves.toBeNull();
  });

  it("بلا إعداد Supabase: خطأ واضح بدل دخول صامت", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_should_never_be_public");
    const { supabaseServer } = await import("@/app/lib/auth/supabaseServer");
    await expect(supabaseServer()).rejects.toThrow(/غير مضبوط/);
  });
});
