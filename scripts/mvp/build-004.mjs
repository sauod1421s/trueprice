#!/usr/bin/env node
/**
 * يولّد db/schema/004_assisted_research.sql وملف تراجعه 004_assisted_research_rollback.sql.
 *
 * الدوال التي يعدّلها 004 تُنسخ حرفيًا من 001 ويُستبدل فيها سطر محدد فقط (يفشل التوليد إن لم يوجد السطر
 * مرة واحدة بالضبط). ملف التراجع يعيد نصوص 001 الأصلية نفسها. CI يتحقق أن الملفين مطابقان للمولِّد.
 *
 *   node scripts/mvp/build-004.mjs          (يكتب الملفين)
 *   node scripts/mvp/build-004.mjs --check  (يفشل عند أي فرق)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = readFileSync(join(ROOT, "db/schema/001_trueprice_v1_1.sql"), "utf8");
const OUT = join(ROOT, "db/schema/004_assisted_research.sql");
const OUT_RB = join(ROOT, "db/schema/004_assisted_research_rollback.sql");
const sha = (s) => createHash("sha256").update(s).digest("hex");

/** نص الدالة من 001 كما هو: من "create or replace function <name>(" حتى نهاية جسمها */
function fn(name) {
  const start = SRC.indexOf(`create or replace function ${name}(`);
  if (start < 0 || SRC.indexOf(`create or replace function ${name}(`, start + 1) >= 0) throw new Error(`function ${name}: not found once`);
  const endMarkers = ["\nend $$;\n", "\n$$;\n"].map((m) => [SRC.indexOf(m, start), m]).filter(([i]) => i > 0);
  const [end, m] = endMarkers.sort((a, b) => a[0] - b[0])[0];
  return SRC.slice(start, end + m.length).trimEnd();
}
function once(text, from, to, label) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`${label}: expected exactly one occurrence, found ${n}`);
  return text.replace(from, () => to); // دالة: لا تفسير لـ $$ في نص الاستبدال
}

const ORIG = {
  register: fn("tp.register_import_core"),
  commit: fn("tp.commit_import_core"),
  verify: fn("admin_api.verify_observation"),
  violations: fn("tp.privilege_violations"),
  ingReg: fn("ingest_api.register_import"),
  ingStage: fn("ingest_api.stage_import_rows"),
  ingSeal: fn("ingest_api.seal_import"),
  ingCommit: fn("ingest_api.commit_import"),
  admReg: fn("admin_api.register_import"),
  admStage: fn("admin_api.stage_import_rows"),
  admSeal: fn("admin_api.seal_import"),
  admCommit: fn("admin_api.commit_import"),
};

const SERVICE_CHECK = "  if p_kind = 'service' and not s.allow_automated then";
const SERVICE_CHECK_NEW = "  if p_kind = 'service' and not (s.allow_automated or s.service_submission) then";
const NEW = {
  register: once(ORIG.register, SERVICE_CHECK, SERVICE_CHECK_NEW, "register_import_core"),
  commit: once(ORIG.commit, SERVICE_CHECK, SERVICE_CHECK_NEW, "commit_import_core"),
  verify: once(ORIG.verify,
    "s.kind in ('manual_upload', 'legacy_manual') and p_evidence_url is null",
    "s.kind in ('manual_upload', 'legacy_manual', 'assisted_research') and p_evidence_url is null", "verify_observation"),
  violations: (() => {
    let v = ORIG.violations;
    v = once(v, "  where n.nspname in ('tp', 'pub', 'admin_api', 'ingest_api') and p.prosecdef",
      "  where n.nspname in ('tp', 'pub', 'admin_api', 'ingest_api', 'research_api') and p.prosecdef", "violations/definer");
    v = once(v, "  where n.nspname in ('tp', 'pub', 'admin_api', 'ingest_api') and c.relkind in ('r', 'v')",
      "  where n.nspname in ('tp', 'pub', 'admin_api', 'ingest_api', 'research_api') and c.relkind in ('r', 'v')", "violations/roles");
    v = once(v, "    and pg_catalog.has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE')\n$$;",
      `    and pg_catalog.has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE')
  union all
  -- 004: دور مساعد الرصد tp_research لا يملك أي صلاحية على جدول أو واجهة
  select 'research_role_table_access', c.oid::regclass::text, 'tp_research'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname not like 'pg\\_%' and n.nspname <> 'information_schema' and c.relkind in ('r', 'v', 'm', 'p')
    and exists (select 1 from pg_catalog.pg_roles x where x.rolname = 'tp_research')
    and pg_catalog.has_table_privilege('tp_research', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  union all
  -- 004: ولا ينفّذ إلا دوال research_api (لا دوال الاعتماد ولا الاستيراد العام ولا الدوال الأساسية)
  select 'research_role_function_access', p.oid::regprocedure::text, 'tp_research'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('tp', 'pub', 'admin_api', 'ingest_api')
    and exists (select 1 from pg_catalog.pg_roles x where x.rolname = 'tp_research')
    and pg_catalog.has_function_privilege('tp_research', p.oid, 'EXECUTE')
$$;`, "violations/research role");
    return v;
  })(),
};

