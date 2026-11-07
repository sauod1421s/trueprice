#!/usr/bin/env node
/**
 * يتحقق من db/supabase/setup_all.sql كما سيُنفَّذ في Supabase SQL Editor:
 * نص واحد يُرسل دفعة واحدة، بدور ترحيل غير مدير (supa_postgres يحاكي postgres في Supabase)،
 * على قاعدة PostgreSQL مؤقتة جديدة (.local/pgverify — تُحذف وتُنشأ من جديد في كل تشغيل).
 *
 * الحالات:
 *   1) بلا مستخدمين في auth.users → يتوقف قبل أي تغيير (لا مخطط tp).
 *   2) ثلاثة مستخدمين → يتوقف قبل أي تغيير.
 *   3) مستخدم واحد → ينجح بمشرف واحد. مستخدمان → ينجح: 0 مخالفات صلاحيات، 52 + 357 منتجًا، 283 سعرًا مرجعيًا، 0 توثيق،
 *      المشرفان بالترتيب، وكلمة مرور tp_app المعروضة تعمل فعلًا.
 *   4) إعادة التشغيل → تنجح بلا تكرار، وتدوّر كلمة المرور.
 *   5) البنية مطابقة لتطبيق الملفات منفصلة (البصمة: الجداول والدوال والصلاحيات والسياسات).
 *   6) ملف التراجع: يرفض بلا تأكيد، ويحذف كل شيء عند التأكيد دون مس auth.users، ثم يعمل الإعداد من جديد.
 *
 * لا يلمس Supabase ولا القاعدة المحلية الأساسية (.local/pgdata).
 */
import { randomBytes } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { buildSetupAll } from "./build-setup-all.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = join(ROOT, ".local/pgverify");
const PORT = Number(process.env.TP_VERIFY_PORT || 54339);
const SU_PW = randomBytes(18).toString("base64url");
const MIG_PW = randomBytes(18).toString("base64url");

const SETUP = readFileSync(join(ROOT, "db/supabase/setup_all.sql"), "utf8");
if (SETUP !== buildSetupAll()) {
  console.error("✗ setup_all.sql لا يطابق المصادر — شغّل npm run db:setup-all");
  process.exit(1);
}

let failures = 0;
const ok = (cond, label, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};

const client = (user, password, database) =>
  new pg.Client({ host: "127.0.0.1", port: PORT, user, password, database });

