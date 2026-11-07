-- =====================================================================
-- TruePrice — التراجع الكامل عن db/supabase/setup_all.sql
--
-- ⚠️ حذف نهائي لكل بيانات TruePrice في القاعدة (المنتجات، الأسعار، الطلبات والشكاوى، الإحصائيات، سجل التدقيق).
-- لا يُنفَّذ إلا بموافقة صريحة من صاحب المشروع، وبعد أخذ نسخة إن كانت فيه بيانات حقيقية.
--
-- ما يحذفه: المخططات tp وpub وadmin_api وingest_api بكل محتواها، والأدوار tp_app وtp_owner وweb_reader
-- وingest_service.
-- ما لا يمسه: حسابات Authentication (auth.users)، والمخطط المؤقت tp_migrate، وأي شيء آخر في المشروع.
-- يبقى بعده: سحب صلاحية التنفيذ الافتراضية للدوال الجديدة من public/anon/authenticated (تشديد أمني
-- طبّقه 001، غير ضار ولا يؤثر على غير TruePrice).
--
-- حماية من التشغيل بالخطأ: لن يحذف شيئًا حتى تُغيَّر القيمة 'لا' في السطر المعلَّم أدناه إلى 'نعم-احذف-trueprice'.
-- معاملة واحدة: أي خطأ = لا يُحذف شيء. بعد التراجع يمكن تشغيل setup_all.sql من جديد.
-- =====================================================================
begin;

do $tp_guard$
declare
  v_confirm text := 'لا';   -- ← غيّرها إلى: نعم-احذف-trueprice
begin
  if v_confirm <> 'نعم-احذف-trueprice' then
    raise exception 'لم يُؤكَّد التراجع (غيّر قيمة v_confirm في أول الملف). لم يُحذف شيء.';
  end if;
end $tp_guard$;

drop schema if exists ingest_api cascade;
drop schema if exists admin_api cascade;
drop schema if exists pub cascade;
drop schema if exists tp cascade;

do $tp_roles$
begin
  if exists (select 1 from pg_roles where rolname = 'tp_app') then
    execute format('revoke all on database %I from tp_app', current_database());
    drop role tp_app;
  end if;
  if exists (select 1 from pg_roles where rolname = 'tp_owner') then
    drop owned by tp_owner;          -- الصلاحيات الافتراضية المتبقية باسم المالك
  end if;
  if exists (select 1 from pg_roles where rolname = 'web_reader') then drop role web_reader; end if;
  if exists (select 1 from pg_roles where rolname = 'ingest_service') then drop role ingest_service; end if;
  if exists (select 1 from pg_roles where rolname = 'tp_owner') then drop role tp_owner; end if;
end $tp_roles$;

select 'تم التراجع: لا مخططات ولا أدوار TruePrice' as result,
       (select count(*) from pg_namespace where nspname in ('tp', 'pub', 'admin_api', 'ingest_api')) as schemas_left_expect_0,
       (select count(*) from pg_roles where rolname in ('tp_app', 'tp_owner', 'web_reader', 'ingest_service')) as roles_left_expect_0;

commit;
