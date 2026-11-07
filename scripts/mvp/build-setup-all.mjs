#!/usr/bin/env node
/**
 * يولّد db/supabase/setup_all.sql: ملف إعداد واحد يُلصق مرة واحدة في Supabase SQL Editor.
 *
 * المحتوى = ملفات الإنتاج نفسها حرفيًا وبالترتيب المعتمد (كل ملف بمعاملته begin … commit)،
 * مع ثلاث كتل صغيرة مكتوبة هنا فقط:
 *   0) فحص مسبق قبل أي تغيير: يجب أن يوجد في Authentication مستخدم أو مستخدمان (المشرفون) لا أكثر.
 *   5) تهيئة أول مشرف/مشرفَين من مستخدمي Authentication الموجودين (مرة واحدة، تُتخطى عند الإعادة).
 *   7) توليد كلمة مرور tp_app داخل القاعدة (دالة 020 نفسها) وعرضها مرة واحدة مع نتيجة الفحوص.
 *
 * لا يحتوي الملف أي كلمة مرور أو مفتاح. إعادة تشغيله آمنة (لا يكرر شيئًا) لكنها تدوّر كلمة مرور tp_app.
 *
 * الاستخدام: node scripts/mvp/build-setup-all.mjs          (يكتب الملف)
 *            node scripts/mvp/build-setup-all.mjs --check  (يفشل إن كان الملف المحفوظ لا يطابق المصادر)
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "db/supabase/setup_all.sql");

// مشروع Supabase المخصص لـ TruePrice (ليس سرًا: يظهر في رابط المشروع العام)
const PROJECT_REF = "xlpzfnespldgaxkgskkg";
// خادم Supavisor المشترك للمنطقة eu-central-1 — يُطابَق مع Connect → Transaction pooler قبل الاستخدام
const POOLER_HOST = "aws-1-eu-central-1.pooler.supabase.com";

const PARTS = [
  ["1", "db/schema/001_trueprice_v1_1.sql", "المخطط v1.1.1: المخططات والأدوار وRLS والدوال وسجل التدقيق"],
  ["2", "db/mvp/002_mvp_overlay.sql", "طبقة MVP: واجهات الموقع ودوال اللوحة والتعطيل المؤقت القابل للعكس"],
  ["3", "db/schema/003_visitors_requests.sql", "إحصائيات الزوار وطلبات التواصل والشكاوى"],
  ["4", "db/supabase/010_app_role.sql", "دور اتصال الموقع tp_app (بلا كلمة مرور بعد)"],
  ["6", "db/seed/100_catalog_seed.sql", "نقل الكتالوج والسيارات والأسعار المرجعية (غير موثقة)"],
];

const sha = (s) => createHash("sha256").update(s).digest("hex");
const read = (f) => readFileSync(join(ROOT, f), "utf8");

const PRECHECK = `-- =====================================================================
-- [0] فحص مسبق — لا يغيّر شيئًا. يوقف الملف كله قبل أي تعديل إن لم تكن الشروط مستوفاة.
-- =====================================================================
do $tp_precheck$
declare
  v_done  boolean := false;
  v_users int;
begin
  if pg_catalog.to_regclass('tp.bootstrap_state') is not null then
    execute 'select exists (select 1 from tp.bootstrap_state)' into v_done;
  end if;
  if v_done then
    raise notice 'التهيئة تمت سابقًا: إعادة تشغيل آمنة (لا يتكرر شيء، وتُدوَّر كلمة مرور tp_app فقط)';
    return;
  end if;
  select count(*) into v_users from auth.users;
  if v_users = 0 then
    raise exception 'لا يوجد أي مستخدم بعد. أنشئ أولًا حساب المشرف من Authentication → Users → Add user (مع Auto Confirm)، ثم أعد التشغيل. لم يتغير شيء.';
  elsif v_users > 2 then
    raise exception 'يوجد % مستخدمين في Authentication. التهيئة تمنح صلاحية المشرف لكل الموجودين، فيجب أن يكونوا مستخدمًا أو اثنين فقط (المشرفون). لم يتغير شيء.', v_users;
  end if;
end $tp_precheck$;
`;

const BOOTSTRAP = `-- =====================================================================
-- [5] تهيئة أول مشرف/مشرفَين من مستخدمي Authentication الموجودين (مرة واحدة فقط)
--     الاسم المعروض = الجزء قبل @ من البريد (يُعدَّل لاحقًا من صفحة الملف الشخصي في اللوحة).
--     مع مستخدمَين: كل منهما يمنح الآخر (لا أحد يمنح نفسه). الدالة تقفل نفسها بعد أول نجاح.
-- =====================================================================
do $tp_bootstrap$
declare
  v_ids   uuid[];
  v_names text[];
begin
  if exists (select 1 from tp.bootstrap_state) then
    raise notice 'تهيئة المشرفين تمت سابقًا — تخطٍّ';
    return;
  end if;
  select array_agg(u.id order by u.created_at, u.id),
         array_agg(coalesce(nullif(left(split_part(coalesce(u.email, ''), '@', 1), 120), ''), 'مشرف')
                   order by u.created_at, u.id)
    into v_ids, v_names
    from auth.users u;
  if v_ids is null or cardinality(v_ids) not between 1 and 2 then
    raise exception 'يجب أن يوجد مستخدم أو مستخدمان فقط في Authentication قبل التهيئة';
  end if;
  perform tp.bootstrap_first_admins(v_ids[1], v_names[1], v_ids[2], v_names[2]);
end $tp_bootstrap$;
`;

function finalBlock(src020) {
  // دالة 020 حرفيًا (بدون سطر select الأخير)، ثم نتيجة واحدة تجمع كلمة المرور والفحوص
  const fn = src020.slice(0, src020.lastIndexOf("select pg_temp.tp_set_app_password()")).trimEnd();
  return `-- =====================================================================
-- [7] كلمة مرور tp_app + نتيجة الفحوص (هذه هي النتيجة الوحيدة التي تظهر في SQL Editor)
--     ${"db/supabase/020_set_app_password.sql"} sha256=${sha(src020)}
--     انسخ database_url مباشرة إلى Vercel (DATABASE_URL) ولا ترسلها في أي رسالة.
--     أي فحص لا يطابق القيمة المتوقعة = توقف وأبلغني (بدون إرسال كلمة المرور).
-- =====================================================================
${fn}

with pw as materialized (select pg_temp.tp_set_app_password() as p)
select
  'postgresql://tp_app.${PROJECT_REF}:' || pw.p || '@${POOLER_HOST}:6543/postgres' as database_url,
  (select count(*) from tp.privilege_violations())                          as privilege_violations_expect_0,
  (select string_agg(version, ', ' order by applied_at) from tp.schema_migrations) as migrations,
  (select string_agg(u.email, ', ' order by u.created_at)
     from tp.user_roles r join auth.users u on u.id = r.user_id where r.role_id = 'admin') as admins,
  (select count(*) from tp.products where category_kind = 'electronics')    as electronics_expect_52,
  (select count(*) from tp.products where category_kind = 'cars')           as cars_expect_357,
  (select count(*) from tp.price_observations)                              as legacy_prices_expect_283,
  (select count(*) from tp.verification_events)                             as verified_expect_0
from pw;
`;
}

export function buildSetupAll() {
  const src020 = read("db/supabase/020_set_app_password.sql");
  const parts = PARTS.map(([step, file, label]) => {
    const body = read(file);
    return { step, file, label, body, sha: sha(body), bytes: Buffer.byteLength(body) };
  });
  const manifest = [
    ...parts.slice(0, 4).map((p) => `--   [${p.step}] ${p.file}  sha256=${p.sha}  (${p.bytes} bytes)`),
    `--   [5] تهيئة المشرفين (كتلة مكتوبة هنا)`,
    `--   [${parts[4].step}] ${parts[4].file}  sha256=${parts[4].sha}  (${parts[4].bytes} bytes)`,
    `--   [7] db/supabase/020_set_app_password.sql  sha256=${sha(src020)}  + نتيجة الفحوص`,
  ].join("\n");

  const header = `-- =====================================================================
-- TruePrice — إعداد قاعدة Supabase كاملة في خطوة واحدة (SQL Editor → Run)
-- مولَّد آليًا بـ scripts/mvp/build-setup-all.mjs — لا يُعدَّل يدويًا (CI يتحقق من التطابق).
--
-- قبل التشغيل: أنشئ حساب المشرف (أو حسابَي المشرفَين) في Authentication → Users → Add user.
-- ماذا يفعل: يطبّق ملفات الإنتاج نفسها حرفيًا بالترتيب، كل ملف في معاملة مستقلة (أي خطأ يلغي الملف كله):
${manifest}
--
-- لا حذف لأي بيانات قائمة. كلمات drop/delete داخل الملفات هي: إعادة إنشاء سياسات RLS بأسمائها،
-- أو داخل دوال لا تعمل إلا عند استدعائها، أو مشغلات تمنع الحذف من جداول السجل.
-- لا يحتوي الملف أي كلمة مرور أو مفتاح. إعادة التشغيل آمنة لكنها تولّد كلمة مرور جديدة لـ tp_app.
-- =====================================================================

`;

  const section = (p) =>
    `-- =====================================================================
-- [${p.step}] ${p.file} — ${p.label}
--     sha256=${p.sha}
-- =====================================================================
${p.body.endsWith("\n") ? p.body : p.body + "\n"}
`;

  return (
    header +
    PRECHECK +
    "\n" +
    parts.slice(0, 4).map(section).join("") +
    BOOTSTRAP +
    "\n" +
    section(parts[4]) +
    finalBlock(src020)
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const sql = buildSetupAll();
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUT, "utf8");
    } catch {}
    if (current !== sql) {
      console.error("db/supabase/setup_all.sql لا يطابق ملفات المصدر. شغّل: npm run db:setup-all");
      process.exit(1);
    }
    console.log(`setup_all.sql مطابق (sha256=${sha(sql)}, ${Buffer.byteLength(sql)} bytes)`);
  } else {
    writeFileSync(OUT, sql);
    console.log(`كُتب db/supabase/setup_all.sql (sha256=${sha(sql)}, ${Buffer.byteLength(sql)} bytes)`);
  }
}
