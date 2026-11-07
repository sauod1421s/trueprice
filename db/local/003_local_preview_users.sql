-- =====================================================================
-- محلي فقط: دور اتصال التطبيق ومستخدمو المعاينة. لا يُنفَّذ على Supabase.
--
-- في Supabase يتصل PostgREST بدور authenticator ثم يتحول إلى anon/authenticated.
-- هنا يتصل خادم Next.js بدور tp_app ويتحول بنفس الطريقة:
--   * web_reader للموقع العام (مخطط pub فقط)
--   * authenticated + request.jwt.claims للوحة الإدارة (RLS + admin_api)
-- tp_app نفسه لا يملك أي صلاحية على الجداول (noinherit).
--
-- يُنفَّذ بالمستخدم المدير المحلي. كلمة مرور tp_app تُمرَّر من سكربت الإعداد
-- (تُولَّد في .local/ ولا تُحفظ في Git) عبر المتغير tp.app_password.
-- =====================================================================
do $$
declare v_pw text := current_setting('tp.app_password');
begin
  if not exists (select 1 from pg_roles where rolname = 'tp_app') then
    execute format('create role tp_app login noinherit password %L', v_pw);
  else
    execute format('alter role tp_app login noinherit password %L', v_pw);
  end if;
end $$;
grant web_reader, authenticated to tp_app;
do $$ begin execute format('grant connect on database %I to tp_app', current_database()); end $$;

-- مستخدمو المعاينة (بريد test.invalid — لا يستقبل بريدًا ولا يمثل أشخاصًا حقيقيين)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'preview-admin-a@test.invalid'),
  ('00000000-0000-4000-8000-0000000000a2', 'preview-admin-b@test.invalid'),
  ('00000000-0000-4000-8000-0000000000b1', 'preview-reviewer@test.invalid')
on conflict (id) do nothing;

-- أول مشرفَين عبر دالة التهيئة نفسها المقترحة لـ Supabase (مرة واحدة فقط)
do $$
begin
  if not exists (select 1 from tp.bootstrap_state) then
    perform tp.bootstrap_first_admins(
      '00000000-0000-4000-8000-0000000000a1', 'مشرف تجريبي أ',
      '00000000-0000-4000-8000-0000000000a2', 'مشرف تجريبي ب');
  end if;
end $$;

insert into tp.profiles (user_id, display_name) values
  ('00000000-0000-4000-8000-0000000000b1', 'مراجع تجريبي')
on conflict (user_id) do nothing;