// مسار الشركاء الآلي (ingest_api) لا يقبل مصادر مساعد الرصد ولا عملياتها: سطر حماية في أول كل دالة
const GUARD_SRC = "  perform tp.assert_not_research_source(p_source_id);\n";
const GUARD_RUN = "  perform tp.assert_not_research_run(p_run_id);\n";
const guard = (text, g, label) => once(text, "as $$\nbegin\n", `as $$\nbegin\n${g}`, label);
NEW.ingReg = guard(ORIG.ingReg, GUARD_SRC, "ingest_api.register_import");
NEW.ingStage = guard(ORIG.ingStage, GUARD_RUN, "ingest_api.stage_import_rows");
NEW.ingSeal = guard(ORIG.ingSeal, GUARD_RUN, "ingest_api.seal_import");
NEW.ingCommit = guard(ORIG.ingCommit, GUARD_RUN, "ingest_api.commit_import");
// ولا مسار رفع اللوحة (admin_api): مصدر مساعد الرصد لا يستقبل إلا من research_api، فيبقى أصل كل سعر فيه واضحًا.
// السطر يأتي بعد فحص الصلاحية (declare) فيبقى رد غير المخوَّل كما هو. discard_import لا يتغير: المشرف يستطيع إلغاء
// عملية رصد عالقة قبل اعتمادها.
const guardAdm = (text, g, label) => once(text, "\nbegin\n", `\nbegin\n${g}`, label);
NEW.admReg = guardAdm(ORIG.admReg, GUARD_SRC, "admin_api.register_import");
NEW.admStage = guardAdm(ORIG.admStage, GUARD_RUN, "admin_api.stage_import_rows");
NEW.admSeal = guardAdm(ORIG.admSeal, GUARD_RUN, "admin_api.seal_import");
NEW.admCommit = guardAdm(ORIG.admCommit, GUARD_RUN, "admin_api.commit_import");

const BASIS =
  "رصد يدوي بحجم بشري من صفحات المنتج العامة على هذا الموقع، مع رابط الصفحة ووقت الرصد لكل سعر؛ لا جمع آلي ولا نسخ من مواقع المقارنة. " +
  "الإدخال عبر دور الخدمة tp_research، وكل سعر غير موثق حتى يعتمده مشرف بعد فتح الرابط. يُعتمد المصدر فقط بعد مراجعة شروط استخدام الموقع.";

const header = (title) => `-- =====================================================================
-- ${title}
-- مولَّد بـ scripts/mvp/build-004.mjs من 001 (sha256=${sha(SRC)}) — لا يُعدَّل يدويًا.
-- =====================================================================
`;