async function withClient(user, password, database, fn) {
  const c = client(user, password, database);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function freshDb(name) {
  await withClient("postgres", SU_PW, "postgres", (c) => c.query(`create database ${name}`));
  await withClient("postgres", SU_PW, name, async (c) => {
    await c.query(readFileSync(join(ROOT, "db/local/000_supabase_shim.sql"), "utf8"));
    await c.query(`alter role supa_postgres password '${MIG_PW}'`);
  });
}

const su = (db, sql, params) => withClient("postgres", SU_PW, db, (c) => c.query(sql, params));

/** يحاكي SQL Editor: النص كاملًا في استعلام واحد (بروتوكول بسيط)، والنتيجة المعروضة هي الأخيرة */
async function runSetup(db) {
  return withClient("supa_postgres", MIG_PW, db, async (c) => {
    try {
      const res = await c.query(SETUP);
      const list = Array.isArray(res) ? res : [res];
      return { ok: true, row: list[list.length - 1].rows[0] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

const FINGERPRINT = `
select md5(string_agg(x, E'\\n' order by x)) as fp, count(*) as n from (
  select format('rel %s.%s %s acl=%s rls=%s owner=%s', n.nspname, c.relname, c.relkind,
                (select string_agg(a::text, ',' order by a::text) from unnest(c.relacl) a), c.relrowsecurity,
                pg_get_userbyid(c.relowner))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('tp','pub','admin_api','ingest_api')
  union all
  select format('fn %s.%s(%s) %s acl=%s owner=%s secdef=%s cfg=%s', n.nspname, p.proname,
                pg_get_function_identity_arguments(p.oid), md5(p.prosrc),
                (select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a), pg_get_userbyid(p.proowner),
                p.prosecdef, p.proconfig)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('tp','pub','admin_api','ingest_api')
  union all
  select format('pol %s.%s %s %s %s %s', schemaname, tablename, policyname, roles, cmd, md5(coalesce(qual,'') || coalesce(with_check,'')))
    from pg_policies where schemaname in ('tp','pub','admin_api','ingest_api')
  union all
  select format('nsp %s acl=%s owner=%s', nspname,
                (select string_agg(a::text, ',' order by a::text) from unnest(nspacl) a), pg_get_userbyid(nspowner))
    from pg_namespace where nspname in ('tp','pub','admin_api','ingest_api')
) s(x)`;

async function main() {
  rmSync(DIR, { recursive: true, force: true });
  const pgc = new EmbeddedPostgres({
    databaseDir: DIR, user: "postgres", password: SU_PW, port: PORT, persistent: false,
    authMethod: "scram-sha-256", initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-c", "listen_addresses=127.0.0.1", "-c", "timezone=UTC"], onLog: () => {},
  });
  await pgc.initialise();
  await pgc.start();
  try {
    console.log(`setup_all.sql: ${Buffer.byteLength(SETUP)} bytes — دور الترحيل غير مدير (supa_postgres)`);

    // 1) بلا مستخدمين
    await freshDb("v_empty");
    let r = await runSetup("v_empty");
    ok(!r.ok && /لا يوجد أي مستخدم/.test(r.error), "بلا مستخدمين: يتوقف برسالة واضحة", r.ok ? "نجح خطأً" : "");
    let tp = await su("v_empty", "select to_regnamespace('tp') is not null as has_tp");
    ok(!tp.rows[0].has_tp, "بلا مستخدمين: لم يُنشأ أي شيء (لا مخطط tp)");

    // 2) ثلاثة مستخدمين
    await freshDb("v_three");
    await su("v_three", `insert into auth.users (id, email) select gen_random_uuid(), 'u' || g || '@test.invalid' from generate_series(1,3) g`);
    r = await runSetup("v_three");
    ok(!r.ok && /يوجد 3 مستخدمين/.test(r.error), "ثلاثة مستخدمين: يتوقف قبل أي تغيير");
    tp = await su("v_three", "select to_regnamespace('tp') is not null as has_tp");
    ok(!tp.rows[0].has_tp, "ثلاثة مستخدمين: لم يُنشأ أي شيء");

    // 3أ) مستخدم واحد → نجاح بمشرف واحد (منح تهيئة بلا مانح)
    await freshDb("v_one");
    await su("v_one", `insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000d001', 'solo@test.invalid')`);
    r = await runSetup("v_one");
    ok(r.ok && r.row.admins === "solo@test.invalid" && Number(r.row.privilege_violations_expect_0) === 0
       && Number(r.row.electronics_expect_52) === 52,
       "مستخدم واحد: ينجح بمشرف واحد و0 مخالفات", r.ok ? r.row.admins : r.error);

    // 3) مستخدمان → نجاح
    await freshDb("v_two");
    await su("v_two", `insert into auth.users (id, email, created_at) values
      ('00000000-0000-4000-8000-00000000c001', 'first.admin@test.invalid', now() - interval '2 minutes'),
      ('00000000-0000-4000-8000-00000000c002', 'second.admin@test.invalid', now() - interval '1 minute')`);
    const t0 = Date.now();
    r = await runSetup("v_two");
    ok(r.ok, "مستخدمان: التنفيذ الكامل نجح", r.ok ? `${Date.now() - t0} ms` : r.error);
    if (!r.ok) throw new Error("توقف التحقق");
    const row = r.row;
    ok(Number(row.privilege_violations_expect_0) === 0, "فاحص الصلاحيات = 0", String(row.privilege_violations_expect_0));
    ok(Number(row.electronics_expect_52) === 52, "52 منتجًا إلكترونيًا", String(row.electronics_expect_52));
    ok(Number(row.cars_expect_357) === 357, "357 سيارة", String(row.cars_expect_357));
    ok(Number(row.legacy_prices_expect_283) === 283, "283 سعرًا مرجعيًا", String(row.legacy_prices_expect_283));
    ok(Number(row.verified_expect_0) === 0, "0 قرار توثيق آلي", String(row.verified_expect_0));
    ok(row.admins === "first.admin@test.invalid, second.admin@test.invalid", "المشرفان بالترتيب", row.admins);
    ok(/003-visitors-requests/.test(row.migrations) && /mvp-overlay/.test(row.migrations), "سجل الترحيل يتضمن 001/002/003", row.migrations);
    const m = /^postgresql:\/\/tp_app\.xlpzfnespldgaxkgskkg:([0-9a-f]{64})@[a-z0-9.-]+\.pooler\.supabase\.com:6543\/postgres$/.exec(
      row.database_url ?? "");
    ok(Boolean(m), "database_url بالشكل الصحيح (tp_app.<ref>، المنفذ 6543، كلمة مرور 64 خانة)");
    const pw1 = m?.[1];
    if (pw1) {
      const who = await withClient("tp_app", pw1, "v_two", (c) => c.query("select current_user as u"));
      ok(who.rows[0].u === "tp_app", "كلمة مرور tp_app المعروضة تعمل فعلًا");
    }
    const boot = await su("v_two", "select cardinality(admins) as n from tp.bootstrap_state");
    ok(boot.rowCount === 1 && boot.rows[0].n === 2, "التهيئة: صف واحد بمشرفَين");
    const grants = await su("v_two", `select count(*) filter (where granted_via = 'grant' and granted_by is not null) as cross_granted
      from tp.user_roles where role_id = 'admin'`);
    ok(Number(grants.rows[0].cross_granted) === 2, "كل مشرف منحه الآخر (لا منح ذاتي)");
    const pubLeak = await su("v_two", "select count(*) as n from pub.electronics_offers");
    ok(Number(pubLeak.rows[0].n) === 0, "لا سعر قديم يظهر كسعر معتمد (pub.electronics_offers = 0)");

    // 4) إعادة التشغيل
    const audit1 = await su("v_two", "select count(*) as n from tp.products");
    r = await runSetup("v_two");
    ok(r.ok, "إعادة التشغيل نجحت", r.ok ? "" : r.error);
    const audit2 = await su("v_two", "select count(*) as n from tp.products");
    ok(audit1.rows[0].n === audit2.rows[0].n, "إعادة التشغيل لا تكرر المنتجات");
    const pw2 = /:([0-9a-f]{64})@/.exec(r.row?.database_url ?? "")?.[1];
    ok(Boolean(pw2) && pw2 !== pw1, "إعادة التشغيل تدوّر كلمة مرور tp_app");
    if (pw1) {
      let oldWorks = true;
      try {
        await withClient("tp_app", pw1, "v_two", (c) => c.query("select 1"));
      } catch {
        oldWorks = false;
      }
      ok(!oldWorks, "كلمة المرور القديمة لم تعد تعمل بعد التدوير");
    }

    // 5) مطابقة البنية مع تطبيق الملفات منفصلة بنفس الدور
    await freshDb("v_files");
    await su("v_files", `insert into auth.users (id, email, created_at) values
      ('00000000-0000-4000-8000-00000000c001', 'first.admin@test.invalid', now() - interval '2 minutes'),
      ('00000000-0000-4000-8000-00000000c002', 'second.admin@test.invalid', now() - interval '1 minute')`);
    await withClient("supa_postgres", MIG_PW, "v_files", async (c) => {
      for (const f of ["db/schema/001_trueprice_v1_1.sql", "db/mvp/002_mvp_overlay.sql",
                       "db/schema/003_visitors_requests.sql", "db/supabase/010_app_role.sql"]) {
        await c.query(readFileSync(join(ROOT, f), "utf8"));
      }
      await c.query(`select tp.bootstrap_first_admins('00000000-0000-4000-8000-00000000c001', 'first.admin',
                                                     '00000000-0000-4000-8000-00000000c002', 'second.admin')`);
      await c.query(readFileSync(join(ROOT, "db/seed/100_catalog_seed.sql"), "utf8"));
    });
    const fa = (await su("v_two", FINGERPRINT)).rows[0];
    const fb = (await su("v_files", FINGERPRINT)).rows[0];
    ok(fa.fp === fb.fp, "البنية بعد التشغيل مرتين مطابقة لتطبيق الملفات منفصلة مرة واحدة", `${fa.n} عنصرًا`);
    if (fa.fp !== fb.fp) {
      const list = FINGERPRINT.replace("select md5(string_agg(x, E'\\n' order by x)) as fp, count(*) as n from (", "select x from (");
      const la = new Set((await su("v_two", list)).rows.map((x) => x.x));
      const lb = new Set((await su("v_files", list)).rows.map((x) => x.x));
      for (const x of la) if (!lb.has(x)) console.log("    + setup_all:", x.slice(0, 300));
      for (const x of lb) if (!la.has(x)) console.log("    - منفصلة:", x.slice(0, 300));
    }

    // 6) التراجع (db/supabase/rollback_all.sql): الحماية تمنع التشغيل بالخطأ، والتراجع المؤكد يعيد الحالة نظيفة،
    //    وحسابات auth.users تبقى، ثم يمكن الإعداد من جديد. الأدوار مشتركة في الخادم فتُحذف القواعد الأخرى أولًا.
    for (const db of ["v_empty", "v_three", "v_one", "v_files"]) {
      await withClient("postgres", SU_PW, "postgres", (c) => c.query(`drop database ${db}`));
    }
    const ROLLBACK = readFileSync(join(ROOT, "db/supabase/rollback_all.sql"), "utf8");
    const runAs = (sql) => withClient("supa_postgres", MIG_PW, "v_two", async (c) => {
      try {
        const res = await c.query(sql);
        const list = Array.isArray(res) ? res : [res];
        return { ok: true, row: list.filter((x) => x.rows?.length).pop()?.rows[0] };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    r = await runAs(ROLLBACK);
    const still = await su("v_two", "select count(*) as n from tp.products");
    ok(!r.ok && /لم يُؤكَّد التراجع/.test(r.error) && Number(still.rows[0].n) === 409,
       "التراجع بلا تأكيد: يرفض ولا يحذف شيئًا");
    const confirmed = ROLLBACK.replace("v_confirm text := 'لا';", "v_confirm text := 'نعم-احذف-trueprice';");
    ok(confirmed !== ROLLBACK, "سطر التأكيد موجود في ملف التراجع");
    r = await runAs(confirmed);
    ok(r.ok && Number(r.row?.schemas_left_expect_0) === 0 && Number(r.row?.roles_left_expect_0) === 0,
       "التراجع المؤكد: لا مخططات ولا أدوار TruePrice", r.ok ? "" : r.error);
    const usersLeft = await su("v_two", "select count(*) as n from auth.users");
    ok(Number(usersLeft.rows[0].n) === 2, "التراجع لا يمس حسابات auth.users");
    r = await runSetup("v_two");
    ok(r.ok && Number(r.row.electronics_expect_52) === 52 && Number(r.row.privilege_violations_expect_0) === 0,
       "بعد التراجع: الإعداد من جديد ينجح", r.ok ? "" : r.error);
  } finally {
    await pgc.stop();
    rmSync(DIR, { recursive: true, force: true });
  }
  console.log(failures ? `\n✗ ${failures} فحص فشل` : "\n✓ كل الفحوص نجحت");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
