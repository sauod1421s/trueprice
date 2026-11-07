-- =====================================================================
-- محلي فقط: مستخدمو المعاينة. لا يُنفَّذ على Supabase.
-- (دور اتصال التطبيق tp_app صار في db/supabase/010_app_role.sql ويُنفَّذ بدور الترحيل كما في الإنتاج.)
--
-- في Supabase يتصل PostgREST بدور authenticator ثم يتحول إلى anon/authenticated.
-- هنا يتصل خادم Next.js بدور tp_app ويتحول بنفس الطريقة:
--   * web_reader للموقع العام (مخطط pub فقط)
--   * authenticated + request.jwt.claims للوحة الإدارة (RLS + admin_api)
-- tp_app نفسه لا يملك أي صلاحية على الجداول (noinherit).
--
-- يُنفَّذ بالمستخدم المدير المحلي (يكتب في auth.users الذي يديره Supabase Auth في الإنتاج).
-- =====================================================================
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

-- دور المراجع عبر دالة منح الأدوار نفسها، بهوية المشرف أ (مرة واحدة)
do $$
begin
  if not exists (select 1 from tp.user_roles where user_id = '00000000-0000-4000-8000-0000000000b1' and role_id = 'reviewer') then
    perform set_config('request.jwt.claims',
      '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal2"}', true);
    set local role authenticated;
    perform admin_api.grant_role('00000000-0000-4000-8000-0000000000b1', 'reviewer');
    reset role;
  end if;
end $$;
