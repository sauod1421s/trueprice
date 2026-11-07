-- =====================================================================
-- محاكاة محلية لبيئة Supabase — للتجربة المحلية فقط. لا تُنفَّذ على Supabase أبدًا.
--
-- تنشئ ما يوفّره Supabase تلقائيًا: أدوار anon/authenticated/service_role، مخطط auth
-- مع auth.users، ومخطط storage مبسّط، ودور ترحيل غير مدير (supa_postgres) يشبه دور
-- postgres في Supabase. تُنفَّذ بالمستخدم المدير المحلي (postgres) فقط.
-- =====================================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'auth_admin') then create role auth_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'storage_admin') then create role storage_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'supa_postgres') then
    create role supa_postgres login createrole bypassrls;
  end if;
end $$;

create schema if not exists auth authorization auth_admin;
create table if not exists auth.users (id uuid primary key, email text, created_at timestamptz not null default now());
alter table auth.users add column if not exists created_at timestamptz not null default now();
alter table auth.users owner to auth_admin;
grant usage on schema auth to anon, authenticated, service_role, supa_postgres;
grant select, references on auth.users to supa_postgres;

create schema if not exists storage authorization storage_admin;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text not null, owner uuid, created_at timestamptz not null default now());
alter table storage.buckets owner to storage_admin;
alter table storage.objects owner to storage_admin;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant storage_admin to supa_postgres;
-- في Supabase (PG17) يملك postgres عضوية بخيار الإدارة في anon/authenticated/service_role،
-- فيستطيع منحها لأدوار التطبيق (مثل tp_app). نحاكي ذلك ليُختبر ملف db/supabase/010 بنفس شروطه.
grant anon, authenticated, service_role to supa_postgres with admin option;

-- امتيازات Supabase الافتراضية في public (نحاكيها للتأكد أنها لا تتسرب لمخططاتنا)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role supa_postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role supa_postgres in schema public grant all on functions to anon, authenticated, service_role;
grant usage, create on schema public to supa_postgres;

do $$ begin execute format('grant create on database %I to supa_postgres', current_database()); end $$;