const migration = `${header("TruePrice 004 — مساعد الرصد (إدخال أسعار مرصودة بأدلة عبر دور خدمة مستقل، واعتماد بشري)")}--
-- الهدف: من يُدخل السعر لا يعتمده. المُدخل هنا دور قاعدة بيانات مستقل (tp_research) لا يستطيع إلا تقديم
-- أسعار لمصادر «مساعد الرصد» المعتمدة، والمعتمِد مشرف بشري يفتح رابط الدليل من اللوحة.
--
-- ما يضيفه (لا حذف لأي بيانات ولا تغيير لأي قيد موجود):
--   1) قيمة enum: tp.source_kind = 'assisted_research'.
--   2) عمود tp.sources.service_submission (افتراضيًا false) + ثلاثة قيود على مصادر مساعد الرصد فقط: العمود true لها
--      وحدها؛ مرتبطة بمتجر واحد ولا تملك allow_automated (لا جمع آلي)؛ ولا تُعتمد إلا برابط الشروط المراجَعة ووقت المراجعة.
--   3) دور tp_research (NOLOGIN): لا يدخل القاعدة بنفسه، لا صلاحية له على أي جدول، وينفّذ دوال research_api الأربع فقط.
--      دور الترحيل (postgres) يستطيع التحول إليه (SET ROLE) لتقليص صلاحياته أثناء الإدخال، دون أن يرث منه شيئًا.
--   4) مخطط research_api: register/stage/seal/commit — تقبل مصادر assisted_research فقط، وتمر بدوال الاستيراد الرسمية.
--      كل دفعة تسجّل في سجل التدقيق هوية الاتصال الفعلية (research.submit: دور الدخول، الدور المفعّل، اسم التطبيق، الملف).
--   5) مسار الشركاء ingest_api ومسار رفع اللوحة admin_api يرفضان مصادر وعمليات مساعد الرصد (سطر حماية واحد في كل
--      دالة؛ admin_api.discard_import لا يتغير ليبقى للمشرف إلغاء عملية رصد عالقة).
--   6) الدالتان tp.register_import_core و tp.commit_import_core: سطر واحد في كل منهما — مسار الخدمة يُقبل إذا
--      allow_automated أو service_submission (بدل allow_automated فقط).
--   7) admin_api.verify_observation: سطر واحد — اعتماد سعر مساعد الرصد يشترط رابط دليل (مثل الإدخال اليدوي).
--   8) tp.privilege_violations: يشمل research_api، ويعدّ أي صلاحية زائدة لـ tp_research مخالفة.
--   9) 9 مصادر بحالة «مسودة» (غير معتمدة): research-apple و research-jarir للإلكترونيات، و7 لمواقع موزعي السيارات
--      الرسميين (تويوتا، نيسان، كيا الجبر، كيا NMC، وموزعو هيونداي الثلاثة ناغي والوعلان والمجدوعي — 4 منهم متاجر جديدة).
--      لا تقبل أي إدخال حتى يعتمد المشرف كل مصدر من اللوحة بعد مراجعة شروط الموقع (يُسجَّل المعتمِد ووقت المراجعة
--      ورابط الشروط في سجل التدقيق).
--  10) تشديد: صلاحيتا price:verify و price:reject تتطلبان تحققًا ثنائيًا (aal2) داخل القاعدة نفسها.
--
-- إعادة التشغيل آمنة (لا يتكرر شيء). التراجع: 004_assisted_research_rollback.sql.

-- (1) القيمة الجديدة في معاملة مستقلة: لا تُستخدم قيمة enum قبل اعتماد معاملتها
begin;
alter type tp.source_kind add value if not exists 'assisted_research';
commit;

begin;

-- (2) العمود والقيود (إضافة فقط)
alter table tp.sources add column if not exists service_submission boolean not null default false;
-- عند إعادة التطبيق بعد تراجع: مصادر مساعد رصد موقوفة لها سجل قد تبقى، فيُضبط عمودها قبل القيد
update tp.sources set service_submission = true where kind = 'assisted_research' and not service_submission;
do $tp004$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'tp.sources'::regclass and conname = 'sources_service_submission_check') then
    alter table tp.sources add constraint sources_service_submission_check
      check (service_submission = (kind = 'assisted_research'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'tp.sources'::regclass and conname = 'sources_research_shape_check') then
    alter table tp.sources add constraint sources_research_shape_check
      check (kind <> 'assisted_research' or (store_id is not null and not allow_automated));
  end if;
  -- لا يُعتمد مصدر مساعد رصد إلا ومعه رابط شروط الموقع التي رُوجعت ووقت المراجعة (على مستوى القاعدة لا اللوحة فقط)
  if not exists (select 1 from pg_constraint where conrelid = 'tp.sources'::regclass and conname = 'sources_research_terms_check') then
    alter table tp.sources add constraint sources_research_terms_check
      check (kind <> 'assisted_research' or status <> 'approved'
             or (permission_evidence_url is not null and terms_reviewed_at is not null));
  end if;
end $tp004$;

-- (3) دور الخدمة
do $tp004$
begin
  if not exists (select 1 from pg_roles where rolname = 'tp_research') then
    create role tp_research nologin noinherit;
  end if;
end $tp004$;
comment on role tp_research is 'TruePrice: مساعد الرصد — يقدّم أسعارًا مرصودة بأدلة لمصادر assisted_research فقط عبر research_api؛ لا يعتمد ولا يقرأ ولا يعدّل أي جدول';
grant tp_research to current_user with inherit false, set true;

-- (4) research_api
create schema if not exists research_api;
revoke all on schema research_api from public;
grant usage, create on schema research_api to tp_owner;
grant usage on schema research_api to tp_research;

create or replace function tp.assert_not_research_source(p_source_id text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from tp.sources where id = p_source_id and kind = 'assisted_research') then
    raise exception 'assisted-research sources accept submissions only through research_api' using errcode = '42501';
  end if;
end $$;

create or replace function tp.assert_not_research_run(p_run_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from tp.import_runs r join tp.sources s on s.id = r.source_id
             where r.id = p_run_id and s.kind = 'assisted_research') then
    raise exception 'assisted-research runs are handled only through research_api' using errcode = '42501';
  end if;
end $$;

create or replace function tp.assert_research_run(p_run_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from tp.import_runs r join tp.sources s on s.id = r.source_id
                 where r.id = p_run_id and s.kind = 'assisted_research' and s.service_submission) then
    raise exception 'research_api handles assisted-research runs only' using errcode = '42501';
  end if;
end $$;

create or replace function research_api.register_import(
  p_source_id text, p_file_name text, p_byte_size bigint, p_sha256 text, p_rows int
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare s tp.sources; v_run uuid;
begin
  select * into s from tp.sources where id = p_source_id;
  if not found or s.kind <> 'assisted_research' or not s.service_submission then
    raise exception 'research_api accepts assisted-research sources only' using errcode = '42501';
  end if;
  v_run := tp.register_import_core(null, 'service', p_source_id, 'imports/research/' || p_sha256, p_file_name, p_byte_size,
    p_sha256, 'research-ledger-1', 'csv', '{"max_rows":1000}'::jsonb,
    pg_catalog.jsonb_build_object('accepted', p_rows, 'rejected', 0), '[]'::jsonb, '[]'::jsonb);
  -- هوية الاتصال الفعلية في سجل التدقيق: دور الدخول، والدور المفعّل (SET ROLE)، واسم التطبيق، والملف
  perform tp.write_audit('research.submit', 'import_run', v_run::text, null,
    pg_catalog.jsonb_build_object('db_login', session_user::text, 'db_role', pg_catalog.current_setting('role', true),
      'application_name', pg_catalog.current_setting('application_name', true),
      'file_name', p_file_name, 'sha256', p_sha256, 'rows', p_rows),
    null, 'service:' || p_source_id);
  return v_run;
end $$;

create or replace function research_api.stage_rows(p_run_id uuid, p_first_row_no int, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform tp.assert_research_run(p_run_id);
  return tp.stage_rows_core(null, 'service', p_run_id, p_first_row_no, p_rows);
end $$;

create or replace function research_api.seal_import(p_run_id uuid, p_expected_rows int) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform tp.assert_research_run(p_run_id);
  return tp.seal_import_core(null, 'service', p_run_id, p_expected_rows);
end $$;

create or replace function research_api.commit_import(p_run_id uuid, p_content_sha256 text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform tp.assert_research_run(p_run_id);
  return tp.commit_import_core(p_run_id, p_content_sha256, null, 'service');
end $$;

-- (5) مسار الشركاء يرفض مساعد الرصد (نص 001 + سطر حماية)
${NEW.ingReg}

${NEW.ingStage}

${NEW.ingSeal}

${NEW.ingCommit}

-- (5ب) ومسار رفع اللوحة كذلك (نص 001 + سطر حماية بعد فحص الصلاحية)
${NEW.admReg}

${NEW.admStage}

${NEW.admSeal}

${NEW.admCommit}

-- (6) مسار الخدمة: allow_automated أو service_submission (نص 001، سطر واحد مختلف في كل دالة)
${NEW.register}

${NEW.commit}

-- (7) الاعتماد يشترط دليلًا لأسعار مساعد الرصد (نص 001، سطر واحد)
${NEW.verify}

-- (8) فاحص الصلاحيات يشمل research_api وصلاحيات tp_research
${NEW.violations}

-- الملكية والصلاحيات: كل الدوال الجديدة/المستبدلة مملوكة لـ tp_owner ومغلقة عن العامة
alter function tp.assert_not_research_source(text) owner to tp_owner;
alter function tp.assert_not_research_run(uuid) owner to tp_owner;
alter function tp.assert_research_run(uuid) owner to tp_owner;
alter function research_api.register_import(text, text, bigint, text, int) owner to tp_owner;
alter function research_api.stage_rows(uuid, int, jsonb) owner to tp_owner;
alter function research_api.seal_import(uuid, int) owner to tp_owner;
alter function research_api.commit_import(uuid, text) owner to tp_owner;
alter function tp.privilege_violations() owner to tp_owner;
revoke all on function tp.assert_not_research_source(text), tp.assert_not_research_run(uuid), tp.assert_research_run(uuid)
  from public, anon, authenticated, service_role, web_reader, ingest_service, tp_research;
revoke all on function research_api.register_import(text, text, bigint, text, int), research_api.stage_rows(uuid, int, jsonb),
  research_api.seal_import(uuid, int), research_api.commit_import(uuid, text)
  from public, anon, authenticated, service_role, web_reader, ingest_service;
grant execute on function research_api.register_import(text, text, bigint, text, int), research_api.stage_rows(uuid, int, jsonb),
  research_api.seal_import(uuid, int), research_api.commit_import(uuid, text) to tp_research;

-- (10) اعتماد الأسعار ورفضها يتطلبان تحققًا ثنائيًا على مستوى القاعدة نفسها (لا اللوحة فقط)
update tp.permissions set requires_mfa = true where id in ('price:verify', 'price:reject') and not requires_mfa;

-- (9) مصدران بحالة مسودة: لا يقبلان أي إدخال قبل اعتماد المشرف بعد مراجعة شروط الموقع
insert into tp.sources (id, name, kind, vertical, store_id, default_currency, time_zone, allow_automated, service_submission,
                        status, permission_basis)
values
  ('research-apple', 'مساعد الرصد — Apple السعودية (apple.com/sa)', 'assisted_research', 'electronics', 'apple', 'SAR',
   'Asia/Riyadh', false, true, 'draft', '${BASIS}'),
  ('research-jarir', 'مساعد الرصد — جرير (jarir.com)', 'assisted_research', 'electronics', 'jarir', 'SAR',
   'Asia/Riyadh', false, true, 'draft', '${BASIS}')
on conflict (id) do nothing;

-- موزعون رسميون مستقلون لهيونداي وكيا (لكل موزع أسعاره المعلنة في موقعه): متاجر جديدة (إضافة فقط)
insert into tp.stores (id, name, name_ar) values
  ('hyundai-naghi', 'Hyundai — Mohamed Yousuf Naghi Motors (hyundaiksa.com/mynaghi)', 'هيونداي — محمد يوسف ناغي للسيارات'),
  ('hyundai-wallan', 'Hyundai — Wallan Trading (hyundaiksa.com/wallan)', 'هيونداي — الوعلان للتجارة'),
  ('hyundai-almajdouie', 'Hyundai — Almajdouie Motors (hyundaiksa.com/almajdouie)', 'هيونداي — المجدوعي للسيارات'),
  ('kia-nmc', 'Kia — National Marketing Company (kia.com/nmc)', 'كيا — الشركة الوطنية للتسويق')
on conflict (id) do nothing;

-- مصادر السيارات (مسودة): موقع الوكيل/الموزع الرسمي، مصدر لكل متجر
insert into tp.sources (id, name, kind, vertical, store_id, default_currency, time_zone, allow_automated, service_submission,
                        status, permission_basis)
select 'research-' || st.id, 'مساعد الرصد — ' || st.name_ar, 'assisted_research', 'cars', st.id, 'SAR', 'Asia/Riyadh',
       false, true, 'draft', '${BASIS}'
from tp.stores st
where st.id in ('toyota-brand-site', 'nissan-brand-site', 'kia-brand-site', 'kia-nmc',
                'hyundai-naghi', 'hyundai-wallan', 'hyundai-almajdouie')
on conflict (id) do nothing;

insert into tp.schema_migrations (version) values ('004-assisted-research') on conflict (version) do nothing;

commit;

select (select count(*) from tp.sources where kind = 'assisted_research') as research_sources_expect_9,
       (select count(*) from tp.sources where kind = 'assisted_research' and status = 'approved') as approved_research_sources_expect_0,
       (select count(*) from tp.privilege_violations()) as privilege_violations_expect_0,
       (select string_agg(version, ', ' order by applied_at) from tp.schema_migrations) as migrations;
`;

