#!/usr/bin/env node
/**
 * فحص جاهزية القاعدة قبل بناء معاينة Vercel — فرع mvp-live-preview فقط (يعمل تلقائيًا قبل next build).
 *
 * إن كان DATABASE_URL مضبوطًا للمعاينة، يتصل بنفس طريقة الموقع (tp_app → web_reader / authenticated،
 * تحقق TLS كامل بشهادات Supabase الجذرية) ويتأكد أن ملف الإعداد طُبّق. أي خلل يُفشل البناء برمز واضح
 * بدل نشر موقع لا يعمل، وتبقى المعاينة السابقة كما هي. لا يطبع أي سر (لا رابط ولا كلمة مرور ولا نص خطأ خام).
 *
 * في أي مكان آخر (الإنتاج، CI، محليًا، فروع أخرى) لا يفعل شيئًا.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import pg from "pg";

const env = process.env;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

if (!(env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "mvp-live-preview")) process.exit(0);
if (!env.DATABASE_URL) {
  console.log("predeploy: DATABASE_URL غير مضبوط — المعاينة تعمل بالوضع العادي (بيانات الموقع الحالية، بلا قاعدة)");
  process.exit(0);
}
if (env.TP_DATA_SOURCE && env.TP_DATA_SOURCE !== "db") {
  console.log(`predeploy: TP_DATA_SOURCE=${env.TP_DATA_SOURCE} — لا فحص للقاعدة`);
  process.exit(0);
}

const HINTS = {
  config: "رابط DATABASE_URL غير صالح — انسخه كما هو من نتيجة setup_all.sql",
  dns: "اسم الخادم في DATABASE_URL غير موجود — طابقه مع Supabase → Connect → Transaction pooler",
  tenant_not_found: "خادم Supavisor أو اسم المستخدم لا يطابق المشروع — طابق اسم الخادم مع Connect → Transaction pooler (aws-0 أو aws-1)",
  auth_failed: "كلمة مرور tp_app خاطئة أو دُوّرت — انسخ database_url من آخر تشغيل لـ setup_all.sql",
  tls: "فشل التحقق من شهادة الخادم — ضع شهادة Supabase في DATABASE_CA_CERT",
  timeout: "انتهت المهلة — قد يكون المشروع متوقفًا مؤقتًا (Paused) في Supabase",
  network: "تعذر الوصول للخادم — تحقق من رقم المنفذ 6543 في الرابط",
  schema_missing: "ملف الإعداد setup_all.sql لم يُنفَّذ بعد في Supabase",
  permission: "الصلاحيات لا تطابق المتوقع — أعد تشغيل setup_all.sql",
  unknown: "خطأ غير معروف — راجع Supabase → Logs",
};

function classify(e) {
  const code = typeof e?.code === "string" ? e.code : "";
  const msg = typeof e?.message === "string" ? e.message : "";
  if (e instanceof TypeError && /Invalid URL/i.test(msg)) return "config";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (code === "ETIMEDOUT" || /timeout/i.test(msg)) return "timeout";
  if (["ECONNREFUSED", "ECONNRESET", "EPIPE", "EHOSTUNREACH"].includes(code)) return "network";
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/.test(code) || /certificate/i.test(msg)) return "tls";
  if (code === "28P01" || code === "28000") return "auth_failed";
  if (/tenant or user not found/i.test(msg)) return "tenant_not_found";
  if (["3F000", "42P01", "42704", "22023"].includes(code)) return "schema_missing";
  if (code === "42501") return "permission";
  return "unknown";
}

let client;
try {
  const url = new URL(env.DATABASE_URL);
  for (const p of ["sslmode", "sslcert", "sslkey", "sslrootcert", "sslpassword", "uselibpqcompat"]) url.searchParams.delete(p);
  const host = url.hostname;
  const roots = JSON.parse(readFileSync(join(ROOT, "app/lib/db/supabase-root-cas.json"), "utf8")).certs.map((c) => c.pem);
  const extra = (env.DATABASE_CA_CERT ?? "").replace(/\\n/g, "\n").trim();
  client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 15_000,
    application_name: "trueprice-predeploy",
    // محليًا (للاختبار فقط) بلا SSL كما في app/lib/db/connection.ts؛ غير ذلك تحقق كامل دائمًا
    ssl: ["127.0.0.1", "localhost", "::1"].includes(host) ? undefined : {
      ca: [...(extra ? [extra] : []), ...(/(^|\.)supabase\.(co|com)$/i.test(host) ? roots : []), ...tls.rootCertificates],
      rejectUnauthorized: true,
      servername: host,
    },
  });
  await client.connect();
  await client.query("begin; set local statement_timeout = '8s'; set local role web_reader");
  const r = await client.query(`select
      (select count(*) from pub.products)::int as products,
      (select count(*) from pub.categories)::int as categories,
      (select count(*) from pub.site_contact)::int >= 0 as contact_view`);
  await client.query("rollback");
  await client.query("begin; set local role authenticated; rollback");
  const k = r.rows[0];
  if (!(k.products > 0 && k.categories > 0)) {
    console.error(`predeploy: ✗ القاعدة متصلة لكنها بلا منتجات ظاهرة (products=${k.products}) — ${HINTS.schema_missing}`);
    process.exit(1);
  }
  console.log(`predeploy: ✓ القاعدة جاهزة ومتصلة${client.ssl ? " بتحقق TLS كامل" : " (محلي بلا TLS)"} — ${k.products} منتجًا ظاهرًا، ${k.categories} تصنيفًا`);
} catch (e) {
  const reason = classify(e);
  console.error(`predeploy: ✗ فحص القاعدة فشل — reason=${reason}: ${HINTS[reason]}`);
  process.exit(1);
} finally {
  await client?.end().catch(() => {});
}
