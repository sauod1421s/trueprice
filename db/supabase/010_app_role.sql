-- =====================================================================
-- TruePrice — دور اتصال خادم الموقع (tp_app). يُنفَّذ بدور postgres بعد المخطط وطبقة MVP.
-- قابل لإعادة التشغيل. لا يحتوي أي كلمة مرور: الدور لا يستطيع الدخول حتى تُضبط كلمته
-- بالخطوة المنفصلة 020 (تُولَّد داخل القاعدة وتُعرض مرة واحدة لمن ينفّذها).
--
-- النموذج نفسه الذي يستخدمه Supabase مع PostgREST (authenticator → anon/authenticated):
--   * خادم Next.js يتصل بـ tp_app، ولا يملك tp_app أي صلاحية بنفسه (noinherit).
--   * داخل كل معاملة يتحول إلى web_reader (الموقع العام: مخطط pub فقط)
--     أو إلى authenticated مع request.jwt.claims بعد التحقق من جلسة Supabase Auth (لوحة الإدارة).
-- الاتصال من Vercel عبر Supavisor بوضع المعاملات (المنفذ 6543) باسم المستخدم tp_app.<project-ref>.
-- =====================================================================
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tp_app') then
    create role tp_app login noinherit;      -- بلا كلمة مرور = لا دخول بعد
  end if;
end $$;
alter role tp_app login noinherit;   -- (nocreatedb/nocreaterole افتراضيان عند الإنشاء)

grant web_reader, authenticated to tp_app;
do $$ begin execute format('grant connect on database %I to tp_app', current_database()); end $$;

-- حدود كل جلسة (تنطبق أيضًا عبر Supavisor لأنه يفتح اتصال الخادم بهذا الدور)
alter role tp_app set statement_timeout = '8s';
alter role tp_app set idle_in_transaction_session_timeout = '15s';
alter role tp_app set lock_timeout = '5s';

commit;