const rollback = `${header("TruePrice 004 — التراجع (يعيد الدوال إلى نص 001 ويزيل مساعد الرصد)")}--
-- لا يُنفَّذ إلا بموافقة صريحة. محمي بسطر تأكيد. معاملة واحدة: أي خطأ = لا يتغير شيء.
--
-- ما يفعله:
--   • يوقف (suspended) أي مصدر مساعد رصد معتمد ⇒ تختفي أسعاره من الموقع فورًا، ويبقى سجلها كما هو (لا حذف لأسعار).
--   • يحذف مصادر مساعد الرصد التي لم يُستورد منها أي ملف قط (مسودات بلا تاريخ)، ومتاجر الموزعين الأربعة إن لم يُشر إليها شيء.
--   • يعيد الدوال الاثنتي عشرة إلى نص 001 الحرفي، ويحذف دوال الحماية ومخطط research_api ودور tp_research.
--   • يحذف القيود الثلاثة وعمود service_submission (بعد إيقاف المصادر لا يُستخدم).
--   • يعيد price:verify و price:reject إلى قيمة 001 (بلا اشتراط تحقق ثنائي على مستوى القاعدة؛ اللوحة تبقى تشترطه).
--   • يبقى: قيمة enum 'assisted_research' (لا يمكن حذف قيمة enum في PostgreSQL دون إعادة بناء النوع؛ غير مستخدمة بعد
--     التراجع ولا أثر لها)، ومصادر مساعد الرصد الموقوفة التي لها سجل استيراد، وسجل التدقيق كاملًا.

begin;

do $tp004rb$
declare
  v_confirm text := 'لا';   -- ← غيّرها إلى: نعم-تراجع-004
begin
  if v_confirm <> 'نعم-تراجع-004' then
    raise exception 'لم يُؤكَّد التراجع (غيّر قيمة v_confirm في أول الملف). لم يتغير شيء.';
  end if;
end $tp004rb$;

update tp.sources set status = 'suspended' where kind = 'assisted_research' and status = 'approved';
delete from tp.sources s
where s.kind = 'assisted_research' and not exists (select 1 from tp.import_files f where f.source_id = s.id);
-- متاجر الموزعين التي أضافها 004 تُحذف فقط إن لم يبق ما يشير إليها (مصدر أو عرض سعر)
delete from tp.stores st
where st.id in ('hyundai-naghi', 'hyundai-wallan', 'hyundai-almajdouie', 'kia-nmc')
  and not exists (select 1 from tp.sources s where s.store_id = st.id)
  and not exists (select 1 from tp.offer_streams os where os.store_id = st.id);

${ORIG.ingReg}

${ORIG.ingStage}

${ORIG.ingSeal}

${ORIG.ingCommit}

${ORIG.admReg}

${ORIG.admStage}

${ORIG.admSeal}

${ORIG.admCommit}

${ORIG.register}

${ORIG.commit}

${ORIG.verify}

${ORIG.violations}

drop function if exists tp.assert_not_research_source(text);
drop function if exists tp.assert_not_research_run(uuid);
drop function if exists tp.assert_research_run(uuid);
drop schema if exists research_api cascade;
do $tp004rb$
begin
  if exists (select 1 from pg_roles where rolname = 'tp_research') then
    drop role tp_research;
  end if;
end $tp004rb$;
alter table tp.sources drop constraint if exists sources_research_terms_check;
alter table tp.sources drop constraint if exists sources_research_shape_check;
alter table tp.sources drop constraint if exists sources_service_submission_check;
alter table tp.sources drop column if exists service_submission;
update tp.permissions set requires_mfa = false where id in ('price:verify', 'price:reject');
delete from tp.schema_migrations where version = '004-assisted-research';

commit;

select (select count(*) from pg_namespace where nspname = 'research_api') as research_api_expect_0,
       (select count(*) from pg_roles where rolname = 'tp_research') as research_role_expect_0,
       (select count(*) from tp.sources where kind = 'assisted_research' and status = 'approved') as approved_research_expect_0,
       (select count(*) from tp.privilege_violations()) as privilege_violations_expect_0;
`;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes("--check")) {
    const a = readFileSync(OUT, "utf8"), b = readFileSync(OUT_RB, "utf8");
    if (a !== migration || b !== rollback) {
      console.error("004 أو ملف تراجعه لا يطابق المولِّد. شغّل: node scripts/mvp/build-004.mjs");
      process.exit(1);
    }
    console.log(`004 مطابق (sha256=${sha(migration)}) والتراجع (sha256=${sha(rollback)})`);
  } else {
    writeFileSync(OUT, migration);
    writeFileSync(OUT_RB, rollback);
    console.log(`كُتب 004 (sha256=${sha(migration)}, ${Buffer.byteLength(migration)} bytes) والتراجع (sha256=${sha(rollback)})`);
  }
}
export { migration, rollback, ORIG, NEW };
