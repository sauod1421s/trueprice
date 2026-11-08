#!/usr/bin/env node
/**
 * اختبار 004 (مساعد الرصد) على نسخة مطابقة لقاعدة TruePrice في Supabase قبل أي تنفيذ هناك.
 *
 * النسخة: PostgreSQL 17 + محاكاة Supabase (db/local/000_supabase_shim.sql) + نفس ملف الإعداد الذي نُفّذ في الإنتاج
 * (db/supabase/setup_all.sql) بدور ترحيل غير مدير، + حساب مشرف واحد، + مخطط tp_migrate بثلاثة أجزاء كما في الإنتاج.
 * بصمة البنية (scripts/mvp/fingerprint.sql) تُقارن ببصمة الإنتاج (TP_PROD_FINGERPRINT) لإثبات التطابق.
 *
 * يختبر: التطبيق كما في SQL Editor، إعادة التشغيل، التغييرات المقصودة فقط (الدوال سطرًا بسطر)، فصل المهام،
 * محاولات الوصول غير المصرح بها، سجل التدقيق، التراجع ثم إعادة التطبيق. لا يلمس Supabase.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { NEW, ORIG, migration, rollback } from "./build-004.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = join(ROOT, ".local/pg004");
const PORT = Number(process.env.TP_VERIFY004_PORT || 54343);
const SU_PW = randomBytes(18).toString("base64url");
const MIG_PW = randomBytes(18).toString("base64url");
const DB = "prod_copy";
const ADMIN = "5a6131fb-8f75-4c2d-97d2-9476c8662958"; // نفس معرّف حساب المشرف في الإنتاج
const VIEWER = "00000000-0000-4000-8000-00000000e002";
const PROD_FP = process.env.TP_PROD_FINGERPRINT || "";

const read = (f) => readFileSync(join(ROOT, f), "utf8");
if (read("db/schema/004_assisted_research.sql") !== migration || read("db/schema/004_assisted_research_rollback.sql") !== rollback) {
  console.error("✗ 004 لا يطابق المولِّد — شغّل node scripts/mvp/build-004.mjs");
  process.exit(1);
}
const SETUP = read("db/supabase/setup_all.sql");
const FP_SQL = read("scripts/mvp/fingerprint.sql");

let failures = 0;
const ok = (cond, label, extra = "") => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
};
async function withClient(user, password, fn) {
  const c = new pg.Client({ host: "127.0.0.1", port: PORT, user, password, database: DB });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
const su = (sql, params) => withClient("postgres", SU_PW, (c) => c.query(sql, params));
const mig = (sql) => withClient("supa_postgres", MIG_PW, async (c) => {
  try { const r = await c.query(sql); const l = Array.isArray(r) ? r : [r]; return { ok: true, row: l[l.length - 1].rows?.[0], all: l }; }
  catch (e) {
    const pos = Number(e.position);
    return { ok: false, error: e.message + (pos ? ` @${pos}: ${JSON.stringify(sql.slice(Math.max(0, pos - 120), pos + 40))}` : ""), code: e.code };
  }
});
/** تنفيذ داخل معاملة تُلغى دائمًا، بدور معيّن وهوية JWT اختيارية */
const asRole = (role, sql, params = [], claims = null) => withClient("postgres", SU_PW, async (c) => {
  await c.query("begin");
  try {
    if (claims) await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await c.query(`set local role ${role}`);
    const r = await c.query(sql, params);
    return { ok: true, rows: r.rows };
  } catch (e) { return { ok: false, error: e.message, code: e.code }; }
  finally { await c.query("rollback"); }
});
/** مثل asRole لكن تُعتمد المعاملة (للخطوات التي يجب أن تبقى) */
const asRoleCommit = (role, sql, params = [], claims = null) => withClient("postgres", SU_PW, async (c) => {
  await c.query("begin");
  try {
    if (claims) await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await c.query(`set local role ${role}`);
    const r = await c.query(sql, params);
    await c.query("commit");
    return { ok: true, rows: r.rows };
  } catch (e) { await c.query("rollback"); return { ok: false, error: e.message, code: e.code }; }
});
const adminClaims = { sub: ADMIN, role: "authenticated", aal: "aal2" };
const fingerprint = async () => (await su(FP_SQL)).rows[0];
const body = (def) => {
  const a = def.indexOf("$$"), b = def.lastIndexOf("$$");
  return def.slice(a + 2, b);
};
const prosrc = async (sig) => (await su(`select prosrc from pg_proc where oid = $1::regprocedure`, [sig])).rows[0]?.prosrc;

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
    const boot = new pg.Client({ host: "127.0.0.1", port: PORT, user: "postgres", password: SU_PW, database: "postgres" });
    await boot.connect(); await boot.query(`create database ${DB}`); await boot.end();
    await su(read("db/local/000_supabase_shim.sql"));
    await su(`alter role supa_postgres password '${MIG_PW}'`);
    await su(`insert into auth.users (id, email, created_at) values ($1, 'admin@test.invalid', now() - interval '1 day')`, [ADMIN]);

    console.log("— النسخة المطابقة");
    const setup = await mig(SETUP);
    ok(setup.ok && Number(setup.row?.privilege_violations_expect_0) === 0 && Number(setup.row?.electronics_expect_52) === 52,
       "ملف الإعداد نفسه الذي نُفّذ في الإنتاج: نجح بدور غير مدير", setup.ok ? "" : setup.error);
    await mig(`create schema tp_migrate; create table tp_migrate.chunks (file text, n int, body text, added_at timestamptz default now(), primary key (file, n));
      alter table tp_migrate.chunks enable row level security; revoke all on schema tp_migrate from public, anon, authenticated, service_role;
      insert into tp_migrate.chunks (file, n, body) select '001', g, repeat(md5(g::text), 600) from generate_series(1, 3) g;`);
    const fp0 = await fingerprint();
    ok(!PROD_FP || fp0.fingerprint === PROD_FP, "بصمة البنية مطابقة لقاعدة Supabase قبل 004",
       `${fp0.fingerprint} (${fp0.items} عنصرًا)${PROD_FP ? "" : " — لم تُمرَّر بصمة الإنتاج"}`);
    if (PROD_FP && fp0.fingerprint !== PROD_FP) {
      const cat = FP_SQL.replace("select md5(string_agg(x, E'\\n' order by x)) as fingerprint, count(*) as items from (",
        "select split_part(x, ' ', 1) as k, md5(string_agg(x, E'\\n' order by x)) as h, count(*) as n from (").replace(/\) s\(x\);\s*$/, ") s(x) group by 1 order by 1;");
      for (const row of (await su(cat)).rows) console.log(`      ${row.k} ${row.h} ${row.n}`);
      if (process.env.TP_FP_DUMP) {
        const list = FP_SQL.replace("select md5(string_agg(x, E'\\n' order by x)) as fingerprint, count(*) as items from (", "select x from (").replace(/\) s\(x\);\s*$/, ") s(x) where x like $1 order by x;");
        for (const row of (await su(list, [process.env.TP_FP_DUMP + "%"])).rows) console.log("      | " + row.x);
      }
    }
    if (process.env.TP_FN_LIST) {
      const l = await su(`select n.nspname || '.' || p.proname || ' ' || left(md5(p.prosrc), 8) || ' ' ||
          left(md5(coalesce((select string_agg(replace(a::text, 'supa_postgres', 'postgres'), ',' order by replace(a::text, 'supa_postgres', 'postgres')) from unnest(p.proacl) a), '')), 8) as x
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('tp','pub','admin_api','ingest_api') order by 1`);
      writeFileSync(process.env.TP_FN_LIST, l.rows.map((x) => x.x).join("\n") + "\n");
    }
    const outside0 = (await su(`select (select md5(string_agg(file || n || body, '|' order by file, n)) from tp_migrate.chunks) as mig,
        (select count(*) from tp.price_observations) as obs, (select count(*) from tp.products) as products,
        (select count(*) from tp.sources) as sources`)).rows[0];

    console.log("— تطبيق 004 (كما في SQL Editor) وإعادة تشغيله");
    let r = await mig(migration);
    ok(r.ok && Number(r.row.research_sources_expect_2) === 2 && Number(r.row.approved_research_sources_expect_0) === 0
       && Number(r.row.privilege_violations_expect_0) === 0 && /004-assisted-research/.test(r.row.migrations),
       "004 نجح: مصدران بحالة مسودة، 0 معتمد، 0 مخالفات", r.ok ? "" : r.error);
    const fp1 = await fingerprint();
    r = await mig(migration);
    ok(r.ok && Number(r.row.research_sources_expect_2) === 2 && Number(r.row.privilege_violations_expect_0) === 0, "إعادة تشغيل 004 نجحت",
       r.ok ? "" : r.error);
    const fp2 = await fingerprint();
    ok(fp1.fingerprint === fp2.fingerprint, "إعادة التشغيل لا تغيّر شيئًا (البصمة نفسها)");

    console.log("— التغييرات المقصودة فقط");
    const fnChecks = [
      ["tp.register_import_core(uuid,tp.actor_kind,text,text,text,bigint,text,text,text,jsonb,jsonb,jsonb,jsonb)", "register"],
      ["tp.commit_import_core(uuid,text,uuid,tp.actor_kind)", "commit"],
      ["admin_api.verify_observation(bigint,text,bigint,text,text,text)", "verify"],
      ["tp.privilege_violations()", "violations"],
      ["ingest_api.register_import(text,text,text,bigint,text,text,text,jsonb,jsonb,jsonb,jsonb)", "ingReg"],
      ["ingest_api.stage_import_rows(uuid,integer,jsonb)", "ingStage"],
      ["ingest_api.seal_import(uuid,integer)", "ingSeal"],
      ["ingest_api.commit_import(uuid,text)", "ingCommit"],
      ["admin_api.register_import(text,text,text,bigint,text,text,text,jsonb,jsonb,jsonb,jsonb)", "admReg"],
      ["admin_api.stage_import_rows(uuid,integer,jsonb)", "admStage"],
      ["admin_api.seal_import(uuid,integer)", "admSeal"],
      ["admin_api.commit_import(uuid,text)", "admCommit"],
    ];
    for (const [sig, key] of fnChecks) {
      const live = await prosrc(sig);
      const origLines = body(ORIG[key]).split("\n"), newLines = body(NEW[key]).split("\n");
      const changed = newLines.filter((l) => !origLines.includes(l)).length + origLines.filter((l) => !newLines.includes(l)).length;
      ok(live === body(NEW[key]), `${sig.split("(")[0]}: مطابقة لنص 001 مع الأسطر المقصودة فقط`, `${changed} سطر مختلف عن 001`);
    }
    const unchanged = await su(`select count(*)::int as n from tp.sources where kind <> 'assisted_research' and service_submission`);
    ok(unchanged.rows[0].n === 0, "المصادر الحالية لم تتغير (service_submission = false)");
    const after = (await su(`select (select md5(string_agg(file || n || body, '|' order by file, n)) from tp_migrate.chunks) as mig,
        (select count(*) from tp.price_observations) as obs, (select count(*) from tp.products) as products`)).rows[0];
    ok(after.mig === outside0.mig && after.obs === outside0.obs && after.products === outside0.products,
       "لا تغيير في البيانات: tp_migrate والأسعار والمنتجات كما هي");

    console.log("— محاولات غير مصرح بها (دور الخدمة tp_research)");
    const deny = async (label, sql, params = [], claims = null) => {
      const x = await asRole("tp_research", sql, params, claims);
      ok(!x.ok && /permission denied|42501/.test(`${x.error} ${x.code}`), label, x.ok ? "نجح خطأً!" : x.error.slice(0, 70));
    };
    await deny("لا يقرأ الأسعار", "select count(*) from tp.price_observations");
    await deny("لا يقرأ الواجهات العامة", "select count(*) from pub.products");
    await deny("لا يكتب قرار اعتماد مباشرة", "insert into tp.verification_events (observation_id, status, actor_id) values (1, 'verified', $1)", [ADMIN]);
    await deny("لا يعتمد سعرًا حتى بهوية مشرف مزوّرة", "select admin_api.verify_observation(1, 'verified', null, null, 'x', 'https://example.com/e')", [], adminClaims);
    await deny("لا يعتمد مصدرًا", "update tp.sources set status = 'approved' where id = 'research-apple'", [], adminClaims);
    await deny("لا يستدعي الدوال الأساسية مباشرة", "select tp.register_import_core(null, 'service', 'research-apple', 'imports/x', 'x', 1, repeat('a',64), 'x', 'csv', '{}', '{}', '[]', '[]')");
    await deny("لا يستخدم مسار الشركاء", "select ingest_api.seal_import(gen_random_uuid(), 1)");
    await deny("لا يمنح نفسه أدوارًا", "select admin_api.grant_role($1, 'admin')", [ADMIN], adminClaims);
    const draft = await asRole("tp_research", "select research_api.register_import('research-apple', 'x.csv', 10, repeat('b',64), 1)");
    ok(!draft.ok && /not approved/.test(draft.error), "المصدر المسودة لا يقبل أي إدخال قبل اعتماده", draft.ok ? "نجح خطأً!" : draft.error.slice(0, 60));
    const legacy = await asRole("tp_research", "select research_api.register_import('legacy-site-data', 'x.csv', 10, repeat('b',64), 1)");
    ok(!legacy.ok && /assisted-research sources only/.test(legacy.error), "لا يُدخل في مصادر غير مساعد الرصد");
    for (const role of ["anon", "authenticated", "web_reader", "ingest_service", "tp_app"]) {
      const x = await asRole(role, "select research_api.seal_import(gen_random_uuid(), 1)", [], role === "authenticated" ? adminClaims : null);
      ok(!x.ok && /permission denied/.test(x.error), `${role} لا يصل إلى research_api`, x.ok ? "نجح خطأً!" : "");
    }
    // ingest_service لا يملك حاليًا EXECUTE على ingest_api (الاستيراد الآلي معطل في MVP)؛ نمنحه داخل معاملة تُلغى لاختبار الحماية نفسها
    const viaIngest = await withClient("postgres", SU_PW, async (c) => {
      await c.query("begin");
      try {
        await c.query("grant execute on function ingest_api.register_import(text,text,text,bigint,text,text,text,jsonb,jsonb,jsonb,jsonb) to ingest_service");
        await c.query("set local role ingest_service");
        await c.query("select ingest_api.register_import('research-apple', 'imports/x', 'x', 1, repeat('c',64), 'x', 'csv', '{}', '{}')");
        return { ok: true };
      } catch (e) { return { ok: false, error: e.message }; } finally { await c.query("rollback"); }
    });
    ok(!viaIngest.ok && /only through research_api/.test(viaIngest.error), "مسار الشركاء (ingest_service) يرفض مصادر مساعد الرصد",
       viaIngest.ok ? "نجح خطأً!" : viaIngest.error.slice(0, 60));

    await su(`insert into auth.users (id, email) values ($1, 'viewer@test.invalid')`, [VIEWER]);
    await asRoleCommit("authenticated", "select admin_api.upsert_profile($1, 'مشاهد'), admin_api.grant_role($1, 'viewer')", [VIEWER], adminClaims);

    console.log("— اعتماد المصدر بعد مراجعة الشروط (مشرف فقط)");
    const noTerms = await asRole("authenticated", "update tp.sources set status = 'approved' where id = 'research-apple'", [], adminClaims);
    ok(!noTerms.ok && /sources_research_terms_check/.test(noTerms.error), "اعتماد مصدر مساعد رصد بلا رابط الشروط ووقت مراجعتها يرفضه القيد",
       noTerms.ok ? "نجح خطأً!" : noTerms.error.slice(0, 70));
    const viewerSrc = await asRole("authenticated",
      "update tp.sources set status = 'approved', permission_evidence_url = 'https://www.apple.com/sa/legal/', terms_reviewed_at = now() where id = 'research-apple' returning id",
      [], { sub: VIEWER, role: "authenticated", aal: "aal2" });
    ok(viewerSrc.ok ? viewerSrc.rows.length === 0 : true, "مستخدم بلا صلاحية source:manage لا يعتمد مصدرًا (RLS)");
    const aal1Src = await asRole("authenticated",
      "update tp.sources set status = 'approved', permission_evidence_url = 'https://www.apple.com/sa/legal/', terms_reviewed_at = now() where id = 'research-apple' returning id",
      [], { ...adminClaims, aal: "aal1" });
    ok(aal1Src.ok ? aal1Src.rows.length === 0 : true, "المشرف بلا تحقق ثنائي (aal1) لا يعتمد مصدرًا");
    // نفس الاستعلام الذي تنفّذه اللوحة (approveResearchSource)
    const approve = await asRoleCommit("authenticated",
      `update tp.sources set status = 'approved', permission_evidence_url = 'https://www.apple.com/sa/legal/', terms_reviewed_at = now()
       where id in ('research-apple', 'research-jarir') and status in ('draft', 'suspended') and kind = 'assisted_research'
       returning id, approved_by`, [], adminClaims);
    ok(approve.ok && approve.rows.length === 2 && approve.rows.every((x) => x.approved_by === ADMIN),
       "المشرف يعتمد المصدرين، ويُسجَّل هو معتمدًا (approved_by)", approve.ok ? "" : approve.error);
    const srcAudit = await su(`select count(*)::int as n from tp.audit_log where entity_type = 'sources' and entity_id in ('research-apple','research-jarir')
                                and actor_id = $1 and after ->> 'status' = 'approved'`, [ADMIN]);
    ok(srcAudit.rows[0].n === 2, "اعتماد المصدرين مسجل في سجل التدقيق باسم المشرف");

    console.log("— إدخال مساعد الرصد (tp_research) ثم الاعتماد البشري");
    const dir = mkdtempSync(join(tmpdir(), "tp004-"));
    const ledger = join(dir, "ledger.csv");
    const now = new Date(Date.now() - 60_000).toLocaleString("sv-SE", { timeZone: "Asia/Riyadh" }).replace(" ", "T").slice(0, 16) + "+03:00";
    writeFileSync(ledger, "product_id,product_name,store_id,price_sar,list_price_sar,url,observed_at,availability,vat_included,match,notes\n" +
      `1,iPhone 17 256GB,apple,4299,,https://example.com/apple/iphone-17,${now},in_stock,yes,iPhone 17 / 256GB,اختبار\n` +
      `1,iPhone 17 256GB,jarir,4299,,https://example.com/jarir/666784,${now},in_stock,yes,iPhone 17 / 256GB,اختبار\n`);
    const sql = execFileSync("node", [join(ROOT, "scripts/research/ledger-to-sql.mjs"), ledger, "electronics"], { encoding: "utf8" });
    const imp = await mig(sql);
    ok(imp.ok && imp.all.at(-1).rows.length === 2 && imp.all.at(-1).rows.every((x) => x.status === "committed" && Number(x.observations) === 1),
       "الإدخال بدور tp_research عبر research_api نجح (عمليتان، متجر لكل مصدر)", imp.ok ? "" : imp.error);
    const runs = (await su(`select r.id, r.actor_kind, r.started_by, r.committed_by, r.source_id from tp.import_runs r
                            where r.source_id like 'research-%' order by r.source_id`)).rows;
    ok(runs.length === 2 && runs.every((x) => x.actor_kind === "service" && x.started_by === null && x.committed_by === null),
       "هوية المُدخل: actor_kind=service بلا مستخدم (المساعد ليس مشرفًا ولا يملك حساب مستخدم)");
    const audit = await su(`select action, actor_id, actor_label from tp.audit_log where entity_id = any($1::text[]) order by id`, [runs.map((x) => x.id)]);
    const acts = audit.rows.map((x) => x.action);
    ok(["import.register", "import.seal", "import.commit"].every((a) => acts.includes(a)) &&
       audit.rows.every((x) => x.actor_id === null && /^service:research-(apple|jarir)$/.test(x.actor_label ?? "")),
       "سجل التدقيق: تسجيل/ختم/اعتماد الاستيراد باسم service:research-<متجر>", [...new Set(audit.rows.map((x) => x.actor_label))].join(", "));
    const mism = await mig(`begin; set local role tp_research;
      select research_api.stage_rows(research_api.register_import('research-apple', 'mm.csv', 10, repeat('d',64), 1), 1,
        '[{"store_id":"jarir","offer_key":"x","condition":"new","amount":"1","currency":"SAR","as_of":"2026-11-08T10:00:00+03:00","availability":"unknown","name":"x","url":"https://example.com/x","canonical_url":"https://example.com/x","product_id":"1","date_confirmed":true}]'::jsonb);
      commit;`);
    ok(!mism.ok && /single-store source/.test(mism.error), "لا يُدخل سعر متجر في مصدر متجر آخر", mism.ok ? "نجح خطأً!" : mism.error.slice(0, 60));
    const pid = (await su("select id from tp.products where legacy_id = 1")).rows[0].id;
    const hidden = (await su("select count(*)::int as n from pub.electronics_offers where product_id = $1", [pid])).rows[0].n;
    ok(hidden === 0, "قبل الاعتماد: لا يظهر أي سعر في الموقع");
    const obs = (await su(`select o.id, o.url from tp.price_observations o where o.import_run_id = any($1::uuid[]) order by o.id`, [runs.map((x) => x.id)])).rows;

    const viewer = await asRole("authenticated", "select admin_api.verify_observation($1, 'verified', null, null, 'x', $2)", [obs[0].id, obs[0].url],
      { sub: VIEWER, role: "authenticated", aal: "aal2" });
    ok(!viewer.ok, "مستخدم بلا صلاحية الاعتماد (viewer) لا يعتمد", viewer.ok ? "نجح خطأً!" : viewer.error.slice(0, 50));
    const aal1 = await asRole("authenticated", "select admin_api.verify_observation($1, 'verified', null, null, 'x', $2)", [obs[0].id, obs[0].url],
      { ...adminClaims, aal: "aal1" });
    ok(!aal1.ok, "المشرف بلا تحقق ثنائي (aal1) لا يعتمد", aal1.ok ? "نجح خطأً!" : aal1.error.slice(0, 50));
    const noEv = await asRole("authenticated", "select admin_api.verify_observation($1, 'verified')", [obs[0].id], adminClaims);
    ok(!noEv.ok && /evidence_url/.test(noEv.error), "المشرف بلا رابط دليل لا يعتمد");
    let allOk = true;
    for (const o of obs) {
      const x = await asRoleCommit("authenticated", "select admin_api.verify_observation($1, 'verified', null, null, 'فُتح الرابط وطابق', $2)", [o.id, o.url], adminClaims);
      allOk = allOk && x.ok;
    }
    ok(allOk, "المشرف (بتحقق ثنائي ودليل) يعتمد: المُدخل خدمة لا مستخدم، فلا مراجعة ذاتية");
    const vAudit = await su(`select count(*)::int as n from tp.audit_log where action = 'price.verify' and actor_id = $1 and entity_id = any($2::text[])`,
      [ADMIN, obs.map((o) => String(o.id))]);
    ok(vAudit.rows[0].n === obs.length, "كل اعتماد مسجل باسم المشرف مع رابط الدليل");
    const shown = (await su("select count(*)::int as n from pub.electronics_offers where product_id = $1", [pid])).rows[0].n;
    ok(shown === 2, "بعد الاعتماد: يظهر السعران في الموقع", String(shown));

    console.log("— مصادر مساعد الرصد لا تستقبل إلا من research_api");
    const admReg = await asRole("authenticated",
      "select admin_api.register_import('research-apple', 'imports/adm', 'x.csv', 1, repeat('f',64), 'x', 'csv', '{}', '{}')", [], adminClaims);
    ok(!admReg.ok && /only through research_api/.test(admReg.error), "حتى المشرف لا يرفع ملفًا في مصدر مساعد رصد من اللوحة",
       admReg.ok ? "نجح خطأً!" : admReg.error.slice(0, 60));
    const pending = await mig(`begin; set local role tp_research;
      select research_api.register_import('research-jarir', 'pending.csv', 10, repeat('e',64), 1) as id; commit;`);
    const pendingId = pending.ok ? pending.all.find((x) => x.rows?.[0]?.id)?.rows[0].id : null;
    ok(Boolean(pendingId), "عملية رصد معلّقة (لم تُختم) للاختبار", pending.ok ? "" : pending.error);
    const admCommit = await asRole("authenticated", "select admin_api.commit_import($1, repeat('e',64))", [pendingId], adminClaims);
    ok(!admCommit.ok && /only through research_api/.test(admCommit.error), "المشرف لا يختم/يعتمد عملية رصد من مسار اللوحة",
       admCommit.ok ? "نجح خطأً!" : admCommit.error.slice(0, 60));
    const discard = await asRoleCommit("authenticated", "select admin_api.discard_import($1, 'اختبار: إلغاء عملية رصد عالقة')", [pendingId], adminClaims);
    const discarded = (await su("select status from tp.import_runs where id = $1", [pendingId])).rows[0]?.status;
    const discardAudit = (await su("select count(*)::int as n from tp.audit_log where action = 'import.discard' and entity_id = $1 and actor_id = $2",
      [pendingId, ADMIN])).rows[0].n;
    ok(discard.ok && discarded === "discarded" && discardAudit === 1, "المشرف يستطيع إلغاء عملية رصد عالقة (مسجل باسمه)", discard.ok ? "" : discard.error);
    const resDiscard = await asRole("tp_research", "select admin_api.discard_import($1, 'x')", [pendingId]);
    ok(!resDiscard.ok && /permission denied/.test(resDiscard.error), "دور مساعد الرصد لا يصل إلى دوال اللوحة");

    const v = (await su("select count(*)::int as n from tp.privilege_violations()")).rows[0].n;
    ok(v === 0, "فاحص الصلاحيات بعد كل ما سبق: 0 مخالفات");

    console.log("— التراجع");
    r = await mig(rollback);
    ok(!r.ok && /لم يُؤكَّد التراجع/.test(r.error), "التراجع بلا تأكيد يُرفض ولا يغيّر شيئًا");
    const confirmed = rollback.replace("v_confirm text := 'لا';", "v_confirm text := 'نعم-تراجع-004';");
    r = await mig(confirmed);
    ok(r.ok && Number(r.row.research_api_expect_0) === 0 && Number(r.row.research_role_expect_0) === 0
       && Number(r.row.approved_research_expect_0) === 0 && Number(r.row.privilege_violations_expect_0) === 0,
       "التراجع المؤكد: لا research_api ولا tp_research ولا مصدر معتمد، 0 مخالفات", r.ok ? "" : r.error);
    for (const [sig, key] of fnChecks) {
      ok((await prosrc(sig)) === body(ORIG[key]), `${sig.split("(")[0]}: عادت إلى نص 001 حرفيًا`);
    }
    const goneFromSite = (await su("select count(*)::int as n from pub.electronics_offers where product_id = $1", [pid])).rows[0].n;
    ok(goneFromSite === 0, "أسعار مساعد الرصد اختفت من الموقع (مصدرها موقوف) دون حذف سجلها");
    const kept = (await su("select count(*)::int as n from tp.price_observations where import_run_id = any($1::uuid[])", [runs.map((x) => x.id)])).rows[0].n;
    ok(kept === 2, "سجل الأسعار وقرارات الاعتماد باقٍ (لا حذف لتاريخ)");
    const fpRb = await fingerprint();
    const diffRb = await su(`select count(*)::int as n from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'source_kind' and e.enumlabel = 'assisted_research'`);
    ok(diffRb.rows[0].n === 1, "قيمة enum تبقى (لا تُحذف في PostgreSQL) — الفرق الوحيد المتوقع عن البنية الأصلية");
    const fpNoEnum = fpRb.fingerprint !== fp0.fingerprint;
    ok(fpNoEnum, "البصمة بعد التراجع تختلف فقط بقيمة enum (تُفحص أدناه)");
    const fpCheck = await su(FP_SQL.replace("select format('enum %s %s', t.typname, (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))",
      "select format('enum %s %s', t.typname, (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid and e.enumlabel <> 'assisted_research'))"));
    ok(fpCheck.rows[0].fingerprint === fp0.fingerprint, "بعد التراجع (مع تجاهل قيمة enum): البنية مطابقة تمامًا لما قبل 004",
       `${fpCheck.rows[0].fingerprint} = ${fp0.fingerprint}`);
    r = await mig(migration);
    ok(r.ok && Number(r.row.privilege_violations_expect_0) === 0, "يمكن تطبيق 004 من جديد بعد التراجع", r.ok ? "" : r.error);
    const fp3 = await fingerprint();
    ok(fp3.fingerprint === fp1.fingerprint, "البنية بعد إعادة التطبيق مطابقة للتطبيق الأول");
  } finally {
    await pgc.stop();
    rmSync(DIR, { recursive: true, force: true });
  }
  console.log(failures ? `\n✗ ${failures} فحص فشل` : "\n✓ كل الفحوص نجحت");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
