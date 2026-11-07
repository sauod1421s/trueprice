/**
 * إعداد اتصال PostgreSQL (بلا أسرار في الكود): محلي أو Supabase عبر Supavisor.
 *
 * - DATABASE_URL: سري، على الخادم فقط (لا يبدأ بـ NEXT_PUBLIC_). في Supabase:
 *   postgresql://tp_app.<project-ref>:<password>@<pooler-host>:6543/postgres  (وضع المعاملات)
 * - DATABASE_CA_CERT: شهادة Supabase العامة (PEM) من Database Settings → SSL Configuration.
 *   ليست سرًا، لكنها مطلوبة للتحقق من هوية الخادم (verify-full). بدونها يرفض الاتصال بخادم بعيد،
 *   ولا نعود أبدًا إلى تشفير بلا تحقق (rejectUnauthorized: false).
 * - إعدادات الجلسة (statement_timeout...) تُضبط داخل كل معاملة لا في رسالة البدء، لأن وضع
 *   المعاملات في Supavisor لا يحفظ حالة الجلسة بين الاستعلامات.
 */
import type { PoolConfig } from "pg";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SSL_URL_PARAMS = ["sslmode", "sslcert", "sslkey", "sslrootcert", "sslpassword", "uselibpqcompat"];

export class DbConfigError extends Error {}

export function poolConfig(env: Record<string, string | undefined> = process.env): PoolConfig {
  const raw = env.DATABASE_URL ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DbConfigError("DATABASE_URL غير صالح");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new DbConfigError("DATABASE_URL يجب أن يبدأ بـ postgresql://");
  }
  // معاملات SSL في الرابط تتغلب على إعدادنا في مكتبة pg، فنحذفها ونضبط SSL صراحة
  for (const p of SSL_URL_PARAMS) url.searchParams.delete(p);

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local = LOCAL_HOSTS.has(host);
  const max = Math.min(Math.max(Number(env.TP_DB_POOL_MAX ?? (local ? 5 : 3)) || 3, 1), 10);
  const config: PoolConfig = {
    connectionString: url.toString(),
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    application_name: "trueprice",
  };
  if (!local) {
    const ca = (env.DATABASE_CA_CERT ?? "").replace(/\\n/g, "\n").trim();
    if (!ca.includes("-----BEGIN CERTIFICATE-----")) {
      throw new DbConfigError(
        "الاتصال بقاعدة بعيدة يتطلب DATABASE_CA_CERT (شهادة Supabase من Database Settings → SSL Configuration)"
      );
    }
    config.ssl = { ca, rejectUnauthorized: true, servername: host };
  }
  return config;
}

/** أوامر تُنفَّذ أول كل معاملة (تعمل عبر Supavisor بوضع المعاملات) */
export const TRANSACTION_SETTINGS = [
  "set local statement_timeout = '8s'",
  "set local lock_timeout = '5s'",
  "set local idle_in_transaction_session_timeout = '15s'",
] as const;
