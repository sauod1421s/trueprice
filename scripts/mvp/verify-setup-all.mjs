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
    ok(/003-visitors-requests/.test(row.migrations) && /mvp-overlay/.test(row.migrations) && /004-assisted-research/.test(row.migrations),
       "سجل الترحيل يتضمن 001/002/003/004", row.migrations);
    const rs = await su("v_two", "select count(*)::int as n from tp.sources where kind = 'assisted_research' and status = 'approved' and approved_by = '00000000-0000-4000-8000-00000000c001'");
    ok(rs.rows[0].n === 2, "مصدرا مساعد الرصد معتمدان باسم أول مشرف");
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

    // 3ب) RLS: كل جدول ينشئه الملف عليه RLS بعد التشغيل (42 عبر الحلقة في 001 + 7 بأوامر صريحة في 002/003)،
    //     ولا صلاحية لـ anon/public/service_role على أي جدول في مخططاتنا
    const created = [...SETUP.matchAll(/create\s+table\s+if\s+not\s+exists\s+tp\.(\w+)/gi)].map((x) => x[1]);
    const rlsInfo = await su("v_two", `select count(*)::int as n, count(*) filter (where relrowsecurity)::int as rls,
        array_agg(relname::text) filter (where not relrowsecurity) as missing
      from pg_class where relnamespace = 'tp'::regnamespace and relkind = 'r'`);
    ok(rlsInfo.rows[0].n === new Set(created).size && rlsInfo.rows[0].rls === rlsInfo.rows[0].n,
       "RLS مفعّل على كل جداول tp التي ينشئها الملف", `${rlsInfo.rows[0].rls}/${rlsInfo.rows[0].n}`);
    const anonGrants = await su("v_two", `select count(*)::int as n from information_schema.role_table_grants
      where table_schema in ('tp','pub','admin_api','ingest_api') and grantee in ('anon','PUBLIC','service_role')`);
    ok(anonGrants.rows[0].n === 0, "لا صلاحية لـ anon/public/service_role على جداول وواجهات المشروع");

    // 3ج) محاكاة زر Supabase «Run and enable RLS»: يُلحق ALTER TABLE ... ENABLE ROW LEVEL SECURITY في آخر النص
    //     للجداول التي لا يرى لها أمرًا صريحًا (42 جدولًا من 001). النتيجة: لا تغيير في القاعدة (RLS مفعّل أصلًا)،
    //     لكن آخر نتيجة تصبح ALTER بلا صفوف، فيختفي صف database_url من الشاشة.
    const explicit = new Set([...SETUP.matchAll(/alter\s+table\s+tp\.(\w+)\s+enable\s+row\s+level\s+security/gi)].map((x) => x[1]));
    const flagged = [...new Set(created)].filter((t) => !explicit.has(t));
    await freshDb("v_studio");
    await su("v_studio", `insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000e001', 'studio@test.invalid')`);
    const studioSql = SETUP.replace(/\s+$/, "") +
      "\n\n-- Added by Supabase: enable Row Level Security on newly created tables\n" +
      flagged.map((t) => `ALTER TABLE tp.${t} ENABLE ROW LEVEL SECURITY;`).join("\n") + "\n";
    const studioRun = await withClient("supa_postgres", MIG_PW, "v_studio", async (c) => {
      try {
        const res = await c.query(studioSql);
        const list = Array.isArray(res) ? res : [res];
        return { ok: true, last: list[list.length - 1] };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
    ok(studioRun.ok, `«Run and enable RLS»: ينجح بلا أخطاء (${flagged.length} أمر ALTER مكرر)`, studioRun.ok ? "" : studioRun.error);
    ok(studioRun.ok && !studioRun.last.rows?.length, "«Run and enable RLS»: آخر نتيجة بلا صفوف — صف database_url لا يظهر في الشاشة");
    const fs1 = (await su("v_studio", FINGERPRINT)).rows[0].fp;
    const fs2 = (await su("v_two", FINGERPRINT)).rows[0].fp;
    ok(fs1 === fs2, "«Run and enable RLS»: البنية والصلاحيات مطابقة تمامًا للتشغيل العادي (لا يضيف حماية جديدة)");
    await withClient("postgres", SU_PW, "postgres", (c) => c.query("drop database v_studio"));

    // 3د) ما خارج نطاق TruePrice: لقطة قبل/بعد على قاعدة تحاكي مشروعنا (مخطط tp_migrate بثلاثة أجزاء نصية،
    //     ومحتوى سابق في public، وحسابات auth.users). المسموح تغيّره فقط: الأدوار الجديدة وعضوياتها، صلاحية
    //     الاتصال لـ tp_app، تشديد الامتيازات الافتراضية لدور الترحيل، وحاوية imports الخاصة وسياستاها.
    await freshDb("v_scope");
    await su("v_scope", `insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000f001', 'scope@test.invalid')`);
    await withClient("supa_postgres", MIG_PW, "v_scope", (c) => c.query(`
      create schema tp_migrate;
      create table tp_migrate.chunks (file text, n int, body text, added_at timestamptz default now(), primary key (file, n));
      alter table tp_migrate.chunks enable row level security;
      revoke all on schema tp_migrate from public, anon, authenticated, service_role;
      revoke all on tp_migrate.chunks from public, anon, authenticated, service_role;
      insert into tp_migrate.chunks (file, n, body) select '001', g, repeat(md5(g::text), 500) from generate_series(1, 3) g;
      create table public.preexisting (id int primary key);
      create function public.preexisting_fn() returns int language sql as 'select 1';`));
    const SNAP = `
      select 'tp_migrate.data ' || md5(string_agg(file || n || body, '|' order by file, n)) from tp_migrate.chunks
      union all select 'tp_migrate.acl ' || coalesce(array_to_string(relacl, ','), '-') || ' rls=' || relrowsecurity
        from pg_class where oid = 'tp_migrate.chunks'::regclass
      union all select 'tp_migrate.schema_acl ' || coalesce(array_to_string(nspacl, ','), '-') from pg_namespace where nspname = 'tp_migrate'
      union all select 'public.rel ' || relname || ' ' || relkind::text || ' ' || coalesce(array_to_string(relacl, ','), '-')
        from pg_class where relnamespace = 'public'::regnamespace
      union all select 'public.fn ' || proname || ' ' || coalesce(array_to_string(proacl, ','), '-')
        from pg_proc where pronamespace = 'public'::regnamespace
      union all select 'auth.users ' || md5(string_agg(id::text || coalesce(email, ''), '|' order by id)) from auth.users
      union all select 'default_acl ' || pg_get_userbyid(d.defaclrole) || ' ' || coalesce(n.nspname, '*') || ' ' || d.defaclobjtype::text
                       || ' ' || coalesce(array_to_string(d.defaclacl, ','), '-')
        from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
        where n.nspname is null or n.nspname not in ('tp', 'pub', 'admin_api', 'ingest_api')
      union all select 'member ' || r.rolname || ' -> ' || m.rolname || case when a.admin_option then ' (admin)' else '' end
        from pg_auth_members a join pg_roles r on r.oid = a.roleid join pg_roles m on m.oid = a.member
      union all select 'database_acl ' || coalesce(array_to_string(datacl, ','), '-') from pg_database where datname = current_database()
      union all select 'storage.bucket ' || id || ' public=' || public from storage.buckets
      union all select 'storage.policy ' || policyname from pg_policies where schemaname = 'storage'
      union all select 'schema ' || nspname from pg_namespace where nspname not like 'pg\\_%' and nspname <> 'information_schema'`;
    const snap = async () => new Set((await su("v_scope", SNAP)).rows.map((x) => Object.values(x)[0]));
    const before = await snap();
    r = await runSetup("v_scope");
    // فاحص الصلاحيات صارم على القاعدة كلها: يبلّغ عن الدالة السابقة في public (قابلة للتنفيذ من anon) لكنه لا يعدّلها.
    // في مشروعنا الحقيقي public فارغ (0 دوال، فُحص) فالنتيجة هناك 0.
    const vio = r.ok ? (await su("v_scope", "select kind, object from tp.privilege_violations()")).rows : [];
    ok(r.ok && vio.length === 1 && vio[0].object === "public.preexisting_fn()",
       "على قاعدة فيها tp_migrate ومحتوى سابق: الإعداد ينجح (والفاحص يبلّغ فقط عن دالة public السابقة دون تعديلها)",
       r.ok ? JSON.stringify(vio) : r.error);
    const after = await snap();
    const removed = [...before].filter((x) => !after.has(x));
    const added = [...after].filter((x) => !before.has(x));
    const keep = (prefix) => [...before].filter((x) => x.startsWith(prefix)).every((x) => after.has(x));
    ok(keep("tp_migrate."), "tp_migrate: الأجزاء الثلاثة وصلاحياتها وRLS كما هي تمامًا");
    ok(keep("public.") && keep("auth.users"), "public وauth.users: بلا أي تغيير");
    const ourRoles = /(tp_owner|web_reader|ingest_service|tp_app)/;
    const allowedAdded = (x) =>
      (x.startsWith("member ") && ourRoles.test(x)) || x.startsWith("database_acl ") || x.startsWith("default_acl supa_postgres ") || x.startsWith("default_acl tp_owner ") ||
      x === "storage.bucket imports public=false" || x === "storage.policy tp_imports_insert" || x === "storage.policy tp_imports_read" ||
      ["schema tp", "schema pub", "schema admin_api", "schema ingest_api"].includes(x);
    const allowedRemoved = (x) => x.startsWith("database_acl ") || x.startsWith("default_acl supa_postgres ");
    ok(added.every(allowedAdded) && removed.every(allowedRemoved), "خارج النطاق: لا تغيير إلا المتوقع (أدوار المشروع، اتصال tp_app، تشديد افتراضي، حاوية imports)",
       [...removed.filter((x) => !allowedRemoved(x)).map((x) => "- " + x), ...added.filter((x) => !allowedAdded(x)).map((x) => "+ " + x)].join(" | "));
    console.log("    تغييرات خارج مخططات TruePrice:");
    for (const x of removed) console.log("      - " + x);
    for (const x of added) console.log("      + " + x);
    console.log("      (database_acl بعد: " + [...after].filter((x) => x.startsWith("database_acl")).join() + ")");
    await withClient("postgres", SU_PW, "postgres", (c) => c.query("drop database v_scope"));

    // 3هـ) مسار مساعد الرصد (004): استيراد عبر مسار الخدمة كما يُنفَّذ من موصل Supabase بدور postgres،
    //      يدخل غير موثق ولا يظهر، الاعتماد يشترط دليلًا، ويُعتمد من مشرف (المُدخل ليس هو)، ثم يظهر.
    {
      const { execFileSync } = await import("node:child_process");
      const { writeFileSync, mkdtempSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const dir = mkdtempSync(join(tmpdir(), "tp-ledger-"));
      const ledger = join(dir, "ledger.csv");
      const pid = (await su("v_two", "select id from tp.products where legacy_id = 1")).rows[0].id;
      const now = new Date(Date.now() - 60_000).toLocaleString("sv-SE", { timeZone: "Asia/Riyadh" }).replace(" ", "T").slice(0, 16) + "+03:00";
      writeFileSync(ledger, "product_id,product_name,store_id,price_sar,list_price_sar,url,observed_at,availability,vat_included,match,notes\n" +
        ["apple:3799", "jarir:3849", "extra:3899"].map((x) => {
          const [st, pr] = x.split(":");
          return `${pid},iPhone 17 256GB,${st},${pr},,https://example.com/${st}/iphone-17-256gb,${now},in_stock,yes,iPhone 17 / 256GB,اختبار محلي`;
        }).join("\n") + "\n");
      const sql = execFileSync("node", [join(ROOT, "scripts/research/ledger-to-sql.mjs"), ledger, "electronics"], { encoding: "utf8" });
      const imp = await withClient("supa_postgres", MIG_PW, "v_two", async (c) => {
        try { const res = await c.query(sql); const l = Array.isArray(res) ? res : [res]; return { ok: true, row: l[l.length - 1].rows[0] }; }
        catch (e) { return { ok: false, error: e.message }; }
      });
      ok(imp.ok && imp.row?.status === "committed" && Number(imp.row?.observations) === 3, "مساعد الرصد: الاستيراد عبر مسار الخدمة نجح (3 أسعار)", imp.ok ? "" : imp.error);
      const pubBefore = (await su("v_two", "select count(*)::int as n from pub.electronics_offers where product_id = $1", [pid])).rows[0].n;
      ok(pubBefore === 0, "مساعد الرصد: لا يظهر أي سعر في الموقع قبل الاعتماد");
      const asAdmin = (q, params) => withClient("postgres", SU_PW, "v_two", async (c) => {
        await c.query("begin");
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: "00000000-0000-4000-8000-00000000c001", role: "authenticated", aal: "aal2" })]);
        await c.query("set local role authenticated");
        try { const r = await c.query(q, params); await c.query("commit"); return { ok: true, rows: r.rows }; }
        catch (e) { await c.query("rollback"); return { ok: false, error: e.message }; }
      });
      const ids = (await su("v_two", "select o.id, o.url from tp.price_observations o join tp.offer_streams os on os.id = o.stream_id where os.offer_key like 'research-%' order by o.id")).rows;
      const noEvidence = await asAdmin("select admin_api.verify_observation($1, 'verified')", [ids[0].id]);
      ok(!noEvidence.ok && /evidence_url/.test(noEvidence.error), "مساعد الرصد: الاعتماد بلا رابط دليل مرفوض");
      let allOk = true;
      for (const o of ids) allOk = (await asAdmin("select admin_api.verify_observation($1, 'verified', null, null, 'فُتح الرابط وطابق', $2)", [o.id, o.url])).ok && allOk;
      ok(allOk, "مساعد الرصد: المشرف يعتمد (المُدخل خدمة لا مستخدم، فلا مراجعة ذاتية)");
      const pubAfter = (await su("v_two", "select count(*)::int as n from pub.electronics_offers where product_id = $1", [pid])).rows[0].n;
      ok(pubAfter === 3, "مساعد الرصد: بعد الاعتماد تظهر الأسعار الثلاثة في الموقع", String(pubAfter));
      await su("v_two", "update tp.sources set status = 'suspended' where id = 'assisted-research-electronics'");
      const blocked = await withClient("supa_postgres", MIG_PW, "v_two", async (c) => {
        try { await c.query(sql.replace(/sha256=[0-9a-f]{64}/, "x").replace(/'[0-9a-f]{64}'/g, `'${"0".repeat(64)}'`)); return false; } catch { return true; }
      });
      ok(blocked, "مساعد الرصد: تعليق المصدر يوقف أي استيراد جديد فورًا");
      await su("v_two", "update tp.sources set status = 'approved' where id = 'assisted-research-electronics'");
    }

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
      await c.query(readFileSync(join(ROOT, "db/schema/004_assisted_research.sql"), "utf8"));
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
