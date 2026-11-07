/**
 * إعداد اتصال PostgreSQL (بلا أسرار في الكود): محلي أو Supabase عبر Supavisor.
 *
 * - DATABASE_URL: سري، على الخادم فقط (لا يبدأ بـ NEXT_PUBLIC_). في Supabase:
 *   postgresql://tp_app.<project-ref>:<password>@<pooler-host>:6543/postgres  (وضع المعاملات)
 * - التحقق الكامل من هوية الخادم دائمًا للقاعدة البعيدة (سلسلة الشهادات + اسم الخادم)، ولا نعود أبدًا إلى
 *   تشفير بلا تحقق (rejectUnauthorized: false). خوادم Supabase موقّعة من جهة Supabase الخاصة، فشهاداتها
 *   الجذرية العامة مضمّنة (supabase-root-cas.json، من مستودع Supabase الرسمي) وتُضاف إلى جذور النظام.
 * - DATABASE_CA_CERT (اختياري): شهادة PEM إضافية — لو غيّر Supabase جهة التوقيع مستقبلًا.
 * - إعدادات الجلسة (statement_timeout...) تُضبط داخل كل معاملة لا في رسالة البدء، لأن وضع
 *   المعاملات في Supavisor لا يحفظ حالة الجلسة بين الاستعلامات.
 */
import tls from "node:tls";
import type { PoolConfig } from "pg";
import supabaseRoots from "./supabase-root-cas.json";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SUPABASE_HOST = /(^|\.)supabase\.(co|com)$/i;
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
    const extra = (env.DATABASE_CA_CERT ?? "").replace(/\\n/g, "\n").trim();
    if (extra && !extra.includes("-----BEGIN CERTIFICATE-----")) {
      throw new DbConfigError("DATABASE_CA_CERT ليس شهادة PEM صالحة");
    }
    const ca = [
      ...(extra ? [extra] : []),
      ...(SUPABASE_HOST.test(host) ? supabaseRoots.certs.map((c) => c.pem) : []),
      ...tls.rootCertificates,
    ];
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
