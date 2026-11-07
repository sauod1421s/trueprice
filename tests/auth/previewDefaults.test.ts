import { describe, expect, it } from "vitest";
import { authMode, supabasePublicConfig } from "@/app/lib/auth/config";
import {
  PREVIEW_SUPABASE_PUBLISHABLE_KEY, PREVIEW_SUPABASE_URL, isBranchPreview, withPreviewDefaults,
} from "@/app/lib/previewDefaults";

const PREVIEW = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "mvp-live-preview" };
const DB = "postgresql://tp_app.ref:pw@aws-1-eu-central-1.pooler.supabase.com:6543/postgres";

describe("قيم معاينة فرع mvp-live-preview الافتراضية (عامة فقط)", () => {
  it("تنطبق على معاينة هذا الفرع وحده", () => {
    expect(isBranchPreview(PREVIEW)).toBe(true);
    expect(isBranchPreview({ ...PREVIEW, VERCEL_ENV: "production" })).toBe(false);
    expect(isBranchPreview({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "main" })).toBe(false);
    expect(isBranchPreview({ ...PREVIEW, VERCEL_GIT_COMMIT_REF: "phase-1-release-candidate" })).toBe(false);
    expect(isBranchPreview({})).toBe(false);
  });
  it("الإنتاج والفروع الأخرى ومحليًا: لا قيم مضافة إطلاقًا", () => {
    for (const env of [{}, { ...PREVIEW, VERCEL_ENV: "production", DATABASE_URL: DB }, { ...PREVIEW, VERCEL_GIT_COMMIT_REF: "main" }]) {
      expect(withPreviewDefaults(env)).toBe(env);
      expect(authMode(env)).toBe("off");
    }
  });
  it("بلا DATABASE_URL: لا وضع قاعدة ولا دخول، واللوحة تُعرض كمعاينة فقط", () => {
    const e = withPreviewDefaults(PREVIEW);
    expect(e.TP_DATA_SOURCE).toBeUndefined();
    expect(e.TRUEPRICE_ADMIN_PREVIEW).toBe("on");
    expect(authMode(PREVIEW)).toBe("off");
  });
  it("مع DATABASE_URL فقط: وضع القاعدة + دخول Supabase بالمفتاح العام", () => {
    const env = { ...PREVIEW, DATABASE_URL: DB };
    expect(withPreviewDefaults(env).TP_DATA_SOURCE).toBe("db");
    expect(authMode(env)).toBe("supabase");
    expect(supabasePublicConfig(env)).toEqual({ url: PREVIEW_SUPABASE_URL, key: PREVIEW_SUPABASE_PUBLISHABLE_KEY });
  });
  it("المتغيرات الصريحة تتغلب دائمًا", () => {
    const env = { ...PREVIEW, DATABASE_URL: DB, TP_DATA_SOURCE: "static", TRUEPRICE_ADMIN_PREVIEW: "off",
      NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" };
    const e = withPreviewDefaults(env);
    expect(e.TP_DATA_SOURCE).toBe("static");
    expect(e.TRUEPRICE_ADMIN_PREVIEW).toBe("off");
    expect(supabasePublicConfig(env)).toEqual({ url: "https://other.supabase.co", key: "anon-key" });
  });
  it("المفتاح المضمّن عام (publishable) وليس سريًا", () => {
    expect(PREVIEW_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")).toBe(true);
  });
});
