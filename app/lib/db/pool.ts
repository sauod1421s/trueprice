/**
 * اتصال قاعدة البيانات (وضع MVP فقط — TP_DATA_SOURCE=db).
 *
 * الخادم يتصل بدور tp_app الذي لا يملك أي صلاحية بنفسه، ثم يتحول داخل كل معاملة:
 *   - web_reader  → الموقع العام: مخطط pub فقط (أسعار منشورة وموثقة فقط)
 *   - authenticated + request.jwt.claims → لوحة الإدارة: RLS ودوال admin_api
 * هذا نفس نموذج Supabase (authenticator ← anon/authenticated)، فلا تتغير قواعد
 * الصلاحيات في القاعدة عند الانتقال إلى Supabase لاحقًا.
 */
import "server-only";
import { Pool, type PoolClient } from "pg";
import { poolConfig, TRANSACTION_SETTINGS } from "./connection";

declare global {
  var __tpPool: Pool | undefined;
}

export function databaseConfigured(): boolean {
  return process.env.TP_DATA_SOURCE === "db" && !!process.env.DATABASE_URL;
}

function pool(): Pool {
  if (!databaseConfigured()) {
    throw new Error("قاعدة البيانات غير مفعّلة (TP_DATA_SOURCE=db و DATABASE_URL)");
  }
  // نفس الاتصال عبر إعادة التحميل في وضع التطوير
  if (!globalThis.__tpPool) {
    globalThis.__tpPool = new Pool(poolConfig());
  }
  return globalThis.__tpPool;
}

/** هوية المشرف كما تصل إلى القاعدة (مثل JWT في Supabase) */
export type DbClaims = { sub: string; aal: "aal1" | "aal2" };

async function inTransaction<T>(setup: (c: PoolClient) => Promise<void>, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    // ذهاب واحد إلى القاعدة: بدء المعاملة + حدودها (بروتوكول الاستعلام البسيط يقبل عدة أوامر)
    await client.query(["begin", ...TRANSACTION_SETTINGS].join("; "));
    await setup(client);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** قراءة الموقع العام: web_reader، قراءة فقط */
export function withPublic<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction(async (c) => {
    await c.query("set transaction read only");
    await c.query("set local role web_reader");
  }, fn);
}

/** عمليات لوحة الإدارة بهوية المستخدم: RLS + admin_api في القاعدة هي التفويض النهائي */
export function withClaims<T>(claims: DbClaims, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return inTransaction(async (c) => {
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: claims.sub, role: "authenticated", aal: claims.aal }),
    ]);
    await c.query("set local role authenticated");
  }, fn);
}

/** للاختبارات والسكربتات فقط */
export async function closePool(): Promise<void> {
  await globalThis.__tpPool?.end();
  globalThis.__tpPool = undefined;
}
