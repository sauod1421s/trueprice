import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
import { makeSessionValue, PREVIEW_USERS, previewAuthEnabled, readSessionValue } from "../../app/lib/admin/session";

const KEY = "k".repeat(40);
const UID = PREVIEW_USERS[0].id;
const NOW = Date.parse("2026-11-07T10:00:00Z");

describe("دخول المعاينة المحلية", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.TP_PREVIEW_AUTH = "on";
    process.env.TP_DATA_SOURCE = "db";
    process.env.TP_PREVIEW_SESSION_SECRET = KEY;
    delete process.env.VERCEL;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("الجلسة الموقعة تُقرأ، والمعدّلة أو المنتهية أو بمفتاح آخر تُرفض", () => {
    const v = makeSessionValue(UID, NOW, KEY);
    expect(readSessionValue(v, NOW, KEY)).toBe(UID);
    expect(readSessionValue(v.replace(UID, PREVIEW_USERS[1].id), NOW, KEY)).toBeNull();
    expect(readSessionValue(v, NOW + 9 * 3600_000, KEY)).toBeNull();
    expect(readSessionValue(v, NOW, "x".repeat(40))).toBeNull();
    expect(readSessionValue("garbage", NOW, KEY)).toBeNull();
  });

  it("مستخدم غير معروف لا يُقبل حتى بتوقيع صحيح", () => {
    expect(readSessionValue(makeSessionValue("00000000-0000-4000-8000-000000000999", NOW, KEY), NOW, KEY)).toBeNull();
  });

  it("معطّل بدون سر كافٍ، أو بدون وضع القاعدة، أو على Vercel", () => {
    expect(previewAuthEnabled()).toBe(true);
    process.env.TP_PREVIEW_SESSION_SECRET = "short";
    expect(previewAuthEnabled()).toBe(false);
    process.env.TP_PREVIEW_SESSION_SECRET = KEY;
    process.env.VERCEL = "1";
    expect(previewAuthEnabled()).toBe(false);
    delete process.env.VERCEL;
    process.env.TP_DATA_SOURCE = "static";
    expect(previewAuthEnabled()).toBe(false);
  });
});
