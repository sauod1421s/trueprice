/**
 * Supabase Auth على الخادم: الجلسة في ملفات تعريف (cookies)، والهوية لا تُقبل إلا بعد التحقق
 * من توقيع الرمز عبر getClaims() (مفاتيح المشروع العامة JWKS)، لا من getSession().
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabasePublicConfig } from "./config";

export async function supabaseServer() {
  const cfg = supabasePublicConfig();
  if (!cfg) throw new Error("Supabase Auth غير مضبوط (NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  const store = await cookies();
  return createServerClient(cfg.url, cfg.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // مكوّنات الخادم لا تكتب ملفات التعريف؛ التحديث يتم في proxy.ts والعمليات (Server Actions)
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
  });
}

export type VerifiedIdentity = { sub: string; aal: "aal1" | "aal2"; email: string | null };

/** الهوية بعد التحقق من التوقيع، أو null */
export async function supabaseIdentity(): Promise<VerifiedIdentity | null> {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getClaims();
  if (error || !data?.claims) return null;
  const c = data.claims as Record<string, unknown>;
  if (typeof c.sub !== "string" || c.role !== "authenticated") return null;
  if (!/^[0-9a-f-]{36}$/i.test(c.sub)) return null;
  return { sub: c.sub, aal: c.aal === "aal2" ? "aal2" : "aal1", email: typeof c.email === "string" ? c.email : null };
}
