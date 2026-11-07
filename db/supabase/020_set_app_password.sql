-- =====================================================================
-- TruePrice — توليد كلمة مرور tp_app وضبطها (مرة واحدة، أو عند التدوير).
--
-- يُنفَّذ في Supabase SQL Editor بدور postgres، بعد 010_app_role.sql.
-- النتيجة تظهر مرة واحدة فقط في جدول النتائج: انسخها مباشرة إلى متغير DATABASE_URL
-- في إعدادات Vercel (Environment Variables، بيئة Production فقط)، ثم أغلق الصفحة.
-- لا تحفظها في GitHub ولا ترسلها في رسالة.
--
-- كلمة المرور تُولَّد داخل القاعدة (gen_random_uuid عشوائي تشفيري، 244 بت تقريبًا)،
-- وتُمرَّر إلى ALTER ROLE داخل دالة مؤقتة (pg_temp) حتى لا يظهر نصها في سجل الأوامر،
-- والدالة تختفي بانتهاء الجلسة.
-- =====================================================================
create or replace function pg_temp.tp_set_app_password() returns text
language plpgsql as $$
declare pw text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  execute format('alter role tp_app password %L', pw);
  return pw;
end $$;

select pg_temp.tp_set_app_password() as tp_app_password;
