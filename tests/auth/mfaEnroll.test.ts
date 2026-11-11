import { describe, expect, it } from "vitest";
import { createEnroller, type MfaApi } from "../../app/lib/auth/mfaEnroll";

/** محاكاة Supabase: قيد تفرد الاسم لكل مستخدم كما في mfa_factors_user_friendly_name_unique */
function fakeMfa(initial: { id: string; status: string; name: string }[] = []) {
  const factors = [...initial];
  let seq = 0;
  const calls = { enroll: 0, unenroll: [] as string[] };
  const api: MfaApi = {
    async listFactors() {
      await Promise.resolve();
      return { data: { all: factors.map((f) => ({ id: f.id, factor_type: "totp", status: f.status })) }, error: null };
    },
    async unenroll({ factorId }) {
      calls.unenroll.push(factorId);
      factors.splice(factors.findIndex((f) => f.id === factorId), 1);
      return { data: {}, error: null };
    },
    async enroll({ friendlyName }) {
      calls.enroll++;
      await Promise.resolve();
      if (factors.some((f) => f.name === friendlyName)) return { data: null, error: new Error("duplicate key value violates unique constraint") };
      const id = `f${++seq}`;
      factors.push({ id, status: "unverified", name: friendlyName });
      return { data: { id, totp: { qr_code: `qr-${id}`, secret: `secret-${id}` } }, error: null };
    },
  };
  return { api, factors, calls };
}

describe("MFA enrollment", () => {
  it("concurrent calls send a single enroll request (the original bug)", async () => {
    const { api, calls, factors } = fakeMfa();
    const enroll = createEnroller(api);
    const [a, b] = await Promise.all([enroll(), enroll()]);
    expect(calls.enroll).toBe(1);
    expect(a).toEqual(b);
    expect(factors).toHaveLength(1);
  });

  it("revokes previously exposed unverified keys before issuing a new one", async () => {
    const { api, calls, factors } = fakeMfa([{ id: "old-exposed", status: "unverified", name: "TruePrice admin" }]);
    const e = await createEnroller(api)();
    expect(calls.unenroll).toEqual(["old-exposed"]);
    expect(factors.map((f) => f.id)).toEqual([e.factorId]);
    expect(e.secret).not.toBe("secret-old-exposed");
  });

  it("never removes a verified factor", async () => {
    const { api, calls } = fakeMfa([{ id: "good", status: "verified", name: "x" }]);
    await createEnroller(api)();
    expect(calls.unenroll).toEqual([]);
  });

  it("a later retry issues a fresh key", async () => {
    const { api } = fakeMfa();
    let t = 0;
    const enroll = createEnroller(api, () => new Date(Date.UTC(2026, 10, 11, 0, 0, t++)));
    const first = await enroll();
    const second = await enroll();
    expect(second.factorId).not.toBe(first.factorId);
  });
});
