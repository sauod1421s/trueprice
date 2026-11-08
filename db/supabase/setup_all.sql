-- =====================================================================
-- TruePrice — إعداد قاعدة Supabase كاملة في خطوة واحدة (SQL Editor → Run)
-- مولَّد آليًا بـ scripts/mvp/build-setup-all.mjs — لا يُعدَّل يدويًا (CI يتحقق من التطابق).
--
-- قبل التشغيل: أنشئ حساب المشرف (أو حسابَي المشرفَين) في Authentication → Users → Add user.
-- ماذا يفعل: يطبّق ملفات الإنتاج نفسها حرفيًا بالترتيب، كل ملف في معاملة مستقلة (أي خطأ يلغي الملف كله):
--   [1] db/schema/001_trueprice_v1_1.sql  sha256=d4f5f7657e97b6075b95a24969f63b23aeeddaff3ad2c3783310e15b5ff5d544  (146825 bytes)
--   [2] db/mvp/002_mvp_overlay.sql  sha256=5110d09b4ee75290eeebfd94a0766cc997fc8440adf63cd1fa686a10173e54c5  (11088 bytes)
--   [3] db/schema/003_visitors_requests.sql  sha256=a7efa90fb0c2638a73c94893a54edc59772b879b73a8a3c27c0ce20f3bc1f315  (30581 bytes)
--   [4] db/supabase/010_app_role.sql  sha256=17966ed4860632801928ea07139d182667679c8ef83b590901b7086f26ca4146  (1934 bytes)
--   [5] تهيئة المشرفين (كتلة مكتوبة هنا)
--   [6] db/seed/100_catalog_seed.sql  sha256=0836989be6c6ac81b518fca38bf42f9dc7d0c7ed19b5afba239afa10dc815170  (256111 bytes)
--   [7] db/supabase/020_set_app_password.sql  sha256=af24ed1b56eb77bdf76e7c57199049b090440610700026b4f9b990c42e1dde8e  + نتيجة الفحوص
--
-- لا حذف لأي بيانات قائمة. كلمات drop/delete داخل الملفات هي: إعادة إنشاء سياسات RLS بأسمائها،
-- أو داخل دوال لا تعمل إلا عند استدعائها، أو مشغلات تمنع الحذف من جداول السجل.
-- لا يحتوي الملف أي كلمة مرور أو مفتاح. إعادة التشغيل آمنة لكنها تولّد كلمة مرور جديدة لـ tp_app.
-- =====================================================================

-- =====================================================================
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

-- =====================================================================
-- [1] db/schema/001_trueprice_v1_1.sql — المخطط v1.1.1: المخططات والأدوار وRLS والدوال وسجل التدقيق
--     sha256=d4f5f7657e97b6075b95a24969f63b23aeeddaff3ad2c3783310e15b5ff5d544
-- =====================================================================
-- =====================================================================
-- TruePrice — مخطط قاعدة البيانات v1.1.1 (لم يُنفَّذ على Supabase بعد)
-- v1.1.1: توافق Supabase — tp.profiles (مفتاحه الأجنبي إلى auth.users) يبقى بمالك دور الترحيل؛ انظر القسم 23.
--
-- المتطلبات: PostgreSQL 15 أو أحدث (Supabase). يُشغَّل بدور الترحيل (postgres في Supabase).
-- قابل لإعادة التشغيل: كل أمر إما idempotent أو محمي بفحص وجود، والملف كله معاملة واحدة.
--
-- الأدوار:
--   tp_owner        : يملك كل الكائنات. دوال SECURITY DEFINER تعمل به. لا يسجل الدخول.
--   authenticated   : مستخدمو لوحة الإدارة (Supabase Auth). قراءة عبر RLS، كتابة محدودة بالسياسات والدوال.
--   web_reader      : الموقع العام (خادم Next.js). يقرأ مخطط pub فقط.
--   ingest_service  : خدمة الاستيراد الآلي المستقبلية. تنفّذ ingest_api فقط.
--   anon            : لا شيء.
--   service_role    : لا صلاحيات على مخططاتنا (لا يُستخدم في الموقع).
--
-- المخططات:
--   tp         : الجداول والدوال الداخلية (غير مكشوف في واجهة Supabase API)
--   pub        : واجهات القراءة للموقع (أسعار مؤهلة فقط)
--   admin_api  : دوال وواجهات لوحة الإدارة (يُكشف في API لاحقًا)
--   ingest_api : دوال خدمة الاستيراد الآلي
-- =====================================================================

begin;

do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'TruePrice schema requires PostgreSQL 15+, found %', current_setting('server_version');
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'role "authenticated" is missing: run on Supabase (or the local test shim)';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1) الأدوار
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'tp_owner') then
    create role tp_owner nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'web_reader') then
    create role web_reader nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'ingest_service') then
    create role ingest_service nologin noinherit;
  end if;
end $$;

-- دور الترحيل يحتاج عضوية tp_owner لنقل الملكية وإعادة التشغيل
grant tp_owner to current_user;

-- ---------------------------------------------------------------------
-- 2) المخططات والصلاحيات الافتراضية
-- ---------------------------------------------------------------------
create schema if not exists tp;
create schema if not exists pub;
create schema if not exists admin_api;
create schema if not exists ingest_api;

revoke all on schema tp, pub, admin_api, ingest_api from public;
grant usage, create on schema tp, pub, admin_api, ingest_api to tp_owner;

-- PostgreSQL يمنح EXECUTE على الدوال الجديدة لـ PUBLIC افتراضيًا: نلغي ذلك لهذه المخططات
alter default privileges in schema tp, pub, admin_api, ingest_api revoke execute on functions from public;
alter default privileges for role tp_owner in schema tp, pub, admin_api, ingest_api revoke execute on functions from public;
-- v1.1: على مستوى كل المخططات أيضًا (أي مخطط مستقبلي ينشئه هذان الدوران)
alter default privileges revoke execute on functions from public;
alter default privileges for role tp_owner revoke execute on functions from public;
-- Supabase يمنح anon/authenticated تنفيذ أي دالة جديدة في public ينشئها دور postgres (امتياز افتراضي للمشروع).
-- منصتنا لا تستخدم public، فنلغي ذلك لدور الترحيل حتى لا تُكشف دالة مستقبلية عبر PostgREST بالخطأ.
-- (لا يؤثر على دوال قائمة، ولا على ما ينشئه supabase_admin للإضافات.)
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) الأنواع
-- ---------------------------------------------------------------------
do $$
declare
  defs text[][] := array[
    array['category_kind',    $q$'electronics','cars'$q$],
    array['record_status',    $q$'draft','active','archived'$q$],
    array['condition',        $q$'new','used','refurbished'$q$],
    array['availability',     $q$'in_stock','out_of_stock','preorder','unknown'$q$],
    array['identifier_kind',  $q$'gtin','mpn','store_sku'$q$],
    array['spec_type',        $q$'text','number','boolean','enum'$q$],
    array['source_kind',      $q$'manual_upload','affiliate_feed','store_feed','official_api','legacy_manual'$q$],
    array['source_status',    $q$'draft','approved','suspended','retired'$q$],
    array['auth_type',        $q$'none','api_key','oauth2','basic','signed_url'$q$],
    array['match_status',     $q$'matched','needs_review','unmatched'$q$],
    array['verification',     $q$'unverified','verified','rejected'$q$],
    array['offer_event_kind', $q$'first_seen','price_changed','availability_changed','url_changed','not_seen','details_changed','fx_converted'$q$],
    array['proposal_status',  $q$'pending','approved','rejected'$q$],
    array['import_status',    $q$'uploaded','previewed','committed','failed','discarded','staging'$q$],
    array['issue_severity',   $q$'error','warning'$q$],
    array['actor_kind',       $q$'user','service'$q$]
  ];
  i int; v text;
begin
  for i in 1 .. array_length(defs, 1) loop
    if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                   where n.nspname = 'tp' and t.typname = defs[i][1]) then
      execute format('create type tp.%I as enum (%s)', defs[i][1], defs[i][2]);
    end if;
    -- ترقية نوع موجود: إضافة القيم الناقصة فقط (لا حذف)
    for v in select pg_catalog.btrim(x, $q$ '$q$) from pg_catalog.unnest(pg_catalog.string_to_array(defs[i][2], ',')) x loop
      execute format('alter type tp.%I add value if not exists %L', defs[i][1], v);
    end loop;
  end loop;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'tp' and t.typname = 'slug') then
    create domain tp.slug as text check (value ~ '^[a-z0-9][a-z0-9-]{1,62}$');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4) الإعدادات وسجل الترحيل
-- ---------------------------------------------------------------------
create table if not exists tp.schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- قيم السياسات: needs_confirmation = قيمة مقترحة تحتاج موافقة صاحب المشروع
create table if not exists tp.settings (
  key                text primary key check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  value              numeric not null,
  needs_confirmation boolean not null default true,
  note               text not null,
  updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5) المستخدمون والأدوار والصلاحيات
-- ---------------------------------------------------------------------
create table if not exists tp.profiles (
  user_id      uuid primary key references auth.users (id) on delete restrict,
  display_name text not null check (length(display_name) between 1 and 120),
  status       text not null default 'active' check (status in ('active', 'disabled')),
  created_at   timestamptz not null default now()
);

create table if not exists tp.roles (
  id          text primary key check (id in ('admin', 'reviewer', 'viewer')),
  description text not null
);

create table if not exists tp.permissions (
  id           text primary key check (id ~ '^[a-z_]+:[a-z_]+$'),
  requires_mfa boolean not null default false,
  description  text not null
);

create table if not exists tp.role_permissions (
  role_id       text not null references tp.roles (id),
  permission_id text not null references tp.permissions (id),
  primary key (role_id, permission_id)
);

create table if not exists tp.user_roles (
  user_id     uuid not null references tp.profiles (user_id),
  role_id     text not null references tp.roles (id),
  granted_by  uuid references tp.profiles (user_id),
  granted_via text not null default 'grant' check (granted_via in ('grant', 'bootstrap')),
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  primary key (user_id, role_id),
  check (granted_by is null or granted_by <> user_id),
  check (granted_via = 'bootstrap' or granted_by is not null),
  check (granted_via <> 'bootstrap' or role_id = 'admin'),
  check (expires_at is null or expires_at > granted_at)
);

-- تهيئة أول مشرف: تُنفَّذ مرة واحدة فقط (صف واحد)
create table if not exists tp.bootstrap_state (
  id           boolean primary key default true check (id),
  completed_at timestamptz not null default now(),
  admins       uuid[] not null
);

-- ---------------------------------------------------------------------
-- 6) الكتالوج — مفاتيح مركبة تمنع التناقض بين المنتج وعائلته وتصنيفه وعلامته
-- ---------------------------------------------------------------------
create table if not exists tp.categories (
  id         bigint generated always as identity primary key,
  parent_id  bigint references tp.categories (id),
  kind       tp.category_kind not null,
  slug       tp.slug not null unique,
  name_ar    text not null,
  name_en    text,
  sort_order int not null default 0,
  status     tp.record_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (id, kind),
  check (parent_id is null or parent_id <> id)
);

create table if not exists tp.brands (
  id         bigint generated always as identity primary key,
  slug       tp.slug not null unique,
  name       text not null,
  name_ar    text,
  status     tp.record_status not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists tp.product_families (
  id            bigint generated always as identity primary key,
  category_id   bigint not null,
  category_kind tp.category_kind not null,
  brand_id      bigint not null references tp.brands (id),
  slug          tp.slug not null unique,
  name          text not null,
  name_ar       text,
  status        tp.record_status not null default 'active',
  created_at    timestamptz not null default now(),
  unique (brand_id, name),
  unique (id, category_id, brand_id),
  unique (id, category_kind),
  foreign key (category_id, category_kind) references tp.categories (id, kind)
);

create table if not exists tp.products (
  id                 bigint generated always as identity primary key,
  legacy_id          int unique,                 -- يحفظ روابط /product/[id] الحالية
  family_id          bigint not null,
  category_id        bigint not null,
  category_kind      tp.category_kind not null,
  brand_id           bigint not null,
  slug               tp.slug not null unique,
  name               text not null check (length(name) <= 500),
  name_ar            text check (length(name_ar) <= 500),
  model_year         smallint check (model_year between 1990 and 2100),
  trim               text check (length(trim) <= 120),
  official_price_sar numeric(14,2) check (official_price_sar > 0),
  official_price_source_url text check (official_price_source_url ~ '^https://'),
  status             tp.record_status not null default 'draft',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, category_id),
  unique (id, category_kind),
  -- المنتج يتبع عائلته: نفس التصنيف ونفس العلامة
  foreign key (family_id, category_id, brand_id) references tp.product_families (id, category_id, brand_id),
  foreign key (category_id, category_kind) references tp.categories (id, kind),
  -- السيارة الجديدة = سنة موديل + فئة
  check (category_kind <> 'cars' or (model_year is not null and trim is not null)),
  check (official_price_sar is null or official_price_source_url is not null)
);
create index if not exists products_family_idx   on tp.products (family_id);
create index if not exists products_category_idx on tp.products (category_id) where status = 'active';
create index if not exists products_brand_idx    on tp.products (brand_id);

create table if not exists tp.spec_definitions (
  id          bigint generated always as identity primary key,
  category_id bigint not null references tp.categories (id),
  key         text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label_ar    text not null,
  unit        text,
  data_type   tp.spec_type not null,
  allowed     text[],
  unique (category_id, key),
  unique (id, category_id),
  check ((data_type = 'enum') = (allowed is not null and cardinality(allowed) > 0))
);

create table if not exists tp.product_specs (
  product_id    bigint not null,
  spec_id       bigint not null,
  category_id   bigint not null,
  value_text    text check (length(value_text) <= 500),
  value_number  numeric,
  value_boolean boolean,
  primary key (product_id, spec_id),
  -- المواصفة من نفس تصنيف المنتج
  foreign key (product_id, category_id) references tp.products (id, category_id),
  foreign key (spec_id, category_id) references tp.spec_definitions (id, category_id),
  check (num_nonnulls(value_text, value_number, value_boolean) = 1)
);

-- ---------------------------------------------------------------------
-- 7) المتاجر والأسماء البديلة والبائعون
-- ---------------------------------------------------------------------
create table if not exists tp.stores (
  id             tp.slug primary key,              -- ثابت: jarir, noon, amazon-sa
  name           text not null,
  name_ar        text not null,
  is_marketplace boolean not null default false,
  country        char(2) not null default 'SA',
  status         tp.record_status not null default 'active',
  merged_into    tp.slug references tp.stores (id),
  created_by     uuid references tp.profiles (user_id),
  created_at     timestamptz not null default now(),
  check (merged_into is null or merged_into <> id),
  check (merged_into is null or status = 'archived')
);

create table if not exists tp.product_identifiers (
  id          bigint generated always as identity primary key,
  product_id  bigint not null references tp.products (id),
  kind        tp.identifier_kind not null,
  value       text not null,
  brand_id    bigint references tp.brands (id),
  store_id    tp.slug references tp.stores (id),
  added_by    uuid references tp.profiles (user_id),
  created_at  timestamptz not null default now(),
  check (kind <> 'gtin' or value ~ '^[0-9]{14}$'),
  check (kind <> 'mpn' or (brand_id is not null and value ~ '^[A-Z0-9]{2,64}$')),
  check (kind <> 'store_sku' or store_id is not null)
);
create unique index if not exists product_identifiers_gtin_uq on tp.product_identifiers (value) where kind = 'gtin';
create unique index if not exists product_identifiers_mpn_uq  on tp.product_identifiers (brand_id, value) where kind = 'mpn';
create unique index if not exists product_identifiers_sku_uq  on tp.product_identifiers (store_id, value) where kind = 'store_sku';
create index if not exists product_identifiers_product_idx on tp.product_identifiers (product_id);

create table if not exists tp.store_domains (
  domain     text primary key check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  store_id   tp.slug not null references tp.stores (id),
  created_at timestamptz not null default now()
);

create table if not exists tp.store_aliases (
  normalized   text primary key check (length(normalized) between 1 and 200),
  store_id     tp.slug not null references tp.stores (id),
  raw_example  text not null,
  approved_by  uuid not null references tp.profiles (user_id),
  approved_at  timestamptz not null default now()
);
create index if not exists store_aliases_store_idx on tp.store_aliases (store_id);

create table if not exists tp.sellers (
  id                 bigint generated always as identity primary key,
  store_id           tp.slug not null references tp.stores (id),
  seller_key         text not null check (seller_key ~ '^[^\s]{1,120}$'),
  display_name       text not null check (length(display_name) <= 200),
  external_seller_id text,
  created_at         timestamptz not null default now(),
  unique (store_id, seller_key),
  unique (id, store_id)
);

-- ---------------------------------------------------------------------
-- 8) العملات وشبكات العمولة والمصادر
-- ---------------------------------------------------------------------
create table if not exists tp.currencies (
  code        char(3) primary key check (code ~ '^[A-Z]{3}$'),
  minor_units smallint not null check (minor_units between 0 and 4),
  name_ar     text not null
);

create table if not exists tp.affiliate_networks (
  id         tp.slug primary key,
  name       text not null,
  website    text check (website ~ '^https://'),
  terms_url  text check (terms_url ~ '^https://'),
  status     tp.source_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists tp.sources (
  id                 tp.slug primary key,
  name               text not null,
  kind               tp.source_kind not null,
  vertical           tp.category_kind not null,          -- إلكترونيات أو سيارات: لا خلط
  network_id         tp.slug references tp.affiliate_networks (id),
  store_id           tp.slug references tp.stores (id),
  default_currency   char(3) references tp.currencies (code),
  time_zone          text,
  column_map         jsonb not null default '{}'::jsonb,
  allow_automated    boolean not null default false,     -- مسموح لخدمة الاستيراد الآلي
  is_full_snapshot   boolean not null default false,     -- الملف يشمل كل عروض المصدر (يسمح بتعليم المختفي)
  status             tp.source_status not null default 'draft',
  permission_basis   text,
  permission_evidence_url text check (permission_evidence_url ~ '^https://'),
  terms_reviewed_at  timestamptz,
  approved_by        uuid references tp.profiles (user_id),
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null and permission_basis is not null)),
  check (kind <> 'affiliate_feed' or network_id is not null),
  check (not allow_automated or kind in ('affiliate_feed', 'store_feed', 'official_api')),
  check (jsonb_typeof(column_map) = 'object')
);

create table if not exists tp.source_connections (
  source_id       tp.slug primary key references tp.sources (id),
  endpoint_url    text check (endpoint_url ~ '^https://'),
  auth_type       tp.auth_type not null default 'none',
  vault_secret_id uuid,                                -- vault.secrets.id — لا أسرار في الجدول
  schedule_cron   text,
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error      text check (length(last_error) <= 2000),
  updated_at      timestamptz not null default now(),
  check (auth_type = 'none' or vault_secret_id is not null)
);

create table if not exists tp.source_contacts (
  id          bigint generated always as identity primary key,
  network_id  tp.slug references tp.affiliate_networks (id),
  source_id   tp.slug references tp.sources (id),
  store_id    tp.slug references tp.stores (id),
  name        text not null,
  email       text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role        text,
  notes       text check (length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(network_id, source_id, store_id) = 1)
);

-- أسعار التحويل: إدخال واعتماد منفصلان (مبدأ العينين)، وكلاهما إضافة فقط
create table if not exists tp.fx_rates (
  id          bigint generated always as identity primary key,
  base        char(3) not null references tp.currencies (code),
  quote       char(3) not null default 'SAR' references tp.currencies (code),
  rate        numeric(20,10) not null check (rate > 0),
  source      text not null check (length(source) between 2 and 120),
  source_url  text check (source_url ~ '^https://'),
  as_of       timestamptz not null,
  created_by  uuid not null references tp.profiles (user_id),
  created_at  timestamptz not null default now(),
  check (base <> quote),
  check (quote = 'SAR'),
  unique (base, quote, source, as_of)
);

create table if not exists tp.fx_rate_approvals (
  fx_rate_id  bigint primary key references tp.fx_rates (id),
  approved_by uuid not null references tp.profiles (user_id),
  approved_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 9) الاستيراد
-- ---------------------------------------------------------------------
create table if not exists tp.import_files (
  id             uuid primary key default gen_random_uuid(),
  source_id      tp.slug not null references tp.sources (id),
  storage_path   text not null unique check (storage_path ~ '^imports/'),
  file_name      text not null check (length(file_name) <= 255),
  byte_size      bigint not null check (byte_size between 1 and 15728640),
  sha256         char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by    uuid references tp.profiles (user_id),   -- null = خدمة آلية
  uploaded_at    timestamptz not null default now(),
  delete_after   date not null,
  deleted_at     timestamptz,
  unique (source_id, sha256),
  unique (id, source_id)
);

create table if not exists tp.import_runs (
  id             uuid primary key default gen_random_uuid(),
  file_id        uuid not null,
  source_id      tp.slug not null,
  actor_kind     tp.actor_kind not null,
  status         tp.import_status not null default 'staging',
  format         text check (format in ('csv', 'google-merchant', 'yml', 'xml', 'manual')),
  engine_version text not null check (length(engine_version) between 1 and 64),
  limits         jsonb not null,
  totals         jsonb not null default '{}'::jsonb,
  fatal_code     text,
  fatal_message  text,
  started_by     uuid references tp.profiles (user_id),
  started_at     timestamptz not null default now(),
  committed_by   uuid references tp.profiles (user_id),
  committed_at   timestamptz,
  -- v1.1: ربط الاعتماد بمحتوى المعاينة المختوم
  staged_rows    int check (staged_rows >= 0),
  content_sha256 char(64) check (content_sha256 ~ '^[0-9a-f]{64}$'),
  sealed_by      uuid references tp.profiles (user_id),
  sealed_at      timestamptz,
  -- التشغيل تابع لملف من نفس المصدر
  foreign key (file_id, source_id) references tp.import_files (id, source_id),
  check ((actor_kind = 'user') = (started_by is not null)),
  check ((status = 'committed') = (committed_at is not null)),
  check (status <> 'committed' or actor_kind = 'service' or committed_by is not null),
  check (status not in ('previewed', 'committed') or (content_sha256 is not null and sealed_at is not null)),
  check (jsonb_typeof(totals) = 'object' and jsonb_typeof(limits) = 'object')
);
create index if not exists import_runs_source_idx on tp.import_runs (source_id, started_at desc);
create unique index if not exists import_runs_committed_once on tp.import_runs (file_id) where status = 'committed';

-- v1.1: الصفوف المقبولة في المعاينة تُحفظ هنا، والاعتماد يطبّقها هي فقط (لا يستقبل صفوفًا جديدة)
create table if not exists tp.import_staged_rows (
  run_id            uuid not null references tp.import_runs (id),
  row_no            int not null check (row_no >= 1),
  payload           jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 16384),
  row_sha256        char(64) not null,
  store_id          tp.slug not null references tp.stores (id),   -- المتجر الفعلي بعد الدمج
  seller_key        text check (seller_key ~ '^[^\s]{1,120}$'),
  seller_name       text check (length(seller_name) <= 200),
  offer_key         text not null check (length(offer_key) between 1 and 600),
  condition         tp.condition not null,
  external_id       text check (length(external_id) <= 200),
  product_id        bigint references tp.products (id),
  family_id         bigint references tp.product_families (id),
  wants_review      boolean not null default false,
  amount            numeric(14,3) not null check (amount > 0 and amount <= 1000000),
  currency          char(3) not null references tp.currencies (code),
  list_amount       numeric(14,3) check (list_amount is null or list_amount > amount),
  as_of             timestamptz not null,
  source_updated_at timestamptz,
  source_offset     text check (source_offset ~ '^(Z|[+-][0-9]{2}:[0-9]{2})$'),
  assumed_time_zone text,
  feed_generated_at timestamptz,
  valid_until       timestamptz,
  date_confirmed    boolean not null,
  availability      tp.availability not null,
  url               text not null check (length(url) <= 2048),
  canonical_url     text not null check (length(canonical_url) <= 2048),
  name              text not null check (length(name) <= 500),
  car_model_year    smallint check (car_model_year between 1990 and 2100),
  car_mileage_km    int check (car_mileage_km between 0 and 2000000),
  car_trim          text check (length(car_trim) <= 120),
  car_city          text check (length(car_city) <= 80),
  car_seller_type   text check (car_seller_type in ('dealer', 'private', 'marketplace')),
  primary key (run_id, row_no),
  check (valid_until is null or valid_until > as_of)
);
create index if not exists import_staged_rows_identity_idx
  on tp.import_staged_rows (run_id, store_id, seller_key, offer_key, condition);

create table if not exists tp.store_alias_proposals (
  id                 bigint generated always as identity primary key,
  normalized         text not null check (length(normalized) between 1 and 200),
  raw_name           text not null,
  suggested_store_id tp.slug references tp.stores (id),
  reason             text not null,
  first_import_id    uuid references tp.import_runs (id),
  occurrences        int not null default 1 check (occurrences >= 1),
  status             tp.proposal_status not null default 'pending',
  decided_store_id   tp.slug references tp.stores (id),
  decided_by         uuid references tp.profiles (user_id),
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  check ((status = 'pending') = (decided_by is null)),
  check ((status = 'approved') = (decided_store_id is not null))
);
create unique index if not exists store_alias_proposals_open_uq
  on tp.store_alias_proposals (normalized) where status = 'pending';

create table if not exists tp.import_row_issues (
  id         bigint generated always as identity primary key,
  run_id     uuid not null references tp.import_runs (id) on delete cascade,
  row_no     int not null check (row_no >= 0),
  severity   tp.issue_severity not null,
  code       text not null check (code ~ '^[a-z_]{2,60}$'),
  field      text,
  message    text not null check (length(message) <= 1000),
  excerpt    jsonb,
  created_at timestamptz not null default now(),
  check (excerpt is null or pg_column_size(excerpt) <= 2048)
);
create index if not exists import_row_issues_run_idx on tp.import_row_issues (run_id, severity, row_no);
-- ---------------------------------------------------------------------
-- 10) سجل الأسعار
-- ---------------------------------------------------------------------
-- هوية العرض. السيارات المستعملة تُربط بعائلة الموديل فقط (لا بمنتج سيارة جديدة)
create table if not exists tp.offer_streams (
  id            bigint generated always as identity primary key,
  stream_key    char(32) not null unique,              -- md5 لمفتاح الهوية (للعرض والتتبع)
  category_kind tp.category_kind not null,
  store_id      tp.slug not null references tp.stores (id),
  seller_id     bigint,
  offer_key     text not null check (length(offer_key) between 1 and 600),
  condition     tp.condition not null,
  external_id   text check (length(external_id) <= 200),
  product_id    bigint,
  family_id     bigint,
  match_status  tp.match_status not null default 'unmatched',
  first_seen_at timestamptz not null default now(),
  constraint offer_streams_identity_uq unique nulls not distinct (store_id, seller_id, offer_key, condition),
  unique (id, condition, category_kind),
  -- البائع تابع لنفس المتجر
  foreign key (seller_id, store_id) references tp.sellers (id, store_id),
  -- المنتج والعائلة من نفس القطاع
  foreign key (product_id, category_kind) references tp.products (id, category_kind),
  foreign key (family_id, category_kind) references tp.product_families (id, category_kind),
  check (category_kind <> 'cars' or condition in ('new', 'used')),
  check (not (category_kind = 'cars' and condition = 'used' and product_id is not null)),
  check (family_id is null or (category_kind = 'cars' and condition = 'used')),
  check ((match_status = 'matched') = (product_id is not null or family_id is not null))
);
create index if not exists offer_streams_product_idx on tp.offer_streams (product_id, condition) where product_id is not null;
create index if not exists offer_streams_family_idx  on tp.offer_streams (family_id) where family_id is not null;
create index if not exists offer_streams_review_idx  on tp.offer_streams (match_status) where match_status = 'needs_review';

create table if not exists tp.price_observations (
  id                bigint generated always as identity primary key,
  observed_hash     char(32) not null unique,             -- stream|amount|currency|list|as_of|date_confirmed|valid_until
  stream_id         bigint not null references tp.offer_streams (id),
  source_id         tp.slug not null references tp.sources (id),
  import_run_id     uuid not null references tp.import_runs (id),   -- كل سعر له استيراد (حتى اليدوي والقديم)
  amount            numeric(14,3) not null check (amount > 0 and amount <= 1000000),
  currency          char(3) not null references tp.currencies (code),
  list_amount       numeric(14,3) check (list_amount is null or list_amount > amount),
  sar_amount        numeric(14,2),
  sar_list_amount   numeric(14,2),
  fx_rate_id        bigint references tp.fx_rates (id),
  as_of             timestamptz not null,
  source_updated_at timestamptz,
  source_offset     text check (source_offset ~ '^(Z|[+-][0-9]{2}:[0-9]{2})$'),
  assumed_time_zone text,
  feed_generated_at timestamptz,
  valid_until       timestamptz,                          -- نهاية العرض/الخصم إن ذكرها المصدر
  date_confirmed    boolean not null default true,        -- false للأسعار القديمة غير المثبتة
  url               text not null check (length(url) <= 2048),
  canonical_url     text not null check (length(canonical_url) <= 2048),
  name_snapshot     text not null check (length(name_snapshot) <= 500),
  recorded_at       timestamptz not null default now(),
  unique (id, stream_id),
  check (
    (currency = 'SAR' and sar_amount = round(amount, 2) and fx_rate_id is null)
    or (currency <> 'SAR' and ((sar_amount is null and fx_rate_id is null)
                               or (sar_amount is not null and fx_rate_id is not null)))
  ),
  check ((list_amount is null) = (sar_list_amount is null) or sar_amount is null),
  check (as_of <= recorded_at + interval '10 minutes'),
  check (valid_until is null or valid_until > as_of)
);
create index if not exists price_observations_stream_idx on tp.price_observations (stream_id, as_of desc);
create index if not exists price_observations_import_idx on tp.price_observations (import_run_id);

create table if not exists tp.stream_state (
  stream_id              bigint primary key references tp.offer_streams (id),
  current_observation_id bigint not null,
  availability           tp.availability not null,
  url                    text not null check (length(url) <= 2048),
  canonical_url          text not null check (length(canonical_url) <= 2048),
  last_seen_at           timestamptz not null,
  last_as_of             timestamptz not null,
  last_import_run_id     uuid not null references tp.import_runs (id),
  last_source_id         tp.slug not null references tp.sources (id),
  delisted_at            timestamptz,
  -- v1.1: آخر بيانات تاريخ وردت من المصدر (تُحدَّث مع كل ظهور غير قديم)
  last_source_updated_at timestamptz,
  last_source_offset     text,
  last_feed_generated_at timestamptz,
  -- السعر الحالي يجب أن يكون من نفس العرض
  foreign key (current_observation_id, stream_id) references tp.price_observations (id, stream_id)
);
create index if not exists stream_state_freshness_idx on tp.stream_state (last_as_of);
create index if not exists stream_state_source_idx on tp.stream_state (last_source_id) where delisted_at is null;

create table if not exists tp.offer_events (
  id                      bigint generated always as identity primary key,
  stream_id               bigint not null,
  observation_id          bigint not null,
  kind                    tp.offer_event_kind not null,
  previous_observation_id bigint,
  from_value              text,
  to_value                text,
  at                      timestamptz not null default now(),
  import_run_id           uuid not null references tp.import_runs (id),
  foreign key (observation_id, stream_id) references tp.price_observations (id, stream_id),
  foreign key (previous_observation_id, stream_id) references tp.price_observations (id, stream_id),
  check ((kind in ('price_changed', 'details_changed')) = (previous_observation_id is not null))
);
create index if not exists offer_events_stream_idx on tp.offer_events (stream_id, at desc);

-- تفاصيل إعلان السيارة: مربوطة بحالة العرض وقطاعه، فلا تُضاف لعرض إلكترونيات ولا تختلط حالة جديد/مستعمل
create table if not exists tp.car_listing_details (
  stream_id     bigint primary key,
  condition     tp.condition not null,
  category_kind tp.category_kind not null default 'cars',
  model_year    smallint not null check (model_year between 1990 and 2100),
  mileage_km    int check (mileage_km between 0 and 2000000),
  trim          text not null check (length(trim) between 1 and 120),
  city          text check (length(city) <= 80),
  seller_type   text check (seller_type in ('dealer', 'private', 'marketplace')),
  updated_at    timestamptz not null default now(),
  foreign key (stream_id, condition, category_kind) references tp.offer_streams (id, condition, category_kind),
  check (category_kind = 'cars'),
  check (condition in ('new', 'used')),
  check (condition <> 'used' or (mileage_km is not null and mileage_km >= 1))
);

-- ---------------------------------------------------------------------
-- 11) التحقق والمراجعة والتدقيق (إضافة فقط)
-- ---------------------------------------------------------------------
create table if not exists tp.verification_events (
  id             bigint generated always as identity primary key,
  observation_id bigint not null references tp.price_observations (id),
  -- v1.1: كل قرار يذكر القرار الذي يعدّله؛ قراران على نفس الأساس مستحيلان (قيد فريد)
  previous_event_id bigint references tp.verification_events (id),
  status         tp.verification not null check (status in ('verified', 'rejected')),
  reason_code    text check (reason_code ~ '^[a-z_]{2,60}$'),
  note           text check (length(note) <= 2000),
  evidence_url   text check (evidence_url ~ '^https://'),
  actor_id       uuid not null references tp.profiles (user_id),
  at             timestamptz not null default clock_timestamp(),
  constraint verification_events_chain_uq unique nulls not distinct (observation_id, previous_event_id),
  check (previous_event_id is null or previous_event_id <> id),
  check (status <> 'rejected' or (note is not null and length(btrim(note)) >= 3))
);
create index if not exists verification_events_obs_idx on tp.verification_events (observation_id, at desc, id desc);

-- v1.1: تحويل لاحق لسعر أجنبي عند اعتماد سعر صرف (إضافة فقط، لا يعدّل ملاحظة السعر)
create table if not exists tp.observation_conversions (
  id              bigint generated always as identity primary key,
  observation_id  bigint not null unique references tp.price_observations (id),
  fx_rate_id      bigint not null references tp.fx_rates (id),
  sar_amount      numeric(14,2) not null check (sar_amount > 0),
  sar_list_amount numeric(14,2),
  reason          text not null check (reason in ('fx_approved')),
  computed_by     uuid references tp.profiles (user_id),
  computed_at     timestamptz not null default clock_timestamp()
);
create index if not exists observation_conversions_fx_idx on tp.observation_conversions (fx_rate_id);

create table if not exists tp.match_reviews (
  id         bigint generated always as identity primary key,
  stream_id  bigint not null references tp.offer_streams (id),
  decision   text not null check (decision in ('match', 'reject')),
  product_id bigint references tp.products (id),
  family_id  bigint references tp.product_families (id),
  note       text check (length(note) <= 2000),
  actor_id   uuid not null references tp.profiles (user_id),
  at         timestamptz not null default now(),
  check ((decision = 'match') = (num_nonnulls(product_id, family_id) = 1))
);

create table if not exists tp.store_merges (
  id          bigint generated always as identity primary key,
  from_store  tp.slug not null references tp.stores (id),
  to_store    tp.slug not null references tp.stores (id),
  reason      text not null,
  actor_id    uuid not null references tp.profiles (user_id),
  at          timestamptz not null default now(),
  check (from_store <> to_store)
);

create table if not exists tp.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null,
  actor_id    uuid references tp.profiles (user_id),
  actor_label text,                                     -- مثل service:<source> للمهام الآلية
  actor_aal   text,
  action      text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  entity_type text not null,
  entity_id   text not null,
  before      jsonb,
  after       jsonb,
  prev_hash   char(64),
  row_hash    char(64) not null unique
);
create index if not exists audit_log_entity_idx on tp.audit_log (entity_type, entity_id, at desc);
create index if not exists audit_log_actor_idx  on tp.audit_log (actor_id, at desc);

-- بيانات الطلب (IP والمتصفح) منفصلة عن السلسلة حتى يمكن حذفها بعد 12 شهرًا دون كسر البصمات
create table if not exists tp.audit_request_meta (
  audit_id   bigint primary key references tp.audit_log (id),
  ip         inet,
  user_agent text check (length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
-- ---------------------------------------------------------------------
-- 12) دوال مساعدة
--     كل دالة SECURITY DEFINER: search_path = '' وكل الأسماء مؤهلة بالمخطط.
--     EXECUTE ممنوع على PUBLIC، ويُمنح صراحة في القسم 17.
-- ---------------------------------------------------------------------

-- هوية المستخدم من رمز الجلسة (نفس المصدر الذي يقرأ منه auth.uid() في Supabase)
create or replace function tp.current_uid() returns uuid
language sql stable set search_path = '' as $$
  select nullif(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;

create or replace function tp.current_aal() returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal', 'aal1')
$$;

create or replace function tp.setting(p_key text) returns numeric
language plpgsql stable set search_path = '' as $$
declare v numeric;
begin
  select s.value into v from tp.settings s where s.key = p_key;
  if v is null then
    raise exception 'missing setting %', p_key using errcode = 'P0002';
  end if;
  return v;
end $$;

create or replace function tp.has_permission(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from tp.user_roles ur
    join tp.profiles pr on pr.user_id = ur.user_id and pr.status = 'active'
    join tp.role_permissions rp on rp.role_id = ur.role_id
    join tp.permissions pm on pm.id = rp.permission_id
    where ur.user_id = tp.current_uid()
      and rp.permission_id = p
      and (ur.expires_at is null or ur.expires_at > now())
      and (not pm.requires_mfa or tp.current_aal() = 'aal2')
  )
$$;

create or replace function tp.require_permission(p text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := tp.current_uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not tp.has_permission(p) then
    raise exception 'permission denied: %', p using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- سجل الإجراءات بسلسلة بصمات SHA-256 (تكشف الحذف والتعديل خارج النظام، ولا تمنعهما)
create or replace function tp.audit_payload(
  p_at timestamptz, p_actor uuid, p_label text, p_aal text, p_action text,
  p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb, p_prev text
) returns text
language sql immutable set search_path = '' as $$
  select coalesce(p_prev, '') || '|' || pg_catalog.jsonb_build_object(
    'at', pg_catalog.to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'actor', p_actor, 'label', p_label, 'aal', p_aal, 'action', p_action,
    'entity_type', p_entity_type, 'entity_id', p_entity_id, 'before', p_before, 'after', p_after
  )::text
$$;

create or replace function tp.write_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null,
  p_actor uuid default null, p_label text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_prev text; v_at timestamptz := pg_catalog.clock_timestamp();
  v_actor uuid := coalesce(p_actor, tp.current_uid());
  v_aal text := case when tp.current_uid() is null then null else tp.current_aal() end;
  v_hash text; v_id bigint; v_headers jsonb;
begin
  -- تسلسل الكتابة حتى تبقى السلسلة خطية
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('tp.audit_chain'));
  select a.row_hash into v_prev from tp.audit_log a order by a.id desc limit 1;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    tp.audit_payload(v_at, v_actor, p_label, v_aal, p_action, p_entity_type, p_entity_id, p_before, p_after, v_prev),
    'UTF8')), 'hex');
  insert into tp.audit_log (at, actor_id, actor_label, actor_aal, action, entity_type, entity_id, before, after, prev_hash, row_hash)
  values (v_at, v_actor, p_label, v_aal, p_action, p_entity_type, p_entity_id, p_before, p_after, v_prev, v_hash)
  returning id into v_id;
  -- عنوان IP من ترويسات PostgREST إن وُجدت (لا يفشل التدقيق إن كانت غير صالحة)
  begin
    v_headers := nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb;
    if v_headers is not null then
      insert into tp.audit_request_meta (audit_id, ip, user_agent)
      values (v_id, nullif(btrim(pg_catalog.split_part(v_headers ->> 'x-forwarded-for', ',', 1)), '')::inet,
              pg_catalog.left(v_headers ->> 'user-agent', 400));
    end if;
  exception when others then
    null;
  end;
  return v_id;
end $$;

create or replace function tp.verify_audit_chain()
returns table (ok boolean, checked bigint, first_bad_id bigint)
language plpgsql stable security definer set search_path = '' as $$
declare r record; v_prev text := null; v_n bigint := 0; v_calc text;
begin
  for r in select * from tp.audit_log order by id loop
    v_n := v_n + 1;
    v_calc := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      tp.audit_payload(r.at, r.actor_id, r.actor_label, r.actor_aal, r.action, r.entity_type, r.entity_id, r.before, r.after, v_prev),
      'UTF8')), 'hex');
    if r.prev_hash is distinct from v_prev or r.row_hash <> v_calc then
      return query select false, v_n, r.id; return;
    end if;
    v_prev := r.row_hash;
  end loop;
  return query select true, v_n, null::bigint;
end $$;

-- ---------------------------------------------------------------------
-- 13) دوال المشغّلات (triggers)
-- ---------------------------------------------------------------------
create or replace function tp.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'append-only table %: % is not allowed', tg_table_name, tg_op
    using errcode = '42501';
end $$;

-- تدقيق تعديلات الجداول القابلة للتعديل (الكتالوج، المتاجر، المصادر، ...)
create or replace function tp.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_key text := tg_argv[0]; v_row jsonb;
begin
  v_row := pg_catalog.to_jsonb(coalesce(new, old));
  perform tp.write_audit(
    pg_catalog.lower(tg_table_name || '.' || tg_op), tg_table_name, coalesce(v_row ->> v_key, '?'),
    case when tg_op in ('UPDATE', 'DELETE') then pg_catalog.to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then pg_catalog.to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function tp.check_product_spec() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d tp.spec_definitions;
begin
  select * into d from tp.spec_definitions where id = new.spec_id;
  if (d.data_type = 'number'  and new.value_number  is null)
  or (d.data_type = 'boolean' and new.value_boolean is null)
  or (d.data_type in ('text', 'enum') and new.value_text is null)
  or (d.data_type = 'enum' and not (new.value_text = any (d.allowed))) then
    raise exception 'spec % expects % value', d.key, d.data_type using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function tp.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- اعتماد المصدر: يُسجَّل من اعتمده من الجلسة نفسها، لا من قيمة يرسلها المستخدم
create or replace function tp.stamp_source_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    new.approved_by := coalesce(tp.current_uid(), new.approved_by);
    new.approved_at := now();
  elsif tg_op = 'UPDATE' and new.status = 'approved' then
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
  end if;
  return new;
end $$;

-- التحقق من تحويل العملة عند تسجيل السعر
create or replace function tp.check_observation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f tp.fx_rates; v_ok boolean; v_max_days numeric := tp.setting('fx_max_age_days');
begin
  if new.fx_rate_id is not null then
    select * into f from tp.fx_rates where id = new.fx_rate_id;
    select exists (select 1 from tp.fx_rate_approvals a where a.fx_rate_id = f.id) into v_ok;
    if f.base <> new.currency or f.quote <> 'SAR' then
      raise exception 'fx rate % does not convert % to SAR', f.id, new.currency using errcode = '23514';
    end if;
    if not v_ok then
      raise exception 'fx rate % is not approved', f.id using errcode = '23514';
    end if;
    if abs(extract(epoch from (f.as_of - new.as_of))) > v_max_days * 86400 then
      raise exception 'fx rate % is too far from price date', f.id using errcode = '23514';
    end if;
    if new.sar_amount <> round(new.amount * f.rate, 2)
       or (new.list_amount is not null and new.sar_list_amount is distinct from round(new.list_amount * f.rate, 2)) then
      raise exception 'SAR amount does not match fx rate %', f.id using errcode = '23514';
    end if;
  elsif new.currency = 'SAR' and new.list_amount is not null and new.sar_list_amount is distinct from round(new.list_amount, 2) then
    raise exception 'SAR list amount mismatch' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function tp.check_stream_state() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_as_of timestamptz;
begin
  select o.as_of into v_as_of from tp.price_observations o where o.id = new.current_observation_id;
  if new.last_as_of < v_as_of then
    raise exception 'stream_state.last_as_of is older than the current observation' using errcode = '23514';
  end if;
  return new;
end $$;

-- هوية العرض لا تتغير؛ والسيارة الجديدة يجب أن تطابق سنة وفئة منتجها
create or replace function tp.check_stream_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.store_id, new.seller_id, new.offer_key, new.condition, new.category_kind, new.stream_key)
     is distinct from (old.store_id, old.seller_id, old.offer_key, old.condition, old.category_kind, old.stream_key) then
    raise exception 'offer stream identity is immutable' using errcode = '42501';
  end if;
  if new.product_id is distinct from old.product_id and new.category_kind = 'cars' then
    perform tp.check_car_consistency(new.id);
  end if;
  return new;
end $$;

create or replace function tp.check_car_consistency(p_stream bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare d tp.car_listing_details; p tp.products; s tp.offer_streams;
begin
  select * into s from tp.offer_streams where id = p_stream;
  select * into d from tp.car_listing_details where stream_id = p_stream;
  if not found then return; end if;           -- التحقق من وجود التفاصيل مؤجل لنهاية المعاملة
  if d.model_year > extract(year from now())::int + 1 then
    raise exception 'model year % is in the future', d.model_year using errcode = '23514';
  end if;
  if d.condition = 'new' and d.mileage_km is not null and d.mileage_km > tp.setting('max_new_car_km') then
    raise exception 'new car mileage % exceeds the new-car limit', d.mileage_km using errcode = '23514';
  end if;
  if s.product_id is not null then
    select * into p from tp.products where id = s.product_id;
    if p.model_year <> d.model_year or pg_catalog.lower(p.trim) <> pg_catalog.lower(d.trim) then
      raise exception 'car listing (% %) does not match product % (% %)',
        d.model_year, d.trim, p.id, p.model_year, p.trim using errcode = '23514';
    end if;
  end if;
end $$;

create or replace function tp.check_car_details() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function tp.check_car_details_after() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform tp.check_car_consistency(new.stream_id);
  return null;
end $$;

-- كل عرض سيارة يجب أن تكون له تفاصيل (يُفحص عند نهاية المعاملة)
create or replace function tp.require_car_details() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from tp.car_listing_details d where d.stream_id = new.id) then
    raise exception 'car offer stream % has no car_listing_details', new.id using errcode = '23514';
  end if;
  return null;
end $$;

create or replace function tp.check_fx_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_creator uuid;
begin
  select f.created_by into v_creator from tp.fx_rates f where f.id = new.fx_rate_id;
  if v_creator = new.approved_by then
    raise exception 'fx rate must be approved by someone other than its creator' using errcode = '42501';
  end if;
  return new;
end $$;

-- v1.1: التحويل اللاحق يخضع لنفس شروط التحويل عند التسجيل
create or replace function tp.check_conversion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o tp.price_observations; f tp.fx_rates; v_max_days numeric := tp.setting('fx_max_age_days');
begin
  select * into o from tp.price_observations where id = new.observation_id;
  select * into f from tp.fx_rates where id = new.fx_rate_id;
  if o.sar_amount is not null then
    raise exception 'observation % already has a SAR amount', o.id using errcode = '23514';
  end if;
  if f.base <> o.currency or f.quote <> 'SAR' then
    raise exception 'fx rate % does not convert % to SAR', f.id, o.currency using errcode = '23514';
  end if;
  if not exists (select 1 from tp.fx_rate_approvals a where a.fx_rate_id = f.id) then
    raise exception 'fx rate % is not approved', f.id using errcode = '23514';
  end if;
  if abs(extract(epoch from (f.as_of - o.as_of))) > v_max_days * 86400 then
    raise exception 'fx rate % is too far from price date', f.id using errcode = '23514';
  end if;
  if new.sar_amount <> round(o.amount * f.rate, 2)
     or new.sar_list_amount is distinct from round(o.list_amount * f.rate, 2) then
    raise exception 'converted amount does not match fx rate %', f.id using errcode = '23514';
  end if;
  return new;
end $$;

-- v1.1: صفوف المعاينة قابلة للإضافة فقط أثناء staging، ولا تتغير بعد الختم
create or replace function tp.guard_staged_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status tp.import_status;
begin
  select r.status into v_status from tp.import_runs r where r.id = coalesce(new.run_id, old.run_id);
  if tg_op = 'INSERT' and v_status = 'staging' then
    new.row_sha256 := tp.staged_row_digest(new);   -- البصمة من القيم المخزنة نفسها
    return new;
  end if;
  if tg_op = 'DELETE' and v_status in ('committed', 'discarded', 'failed') then
    return old;   -- الحذف بمهمة الاحتفاظ فقط بعد انتهاء التشغيل
  end if;
  raise exception 'staged rows of run % are sealed (status %): % not allowed',
    coalesce(new.run_id, old.run_id), v_status, tg_op using errcode = '42501';
end $$;

create or replace function tp.forbid_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'table %: UPDATE is not allowed', tg_table_name using errcode = '42501';
end $$;

-- v1.1: فحص صلاحيات قابل للتشغيل في CI وبعد كل ترحيل مستقبلي
create or replace function tp.privilege_violations()
returns table (kind text, object text, detail text)
language sql stable security definer set search_path = '' as $$
  -- دوال قابلة للتنفيذ من PUBLIC أو anon
  select 'function_public_execute', p.oid::regprocedure::text, 'EXECUTE granted to PUBLIC or anon'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  -- v1.1: كل المخططات غير النظامية وغير المُدارة من Supabase (أي مخطط مستقبلي)، عدا دوال الإضافات
  where n.nspname not like 'pg\_%' and n.nspname not in ('information_schema', 'auth', 'storage', 'extensions',
          'graphql', 'graphql_public', 'realtime', 'vault', 'pgsodium', 'pgsodium_masks', 'cron', 'net',
          'supabase_functions', 'supabase_migrations', 'pgbouncer')
    and not exists (select 1 from pg_catalog.pg_depend d where d.classid = 'pg_catalog.pg_proc'::regclass
                    and d.objid = p.oid and d.deptype = 'e')
    and (exists (select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
                 where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         or (exists (select 1 from pg_catalog.pg_roles x where x.rolname = 'anon')
             and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')))
  union all
  -- دوال DEFINER بلا search_path فارغ أو بمالك غير tp_owner
  select 'definer_unsafe', p.oid::regprocedure::text,
         'owner=' || pg_catalog.pg_get_userbyid(p.proowner) || ' config=' || coalesce(pg_catalog.array_to_string(p.proconfig, ','), '')
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('tp', 'pub', 'admin_api', 'ingest_api') and p.prosecdef
    and (p.proconfig is null or not ('search_path=""' = any (p.proconfig))
         or pg_catalog.pg_get_userbyid(p.proowner) <> 'tp_owner')
  union all
  -- جداول بلا RLS
  select 'table_without_rls', c.oid::regclass::text, 'row level security disabled'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'tp' and c.relkind = 'r' and not c.relrowsecurity
  union all
  -- أي صلاحية لأدوار لا يجب أن ترى مخططاتنا
  select 'role_has_access', c.oid::regclass::text, r.rolname
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('service_role')) r(rolname)
  where n.nspname in ('tp', 'pub', 'admin_api', 'ingest_api') and c.relkind in ('r', 'v')
    and exists (select 1 from pg_catalog.pg_roles x where x.rolname = r.rolname)
    and pg_catalog.has_table_privilege(r.rolname, c.oid, 'SELECT,INSERT,UPDATE,DELETE')
$$;
-- ---------------------------------------------------------------------
-- 14) الاستيراد v1.1: تسجيل ← رفع الصفوف على دفعات ← ختم المعاينة ← اعتماد واحد ذري
--
--   register  : ينشئ الملف والتشغيل بحالة staging
--   stage     : يضيف دفعة صفوف (حتى max_stage_chunk_rows) بعد فحصها؛ لا شيء منها مرئي للموقع
--   seal      : يقفل الصفوف ويحسب بصمة SHA-256 للمحتوى ويعيدها (هذه هي المعاينة المعتمدة)
--   commit    : لا يستقبل صفوفًا؛ يطبّق الصفوف المختومة فقط إذا طابقت البصمة التي رآها المعتمِد،
--               بعمليات مجمّعة (set-based) في معاملة واحدة: كل شيء يظهر معًا أو لا شيء
-- ---------------------------------------------------------------------
create or replace function tp.register_import_core(
  p_actor uuid, p_kind tp.actor_kind,
  p_source_id text, p_storage_path text, p_file_name text, p_byte_size bigint, p_sha256 text,
  p_engine_version text, p_format text, p_limits jsonb, p_totals jsonb,
  p_issues jsonb default '[]'::jsonb, p_store_proposals jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s tp.sources; v_file uuid; v_run uuid; v_existing uuid; i jsonb;
begin
  select * into s from tp.sources where id = p_source_id for share;
  if not found then raise exception 'unknown source %', p_source_id using errcode = '23503'; end if;
  if s.status <> 'approved' then
    raise exception 'source % is not approved (status %)', s.id, s.status using errcode = '42501';
  end if;
  if p_kind = 'service' and not s.allow_automated then
    raise exception 'source % does not allow automated imports', s.id using errcode = '42501';
  end if;
  if jsonb_typeof(p_issues) <> 'array' or jsonb_typeof(p_store_proposals) <> 'array' then
    raise exception 'issues and store proposals must be JSON arrays' using errcode = '22023';
  end if;
  if jsonb_array_length(p_issues) > tp.setting('max_import_rows') then
    raise exception 'too many issues' using errcode = '22023';
  end if;

  select f.id into v_existing from tp.import_files f where f.source_id = s.id and f.sha256 = p_sha256;
  if found then
    raise exception 'duplicate file: already registered as %', v_existing using errcode = '23505';
  end if;

  insert into tp.import_files (source_id, storage_path, file_name, byte_size, sha256, uploaded_by, delete_after)
  values (s.id, p_storage_path, p_file_name, p_byte_size, p_sha256, p_actor,
          current_date + tp.setting('import_file_retention_days')::int)
  returning id into v_file;

  insert into tp.import_runs (file_id, source_id, actor_kind, status, format, engine_version, limits, totals, started_by)
  values (v_file, s.id, p_kind, 'staging', p_format, p_engine_version, p_limits, p_totals, p_actor)
  returning id into v_run;

  insert into tp.import_row_issues (run_id, row_no, severity, code, field, message, excerpt)
  select v_run, (x ->> 'row')::int, (x ->> 'severity')::tp.issue_severity, x ->> 'code', x ->> 'field',
         pg_catalog.left(x ->> 'message', 1000), x -> 'excerpt'
  from jsonb_array_elements(p_issues) x;

  for i in select * from jsonb_array_elements(p_store_proposals) loop
    insert into tp.store_alias_proposals (normalized, raw_name, suggested_store_id, reason, first_import_id, occurrences)
    values (i ->> 'normalized', i ->> 'raw_name', nullif(i ->> 'suggested_store_id', ''), i ->> 'reason', v_run,
            greatest(coalesce((i ->> 'rows')::int, 1), 1))
    on conflict (normalized) where status = 'pending'
    do update set occurrences = tp.store_alias_proposals.occurrences + excluded.occurrences;
  end loop;

  perform tp.write_audit('import.register', 'import_run', v_run::text, null,
    pg_catalog.jsonb_build_object('source', s.id, 'file', p_file_name, 'sha256', p_sha256, 'totals', p_totals),
    p_actor, case when p_kind = 'service' then 'service:' || s.id end);
  return v_run;
end $$;

-- بصمة صف مختوم: تغطي كل الأعمدة التي يطبّقها الاعتماد + النص الأصلي
create or replace function tp.staged_row_digest(r tp.import_staged_rows) returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
    r.row_no, r.store_id, r.seller_key, r.seller_name, r.offer_key, r.condition, r.external_id, r.product_id,
    r.family_id, r.wants_review, r.amount, r.currency, r.list_amount,
    pg_catalog.to_char(r.as_of at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    pg_catalog.to_char(r.source_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    r.source_offset, r.assumed_time_zone,
    pg_catalog.to_char(r.feed_generated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    pg_catalog.to_char(r.valid_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    r.date_confirmed, r.availability, r.url, r.canonical_url, r.name,
    r.car_model_year, r.car_mileage_km, r.car_trim, r.car_city, r.car_seller_type, r.payload
  )::text, 'UTF8')), 'hex')
$$;

-- بصمة المحتوى = SHA-256 لبصمات الصفوف بترتيبها. p_recompute يعيد حساب كل صف من أعمدته
create or replace function tp.staged_content_sha256(p_run uuid, p_recompute boolean) returns text
language sql stable set search_path = '' as $$
  -- v1.1: معرّف التشغيل جزء من البصمة، فبصمة معاينة لا تصلح لتشغيل آخر حتى لو تطابق المحتوى
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
           p_run::text || ':' || coalesce(pg_catalog.string_agg(case when p_recompute then tp.staged_row_digest(sr) else sr.row_sha256 end, '' order by sr.row_no), ''),
           'UTF8')), 'hex')
  from tp.import_staged_rows sr where sr.run_id = p_run
$$;

create or replace function tp.stage_rows_core(
  p_actor uuid, p_kind tp.actor_kind, p_run_id uuid, p_first_row_no int, p_rows jsonb
) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r tp.import_runs; s tp.sources; v_n int; v_problem record; v_total int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be a JSON array' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_rows);
  if v_n = 0 or v_n > tp.setting('max_stage_chunk_rows') then
    raise exception 'a chunk must contain 1..% rows (got %)', tp.setting('max_stage_chunk_rows'), v_n using errcode = '22023';
  end if;
  if p_first_row_no is null or p_first_row_no < 1 then
    raise exception 'first row number must be >= 1' using errcode = '22023';
  end if;

  -- قفل التشغيل: الدفعات تُضاف بالتتابع
  select * into r from tp.import_runs where id = p_run_id for update;
  if not found then raise exception 'import run % not found', p_run_id using errcode = 'P0002'; end if;
  if r.status <> 'staging' then
    raise exception 'import run % is not accepting rows (status %)', r.id, r.status using errcode = '55000';
  end if;
  if r.actor_kind <> p_kind or (p_kind = 'user' and r.started_by is distinct from p_actor) then
    raise exception 'only the actor who registered the import can add rows' using errcode = '42501';
  end if;
  select * into s from tp.sources where id = r.source_id;
  if s.status <> 'approved' then
    raise exception 'source % is not approved (status %)', s.id, s.status using errcode = '42501';
  end if;

  -- حد حجم التشغيل الواحد: الاعتماد ذري في استدعاء واحد، فيجب أن يبقى تحت مهلة الطلب (انظر التقرير)
  if (select count(*) from tp.import_staged_rows where run_id = r.id) + v_n > tp.setting('max_commit_rows') then
    raise exception 'import run exceeds max_commit_rows (%); split the file into several runs',
      tp.setting('max_commit_rows') using errcode = '54000';
  end if;

  -- فحص كل الصفوف قبل الإدراج، والإبلاغ عن أول صف خاطئ برقمه
  select x.row_no, x.problem into v_problem
  from (
    select p_first_row_no + (t.ord - 1)::int as row_no,
      case
        when jsonb_typeof(t.j) <> 'object' then 'row is not a JSON object'
        when coalesce(t.j ->> 'offer_key', '') = '' or t.j ->> 'amount' is null or t.j ->> 'currency' is null
          or t.j ->> 'as_of' is null or t.j ->> 'url' is null or t.j ->> 'canonical_url' is null
          or t.j ->> 'name' is null or t.j ->> 'store_id' is null or t.j ->> 'condition' is null
          then 'missing required fields'
        when st.id is null then 'unknown store ' || (t.j ->> 'store_id')
        when tgt.status <> 'active' then 'store ' || tgt.id || ' is not active'
        when s.store_id is not null and tgt.id <> s.store_id then 'row store does not belong to single-store source ' || s.id
        when s.vertical = 'cars' and (t.j -> 'car' is null or t.j -> 'car' ->> 'model_year' is null or t.j -> 'car' ->> 'trim' is null)
          then 'car source rows require car details'
        when s.vertical <> 'cars' and t.j ? 'car' then 'car details are not allowed for ' || s.vertical || ' sources'
        when s.vertical = 'cars' and t.j ->> 'condition' = 'used' and coalesce(t.j ->> 'product_id', '') <> ''
          then 'used cars are matched to a model family, not to a new-car product'
        when coalesce(t.j ->> 'product_id', '') <> '' and p.id is null then 'unknown product ' || (t.j ->> 'product_id')
        when p.id is not null and p.category_kind <> s.vertical then 'product ' || p.id || ' belongs to another vertical'
        when coalesce(t.j ->> 'family_id', '') <> '' and (f.id is null or f.category_kind <> s.vertical)
          then 'family ' || (t.j ->> 'family_id') || ' is unknown or belongs to another vertical'
        when (t.j ->> 'as_of')::timestamptz > now() + interval '10 minutes' then 'as_of is in the future'
      end as problem
    from jsonb_array_elements(p_rows) with ordinality as t (j, ord)
    left join tp.stores st on st.id = t.j ->> 'store_id'
    left join tp.stores tgt on tgt.id = coalesce(st.merged_into, st.id)
    left join tp.products p on p.id = nullif(t.j ->> 'product_id', '')::bigint
    left join tp.product_families f on f.id = nullif(t.j ->> 'family_id', '')::bigint
  ) x
  where x.problem is not null
  order by x.row_no
  limit 1;
  if found then
    raise exception 'row %: %', v_problem.row_no, v_problem.problem using errcode = '22023';
  end if;

  insert into tp.import_staged_rows (run_id, row_no, payload, row_sha256, store_id, seller_key, seller_name, offer_key,
    condition, external_id, product_id, family_id, wants_review, amount, currency, list_amount, as_of, source_updated_at,
    source_offset, assumed_time_zone, feed_generated_at, valid_until, date_confirmed, availability, url, canonical_url,
    name, car_model_year, car_mileage_km, car_trim, car_city, car_seller_type)
  select r.id, p_first_row_no + (t.ord - 1)::int, t.j, repeat('0', 64),
    coalesce(st.merged_into, st.id), nullif(btrim(t.j ->> 'seller_key'), ''), nullif(t.j ->> 'seller_name', ''),
    t.j ->> 'offer_key', (t.j ->> 'condition')::tp.condition, nullif(t.j ->> 'external_id', ''),
    nullif(t.j ->> 'product_id', '')::bigint, nullif(t.j ->> 'family_id', '')::bigint,
    coalesce(t.j ->> 'match_status' = 'needs_review', false),
    (t.j ->> 'amount')::numeric, upper(t.j ->> 'currency'), nullif(t.j ->> 'list_amount', '')::numeric,
    (t.j ->> 'as_of')::timestamptz, nullif(t.j ->> 'source_updated_at', '')::timestamptz,
    nullif(t.j ->> 'source_offset', ''), nullif(t.j ->> 'assumed_time_zone', ''),
    nullif(t.j ->> 'feed_generated_at', '')::timestamptz, nullif(t.j ->> 'valid_until', '')::timestamptz,
    case when s.kind = 'legacy_manual' then false else coalesce((t.j ->> 'date_confirmed')::boolean, true) end,
    coalesce(nullif(t.j ->> 'availability', ''), 'unknown')::tp.availability,
    t.j ->> 'url', t.j ->> 'canonical_url', t.j ->> 'name',
    (t.j -> 'car' ->> 'model_year')::smallint, nullif(t.j -> 'car' ->> 'mileage_km', '')::int,
    t.j -> 'car' ->> 'trim', nullif(t.j -> 'car' ->> 'city', ''), nullif(t.j -> 'car' ->> 'seller_type', '')
  from jsonb_array_elements(p_rows) with ordinality as t (j, ord)
  join tp.stores st on st.id = t.j ->> 'store_id';

  -- بصمة كل صف تُحسب في المشغّل guard_staged_rows من القيم المخزنة نفسها

  select count(*) into v_total from tp.import_staged_rows where run_id = r.id;
  return v_total;
end $$;

create or replace function tp.seal_import_core(p_actor uuid, p_kind tp.actor_kind, p_run_id uuid, p_expected_rows int)
returns text
language plpgsql security definer set search_path = '' as $$
declare r tp.import_runs; v_count int; v_max int; v_hash text;
begin
  select * into r from tp.import_runs where id = p_run_id for update;
  if not found then raise exception 'import run % not found', p_run_id using errcode = 'P0002'; end if;
  if r.status <> 'staging' then
    raise exception 'import run % cannot be sealed (status %)', r.id, r.status using errcode = '55000';
  end if;
  if r.actor_kind <> p_kind or (p_kind = 'user' and r.started_by is distinct from p_actor) then
    raise exception 'only the actor who registered the import can seal it' using errcode = '42501';
  end if;
  select count(*), max(row_no) into v_count, v_max from tp.import_staged_rows where run_id = r.id;
  if v_count <> p_expected_rows or v_count is distinct from (r.totals ->> 'accepted')::int then
    raise exception 'staged rows (%) do not match the expected (%) and previewed (%) counts',
      v_count, p_expected_rows, r.totals ->> 'accepted' using errcode = '22023';
  end if;
  if v_count > 0 and v_max <> v_count then
    raise exception 'staged row numbers are not contiguous' using errcode = '22023';
  end if;
  v_hash := tp.staged_content_sha256(r.id, false);
  update tp.import_runs
     set status = 'previewed', staged_rows = v_count, content_sha256 = v_hash, sealed_by = p_actor, sealed_at = now()
   where id = r.id;
  perform tp.write_audit('import.seal', 'import_run', r.id::text, null,
    pg_catalog.jsonb_build_object('rows', v_count, 'content_sha256', v_hash), p_actor,
    case when p_kind = 'service' then 'service:' || r.source_id end);
  return v_hash;
end $$;

-- الاعتماد: بصمة المعتمِد = البصمة المختومة = بصمة محسوبة الآن من الأعمدة. ثم تطبيق مجمّع
-- إحصاءات الجداول الحقيقية قبل الدمج الكبير: إن كان تقدير الصفوف المسجَّل أقل من حجم الاستيراد نفسه
-- (جدول جديد، أو reltuples=0 بعد استيراد فاشل ثم autovacuum) نحلّله الآن. هذا الشرط لا يتحقق إلا والجدول
-- صغير حسب آخر إحصاء، فالتحليل رخيص في الحالات التي يعمل فيها، ولا يحدث للجداول الكبيرة المحدَّثة إحصاؤها.
create or replace function tp.refresh_small_table_stats(p_rows bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare t text; n int := 0;
begin
  for t in select c.oid::regclass::text from pg_catalog.pg_class c
           where c.oid in ('tp.offer_streams'::regclass, 'tp.stream_state'::regclass,
                           'tp.price_observations'::regclass, 'tp.sellers'::regclass)
             and c.reltuples < p_rows
           order by 1 loop
    execute pg_catalog.format('analyze %s', t);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function tp.commit_import_core(p_run_id uuid, p_content_sha256 text, p_actor uuid, p_kind tp.actor_kind)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r tp.import_runs; s tp.sources; f tp.import_files;
  v_now_hash text; v_fx_days numeric := tp.setting('fx_max_age_days');
  v_unique int; n_conflict int := 0; n_delisted int := 0; v_stats jsonb; v_bad text;
begin
  select * into r from tp.import_runs where id = p_run_id for update;
  if not found then raise exception 'import run % not found', p_run_id using errcode = 'P0002'; end if;
  if r.status <> 'previewed' then
    raise exception 'import run % cannot be committed (status %)', r.id, r.status using errcode = '55000';
  end if;
  if r.actor_kind <> p_kind then
    raise exception 'import run % belongs to a % actor', r.id, r.actor_kind using errcode = '42501';
  end if;
  if p_content_sha256 is null or p_content_sha256 <> r.content_sha256 then
    raise exception 'content hash does not match the sealed preview' using errcode = '22023';
  end if;
  v_now_hash := tp.staged_content_sha256(r.id, true);
  if v_now_hash <> r.content_sha256 then
    raise exception 'staged rows changed after the preview was sealed' using errcode = '22023';
  end if;
  if (select count(*) from tp.import_staged_rows where run_id = r.id) <> r.staged_rows then
    raise exception 'staged row count changed after sealing' using errcode = '22023';
  end if;

  select * into s from tp.sources where id = r.source_id for share;
  if s.status <> 'approved' then
    raise exception 'source % is not approved (status %)', s.id, s.status using errcode = '42501';
  end if;
  if p_kind = 'service' and not s.allow_automated then
    raise exception 'source % does not allow automated imports', s.id using errcode = '42501';
  end if;
  select * into f from tp.import_files where id = r.file_id;
  if f.deleted_at is not null then raise exception 'import file was deleted' using errcode = '55000'; end if;

  -- جدول عمل مؤقت داخل المعاملة
  create temp table if not exists tp_apply (
    row_no int, store_id text, seller_key text, seller_name text, seller_id bigint, offer_key text,
    condition tp.condition, external_id text, product_id bigint, family_id bigint, wants_review boolean,
    amount numeric, currency char(3), list_amount numeric, as_of timestamptz, source_updated_at timestamptz,
    source_offset text, assumed_time_zone text, feed_generated_at timestamptz, valid_until timestamptz,
    date_confirmed boolean, availability tp.availability, url text, canonical_url text, name text,
    car_model_year smallint, car_mileage_km int, car_trim text, car_city text, car_seller_type text,
    stream_id bigint, fx_id bigint, sar numeric, sar_list numeric,
    cur_obs bigint, cur_last_as_of timestamptz, cur_avail tp.availability, cur_curl text,
    prev_amount numeric, prev_currency char(3), prev_list numeric, prev_dc boolean, prev_valid_until timestamptz,
    kind text, eff_dc boolean, obs_hash text, new_obs bigint
  ) on commit drop;
  -- فهارس على جدول العمل: أي حلقة متداخلة يختارها المخطط (حتى بإحصاءات قديمة/صفرية للجداول الحقيقية)
  -- تصبح بحثًا بالفهرس من الجهتين، فيبقى الزمن خطيًا تقريبًا بدل التربيعي
  create index if not exists tp_apply_identity_idx on pg_temp.tp_apply (store_id, offer_key, condition);
  create index if not exists tp_apply_seller_idx on pg_temp.tp_apply (store_id, seller_key);
  create index if not exists tp_apply_stream_idx on pg_temp.tp_apply (stream_id);
  create index if not exists tp_apply_hash_idx on pg_temp.tp_apply (obs_hash);
  truncate pg_temp.tp_apply;

  -- 1) صف واحد لكل عرض: الأحدث تاريخًا ثم الأخير في الملف
  insert into pg_temp.tp_apply (row_no, store_id, seller_key, seller_name, offer_key, condition, external_id, product_id,
    family_id, wants_review, amount, currency, list_amount, as_of, source_updated_at, source_offset, assumed_time_zone,
    feed_generated_at, valid_until, date_confirmed, availability, url, canonical_url, name,
    car_model_year, car_mileage_km, car_trim, car_city, car_seller_type)
  select distinct on (coalesce(st.merged_into, st.id), coalesce(sr.seller_key, ''), sr.offer_key, sr.condition)
    sr.row_no, coalesce(st.merged_into, st.id), sr.seller_key, sr.seller_name, sr.offer_key, sr.condition, sr.external_id,
    sr.product_id, sr.family_id, sr.wants_review, sr.amount, sr.currency, sr.list_amount, sr.as_of, sr.source_updated_at,
    sr.source_offset, sr.assumed_time_zone, sr.feed_generated_at, sr.valid_until, sr.date_confirmed, sr.availability,
    sr.url, sr.canonical_url, sr.name, sr.car_model_year, sr.car_mileage_km, sr.car_trim, sr.car_city, sr.car_seller_type
  from tp.import_staged_rows sr
  join tp.stores st on st.id = sr.store_id
  where sr.run_id = r.id
  order by coalesce(st.merged_into, st.id), coalesce(sr.seller_key, ''), sr.offer_key, sr.condition, sr.as_of desc, sr.row_no desc;
  get diagnostics v_unique = row_count;
  -- ANALYZE للجدول المؤقت بعد كل مرحلة تملأ أعمدة ربط جديدة (هنا، وبعد stream_id، وبعد التصنيف):
  -- يحدّث إحصاءاته ويُبطل خطط الجلسة المخزنة، فتُخطَّط كل خطوة بالأحجام والقيم الحالية.
  -- (بدونه قد تُعاد خطة وُضعت والجداول فارغة → حلقات متداخلة بزمن تربيعي — قيس فعلًا في الاختبارات)
  analyze pg_temp.tp_apply;

  -- المتاجر قد تتغير بين المعاينة والاعتماد: إعادة الفحص
  select a.store_id into v_bad from pg_temp.tp_apply a join tp.stores st on st.id = a.store_id
  where st.status <> 'active' limit 1;
  if v_bad is not null then raise exception 'store % is no longer active', v_bad using errcode = '42501'; end if;

  -- 2) البائعون
  insert into tp.sellers (store_id, seller_key, display_name)
  select distinct on (a.store_id, a.seller_key) a.store_id, a.seller_key, coalesce(a.seller_name, a.seller_key)
  from pg_temp.tp_apply a where a.seller_key is not null
  order by a.store_id, a.seller_key
  on conflict (store_id, seller_key) do nothing;
  update pg_temp.tp_apply a set seller_id = se.id
  from tp.sellers se where a.seller_key is not null and se.store_id = a.store_id and se.seller_key = a.seller_key;

  -- 3) المسارات: إنشاء الناقص ثم قفل الكل بترتيب ثابت (يمنع الجمود)
  insert into tp.offer_streams (stream_key, category_kind, store_id, seller_id, offer_key, condition, external_id,
                                product_id, family_id, match_status)
  select pg_catalog.md5(concat_ws('|', a.store_id, coalesce(a.seller_id::text, ''), a.offer_key, a.condition::text)),
         s.vertical, a.store_id, a.seller_id, a.offer_key, a.condition, a.external_id, a.product_id, a.family_id,
         (case when a.product_id is not null or a.family_id is not null then 'matched'
               when a.wants_review then 'needs_review' else 'unmatched' end)::tp.match_status
  from pg_temp.tp_apply a
  order by a.store_id, a.seller_id, a.offer_key, a.condition
  on conflict on constraint offer_streams_identity_uq do nothing;

  update pg_temp.tp_apply a set stream_id = os.id from tp.offer_streams os
  where a.seller_id is null and os.seller_id is null
    and os.store_id = a.store_id and os.offer_key = a.offer_key and os.condition = a.condition;
  update pg_temp.tp_apply a set stream_id = os.id from tp.offer_streams os
  where a.seller_id is not null and os.seller_id = a.seller_id
    and os.store_id = a.store_id and os.offer_key = a.offer_key and os.condition = a.condition;

  perform tp.refresh_small_table_stats(v_unique);
  analyze pg_temp.tp_apply;   -- بعد تعيين stream_id
  perform 1 from tp.offer_streams os where os.id in (select a.stream_id from pg_temp.tp_apply a) order by os.id for update;
  perform 1 from tp.stream_state ss where ss.stream_id in (select a.stream_id from pg_temp.tp_apply a) order by ss.stream_id for update;

  select os.id::text into v_bad from tp.offer_streams os join pg_temp.tp_apply a on a.stream_id = os.id
  where os.category_kind <> s.vertical limit 1;
  if v_bad is not null then
    raise exception 'offer stream % belongs to another vertical', v_bad using errcode = '42501';
  end if;

  -- مطابقة آلية فقط للمسارات غير المطابقة؛ المطابقة القائمة لا تُستبدل
  select count(*) into n_conflict from pg_temp.tp_apply a join tp.offer_streams os on os.id = a.stream_id
  where os.match_status = 'matched' and (a.product_id is not null or a.family_id is not null)
    and (os.product_id is distinct from a.product_id or os.family_id is distinct from a.family_id);
  update tp.offer_streams os set product_id = a.product_id, family_id = a.family_id, match_status = 'matched'
  from pg_temp.tp_apply a
  where os.id = a.stream_id and os.match_status <> 'matched' and (a.product_id is not null or a.family_id is not null);

  -- 4) تفاصيل السيارات
  insert into tp.car_listing_details (stream_id, condition, model_year, mileage_km, trim, city, seller_type)
  select a.stream_id, a.condition, a.car_model_year, a.car_mileage_km, a.car_trim, a.car_city, a.car_seller_type
  from pg_temp.tp_apply a where a.car_model_year is not null
  order by a.stream_id
  on conflict (stream_id) do update
    set model_year = excluded.model_year, mileage_km = excluded.mileage_km, trim = excluded.trim,
        city = excluded.city, seller_type = excluded.seller_type;

  -- 5) التحويل إلى الريال: بسعر صرف معتمد وقريب من تاريخ السعر فقط
  update pg_temp.tp_apply set sar = round(amount, 2), sar_list = round(list_amount, 2) where currency = 'SAR';
  update pg_temp.tp_apply a set fx_id = x.fx_id, sar = round(a.amount * x.rate, 2), sar_list = round(a.list_amount * x.rate, 2)
  from (
    select a2.row_no, fx.id as fx_id, fx.rate
    from pg_temp.tp_apply a2
    cross join lateral (
      select fr.id, fr.rate from tp.fx_rates fr join tp.fx_rate_approvals ap on ap.fx_rate_id = fr.id
      where fr.base = a2.currency and fr.quote = 'SAR'
        and abs(extract(epoch from (fr.as_of - a2.as_of))) <= v_fx_days * 86400
      order by abs(extract(epoch from (fr.as_of - a2.as_of))), fr.id desc
      limit 1
    ) fx
    where a2.currency <> 'SAR'
  ) x
  where a.row_no = x.row_no;

  -- 6) مقارنة بالحالة الحالية وتصنيف كل صف
  update pg_temp.tp_apply a set cur_obs = ss.current_observation_id, cur_last_as_of = ss.last_as_of,
         cur_avail = ss.availability, cur_curl = ss.canonical_url, prev_amount = o.amount, prev_currency = o.currency,
         prev_list = o.list_amount, prev_dc = o.date_confirmed, prev_valid_until = o.valid_until
  from tp.stream_state ss join tp.price_observations o on o.id = ss.current_observation_id
  where ss.stream_id = a.stream_id;

  update pg_temp.tp_apply set kind = case
      when cur_obs is null then 'new'
      when as_of < cur_last_as_of then 'stale'
      when prev_amount <> amount or prev_currency <> currency or prev_list is distinct from list_amount then 'price'
      -- معلومة أحدث وأوثق لنفس السعر: تاريخ مؤكد بعد غير مؤكد، أو تغيّر صلاحية العرض
      when (not prev_dc and date_confirmed) or prev_valid_until is distinct from valid_until then 'details'
      else 'refresh'
    end;
  -- لا تخفيض: سعر غير مؤكد التاريخ لا يُسقط تأكيد نفس السعر السابق
  update pg_temp.tp_apply set eff_dc = case when kind = 'details' then (prev_dc or date_confirmed) else date_confirmed end
  where kind in ('new', 'price', 'details');
  update pg_temp.tp_apply set obs_hash = pg_catalog.md5(concat_ws('|', stream_id, amount::text, currency,
         coalesce(list_amount::text, ''), extract(epoch from as_of)::text, eff_dc::text,
         coalesce(extract(epoch from valid_until)::text, '')))
  where kind in ('new', 'price', 'details');

  analyze pg_temp.tp_apply;   -- بعد التصنيف وحساب البصمات
  -- 7) حالات السعر الجديدة (إضافة فقط)
  insert into tp.price_observations (observed_hash, stream_id, source_id, import_run_id, amount, currency, list_amount,
    sar_amount, sar_list_amount, fx_rate_id, as_of, source_updated_at, source_offset, assumed_time_zone,
    feed_generated_at, valid_until, date_confirmed, url, canonical_url, name_snapshot)
  select a.obs_hash, a.stream_id, s.id, r.id, a.amount, a.currency, a.list_amount, a.sar, a.sar_list, a.fx_id, a.as_of,
         a.source_updated_at, a.source_offset, a.assumed_time_zone, a.feed_generated_at, a.valid_until, a.eff_dc,
         a.url, a.canonical_url, a.name
  from pg_temp.tp_apply a where a.kind in ('new', 'price', 'details')
  order by a.stream_id
  on conflict (observed_hash) do nothing;
  update pg_temp.tp_apply a set new_obs = o.id from tp.price_observations o
  where a.kind in ('new', 'price', 'details') and o.observed_hash = a.obs_hash;

  -- 8) الأحداث
  insert into tp.offer_events (stream_id, observation_id, kind, previous_observation_id, from_value, to_value, at, import_run_id)
  select a.stream_id, a.new_obs, 'first_seen'::tp.offer_event_kind, null, null, null, now(), r.id
  from pg_temp.tp_apply a where a.kind = 'new'
  union all
  select a.stream_id, a.new_obs, 'price_changed', a.cur_obs, a.prev_amount::text || ' ' || a.prev_currency,
         a.amount::text || ' ' || a.currency, now(), r.id
  from pg_temp.tp_apply a where a.kind = 'price'
  union all
  select a.stream_id, a.new_obs, 'details_changed', a.cur_obs,
         'date_confirmed=' || a.prev_dc::text || '; valid_until=' || coalesce(a.prev_valid_until::text, '-'),
         'date_confirmed=' || a.eff_dc::text || '; valid_until=' || coalesce(a.valid_until::text, '-'), now(), r.id
  from pg_temp.tp_apply a where a.kind = 'details'
  union all
  select a.stream_id, coalesce(a.new_obs, a.cur_obs), 'availability_changed', null, a.cur_avail::text,
         a.availability::text, now(), r.id
  from pg_temp.tp_apply a where a.kind in ('price', 'details', 'refresh') and a.cur_avail <> a.availability
  union all
  select a.stream_id, coalesce(a.new_obs, a.cur_obs), 'url_changed', null, a.cur_curl, a.canonical_url, now(), r.id
  from pg_temp.tp_apply a where a.kind in ('price', 'details', 'refresh') and a.cur_curl <> a.canonical_url;

  -- 9) المؤشر الحالي وآخر ظهور
  insert into tp.stream_state (stream_id, current_observation_id, availability, url, canonical_url, last_seen_at,
    last_as_of, last_import_run_id, last_source_id, last_source_updated_at, last_source_offset, last_feed_generated_at)
  select a.stream_id, a.new_obs, a.availability, a.url, a.canonical_url, now(), a.as_of, r.id, s.id,
         a.source_updated_at, a.source_offset, a.feed_generated_at
  from pg_temp.tp_apply a where a.kind = 'new';

  update tp.stream_state ss
     set current_observation_id = coalesce(a.new_obs, ss.current_observation_id),
         last_as_of = greatest(ss.last_as_of, a.as_of),
         availability = a.availability, url = a.url, canonical_url = a.canonical_url,
         last_seen_at = now(), last_import_run_id = r.id, last_source_id = s.id, delisted_at = null,
         last_source_updated_at = coalesce(a.source_updated_at, ss.last_source_updated_at),
         last_source_offset = coalesce(a.source_offset, ss.last_source_offset),
         last_feed_generated_at = coalesce(a.feed_generated_at, ss.last_feed_generated_at)
  from pg_temp.tp_apply a
  where ss.stream_id = a.stream_id and a.kind in ('price', 'details', 'refresh');

  -- 10) ملف شامل: ما اختفى من هذا المصدر يُعلَّم (بلا حذف)
  if s.is_full_snapshot then
    perform 1 from tp.stream_state ss
    where ss.last_source_id = s.id and ss.last_import_run_id <> r.id and ss.delisted_at is null
    order by ss.stream_id for update;
    with d as (
      update tp.stream_state ss set delisted_at = now()
      where ss.last_source_id = s.id and ss.last_import_run_id <> r.id and ss.delisted_at is null
      returning ss.stream_id, ss.current_observation_id
    )
    insert into tp.offer_events (stream_id, observation_id, kind, at, import_run_id)
    select d.stream_id, d.current_observation_id, 'not_seen', now(), r.id from d;
    get diagnostics n_delisted = row_count;
  end if;

  select pg_catalog.jsonb_build_object(
      'rows', r.staged_rows, 'unique_offers', v_unique, 'duplicates_in_file', r.staged_rows - v_unique,
      'new', count(*) filter (where kind = 'new'),
      'price_changed', count(*) filter (where kind = 'price'),
      'details_changed', count(*) filter (where kind = 'details'),
      'refreshed', count(*) filter (where kind = 'refresh'),
      'stale', count(*) filter (where kind = 'stale'),
      'availability_changed', count(*) filter (where kind in ('price', 'details', 'refresh') and cur_avail <> availability),
      'url_changed', count(*) filter (where kind in ('price', 'details', 'refresh') and cur_curl <> canonical_url),
      'match_conflicts', n_conflict, 'delisted', n_delisted)
    into v_stats
  from pg_temp.tp_apply;

  update tp.import_runs
     set status = 'committed', committed_by = p_actor, committed_at = now(),
         totals = totals || pg_catalog.jsonb_build_object('commit', v_stats)
   where id = r.id;
  perform tp.write_audit('import.commit', 'import_run', r.id::text, null,
    v_stats || pg_catalog.jsonb_build_object('content_sha256', r.content_sha256), p_actor,
    case when p_kind = 'service' then 'service:' || s.id end);
  return v_stats;
end $$;

-- ---------------------------------------------------------------------
-- 14ب) إعادة الاحتساب عند اعتماد سعر صرف: تحويل لاحق مسجَّل، بلا تعديل الملاحظة ولا اختراع سعر
-- ---------------------------------------------------------------------
create or replace function tp.convert_pending_for_rate(p_fx_rate_id bigint, p_actor uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare f tp.fx_rates; v_days numeric := tp.setting('fx_max_age_days'); n int;
begin
  select * into f from tp.fx_rates where id = p_fx_rate_id;
  if not exists (select 1 from tp.fx_rate_approvals where fx_rate_id = f.id) then
    raise exception 'fx rate % is not approved', f.id using errcode = '55000';
  end if;
  with candidates as (
    select o.id, o.stream_id from tp.price_observations o
    where o.currency = f.base and o.sar_amount is null
      and abs(extract(epoch from (f.as_of - o.as_of))) <= v_days * 86400
      and not exists (select 1 from tp.observation_conversions c where c.observation_id = o.id)
    order by o.id
    for update of o
  ), ins as (
    insert into tp.observation_conversions (observation_id, fx_rate_id, sar_amount, sar_list_amount, reason, computed_by)
    select o.id, f.id, round(o.amount * f.rate, 2), round(o.list_amount * f.rate, 2), 'fx_approved', p_actor
    from candidates c join tp.price_observations o on o.id = c.id
    returning observation_id
  )
  insert into tp.offer_events (stream_id, observation_id, kind, from_value, to_value, at, import_run_id)
  select o.stream_id, o.id, 'fx_converted', o.amount::text || ' ' || o.currency,
         round(o.amount * f.rate, 2)::text || ' SAR (fx ' || f.id || ')', now(), o.import_run_id
  from ins join tp.price_observations o on o.id = ins.observation_id;
  get diagnostics n = row_count;
  return n;
end $$;
-- ---------------------------------------------------------------------
-- 15) admin_api — الاستيراد (كل دالة تتحقق من الصلاحية بنفسها)
-- ---------------------------------------------------------------------
create or replace function admin_api.register_import(
  p_source_id text, p_storage_path text, p_file_name text, p_byte_size bigint, p_sha256 text,
  p_engine_version text, p_format text, p_limits jsonb, p_totals jsonb,
  p_issues jsonb default '[]'::jsonb, p_store_proposals jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('import:commit');
begin
  return tp.register_import_core(v_uid, 'user', p_source_id, p_storage_path, p_file_name, p_byte_size, p_sha256,
                                 p_engine_version, p_format, p_limits, p_totals, p_issues, p_store_proposals);
end $$;

create or replace function admin_api.stage_import_rows(p_run_id uuid, p_first_row_no int, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('import:commit');
begin
  return tp.stage_rows_core(v_uid, 'user', p_run_id, p_first_row_no, p_rows);
end $$;

create or replace function admin_api.seal_import(p_run_id uuid, p_expected_rows int) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('import:commit');
begin
  return tp.seal_import_core(v_uid, 'user', p_run_id, p_expected_rows);
end $$;

create or replace function admin_api.commit_import(p_run_id uuid, p_content_sha256 text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('import:commit');
begin
  return tp.commit_import_core(p_run_id, p_content_sha256, v_uid, 'user');
end $$;

create or replace function admin_api.discard_import(p_run_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('import:commit'); r tp.import_runs;
begin
  select * into r from tp.import_runs where id = p_run_id for update;
  if not found or r.status not in ('staging', 'previewed') then
    raise exception 'only staging or previewed runs can be discarded' using errcode = '55000';
  end if;
  update tp.import_runs set status = 'discarded' where id = p_run_id;
  perform tp.write_audit('import.discard', 'import_run', p_run_id::text, null,
                         pg_catalog.jsonb_build_object('reason', p_reason), v_uid);
end $$;

-- ---------------------------------------------------------------------
-- 15أ) التحقق v1.1: قفل + تسلسل قرارات + سياسة إعادة مراجعة صريحة
--
--   p_expected_previous_event_id = آخر قرار رآه المراجع (null إن لم يرَ أي قرار)
--   * إن تغيّر آخر قرار منذ ذلك: يُرفض الطلب (40001) ويُعاد تحميل الصفحة
--   * نفس الحالة مرتين: مرفوض (لا قرار مكرر)
--   * عكس قرار سابق (موثق ↔ مرفوض): يتطلب ملاحظة، ومن شخص غير صاحب القرار السابق
--   * لا مراجعة ذاتية لمن رفع الملف أو بدأ الاستيراد أو ختمه أو اعتمده
--   * سعر جديد = ملاحظة جديدة غير موثقة (التوثيق لا ينتقل بين الملاحظات)
-- ---------------------------------------------------------------------
create or replace function admin_api.verify_observation(
  p_observation_id bigint, p_status text, p_expected_previous_event_id bigint default null,
  p_reason_code text default null, p_note text default null, p_evidence_url text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid; o tp.price_observations; r tp.import_runs; f tp.import_files; s tp.sources;
  v_last tp.verification_events; v_id bigint;
begin
  if p_status not in ('verified', 'rejected') then
    raise exception 'status must be verified or rejected' using errcode = '22023';
  end if;
  v_uid := tp.require_permission(case when p_status = 'verified' then 'price:verify' else 'price:reject' end);

  -- قفل حصري على الملاحظة: المراجعات المتزامنة لنفس السعر تتسلسل
  select * into o from tp.price_observations where id = p_observation_id for update;
  if not found then raise exception 'observation % not found', p_observation_id using errcode = 'P0002'; end if;
  select * into r from tp.import_runs where id = o.import_run_id;
  select * into f from tp.import_files where id = r.file_id;
  select * into s from tp.sources where id = o.source_id;

  if v_uid = r.started_by or v_uid = r.committed_by or v_uid = r.sealed_by or v_uid = f.uploaded_by then
    raise exception 'self review is not allowed' using errcode = '42501';
  end if;

  select * into v_last from tp.verification_events v
  where v.observation_id = o.id order by v.id desc limit 1;

  if v_last.id is distinct from p_expected_previous_event_id then
    raise exception 'stale review: the latest decision is %, not %', v_last.id, p_expected_previous_event_id
      using errcode = '40001';
  end if;
  if v_last.id is not null and v_last.status::text = p_status then
    raise exception 'observation % is already %', o.id, p_status using errcode = '55000';
  end if;
  if v_last.id is not null then
    if v_last.actor_id = v_uid then
      raise exception 'a decision must be reversed by a different reviewer' using errcode = '42501';
    end if;
    if p_note is null or length(btrim(p_note)) < 3 then
      raise exception 'reversing a decision requires a note' using errcode = '22023';
    end if;
  end if;
  if p_status = 'verified' and s.kind in ('manual_upload', 'legacy_manual') and p_evidence_url is null then
    raise exception 'manual prices require evidence_url to be verified' using errcode = '22023';
  end if;

  insert into tp.verification_events (observation_id, previous_event_id, status, reason_code, note, evidence_url, actor_id)
  values (o.id, v_last.id, p_status::tp.verification, p_reason_code, p_note, p_evidence_url, v_uid)
  returning id into v_id;

  perform tp.write_audit(case when p_status = 'verified' then 'price.verify' else 'price.reject' end,
    'price_observation', o.id::text,
    pg_catalog.jsonb_build_object('status', coalesce(v_last.status::text, 'unverified'), 'event', v_last.id),
    pg_catalog.jsonb_build_object('status', p_status, 'reason_code', p_reason_code, 'note', p_note,
                                  'evidence_url', p_evidence_url, 'event', v_id),
    v_uid);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 15ج) تهيئة أول مشرف — مرة واحدة فقط، من محرر SQL في Supabase (دور postgres)
--
--   * لا تُمنح لأي دور: authenticated وanon وservice_role لا يملكون EXECUTE، والمخطط tp غير مكشوف
--   * ترفض أي استدعاء يحمل رمز جلسة (request.jwt.claims) حتى لو مُنحت خطأً
--   * تعمل فقط إن لم يوجد أي مشرف ولم تُنفَّذ من قبل (tp.bootstrap_state)
--   * المستخدمون يجب أن يكونوا مسجلين فعلًا في auth.users (دعوة من لوحة Supabase)
-- ---------------------------------------------------------------------
create or replace function tp.bootstrap_first_admins(
  p_first uuid, p_first_name text, p_second uuid default null, p_second_name text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_users uuid[];
begin
  if nullif(pg_catalog.current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'bootstrap cannot run from an API session' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('tp.bootstrap'));
  if exists (select 1 from tp.bootstrap_state) then
    raise exception 'bootstrap already completed' using errcode = '55000';
  end if;
  if exists (select 1 from tp.user_roles where role_id = 'admin') then
    raise exception 'an admin already exists; use admin_api.grant_role' using errcode = '55000';
  end if;
  if p_first is null or p_first = p_second then
    raise exception 'provide one or two distinct users' using errcode = '22023';
  end if;
  v_users := array_remove(array[p_first, p_second], null);

  -- وجود المستخدم في auth.users يُفرض بالمفتاح الأجنبي tp.profiles.user_id (لا نحتاج صلاحية قراءة auth)
  begin
    insert into tp.profiles (user_id, display_name) values (p_first, p_first_name) on conflict (user_id) do nothing;
    if p_second is not null then
      insert into tp.profiles (user_id, display_name) values (p_second, p_second_name) on conflict (user_id) do nothing;
    end if;
  exception when foreign_key_violation then
    raise exception 'all bootstrap users must exist in auth.users' using errcode = '23503';
  end;
  -- مع مستخدمَين: كل منهما يمنح الآخر. مع مستخدم واحد: منح تهيئة بلا مانح
  insert into tp.user_roles (user_id, role_id, granted_by, granted_via)
  values (p_first, 'admin', p_second, case when p_second is null then 'bootstrap' else 'grant' end);
  if p_second is not null then
    insert into tp.user_roles (user_id, role_id, granted_by, granted_via) values (p_second, 'admin', p_first, 'grant');
  end if;
  insert into tp.bootstrap_state (admins) values (v_users);
  perform tp.write_audit('bootstrap.admins', 'system', 'bootstrap', null,
    pg_catalog.jsonb_build_object('admins', v_users), null, 'system:bootstrap');
end $$;

-- ---------------------------------------------------------------------
-- 16) ingest_api — لخدمة الاستيراد الآلي فقط (دور ingest_service)
-- ---------------------------------------------------------------------
create or replace function ingest_api.register_import(
  p_source_id text, p_storage_path text, p_file_name text, p_byte_size bigint, p_sha256 text,
  p_engine_version text, p_format text, p_limits jsonb, p_totals jsonb,
  p_issues jsonb default '[]'::jsonb, p_store_proposals jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return tp.register_import_core(null, 'service', p_source_id, p_storage_path, p_file_name, p_byte_size, p_sha256,
                                 p_engine_version, p_format, p_limits, p_totals, p_issues, p_store_proposals);
end $$;

create or replace function ingest_api.stage_import_rows(p_run_id uuid, p_first_row_no int, p_rows jsonb) returns int
language plpgsql security definer set search_path = '' as $$
begin
  return tp.stage_rows_core(null, 'service', p_run_id, p_first_row_no, p_rows);
end $$;

create or replace function ingest_api.seal_import(p_run_id uuid, p_expected_rows int) returns text
language plpgsql security definer set search_path = '' as $$
begin
  return tp.seal_import_core(null, 'service', p_run_id, p_expected_rows);
end $$;

create or replace function ingest_api.commit_import(p_run_id uuid, p_content_sha256 text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return tp.commit_import_core(p_run_id, p_content_sha256, null, 'service');
end $$;

-- ---------------------------------------------------------------------
-- 16ب) سياسة الاحتفاظ (تُجدول لاحقًا بـ pg_cron بعد تفعيله)
-- ---------------------------------------------------------------------
create or replace function tp.apply_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n_issues int; n_files int; n_ip int; n_staged int;
begin
  delete from tp.import_row_issues where created_at < now() - make_interval(days => tp.setting('row_issue_retention_days')::int);
  get diagnostics n_issues = row_count;
  -- الصفوف المختومة دليل على ما اعتُمد: تُحذف مع الملف الخام بعد انتهاء مدة الاحتفاظ فقط
  delete from tp.import_staged_rows sr using tp.import_runs r, tp.import_files f
  where sr.run_id = r.id and f.id = r.file_id and f.delete_after < current_date
    and r.status in ('committed', 'discarded', 'failed');
  get diagnostics n_staged = row_count;
  update tp.import_files set deleted_at = now() where delete_after < current_date and deleted_at is null;
  get diagnostics n_files = row_count;
  delete from tp.audit_request_meta where created_at < now() - make_interval(months => tp.setting('audit_ip_retention_months')::int);
  get diagnostics n_ip = row_count;
  perform tp.write_audit('retention.run', 'system', 'retention', null,
    pg_catalog.jsonb_build_object('issues_deleted', n_issues, 'staged_rows_deleted', n_staged,
                                  'files_marked', n_files, 'ip_rows_deleted', n_ip), null, 'system:retention');
  return pg_catalog.jsonb_build_object('issues_deleted', n_issues, 'staged_rows_deleted', n_staged,
                                       'files_marked', n_files, 'ip_rows_deleted', n_ip);
end $$;

create or replace function admin_api.security_report() returns table (kind text, object text, detail text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform tp.require_permission('audit:read');
  return query select * from tp.privilege_violations();
end $$;
-- ---------------------------------------------------------------------
-- 15ب) بقية دوال لوحة الإدارة
-- ---------------------------------------------------------------------
create or replace function admin_api.review_match(
  p_stream_id bigint, p_decision text, p_product_id bigint default null,
  p_family_id bigint default null, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('match:review'); s tp.offer_streams;
begin
  select * into s from tp.offer_streams where id = p_stream_id for update;
  if not found then raise exception 'stream % not found', p_stream_id using errcode = 'P0002'; end if;
  if p_decision = 'match' then
    if num_nonnulls(p_product_id, p_family_id) <> 1 then
      raise exception 'match needs exactly one of product or family' using errcode = '22023';
    end if;
    update tp.offer_streams set product_id = p_product_id, family_id = p_family_id, match_status = 'matched'
    where id = p_stream_id;
  elsif p_decision = 'reject' then
    update tp.offer_streams set product_id = null, family_id = null, match_status = 'unmatched'
    where id = p_stream_id;
  else
    raise exception 'decision must be match or reject' using errcode = '22023';
  end if;
  insert into tp.match_reviews (stream_id, decision, product_id, family_id, note, actor_id)
  values (p_stream_id, p_decision, p_product_id, p_family_id, p_note, v_uid);
  perform tp.write_audit('match.' || p_decision, 'offer_stream', p_stream_id::text,
    pg_catalog.jsonb_build_object('product_id', s.product_id, 'family_id', s.family_id),
    pg_catalog.jsonb_build_object('product_id', p_product_id, 'family_id', p_family_id), v_uid);
end $$;

create or replace function admin_api.decide_store_alias(
  p_proposal_id bigint, p_decision text, p_store_id text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('store:approve_alias'); p tp.store_alias_proposals;
begin
  select * into p from tp.store_alias_proposals where id = p_proposal_id for update;
  if not found or p.status <> 'pending' then
    raise exception 'proposal % is not pending', p_proposal_id using errcode = '55000';
  end if;
  if p_decision = 'approve' then
    if not exists (select 1 from tp.stores where id = p_store_id and status = 'active') then
      raise exception 'store % is not an active store', p_store_id using errcode = '23503';
    end if;
    insert into tp.store_aliases (normalized, store_id, raw_example, approved_by)
    values (p.normalized, p_store_id, p.raw_name, v_uid);
    update tp.store_alias_proposals
       set status = 'approved', decided_store_id = p_store_id, decided_by = v_uid, decided_at = now()
     where id = p.id;
  elsif p_decision = 'reject' then
    update tp.store_alias_proposals set status = 'rejected', decided_by = v_uid, decided_at = now() where id = p.id;
  else
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;
  perform tp.write_audit('store_alias.' || p_decision, 'store_alias_proposal', p.id::text,
    pg_catalog.to_jsonb(p), pg_catalog.jsonb_build_object('store_id', p_store_id), v_uid);
end $$;

create or replace function admin_api.merge_store(p_from text, p_to text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('store:merge');
begin
  if p_from = p_to then raise exception 'cannot merge a store into itself' using errcode = '22023'; end if;
  perform 1 from tp.stores where id in (p_from, p_to) for update;
  if not exists (select 1 from tp.stores where id = p_to and status = 'active' and merged_into is null) then
    raise exception 'target store % must be active' , p_to using errcode = '23503';
  end if;
  if exists (select 1 from tp.stores where merged_into = p_from) then
    raise exception 'store % is itself a merge target; resolve that first', p_from using errcode = '55000';
  end if;
  update tp.stores set merged_into = p_to, status = 'archived' where id = p_from and merged_into is null;
  if not found then raise exception 'store % not found or already merged', p_from using errcode = '55000'; end if;
  insert into tp.store_merges (from_store, to_store, reason, actor_id) values (p_from, p_to, p_reason, v_uid);
  perform tp.write_audit('store.merge', 'store', p_from, null,
                         pg_catalog.jsonb_build_object('into', p_to, 'reason', p_reason), v_uid);
end $$;

create or replace function admin_api.grant_role(p_user uuid, p_role text, p_expires_at timestamptz default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('user:manage');
begin
  if p_user = v_uid then raise exception 'cannot grant a role to yourself' using errcode = '42501'; end if;
  insert into tp.user_roles (user_id, role_id, granted_by, granted_via, expires_at) values (p_user, p_role, v_uid, 'grant', p_expires_at)
  on conflict (user_id, role_id) do update
    set granted_by = excluded.granted_by, granted_via = 'grant', granted_at = now(), expires_at = excluded.expires_at;
  perform tp.write_audit('role.grant', 'user', p_user::text, null,
                         pg_catalog.jsonb_build_object('role', p_role, 'expires_at', p_expires_at), v_uid);
end $$;

create or replace function admin_api.revoke_role(p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('user:manage');
begin
  if p_role = 'admin' and (select count(*) from tp.user_roles ur join tp.profiles p on p.user_id = ur.user_id
                           where ur.role_id = 'admin' and p.status = 'active'
                             and (ur.expires_at is null or ur.expires_at > now())) <= 1 then
    raise exception 'cannot revoke the last active admin' using errcode = '55000';
  end if;
  delete from tp.user_roles where user_id = p_user and role_id = p_role;
  if not found then raise exception 'role not assigned' using errcode = 'P0002'; end if;
  perform tp.write_audit('role.revoke', 'user', p_user::text, pg_catalog.jsonb_build_object('role', p_role), null, v_uid);
end $$;

create or replace function admin_api.add_fx_rate(
  p_base text, p_rate numeric, p_source text, p_source_url text, p_as_of timestamptz
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('fx:enter'); v_id bigint;
begin
  insert into tp.fx_rates (base, quote, rate, source, source_url, as_of, created_by)
  values (upper(p_base), 'SAR', p_rate, p_source, p_source_url, p_as_of, v_uid) returning id into v_id;
  perform tp.write_audit('fx.add', 'fx_rate', v_id::text, null,
    pg_catalog.jsonb_build_object('base', upper(p_base), 'rate', p_rate, 'source', p_source, 'as_of', p_as_of), v_uid);
  return v_id;
end $$;

-- v1.1: الاعتماد يعيد احتساب الأسعار الأجنبية غير المحوّلة ضمن نافذة التاريخ، ويُرجع عددها
create or replace function admin_api.approve_fx_rate(p_fx_rate_id bigint) returns int
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('fx:approve'); n int;
begin
  insert into tp.fx_rate_approvals (fx_rate_id, approved_by) values (p_fx_rate_id, v_uid);
  n := tp.convert_pending_for_rate(p_fx_rate_id, v_uid);
  perform tp.write_audit('fx.approve', 'fx_rate', p_fx_rate_id::text, null,
                         pg_catalog.jsonb_build_object('observations_converted', n), v_uid);
  return n;
end $$;

create or replace function admin_api.verify_audit_chain()
returns table (ok boolean, checked bigint, first_bad_id bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform tp.require_permission('audit:read');
  return query select * from tp.verify_audit_chain();
end $$;

create or replace function admin_api.my_permissions() returns setof text
language sql stable security definer set search_path = '' as $$
  select p.id from tp.permissions p where tp.has_permission(p.id) order by p.id
$$;

-- ---------------------------------------------------------------------
-- 16) ingest_api — لخدمة الاستيراد الآلي فقط (دور ingest_service)
-- ---------------------------------------------------------------------
-- ---------------------------------------------------------------------
-- 17) المشغّلات
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  -- الإضافة فقط: منع UPDATE وDELETE وTRUNCATE (طبقة داخل القاعدة؛ ليست حماية مطلقة من المالك — انظر التقرير)
  foreach t in array array['price_observations', 'offer_events', 'verification_events', 'match_reviews',
                           'store_merges', 'fx_rates', 'fx_rate_approvals', 'audit_log', 'observation_conversions'] loop
    execute format('create or replace trigger %I before update or delete on tp.%I for each row execute function tp.forbid_mutation()',
                   t || '_append_only', t);
    execute format('create or replace trigger %I before truncate on tp.%I for each statement execute function tp.forbid_mutation()',
                   t || '_no_truncate', t);
  end loop;
end $$;

do $$
declare r record;
begin
  -- تدقيق الجداول القابلة للتعديل (المفتاح المستخدم كمعرّف الكيان)
  for r in select * from (values
      ('categories', 'id'), ('brands', 'id'), ('product_families', 'id'), ('products', 'id'),
      ('spec_definitions', 'id'), ('product_specs', 'product_id'), ('product_identifiers', 'id'),
      ('stores', 'id'), ('store_domains', 'domain'), ('affiliate_networks', 'id'), ('sources', 'id'),
      ('source_connections', 'source_id'), ('source_contacts', 'id'), ('settings', 'key')
    ) as x(tbl, keycol)
  loop
    execute format('create or replace trigger %I after insert or update or delete on tp.%I for each row execute function tp.audit_row_change(%L)',
                   r.tbl || '_audit', r.tbl, r.keycol);
  end loop;
end $$;

create or replace trigger products_touch before update on tp.products
  for each row execute function tp.touch_updated_at();
create or replace trigger source_connections_touch before update on tp.source_connections
  for each row execute function tp.touch_updated_at();
create or replace trigger settings_touch before update on tp.settings
  for each row execute function tp.touch_updated_at();
create or replace trigger product_specs_check before insert or update on tp.product_specs
  for each row execute function tp.check_product_spec();
create or replace trigger sources_approval before insert or update on tp.sources
  for each row execute function tp.stamp_source_approval();
create or replace trigger price_observations_check before insert on tp.price_observations
  for each row execute function tp.check_observation();
create or replace trigger stream_state_check before insert or update on tp.stream_state
  for each row execute function tp.check_stream_state();
create or replace trigger offer_streams_update_check before update on tp.offer_streams
  for each row execute function tp.check_stream_update();
create or replace trigger car_listing_details_touch before insert or update on tp.car_listing_details
  for each row execute function tp.check_car_details();
create or replace trigger car_listing_details_check after insert or update on tp.car_listing_details
  for each row execute function tp.check_car_details_after();
create or replace trigger fx_rate_approvals_check before insert on tp.fx_rate_approvals
  for each row execute function tp.check_fx_approval();
create or replace trigger observation_conversions_check before insert on tp.observation_conversions
  for each row execute function tp.check_conversion();
-- v1.1: صفوف المعاينة: إدراج أثناء staging فقط، لا تعديل، حذف بعد انتهاء التشغيل فقط
create or replace trigger import_staged_rows_guard before insert or update or delete on tp.import_staged_rows
  for each row execute function tp.guard_staged_rows();
create or replace trigger import_staged_rows_no_truncate before truncate on tp.import_staged_rows
  for each statement execute function tp.forbid_mutation();
create or replace trigger verification_events_no_update before update on tp.verification_events
  for each row execute function tp.forbid_update();

-- CREATE OR REPLACE غير مدعوم لمشغّلات القيود: حذف ثم إنشاء
drop trigger if exists offer_streams_require_car_details on tp.offer_streams;
create constraint trigger offer_streams_require_car_details
  after insert on tp.offer_streams deferrable initially deferred
  for each row when (new.category_kind = 'cars')
  execute function tp.require_car_details();

-- ---------------------------------------------------------------------
-- 18) قواعد الأهلية للسعر العادل
-- ---------------------------------------------------------------------
-- لكل عرض: السعر الحالي وأسباب استبعاده. القائمة الفارغة = مؤهل.
-- مالكها tp_owner وتعمل بصلاحياته (تُقرأ من pub)؛ غير ممنوحة لـ authenticated مباشرة
create or replace view tp.offer_eligibility with (security_barrier = true) as
with latest_verification as (
  select distinct on (v.observation_id) v.observation_id, v.status, v.at
  from tp.verification_events v
  order by v.observation_id, v.at desc, v.id desc
), cfg as (
  select s.value as max_age_days from tp.settings s where s.key = 'max_price_age_days'
)
select
  os.id as stream_id, os.category_kind, os.condition, os.product_id, os.family_id, os.match_status,
  os.store_id as listed_store_id, tgt.id as effective_store_id,
  o.id as observation_id, o.amount, o.currency,
  -- السعر بالريال: من الملاحظة نفسها، أو من تحويل لاحق مسجَّل عند اعتماد سعر صرف
  coalesce(o.sar_amount, cv.sar_amount) as sar_amount,
  case when o.sar_amount is not null then o.sar_list_amount else cv.sar_list_amount end as sar_list_amount,
  coalesce(o.fx_rate_id, cv.fx_rate_id) as fx_rate_id, (cv.id is not null) as converted_later,
  o.as_of, o.valid_until, o.date_confirmed, o.source_id,
  ss.availability, ss.canonical_url, ss.last_as_of, ss.last_seen_at, ss.delisted_at,
  coalesce(lv.status, 'unverified'::tp.verification) as verification, lv.at as verified_at,
  array_remove(array[
    case when os.match_status <> 'matched' then 'unmatched' end,
    case when lv.status is null then 'unverified' end,
    case when lv.status = 'rejected' then 'rejected' end,
    case when ss.last_as_of < now() - make_interval(days => cfg.max_age_days::int) then 'stale' end,
    case when ss.delisted_at is not null or (o.valid_until is not null and o.valid_until <= now()) then 'expired' end,
    case when ss.availability <> 'in_stock' then 'unavailable' end,
    case when o.sar_amount is null and cv.id is null then 'no_sar_price' end,
    case when not o.date_confirmed then 'date_unconfirmed' end,
    case when src.status <> 'approved' then 'source_not_approved' end,
    case when tgt.status <> 'active' then 'store_inactive' end
  ], null) as exclusion_reasons
from tp.stream_state ss
join tp.offer_streams os on os.id = ss.stream_id
join tp.price_observations o on o.id = ss.current_observation_id
join tp.stores st on st.id = os.store_id
join tp.stores tgt on tgt.id = coalesce(st.merged_into, st.id)
join tp.sources src on src.id = o.source_id
left join tp.observation_conversions cv on cv.observation_id = o.id
left join latest_verification lv on lv.observation_id = o.id
cross join cfg;

-- ---------------------------------------------------------------------
-- 19) pub — واجهات الموقع العام (يقرأها web_reader فقط). أسعار مؤهلة فقط.
-- ---------------------------------------------------------------------
create or replace view pub.categories with (security_barrier = true) as
  select id, parent_id, kind, slug, name_ar, name_en, sort_order from tp.categories where status = 'active';

create or replace view pub.brands with (security_barrier = true) as
  select id, slug, name, name_ar from tp.brands where status = 'active';

create or replace view pub.product_families with (security_barrier = true) as
  select id, category_id, category_kind, brand_id, slug, name, name_ar from tp.product_families where status = 'active';

create or replace view pub.products with (security_barrier = true) as
  select id, legacy_id, family_id, category_id, category_kind, brand_id, slug, name, name_ar,
         model_year, trim, official_price_sar, official_price_source_url
  from tp.products where status = 'active';

create or replace view pub.product_specs with (security_barrier = true) as
  select ps.product_id, sd.key, sd.label_ar, sd.unit, sd.data_type, ps.value_text, ps.value_number, ps.value_boolean
  from tp.product_specs ps
  join tp.spec_definitions sd on sd.id = ps.spec_id
  join tp.products p on p.id = ps.product_id and p.status = 'active';

create or replace view pub.stores with (security_barrier = true) as
  select id, name, name_ar, is_marketplace from tp.stores where status = 'active' and merged_into is null;

-- الإلكترونيات: عرض واحد لكل (منتج، حالة، متجر) — أقل سعر مؤهل عند تعدد البائعين أو المصادر
create or replace view pub.electronics_offers with (security_barrier = true) as
  select distinct on (e.product_id, e.condition, e.effective_store_id)
         e.product_id, p.legacy_id, e.condition, e.effective_store_id as store_id, st.name_ar as store_name_ar,
         e.sar_amount as price_sar, e.sar_list_amount as list_price_sar, e.canonical_url,
         e.as_of as price_as_of, e.last_seen_at, e.verified_at
  from tp.offer_eligibility e
  join tp.products p on p.id = e.product_id and p.status = 'active'
  join tp.stores st on st.id = e.effective_store_id
  where e.category_kind = 'electronics' and cardinality(e.exclusion_reasons) = 0
  order by e.product_id, e.condition, e.effective_store_id, e.sar_amount, e.stream_id;

-- السيارات الجديدة: مربوطة بمنتج (سنة + فئة)، الحالة new فقط
create or replace view pub.new_car_offers with (security_barrier = true) as
  select distinct on (e.product_id, e.effective_store_id)
         e.product_id, p.legacy_id, p.model_year, p.trim, e.effective_store_id as store_id, st.name_ar as store_name_ar,
         e.sar_amount as price_sar, e.sar_list_amount as list_price_sar, e.canonical_url,
         e.as_of as price_as_of, e.last_seen_at, e.verified_at
  from tp.offer_eligibility e
  join tp.products p on p.id = e.product_id and p.status = 'active'
  join tp.stores st on st.id = e.effective_store_id
  where e.category_kind = 'cars' and e.condition = 'new' and cardinality(e.exclusion_reasons) = 0
  order by e.product_id, e.effective_store_id, e.sar_amount, e.stream_id;

-- السيارات المستعملة: مربوطة بعائلة الموديل مع السنة والممشى والفئة، الحالة used فقط
create or replace view pub.used_car_listings with (security_barrier = true) as
  select e.stream_id as listing_id, e.family_id, d.model_year, d.trim, d.mileage_km, d.city, d.seller_type,
         e.effective_store_id as store_id, st.name_ar as store_name_ar,
         e.sar_amount as price_sar, e.canonical_url, e.as_of as price_as_of, e.last_seen_at, e.verified_at
  from tp.offer_eligibility e
  join tp.car_listing_details d on d.stream_id = e.stream_id and d.condition = 'used'
  join tp.product_families f on f.id = e.family_id and f.status = 'active'
  join tp.stores st on st.id = e.effective_store_id
  where e.category_kind = 'cars' and e.condition = 'used' and cardinality(e.exclusion_reasons) = 0;

-- ---------------------------------------------------------------------
-- 20) admin_api — واجهات قراءة للوحة (security_invoker: تخضع لـ RLS المستخدم)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['categories', 'brands', 'product_families', 'products', 'spec_definitions', 'product_specs',
                           'product_identifiers', 'stores', 'store_domains', 'store_aliases', 'store_alias_proposals',
                           'sellers', 'affiliate_networks', 'sources', 'source_connections', 'source_contacts',
                           'currencies', 'fx_rates', 'fx_rate_approvals', 'import_files', 'import_runs',
                           'import_row_issues', 'offer_streams', 'price_observations', 'stream_state', 'offer_events',
                           'car_listing_details', 'verification_events', 'match_reviews', 'store_merges', 'audit_log',
                           'settings', 'observation_conversions', 'import_staged_rows'] loop
    execute format('create or replace view admin_api.%I with (security_invoker = true) as select * from tp.%I', t, t);
  end loop;
end $$;

-- أسباب الاستبعاد للوحة: تعمل بصلاحية المالك لكنها لا تعيد شيئًا بدون admin:read
create or replace view admin_api.offer_eligibility with (security_barrier = true) as
  select * from tp.offer_eligibility where (select tp.has_permission('admin:read'));

-- ---------------------------------------------------------------------
-- 21) RLS: مفعّل على كل جدول؛ لا شيء إلا ما تذكره السياسات
-- ---------------------------------------------------------------------
do $$
declare t record; p record;
begin
  for t in select tablename from pg_tables where schemaname = 'tp' loop
    execute format('alter table tp.%I enable row level security', t.tablename);
  end loop;
  -- حذف سياساتنا السابقة لإعادة إنشائها (إعادة تشغيل آمنة)
  for p in select policyname, tablename from pg_policies where schemaname = 'tp' loop
    execute format('drop policy %I on tp.%I', p.policyname, p.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  -- قراءة لوحة الإدارة
  foreach t in array array['categories', 'brands', 'product_families', 'products', 'spec_definitions', 'product_specs',
                           'product_identifiers', 'stores', 'store_domains', 'store_aliases', 'store_alias_proposals',
                           'sellers', 'affiliate_networks', 'sources', 'currencies', 'fx_rates', 'fx_rate_approvals',
                           'import_files', 'import_runs', 'import_row_issues', 'offer_streams', 'price_observations',
                           'stream_state', 'offer_events', 'car_listing_details', 'verification_events',
                           'match_reviews', 'store_merges', 'settings', 'roles', 'permissions', 'role_permissions',
                           'observation_conversions', 'import_staged_rows'] loop
    execute format('create policy %I on tp.%I for select to authenticated using ((select tp.has_permission(%L)))',
                   t || '_read', t, 'admin:read');
  end loop;

  -- تعديل الكتالوج (catalog:edit يتطلب تحققًا ثنائيًا)
  foreach t in array array['categories', 'brands', 'product_families', 'products', 'spec_definitions',
                           'product_specs', 'product_identifiers'] loop
    execute format('create policy %I on tp.%I for insert to authenticated with check ((select tp.has_permission(%L)))',
                   t || '_insert', t, 'catalog:edit');
    execute format('create policy %I on tp.%I for update to authenticated using ((select tp.has_permission(%L))) with check ((select tp.has_permission(%L)))',
                   t || '_update', t, 'catalog:edit', 'catalog:edit');
  end loop;
  foreach t in array array['product_specs', 'product_identifiers'] loop
    execute format('create policy %I on tp.%I for delete to authenticated using ((select tp.has_permission(%L)))',
                   t || '_delete', t, 'catalog:edit');
  end loop;

  -- المتاجر ونطاقاتها
  foreach t in array array['stores', 'store_domains'] loop
    execute format('create policy %I on tp.%I for insert to authenticated with check ((select tp.has_permission(%L)))',
                   t || '_insert', t, 'store:approve_alias');
  end loop;
  -- الدمج يتم عبر admin_api.merge_store فقط، لذلك التعديل المباشر لا يضبط merged_into
  create policy stores_update on tp.stores for update to authenticated
    using ((select tp.has_permission('store:approve_alias')))
    with check ((select tp.has_permission('store:approve_alias')) and merged_into is null);
  create policy store_domains_update on tp.store_domains for update to authenticated
    using ((select tp.has_permission('store:approve_alias'))) with check ((select tp.has_permission('store:approve_alias')));

  -- المصادر والشبكات وبيانات الاتصال
  foreach t in array array['affiliate_networks', 'sources', 'source_connections', 'source_contacts'] loop
    execute format('create policy %I on tp.%I for insert to authenticated with check ((select tp.has_permission(%L)))',
                   t || '_insert', t, 'source:manage');
    execute format('create policy %I on tp.%I for update to authenticated using ((select tp.has_permission(%L))) with check ((select tp.has_permission(%L)))',
                   t || '_update', t, 'source:manage', 'source:manage');
  end loop;
end $$;

create policy source_connections_read on tp.source_connections for select to authenticated
  using ((select tp.has_permission('source:manage')));
create policy source_contacts_read on tp.source_contacts for select to authenticated
  using ((select tp.has_permission('source:manage')));
create policy source_contacts_delete on tp.source_contacts for delete to authenticated
  using ((select tp.has_permission('source:manage')));
create policy settings_update on tp.settings for update to authenticated
  using ((select tp.has_permission('settings:manage'))) with check ((select tp.has_permission('settings:manage')));
create policy audit_log_read on tp.audit_log for select to authenticated
  using ((select tp.has_permission('audit:read')));
create policy audit_request_meta_read on tp.audit_request_meta for select to authenticated
  using ((select tp.has_permission('audit:read')));
create policy profiles_read on tp.profiles for select to authenticated
  using (user_id = (select tp.current_uid()) or (select tp.has_permission('user:manage')));
create policy user_roles_read on tp.user_roles for select to authenticated
  using (user_id = (select tp.current_uid()) or (select tp.has_permission('user:manage')));
-- tp.schema_migrations: بلا سياسات = لا وصول لأي دور غير المالك

-- ---------------------------------------------------------------------
-- 22) الصلاحيات الصريحة (GRANT/REVOKE)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema tp, pub, admin_api, ingest_api from public, anon, authenticated, service_role, web_reader, ingest_service;
revoke all on all sequences in schema tp from public, anon, authenticated, service_role, web_reader, ingest_service;
revoke all on all functions in schema tp, pub, admin_api, ingest_api from public, anon, authenticated, service_role, web_reader, ingest_service;
revoke all on schema tp, pub, admin_api, ingest_api from anon, service_role;

-- لوحة الإدارة
grant usage on schema tp, admin_api to authenticated;
grant select on all tables in schema tp to authenticated;              -- RLS يحدد الصفوف
revoke select on tp.schema_migrations, tp.offer_eligibility, tp.bootstrap_state from authenticated;
grant insert, update on tp.categories, tp.brands, tp.product_families, tp.products, tp.spec_definitions,
  tp.product_specs, tp.product_identifiers, tp.stores, tp.store_domains, tp.affiliate_networks, tp.sources,
  tp.source_connections, tp.source_contacts to authenticated;
grant update on tp.settings to authenticated;
grant delete on tp.product_specs, tp.product_identifiers, tp.source_contacts to authenticated;
grant usage on all sequences in schema tp to authenticated;
grant select on all tables in schema admin_api to authenticated;
grant execute on function tp.current_uid(), tp.current_aal(), tp.has_permission(text) to authenticated;
grant execute on function
  admin_api.register_import(text, text, text, bigint, text, text, text, jsonb, jsonb, jsonb, jsonb),
  admin_api.stage_import_rows(uuid, int, jsonb),
  admin_api.seal_import(uuid, int),
  admin_api.commit_import(uuid, text),
  admin_api.discard_import(uuid, text),
  admin_api.verify_observation(bigint, text, bigint, text, text, text),
  admin_api.security_report(),
  admin_api.review_match(bigint, text, bigint, bigint, text),
  admin_api.decide_store_alias(bigint, text, text),
  admin_api.merge_store(text, text, text),
  admin_api.grant_role(uuid, text, timestamptz),
  admin_api.revoke_role(uuid, text),
  admin_api.add_fx_rate(text, numeric, text, text, timestamptz),
  admin_api.approve_fx_rate(bigint),
  admin_api.verify_audit_chain(),
  admin_api.my_permissions()
to authenticated;

-- الموقع العام
grant usage on schema pub to web_reader;
grant select on all tables in schema pub to web_reader;

-- خدمة الاستيراد الآلي
grant usage on schema ingest_api to ingest_service;
grant execute on function
  ingest_api.register_import(text, text, text, bigint, text, text, text, jsonb, jsonb, jsonb, jsonb),
  ingest_api.stage_import_rows(uuid, int, jsonb),
  ingest_api.seal_import(uuid, int),
  ingest_api.commit_import(uuid, text)
to ingest_service;

-- ---------------------------------------------------------------------
-- 23) الملكية: كل الكائنات لـ tp_owner (دوال DEFINER تعمل بأقل صلاحيات ممكنة، لا بدور postgres)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select n.nspname, c.relname, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('tp', 'pub', 'admin_api', 'ingest_api') and c.relkind in ('r', 'v', 'p')
      and pg_get_userbyid(c.relowner) <> 'tp_owner'
      -- v1.1.1 (توافق Supabase): جدول له مفتاح أجنبي إلى مخطط auth يبقى بمالك دور الترحيل (postgres)،
      -- لأن Supabase لا يسمح لدور مخصص بامتلاك جدول يشير إلى auth.users. يُمنح tp_owner صلاحياته أدناه.
      and not exists (select 1 from pg_constraint k join pg_class rc on rc.oid = k.confrelid
                      join pg_namespace rn on rn.oid = rc.relnamespace
                      where k.conrelid = c.oid and k.contype = 'f' and rn.nspname = 'auth')
  loop
    execute format('alter %s %I.%I owner to tp_owner', case r.relkind when 'v' then 'view' else 'table' end, r.nspname, r.relname);
  end loop;
  -- الجداول المستثناة (حاليًا tp.profiles): صلاحيات كاملة لـ tp_owner + سياسة RLS له، لأنه لم يعد مالكها
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'tp' and c.relkind in ('r', 'p')
      and exists (select 1 from pg_constraint k join pg_class rc on rc.oid = k.confrelid
                  join pg_namespace rn on rn.oid = rc.relnamespace
                  where k.conrelid = c.oid and k.contype = 'f' and rn.nspname = 'auth')
  loop
    execute format('grant select, insert, update, delete, references, trigger on tp.%I to tp_owner', r.relname);
    if not exists (select 1 from pg_policies where schemaname = 'tp' and tablename = r.relname
                   and policyname = r.relname || '_tp_owner_all') then
      execute format('create policy %I on tp.%I for all to tp_owner using (true) with check (true)',
                     r.relname || '_tp_owner_all', r.relname);
    end if;
  end loop;
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('tp', 'pub', 'admin_api', 'ingest_api') and pg_get_userbyid(p.proowner) <> 'tp_owner'
  loop
    execute format('alter function %s owner to tp_owner', r.sig);
  end loop;
  for r in
    select n.nspname, t.typname, t.typtype
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'tp' and t.typtype in ('e', 'd') and pg_get_userbyid(t.typowner) <> 'tp_owner'
  loop
    execute format('alter %s tp.%I owner to tp_owner', case r.typtype when 'd' then 'domain' else 'type' end, r.typname);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 24) Supabase Storage: حاوية خاصة لملفات الاستيراد (تُنفَّذ فقط إن وُجد مخطط storage)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is not null and to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('imports', 'imports', false) on conflict (id) do nothing;
    execute 'drop policy if exists tp_imports_insert on storage.objects';
    execute 'drop policy if exists tp_imports_read on storage.objects';
    execute $p$create policy tp_imports_insert on storage.objects for insert to authenticated
               with check (bucket_id = 'imports' and (select tp.has_permission('import:commit')))$p$;
    execute $p$create policy tp_imports_read on storage.objects for select to authenticated
               using (bucket_id = 'imports' and (select tp.has_permission('import:commit')))$p$;
    -- لا سياسات تعديل/حذف: الحذف يتم بمهمة الاحتفاظ فقط
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 25) بيانات مرجعية (بلا أسعار). on conflict do nothing = إعادة تشغيل آمنة
-- ---------------------------------------------------------------------
insert into tp.settings (key, value, needs_confirmation, note) values
  ('max_price_age_days',         14,     false, 'عمر السعر الأقصى للسعر العادل (معتمد في محرك الاستيراد)'),
  ('max_import_rows',            50000,  false, 'نفس حد محرك الاستيراد'),
  ('max_stage_chunk_rows',       5000,   false, 'أقصى صفوف في دفعة رفع واحدة (تحت مهلة 8 ثوانٍ مع هامش)'),
  ('max_commit_rows',            20000,  false, 'أقصى صفوف في تشغيل استيراد واحد داخل القاعدة (الاعتماد ذري في استدعاء واحد تحت مهلة 8 ثوانٍ؛ الملف الأكبر يُقسَّم لعدة تشغيلات)'),
  ('fx_max_age_days',            2,      true,  'أقصى فرق بين تاريخ سعر الصرف وتاريخ السعر'),
  ('max_new_car_km',             500,    true,  'أقصى ممشى مقبول لسيارة توصف بأنها جديدة'),
  ('import_file_retention_days', 180,    true,  'مدة الاحتفاظ بملف الاستيراد الخام'),
  ('row_issue_retention_days',   90,     true,  'مدة الاحتفاظ بأخطاء الصفوف'),
  ('audit_ip_retention_months',  12,     true,  'مدة الاحتفاظ بعنوان IP في بيانات الطلب')
on conflict (key) do nothing;

insert into tp.roles (id, description) values
  ('admin', 'إدارة كاملة'), ('reviewer', 'مراجعة الأسعار والمطابقة'), ('viewer', 'قراءة فقط')
on conflict (id) do nothing;

insert into tp.permissions (id, requires_mfa, description) values
  ('admin:read',          false, 'قراءة لوحة الإدارة'),
  ('import:preview',      false, 'معاينة ملف'),
  ('import:commit',       true,  'تسجيل واعتماد استيراد'),
  ('store:approve_alias', true,  'اعتماد اسم متجر بديل أو متجر جديد'),
  ('store:merge',         true,  'دمج متجرين'),
  ('price:verify',        false, 'توثيق سعر'),
  ('price:reject',        false, 'رفض سعر'),
  ('match:review',        false, 'مراجعة المطابقة'),
  ('catalog:edit',        true,  'تعديل الكتالوج'),
  ('source:manage',       true,  'إدارة المصادر وبيانات الاتصال'),
  ('fx:enter',            true,  'إدخال سعر تحويل'),
  ('fx:approve',          true,  'اعتماد سعر تحويل (غير من أدخله)'),
  ('settings:manage',     true,  'تعديل قيم السياسات'),
  ('audit:read',          false, 'قراءة سجل الإجراءات'),
  ('user:manage',         true,  'إدارة المستخدمين والأدوار')
on conflict (id) do nothing;

insert into tp.role_permissions (role_id, permission_id)
select 'admin', id from tp.permissions
union all select 'reviewer', unnest(array['admin:read', 'import:preview', 'price:verify', 'price:reject', 'match:review'])
union all select 'viewer',   unnest(array['admin:read', 'import:preview'])
on conflict do nothing;

insert into tp.currencies (code, minor_units, name_ar) values
  ('SAR', 2, 'ريال سعودي'), ('AED', 2, 'درهم إماراتي'), ('QAR', 2, 'ريال قطري'), ('EGP', 2, 'جنيه مصري'),
  ('KWD', 3, 'دينار كويتي'), ('BHD', 3, 'دينار بحريني'), ('OMR', 3, 'ريال عماني'), ('JOD', 3, 'دينار أردني'),
  ('USD', 2, 'دولار أمريكي'), ('EUR', 2, 'يورو'), ('GBP', 2, 'جنيه إسترليني'), ('CNY', 2, 'يوان صيني'),
  ('INR', 2, 'روبية هندية'), ('TRY', 2, 'ليرة تركية')
on conflict (code) do nothing;

insert into tp.schema_migrations (version) values ('v1.1') on conflict (version) do nothing;
insert into tp.schema_migrations (version) values ('v1.1.1') on conflict (version) do nothing;

commit;

-- =====================================================================
-- [2] db/mvp/002_mvp_overlay.sql — طبقة MVP: واجهات الموقع ودوال اللوحة والتعطيل المؤقت القابل للعكس
--     sha256=5110d09b4ee75290eeebfd94a0766cc997fc8440adf63cd1fa686a10173e54c5
-- =====================================================================
-- =====================================================================
-- TruePrice — طبقة MVP فوق مخطط v1.1 (db/schema/001_trueprice_v1_1.sql)
--
-- لا تعدّل ملف v1.1 المعتمد للمراجعة؛ تضيف فوقه فقط، وكل تعطيل هنا قابل للعكس
-- بالملف db/mvp/restore_disabled_features.sql (لا يُنفَّذ تلقائيًا).
--
--   1) tp.product_details: حقول صفحة المنتج الحالية (الشاشة، المعالج، الألوان...)
--      حتى تبقى صفحات المنتجات كما هي بعد النقل إلى القاعدة.
--   2) pub.product_details و pub.price_history: قراءة عامة لما هو منشور وموثق فقط.
--   3) تعطيل مؤقت (MVP): تحويل العملات، الاستيراد الآلي، والاستيراد الضخم.
--      الأسعار بالريال السعودي فقط.
--
-- إعادة التشغيل آمنة. يُنفَّذ بدور الترحيل نفسه الذي نفّذ v1.1.
-- =====================================================================
begin;
set local role tp_owner;

-- ---------------------------------------------------------------------
-- 1) تفاصيل صفحة المنتج (تماثل حقول app/data/products.ts)
-- ---------------------------------------------------------------------
create table if not exists tp.product_details (
  product_id       bigint primary key references tp.products (id),
  memory           text check (length(memory) <= 120),
  storage          text check (length(storage) <= 120),
  screen           text check (length(screen) <= 300),
  chip             text check (length(chip) <= 300),
  camera           text check (length(camera) <= 300),
  front_camera     text check (length(front_camera) <= 300),
  battery          text check (length(battery) <= 300),
  connectivity     text check (length(connectivity) <= 300),
  water_resistance text check (length(water_resistance) <= 120),
  refresh_rate     text check (length(refresh_rate) <= 120),
  colors           text[] not null default '{}',
  description      text check (length(description) <= 4000),
  amazon_url       text check (amazon_url ~ '^https://'),
  -- بيانات عرض/اختبار: تظهر بشارة "بيانات تجريبية" ولا تُفهرس ولا تدخل خريطة الموقع
  is_demo          boolean not null default false,
  updated_at       timestamptz not null default now()
);
alter table tp.product_details enable row level security;

drop policy if exists product_details_read on tp.product_details;
create policy product_details_read on tp.product_details for select to authenticated
  using ((select tp.has_permission('admin:read')));
drop policy if exists product_details_insert on tp.product_details;
create policy product_details_insert on tp.product_details for insert to authenticated
  with check ((select tp.has_permission('catalog:edit')));
drop policy if exists product_details_update on tp.product_details;
create policy product_details_update on tp.product_details for update to authenticated
  using ((select tp.has_permission('catalog:edit'))) with check ((select tp.has_permission('catalog:edit')));

drop trigger if exists product_details_touch on tp.product_details;
create trigger product_details_touch before update on tp.product_details
  for each row execute function tp.touch_updated_at();

create or replace view admin_api.product_details with (security_invoker = true) as select * from tp.product_details;

-- ---------------------------------------------------------------------
-- 2) واجهات عامة إضافية (يقرأها web_reader فقط)
-- ---------------------------------------------------------------------
create or replace view pub.product_details with (security_barrier = true) as
  select d.product_id, d.memory, d.storage, d.screen, d.chip, d.camera, d.front_camera, d.battery,
         d.connectivity, d.water_resistance, d.refresh_rate, d.colors, d.description, d.amazon_url, d.is_demo
  from tp.product_details d
  join tp.products p on p.id = d.product_id and p.status = 'active';

-- سجل الأسعار العام: الملاحظات التي آخر قرار عليها "موثق" فقط، بالريال، لمنتجات منشورة.
-- المرفوض وغير الموثق لا يظهر هنا أبدًا. الملاحظات لا تُعدّل ولا تُحذف (إضافة فقط).
create or replace view pub.price_history with (security_barrier = true) as
  with latest_verification as (
    select distinct on (v.observation_id) v.observation_id, v.status, v.at
    from tp.verification_events v
    order by v.observation_id, v.id desc
  )
  select os.product_id, p.legacy_id, coalesce(st.merged_into, st.id) as store_id, tgt.name_ar as store_name_ar,
         o.id as observation_id, o.sar_amount as price_sar, o.as_of, o.date_confirmed, lv.at as verified_at,
         (ss.current_observation_id = o.id) as is_current
  from tp.price_observations o
  join latest_verification lv on lv.observation_id = o.id and lv.status = 'verified'
  join tp.offer_streams os on os.id = o.stream_id and os.category_kind = 'electronics'
  join tp.products p on p.id = os.product_id and p.status = 'active'
  join tp.stores st on st.id = os.store_id
  join tp.stores tgt on tgt.id = coalesce(st.merged_into, st.id)
  left join tp.stream_state ss on ss.stream_id = os.id
  where o.currency = 'SAR' and o.sar_amount is not null;

-- نفس أنواع المتاجر غير المنشورة لا تظهر: pub.stores يحددها v1.1
grant usage on schema pub to web_reader;
grant select on pub.product_details, pub.price_history to web_reader;
grant select, insert, update on tp.product_details to authenticated;
grant select on admin_api.product_details to authenticated;

-- هوية المستخدم الحالي للعرض في اللوحة (اسمه وأدواره الفعّالة) — لا تمنح أي صلاحية
create or replace function admin_api.my_profile() returns table (display_name text, roles text[])
language sql stable security definer set search_path = '' as $$
  select pr.display_name,
         coalesce(array(select ur.role_id from tp.user_roles ur
                        where ur.user_id = pr.user_id and (ur.expires_at is null or ur.expires_at > now())
                        order by ur.role_id), '{}')
  from tp.profiles pr
  where pr.user_id = tp.current_uid() and pr.status = 'active'
$$;
revoke all on function admin_api.my_profile() from public;
grant execute on function admin_api.my_profile() to authenticated;

-- إدارة المستخدمين من اللوحة (user:manage، يتطلب تحققًا ثنائيًا). الحساب نفسه يُنشأ في Supabase Auth،
-- وهنا يُربط بملف شخصي ثم تُمنح الأدوار بدالة grant_role الموجودة (لا أحد يمنح نفسه).
create or replace function admin_api.list_users() returns table (user_id uuid, display_name text, status text, roles text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  perform tp.require_permission('user:manage');
  return query
    select pr.user_id, pr.display_name, pr.status,
           coalesce(array(select ur.role_id from tp.user_roles ur
                          where ur.user_id = pr.user_id and (ur.expires_at is null or ur.expires_at > now())
                          order by ur.role_id), '{}')
    from tp.profiles pr order by pr.created_at;
end $$;
revoke all on function admin_api.list_users() from public;
grant execute on function admin_api.list_users() to authenticated;

create or replace function admin_api.upsert_profile(p_user uuid, p_display_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('user:manage'); v_name text := pg_catalog.btrim(p_display_name);
begin
  if v_name is null or pg_catalog.length(v_name) < 2 or pg_catalog.length(v_name) > 120 then
    raise exception 'display name must be 2-120 characters' using errcode = '22023';
  end if;
  begin
    insert into tp.profiles (user_id, display_name) values (p_user, v_name)
    on conflict (user_id) do update set display_name = excluded.display_name;
  exception when foreign_key_violation then
    raise exception 'user must exist in Supabase Auth first' using errcode = '23503';
  end;
  perform tp.write_audit('user.profile', 'user', p_user::text, null,
                         pg_catalog.jsonb_build_object('display_name', v_name), v_uid);
end $$;
revoke all on function admin_api.upsert_profile(uuid, text) from public;
grant execute on function admin_api.upsert_profile(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) تعطيل مؤقت لميزات خارج MVP (قابل للعكس — restore_disabled_features.sql)
-- ---------------------------------------------------------------------
-- (أ) الريال فقط: لا تُقبل صفوف استيراد بعملة أخرى
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mvp_sar_only' and conrelid = 'tp.import_staged_rows'::regclass) then
    alter table tp.import_staged_rows add constraint mvp_sar_only check (currency = 'SAR');
  end if;
end $$;

-- (ب) تحويل العملات: دوال إدخال واعتماد سعر الصرف غير متاحة للوحة
revoke execute on function admin_api.add_fx_rate(text, numeric, text, text, timestamptz) from authenticated;
revoke execute on function admin_api.approve_fx_rate(bigint) from authenticated;

-- (ج) الاستيراد الآلي (خدمة ingest_service): معطّل في MVP، الاستيراد من اللوحة فقط
revoke execute on function ingest_api.register_import(text, text, text, bigint, text, text, text, jsonb, jsonb, jsonb, jsonb),
  ingest_api.stage_import_rows(uuid, int, jsonb), ingest_api.seal_import(uuid, int),
  ingest_api.commit_import(uuid, text) from ingest_service;

-- (د) الاستيراد الضخم: حد التشغيل الواحد 1,000 صف بدل 20,000 (القيمة الأصلية محفوظة للاسترجاع)
insert into tp.settings (key, value, needs_confirmation, note) values
  ('mvp_original_max_commit_rows', 20000, false, 'MVP: قيمة max_commit_rows الأصلية قبل التعطيل المؤقت للاستيراد الضخم'),
  ('mvp_fx_enabled',               0,     false, 'MVP: تحويل العملات معطّل مؤقتًا (0) — الأسعار بالريال فقط'),
  ('mvp_automated_import_enabled', 0,     false, 'MVP: الاستيراد الآلي معطّل مؤقتًا (0) — الاستيراد من لوحة الإدارة فقط')
on conflict (key) do nothing;
update tp.settings set value = 1000 where key = 'max_commit_rows' and value <> 1000;

insert into tp.schema_migrations (version) values ('mvp-overlay-1') on conflict (version) do nothing;
insert into tp.schema_migrations (version) values ('mvp-overlay-2') on conflict (version) do nothing;
commit;

-- =====================================================================
-- [3] db/schema/003_visitors_requests.sql — إحصائيات الزوار وطلبات التواصل والشكاوى
--     sha256=a7efa90fb0c2638a73c94893a54edc59772b879b73a8a3c27c0ce20f3bc1f315
-- =====================================================================
-- =====================================================================
-- TruePrice — 003: إحصائيات الزوار، طلبات التواصل والشكاوى، إعدادات التواصل، حدود المعدل
--
-- يُنفَّذ بعد 001 و002 وبنفس دور الترحيل. إضافي فقط وإعادة تشغيله آمنة (لا يحذف بيانات).
--
-- الخصوصية (إحصائيات الزوار):
--   - لا يُخزَّن عنوان IP ولا متصفح المستخدم ولا أي معرّف دائم. يُحسب فقط بصمة يومية
--     sha256(ملح اليوم ‖ IP ‖ المتصفح) مقطوعة إلى 16 بايت، والملح عشوائي ويُتلف بعد يومين،
--     فلا يمكن ربط زائر بين يومين ولا استرجاع عنوانه.
--   - لا ملفات تعريف (cookies) ولا تخزين في المتصفح للإحصائيات.
--   - الزوار الفريدون = فريدون في اليوم؛ لأي فترة أطول يُعرض مجموع الفريدين اليوميين (موسوم بذلك).
--
-- الطلبات: رقم مرجعي عشوائي (لا يمكن تخمين الأرقام المتتالية) + رمز متابعة سري يُعرض مرة واحدة
-- ولا يُخزَّن إلا بصمته. البيانات الشخصية (الاسم، البريد، الجوال) اختيارية ولا يقرؤها إلا من له
-- صلاحية requests:read.
--
-- كل الوصول عبر دوال SECURITY DEFINER بمسار بحث فارغ ومالكها tp_owner؛ الجداول بلا سياسات
-- (RLS مفعّل) فلا يصلها أي دور مباشرة.
-- =====================================================================
begin;
set local role tp_owner;

-- ---------------------------------------------------------------------
-- 1) الصلاحيات الجديدة
-- ---------------------------------------------------------------------
insert into tp.permissions (id, requires_mfa, description) values
  ('stats:read',      false, 'قراءة إحصائيات الزوار'),
  ('requests:read',   false, 'قراءة طلبات التواصل والشكاوى'),
  ('requests:manage', true,  'معالجة طلبات التواصل والرد عليها')
on conflict (id) do nothing;

insert into tp.role_permissions (role_id, permission_id) values
  ('admin', 'stats:read'), ('admin', 'requests:read'), ('admin', 'requests:manage'),
  ('viewer', 'stats:read')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) الأملاح اليومية وحدود المعدل (داخلية — لا يقرؤها أي دور)
-- ---------------------------------------------------------------------
create table if not exists tp.visitor_salts (
  day  date primary key,
  salt bytea not null check (pg_catalog.length(salt) = 32)
);
alter table tp.visitor_salts enable row level security;

create table if not exists tp.rate_limit_hits (
  bucket   text not null check (bucket ~ '^[a-z_]{2,40}$'),
  key_hash bytea not null,
  at       timestamptz not null default now()
);
create index if not exists rate_limit_hits_idx on tp.rate_limit_hits (bucket, key_hash, at);
alter table tp.rate_limit_hits enable row level security;

-- اليوم بتوقيت الرياض
create or replace function tp.riyadh_today() returns date
language sql stable set search_path = '' as $$
  select (pg_catalog.now() at time zone 'Asia/Riyadh')::date
$$;

-- بصمة يومية غير قابلة للعكس (16 بايت). الملح يُنشأ عند أول استخدام في اليوم ويُتلف بعد يومين.
create or replace function tp.daily_hash(p_parts text) returns bytea
language plpgsql security definer set search_path = '' as $$
declare v_day date := tp.riyadh_today(); v_salt bytea;
begin
  select s.salt into v_salt from tp.visitor_salts s where s.day = v_day;
  if v_salt is null then
    insert into tp.visitor_salts (day, salt)
    values (v_day, pg_catalog.sha256(pg_catalog.uuid_send(pg_catalog.gen_random_uuid())
                                     || pg_catalog.uuid_send(pg_catalog.gen_random_uuid())))
    on conflict (day) do nothing;
    select s.salt into v_salt from tp.visitor_salts s where s.day = v_day;
    -- إتلاف الأملاح القديمة: البصمات السابقة تصبح غير قابلة للربط
    delete from tp.visitor_salts s where s.day < v_day - 1;
  end if;
  return pg_catalog.substr(pg_catalog.sha256(v_salt || pg_catalog.convert_to(coalesce(p_parts, ''), 'UTF8')), 1, 16);
end $$;

-- true = تجاوز الحد (لا يُسجَّل المحاولة الزائدة)
create or replace function tp.rate_limited(p_bucket text, p_key bytea, p_max int, p_window interval) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  delete from tp.rate_limit_hits h
  where h.bucket = p_bucket and h.key_hash = p_key and h.at < pg_catalog.now() - p_window;
  select pg_catalog.count(*) into v_n from tp.rate_limit_hits h
  where h.bucket = p_bucket and h.key_hash = p_key and h.at >= pg_catalog.now() - p_window;
  if v_n >= p_max then
    return true;
  end if;
  insert into tp.rate_limit_hits (bucket, key_hash) values (p_bucket, p_key);
  -- تنظيف دوري لمفاتيح الأيام السابقة (البصمات اليومية لا تتكرر بعد يومها)
  if pg_catalog.random() < 0.01 then
    delete from tp.rate_limit_hits h where h.at < pg_catalog.now() - interval '2 days';
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 3) إحصائيات الزوار
-- ---------------------------------------------------------------------
create table if not exists tp.page_views (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  day           date not null,
  visitor_hash  bytea not null check (pg_catalog.length(visitor_hash) = 16),
  path          text not null check (path ~ '^/[^[:cntrl:]]{0,199}$'),
  kind          text not null check (kind in ('home', 'search', 'product', 'car_brand', 'cars', 'category',
                                              'methodology', 'contact', 'other')),
  ref_id        text check (ref_id ~ '^[a-z0-9-]{1,80}$'),
  search_query  text check (pg_catalog.length(search_query) between 1 and 80),
  referrer_host text check (referrer_host ~ '^[a-z0-9.-]{1,100}$'),
  device        text not null check (device in ('mobile', 'tablet', 'desktop'))
);
create index if not exists page_views_day_idx on tp.page_views (day, visitor_hash, at);
create index if not exists page_views_kind_idx on tp.page_views (kind, day);
alter table tp.page_views enable row level security;

-- يستدعيها الموقع العام (web_reader) لكل مشاهدة صفحة اجتازت فلتر الزيارات الآلية في التطبيق.
-- عنوان IP والمتصفح يُستخدمان هنا لحساب البصمة فقط ولا يُخزَّنان.
create or replace function pub.record_page_view(
  p_ip text, p_ua text, p_path text, p_kind text, p_ref text, p_query text, p_referrer_host text, p_device text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_hash bytea; v_kind text; v_device text;
begin
  if p_path is null or p_path !~ '^/[^[:cntrl:]]{0,199}$' then
    return false;
  end if;
  v_kind := case when p_kind in ('home', 'search', 'product', 'car_brand', 'cars', 'category', 'methodology', 'contact')
                 then p_kind else 'other' end;
  v_device := case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'desktop' end;
  v_hash := tp.daily_hash(coalesce(p_ip, '') || '|' || coalesce(pg_catalog.left(p_ua, 400), ''));
  -- حماية إضافية من الإغراق: 120 مشاهدة لكل زائر في 10 دقائق
  if tp.rate_limited('page_view', v_hash, 120, interval '10 minutes') then
    return false;
  end if;
  insert into tp.page_views (day, visitor_hash, path, kind, ref_id, search_query, referrer_host, device)
  values (tp.riyadh_today(), v_hash, p_path, v_kind,
          case when p_ref ~ '^[a-z0-9-]{1,80}$' then p_ref end,
          case when v_kind = 'search' and pg_catalog.length(pg_catalog.btrim(p_query)) between 1 and 80
               then pg_catalog.btrim(p_query) end,
          case when p_referrer_host ~ '^[a-z0-9.-]{1,100}$' then p_referrer_host end,
          v_device);
  return true;
end $$;

-- لوحة الإحصائيات: آخر p_days يومًا (1..400) بتوقيت الرياض
create or replace function admin_api.visitor_stats(p_days int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 400);
  v_to date := tp.riyadh_today();
  v_from date := v_to - (v_days - 1);
  v jsonb;
begin
  perform tp.require_permission('stats:read');
  with pv as (
    select p.* from tp.page_views p where p.day between v_from and v_to
  ), marked as (
    select pv.day, pv.visitor_hash,
           case when pg_catalog.lag(pv.at) over w is null or pv.at - pg_catalog.lag(pv.at) over w > interval '30 minutes'
                then 1 else 0 end as starts_visit
    from pv window w as (partition by pv.day, pv.visitor_hash order by pv.at)
  ), per_day as (
    select g.d::date as day,
           (select pg_catalog.count(*) from pv where pv.day = g.d::date) as pageviews,
           (select pg_catalog.count(distinct pv.visitor_hash) from pv where pv.day = g.d::date) as visitors,
           (select coalesce(pg_catalog.sum(m.starts_visit), 0) from marked m where m.day = g.d::date) as visits
    from pg_catalog.generate_series(v_from, v_to, interval '1 day') g(d)
  )
  select pg_catalog.jsonb_build_object(
    'from', v_from, 'to', v_to,
    'totals', (select pg_catalog.jsonb_build_object(
                 'pageviews', coalesce(pg_catalog.sum(d.pageviews), 0),
                 'daily_unique_visitors_sum', coalesce(pg_catalog.sum(d.visitors), 0),
                 'visits', coalesce(pg_catalog.sum(d.visits), 0)) from per_day d),
    'daily', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                 'day', d.day, 'pageviews', d.pageviews, 'visitors', d.visitors, 'visits', d.visits) order by d.day), '[]')
              from per_day d),
    'top_pages', (select coalesce(pg_catalog.jsonb_agg(x order by x.n desc, x.path), '[]') from (
                    select pv.path, pg_catalog.count(*) as n from pv group by pv.path order by n desc, pv.path limit 15) x),
    'top_products', (select coalesce(pg_catalog.jsonb_agg(x order by x.n desc, x.ref_id), '[]') from (
                    select pv.ref_id, pg_catalog.count(*) as n,
                           (select coalesce(p.name_ar, p.name) from tp.products p
                            where p.category_kind = 'electronics'
                              and coalesce(p.legacy_id::bigint, 900000 + p.id)::text = pv.ref_id) as name
                    from pv where pv.kind = 'product' and pv.ref_id is not null
                    group by pv.ref_id order by n desc, pv.ref_id limit 10) x),
    'top_cars', (select coalesce(pg_catalog.jsonb_agg(x order by x.n desc, x.ref_id), '[]') from (
                    select pv.ref_id, pg_catalog.count(*) as n,
                           (select coalesce(b.name_ar, b.name) from tp.brands b where b.slug = pv.ref_id) as name
                    from pv where pv.kind = 'car_brand' and pv.ref_id is not null
                    group by pv.ref_id order by n desc, pv.ref_id limit 10) x),
    'top_searches', (select coalesce(pg_catalog.jsonb_agg(x order by x.n desc, x.q), '[]') from (
                    select pv.search_query as q, pg_catalog.count(*) as n from pv
                    where pv.kind = 'search' and pv.search_query is not null
                    group by pv.search_query order by n desc, pv.search_query limit 15) x),
    'referrers', (select coalesce(pg_catalog.jsonb_agg(x order by x.n desc, x.host), '[]') from (
                    select coalesce(pv.referrer_host, 'direct') as host, pg_catalog.count(*) as n from pv
                    group by 1 order by n desc, 1 limit 10) x),
    'devices', (select coalesce(pg_catalog.jsonb_agg(x order by x.n desc, x.device), '[]') from (
                    select pv.device, pg_catalog.count(*) as n from pv group by pv.device) x)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 4) إعدادات التواصل (البريد والواتساب) — فارغة حتى يدخلها صاحب المشروع من اللوحة
-- ---------------------------------------------------------------------
create table if not exists tp.site_settings (
  key        text primary key check (key in ('contact_email', 'contact_whatsapp')),
  value      text not null check (pg_catalog.length(value) between 3 and 200),
  updated_by uuid not null references tp.profiles (user_id),
  updated_at timestamptz not null default now()
);
alter table tp.site_settings enable row level security;

create or replace view pub.site_contact with (security_barrier = true) as
  select (select s.value from tp.site_settings s where s.key = 'contact_email') as email,
         (select s.value from tp.site_settings s where s.key = 'contact_whatsapp') as whatsapp;

create or replace function admin_api.site_settings() returns table (key text, value text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform tp.require_permission('admin:read');
  return query select s.key, s.value, s.updated_at from tp.site_settings s order by s.key;
end $$;

-- قيمة فارغة = إزالة الإعداد (لا يُعرض شيء في الموقع)
create or replace function admin_api.set_site_setting(p_key text, p_value text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('settings:manage'); v text := pg_catalog.btrim(coalesce(p_value, ''));
  v_before text;
begin
  if p_key not in ('contact_email', 'contact_whatsapp') then
    raise exception 'unknown setting %', p_key using errcode = 'TP400';
  end if;
  if p_key = 'contact_whatsapp' then
    v := pg_catalog.regexp_replace(v, '[\s()-]', '', 'g');
  end if;
  if v <> '' and p_key = 'contact_email' and v !~* '^[^@\s]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$' then
    raise exception 'invalid email' using errcode = 'TP400';
  end if;
  if v <> '' and p_key = 'contact_whatsapp' and v !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid whatsapp number (international format +966...)' using errcode = 'TP400';
  end if;
  select s.value into v_before from tp.site_settings s where s.key = p_key;
  if v = '' then
    delete from tp.site_settings s where s.key = p_key;
  else
    insert into tp.site_settings (key, value, updated_by) values (p_key, v, v_uid)
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform tp.write_audit('settings.contact', 'site_setting', p_key,
    pg_catalog.jsonb_build_object('value', v_before), pg_catalog.jsonb_build_object('value', nullif(v, '')), v_uid);
end $$;

-- ---------------------------------------------------------------------
-- 5) طلبات التواصل: استفسار، شكوى، اقتراح، بلاغ عن خطأ في سعر
-- ---------------------------------------------------------------------
create table if not exists tp.contact_requests (
  id          bigint generated always as identity primary key,
  reference   text not null unique check (reference ~ '^TP-[A-HJ-NP-Z2-9]{8}$'),
  token_hash  bytea not null check (pg_catalog.length(token_hash) = 32),
  kind        text not null check (kind in ('inquiry', 'complaint', 'suggestion', 'price_error')),
  status      text not null default 'new' check (status in ('new', 'in_progress', 'answered', 'closed', 'spam')),
  name        text check (pg_catalog.length(name) between 1 and 100),
  email       text check (email ~* '^[^@\s]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$'),
  phone       text check (phone ~ '^\+?[0-9]{7,15}$'),
  subject     text not null check (pg_catalog.length(subject) between 3 and 150),
  message     text not null check (pg_catalog.length(message) between 10 and 4000),
  related_ref text check (related_ref ~ '^(/[a-z0-9/_-]{1,200}|[0-9]{1,9})$'),
  ip_hash     bytea not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists contact_requests_status_idx on tp.contact_requests (status, created_at desc);
alter table tp.contact_requests enable row level security;

create table if not exists tp.contact_replies (
  id          bigint generated always as identity primary key,
  request_id  bigint not null references tp.contact_requests (id),
  body        text not null check (pg_catalog.length(body) between 1 and 4000),
  is_public   boolean not null,
  author_id   uuid not null references tp.profiles (user_id),
  created_at  timestamptz not null default now()
);
create index if not exists contact_replies_request_idx on tp.contact_replies (request_id, id);
alter table tp.contact_replies enable row level security;

create or replace function tp.random_code(p_len int) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- 32 حرفًا، بلا I/O/0/1 للالتباس
  b bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid()) || pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  r text := '';
begin
  if p_len < 1 or p_len > 24 then
    raise exception 'bad length' using errcode = 'TP400';
  end if;
  -- بايتات UUID v4 العشوائية (يُتجنَّب بايت الإصدار 6 والمتغير 8 في كل UUID)
  for i in 0..p_len - 1 loop
    r := r || pg_catalog.substr(alphabet, (pg_catalog.get_byte(b, (array[0,1,2,3,4,5,7,9,10,11,12,13,14,15,
                                                                     16,17,18,19,20,21,23,25,26,27])[i + 1]) % 32) + 1, 1);
  end loop;
  return r;
end $$;

create or replace function tp.normalize_code(p text) returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- يستدعيها الموقع العام بعد فحوص التطبيق (الحقل المخفي، زمن التعبئة). تعيد الرقم المرجعي ورمز
-- المتابعة مرة واحدة فقط؛ الرمز لا يُخزَّن (بصمته فقط).
create or replace function pub.submit_contact_request(
  p_ip text, p_kind text, p_name text, p_email text, p_phone text,
  p_subject text, p_message text, p_related_ref text
) returns table (reference text, tracking_code text)
language plpgsql security definer set search_path = '' as $$
declare
  v_ip bytea := tp.daily_hash('contact|' || coalesce(p_ip, ''));
  v_global bytea := '\x00'::bytea;
  v_name text := nullif(pg_catalog.btrim(p_name), '');
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(p_email)), '');
  v_phone text := nullif(pg_catalog.regexp_replace(coalesce(p_phone, ''), '[\s()-]', '', 'g'), '');
  v_subject text := pg_catalog.btrim(p_subject);
  v_message text := pg_catalog.btrim(p_message);
  v_ref text := nullif(pg_catalog.btrim(p_related_ref), '');
  v_code text; v_reference text;
begin
  if p_kind not in ('inquiry', 'complaint', 'suggestion', 'price_error') then
    raise exception 'invalid kind' using errcode = 'TP400';
  end if;
  if v_subject is null or pg_catalog.length(v_subject) not between 3 and 150 then
    raise exception 'subject must be 3-150 characters' using errcode = 'TP400';
  end if;
  if v_message is null or pg_catalog.length(v_message) not between 10 and 4000 then
    raise exception 'message must be 10-4000 characters' using errcode = 'TP400';
  end if;
  if v_name is not null and pg_catalog.length(v_name) > 100 then
    raise exception 'name too long' using errcode = 'TP400';
  end if;
  if v_email is not null and v_email !~* '^[^@\s]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$' then
    raise exception 'invalid email' using errcode = 'TP400';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9]{7,15}$' then
    raise exception 'invalid phone' using errcode = 'TP400';
  end if;
  if v_ref is not null and v_ref !~ '^(/[a-z0-9/_-]{1,200}|[0-9]{1,9})$' then
    v_ref := null;
  end if;
  -- رسائل مزعجة: روابط كثيرة
  if (select pg_catalog.count(*) from pg_catalog.regexp_matches(v_message, 'https?://', 'g')) > 3 then
    raise exception 'too many links' using errcode = 'TP400';
  end if;
  -- حدود المعدل: 5 في الساعة و20 في اليوم لكل زائر، و300 في الساعة للموقع كله
  if tp.rate_limited('contact_hour', v_ip, 5, interval '1 hour')
     or tp.rate_limited('contact_day', v_ip, 20, interval '1 day')
     or tp.rate_limited('contact_global', v_global, 300, interval '1 hour') then
    raise exception 'rate limited' using errcode = 'TP429';
  end if;
  -- نفس الرسالة من نفس الزائر اليوم = تكرار
  if exists (select 1 from tp.contact_requests r where r.ip_hash = v_ip and r.message = v_message
             and r.created_at > pg_catalog.now() - interval '1 day') then
    raise exception 'duplicate request' using errcode = 'TP409';
  end if;

  v_code := tp.random_code(16);
  loop
    v_reference := 'TP-' || tp.random_code(8);
    exit when not exists (select 1 from tp.contact_requests r where r.reference = v_reference);
  end loop;
  insert into tp.contact_requests (reference, token_hash, kind, name, email, phone, subject, message, related_ref, ip_hash)
  values (v_reference, pg_catalog.sha256(pg_catalog.convert_to(v_code, 'UTF8')), p_kind, v_name, v_email, v_phone,
          v_subject, v_message, v_ref, v_ip);
  return query select v_reference,
    pg_catalog.substr(v_code, 1, 4) || '-' || pg_catalog.substr(v_code, 5, 4) || '-' ||
    pg_catalog.substr(v_code, 9, 4) || '-' || pg_catalog.substr(v_code, 13, 4);
end $$;

-- متابعة الطلب: الرقم المرجعي + رمز المتابعة. لا يعيد أي بيانات شخصية، ولا الردود الداخلية.
create or replace function pub.track_contact_request(p_ip text, p_reference text, p_code text)
returns table (reference text, kind text, status text, subject text, created_at timestamptz, updated_at timestamptz,
               replies jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_ip bytea := tp.daily_hash('track|' || coalesce(p_ip, '')); r tp.contact_requests;
begin
  if tp.rate_limited('track_hour', v_ip, 30, interval '1 hour') then
    raise exception 'rate limited' using errcode = 'TP429';
  end if;
  select * into r from tp.contact_requests c
  where c.reference = pg_catalog.upper(pg_catalog.btrim(coalesce(p_reference, '')))
    and c.token_hash = pg_catalog.sha256(pg_catalog.convert_to(tp.normalize_code(p_code), 'UTF8'));
  if not found then
    return;   -- نفس الاستجابة لرقم غير موجود أو رمز خاطئ
  end if;
  return query select r.reference, r.kind, case when r.status = 'spam' then 'closed' else r.status end,
    r.subject, r.created_at, r.updated_at,
    coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('body', x.body, 'at', x.created_at) order by x.id)
              from tp.contact_replies x where x.request_id = r.id and x.is_public), '[]'::jsonb);
end $$;

-- لوحة الإدارة
create or replace function admin_api.list_requests(p_status text, p_kind text, p_limit int)
returns table (id bigint, reference text, kind text, status text, subject text, created_at timestamptz,
               updated_at timestamptz, has_contact boolean, replies int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform tp.require_permission('requests:read');
  return query
    select c.id, c.reference, c.kind, c.status, c.subject, c.created_at, c.updated_at,
           (c.email is not null or c.phone is not null),
           (select pg_catalog.count(*)::int from tp.contact_replies x where x.request_id = c.id)
    from tp.contact_requests c
    where (p_status is null or c.status = p_status) and (p_kind is null or c.kind = p_kind)
    order by c.created_at desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create or replace function admin_api.request_counts() returns table (status text, n int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform tp.require_permission('requests:read');
  return query select c.status, pg_catalog.count(*)::int from tp.contact_requests c group by c.status;
end $$;

create or replace function admin_api.request_detail(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform tp.require_permission('requests:read');
  select pg_catalog.jsonb_build_object(
    'id', c.id, 'reference', c.reference, 'kind', c.kind, 'status', c.status, 'name', c.name, 'email', c.email,
    'phone', c.phone, 'subject', c.subject, 'message', c.message, 'related_ref', c.related_ref,
    'created_at', c.created_at, 'updated_at', c.updated_at,
    'replies', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                  'id', x.id, 'body', x.body, 'is_public', x.is_public, 'at', x.created_at,
                  'author', (select pr.display_name from tp.profiles pr where pr.user_id = x.author_id)) order by x.id)
                from tp.contact_replies x where x.request_id = c.id), '[]'::jsonb))
  into v from tp.contact_requests c where c.id = p_id;
  return v;
end $$;

create or replace function admin_api.set_request_status(p_id bigint, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('requests:manage'); v_before text;
begin
  if p_status not in ('new', 'in_progress', 'answered', 'closed', 'spam') then
    raise exception 'invalid status' using errcode = 'TP400';
  end if;
  select c.status into v_before from tp.contact_requests c where c.id = p_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'TP404';
  end if;
  update tp.contact_requests c set status = p_status, updated_at = pg_catalog.now() where c.id = p_id;
  perform tp.write_audit('request.status', 'contact_request', p_id::text,
    pg_catalog.jsonb_build_object('status', v_before), pg_catalog.jsonb_build_object('status', p_status), v_uid);
end $$;

-- رد عام (يظهر للمرسل في صفحة المتابعة) أو ملاحظة داخلية (لا تظهر له أبدًا)
create or replace function admin_api.reply_request(p_id bigint, p_body text, p_public boolean) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := tp.require_permission('requests:manage'); v_body text := pg_catalog.btrim(p_body); v_id bigint;
begin
  if v_body is null or pg_catalog.length(v_body) not between 1 and 4000 then
    raise exception 'reply must be 1-4000 characters' using errcode = 'TP400';
  end if;
  perform 1 from tp.contact_requests c where c.id = p_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'TP404';
  end if;
  insert into tp.contact_replies (request_id, body, is_public, author_id) values (p_id, v_body, coalesce(p_public, false), v_uid)
  returning id into v_id;
  update tp.contact_requests c
  set status = case when coalesce(p_public, false) and c.status in ('new', 'in_progress') then 'answered'
                    when c.status = 'new' then 'in_progress' else c.status end,
      updated_at = pg_catalog.now()
  where c.id = p_id;
  perform tp.write_audit('request.reply', 'contact_request', p_id::text, null,
    pg_catalog.jsonb_build_object('reply_id', v_id, 'public', coalesce(p_public, false)), v_uid);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 6) الصلاحيات الصريحة
-- ---------------------------------------------------------------------
revoke all on tp.visitor_salts, tp.rate_limit_hits, tp.page_views, tp.site_settings, tp.contact_requests,
  tp.contact_replies from public, anon, authenticated, service_role, web_reader, ingest_service;
-- تسلسلات الهوية لا يحتاجها أحد مباشرة (الإدراج عبر دوال المالك فقط). إعادة تشغيل 001 تمنح authenticated
-- استخدام كل تسلسلات tp، فنعيد سحبه هنا لتبقى النتيجة نفسها بعد أي إعادة تشغيل.
revoke all on sequence tp.page_views_id_seq, tp.contact_requests_id_seq, tp.contact_replies_id_seq
  from public, anon, authenticated, service_role, web_reader, ingest_service;
revoke all on function tp.riyadh_today(), tp.daily_hash(text), tp.rate_limited(text, bytea, int, interval),
  tp.random_code(int), tp.normalize_code(text) from public;
revoke all on function pub.record_page_view(text, text, text, text, text, text, text, text),
  pub.submit_contact_request(text, text, text, text, text, text, text, text),
  pub.track_contact_request(text, text, text) from public;
revoke all on function admin_api.visitor_stats(int), admin_api.site_settings(), admin_api.set_site_setting(text, text),
  admin_api.list_requests(text, text, int), admin_api.request_counts(), admin_api.request_detail(bigint),
  admin_api.set_request_status(bigint, text), admin_api.reply_request(bigint, text, boolean) from public;

grant select on pub.site_contact to web_reader;
grant execute on function pub.record_page_view(text, text, text, text, text, text, text, text),
  pub.submit_contact_request(text, text, text, text, text, text, text, text),
  pub.track_contact_request(text, text, text) to web_reader;
grant execute on function admin_api.visitor_stats(int), admin_api.site_settings(), admin_api.set_site_setting(text, text),
  admin_api.list_requests(text, text, int), admin_api.request_counts(), admin_api.request_detail(bigint),
  admin_api.set_request_status(bigint, text), admin_api.reply_request(bigint, text, boolean) to authenticated;

insert into tp.schema_migrations (version) values ('003-visitors-requests') on conflict (version) do nothing;
commit;

-- =====================================================================
-- [4] db/supabase/010_app_role.sql — دور اتصال الموقع tp_app (بلا كلمة مرور بعد)
--     sha256=17966ed4860632801928ea07139d182667679c8ef83b590901b7086f26ca4146
-- =====================================================================
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

-- =====================================================================
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

-- =====================================================================
-- [6] db/seed/100_catalog_seed.sql — نقل الكتالوج والسيارات والأسعار المرجعية (غير موثقة)
--     sha256=0836989be6c6ac81b518fca38bf42f9dc7d0c7ed19b5afba239afa10dc815170
-- =====================================================================
-- =====================================================================
-- TruePrice — نقل الكتالوج الحالي (الإلكترونيات + السيارات) وأسعاره المرجعية إلى القاعدة.
-- مولَّد آليًا بـ scripts/data/build-catalog-seed.mjs من app/data — لا يُعدَّل يدويًا.
-- payload sha256=d29c0e2780a56966e895d6696b5356b05e097c102dc794232856722636046fca  cars.ts sha256=da8ca3f12d692f228099839f474f8327b9bcdf684f9055b9d4d7167df11191ca
--
-- المحتوى: 52 منتجًا إلكترونيًا، 208 سعرًا مرجعيًا، 17 متجرًا؛
--          40 علامة سيارات، 357 عائلة موديل، 357 سيارة جديدة (سنة + فئة)،
--          75 سعرًا مرجعيًا للسيارات من 9 موقع علامة.
-- كل الأسعار تدخل غير موثقة وتاريخها غير مؤكد، فلا تظهر كأسعار معتمدة ولا تدخل في السعر العادل.
--
-- يُنفَّذ بدور postgres (Supabase SQL Editor) بعد: المخطط 001، طبقة MVP 002، دور التطبيق 010،
-- وتهيئة أول مشرف (tp.bootstrap_first_admins). يعمل بهوية أول مشرف عبر صلاحيات اللوحة نفسها
-- (RLS + admin_api) فيُسجَّل كل شيء في التدقيق باسمه. معاملة واحدة، وإعادة التشغيل آمنة:
-- ما هو موجود يُتخطى، والاستيراد لا يتكرر. لا حذف ولا تعديل لبيانات قائمة.
-- =====================================================================
begin;

do $seed$
declare
  d        jsonb := $json${"electronics":{"categories":[{"slug":"smartphones","name_en":"Smartphones","name_ar":"جوالات","sort_order":0},{"slug":"tablets","name_en":"Tablets","name_ar":"أجهزة لوحية","sort_order":10},{"slug":"laptops","name_en":"Laptops","name_ar":"لابتوبات","sort_order":20},{"slug":"smartwatches","name_en":"Smartwatches","name_ar":"ساعات ذكية","sort_order":30},{"slug":"audio","name_en":"Audio","name_ar":"سماعات","sort_order":40},{"slug":"gaming","name_en":"Gaming","name_ar":"ألعاب","sort_order":50},{"slug":"tv","name_en":"TV","name_ar":"تلفزيونات","sort_order":60}],"brands":[{"slug":"apple","name":"Apple","name_ar":"أبل"},{"slug":"samsung","name":"Samsung","name_ar":"سامسونج"},{"slug":"xiaomi","name":"Xiaomi","name_ar":"شاومي"},{"slug":"huawei","name":"Huawei","name_ar":"هواوي"},{"slug":"honor","name":"HONOR","name_ar":"هونر"},{"slug":"google","name":"Google","name_ar":"جوجل"},{"slug":"lenovo","name":"Lenovo","name_ar":"لينوفو"},{"slug":"asus","name":"ASUS","name_ar":"ASUS"},{"slug":"hp","name":"HP","name_ar":"HP"},{"slug":"msi","name":"MSI","name_ar":"MSI"},{"slug":"sony","name":"Sony","name_ar":"سوني"},{"slug":"lg","name":"LG","name_ar":"LG"},{"slug":"tcl","name":"TCL","name_ar":"TCL"},{"slug":"hisense","name":"Hisense","name_ar":"هايسنس"}],"products":[{"legacy_id":1,"category":"smartphones","brand":"apple","family_slug":"f-1-iphone-17-256gb","slug":"p-1-iphone-17-256gb","name":"iPhone 17 256GB","name_ar":"آيفون 17 - 256 جيجابايت","details":{"memory":"8GB","storage":"256GB","screen":"6.3-inch Super Retina XDR","chip":"Apple A19","camera":"48MP","front_camera":"18MP","battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"120Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":2,"category":"smartphones","brand":"apple","family_slug":"f-2-iphone-17-512gb","slug":"p-2-iphone-17-512gb","name":"iPhone 17 512GB","name_ar":"آيفون 17 - 512 جيجابايت","details":{"memory":"8GB","storage":"512GB","screen":"6.3-inch Super Retina XDR","chip":"Apple A19","camera":"48MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"120Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":3,"category":"smartphones","brand":"apple","family_slug":"f-3-iphone-17-pro-256gb","slug":"p-3-iphone-17-pro-256gb","name":"iPhone 17 Pro 256GB","name_ar":"آيفون 17 Pro - 256 جيجابايت","details":{"memory":"12GB","storage":"256GB","screen":"6.3-inch Super Retina XDR","chip":"Apple A19 Pro","camera":"Pro Fusion 48MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"120Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":4,"category":"smartphones","brand":"apple","family_slug":"f-4-iphone-17-pro-max-256gb","slug":"p-4-iphone-17-pro-max-256gb","name":"iPhone 17 Pro Max 256GB","name_ar":"آيفون 17 Pro Max - 256 جيجابايت","details":{"memory":"12GB","storage":"256GB","screen":"6.9-inch Super Retina XDR","chip":"Apple A19 Pro","camera":"Pro Fusion 48MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"120Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":5,"category":"smartphones","brand":"apple","family_slug":"f-5-iphone-16-128gb","slug":"p-5-iphone-16-128gb","name":"iPhone 16 128GB","name_ar":"آيفون 16 - 128 جيجابايت","details":{"memory":"8GB","storage":"128GB","screen":"6.1-inch Super Retina XDR","chip":"Apple A18","camera":"48MP Fusion","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":6,"category":"smartphones","brand":"apple","family_slug":"f-6-iphone-15-128gb","slug":"p-6-iphone-15-128gb","name":"iPhone 15 128GB","name_ar":"آيفون 15 - 128 جيجابايت","details":{"memory":"6GB","storage":"128GB","screen":"6.1-inch Super Retina XDR","chip":"Apple A16","camera":"48MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":20,"category":"tablets","brand":"apple","family_slug":"f-20-ipad-128gb-wi-fi","slug":"p-20-ipad-128gb-wi-fi","name":"iPad 128GB Wi-Fi","name_ar":"آيباد - 128 جيجابايت Wi-Fi","details":{"memory":"—","storage":"128GB","screen":"11-inch Liquid Retina","chip":"Apple A16","camera":"12MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":21,"category":"tablets","brand":"apple","family_slug":"f-21-ipad-air-m4-11-256gb","slug":"p-21-ipad-air-m4-11-256gb","name":"iPad Air M4 11 256GB","name_ar":"آيباد Air M4 - 11 إنش - 256 جيجابايت","details":{"memory":"8GB","storage":"256GB","screen":"11-inch Liquid Retina","chip":"Apple M4","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":22,"category":"tablets","brand":"apple","family_slug":"f-22-ipad-pro-m5-11-256gb","slug":"p-22-ipad-pro-m5-11-256gb","name":"iPad Pro M5 11 256GB","name_ar":"آيباد Pro M5 - 11 إنش - 256 جيجابايت","details":{"memory":"12GB","storage":"256GB","screen":"11-inch Ultra Retina XDR","chip":"Apple M5","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":30,"category":"laptops","brand":"apple","family_slug":"f-30-macbook-air-13-m5","slug":"p-30-macbook-air-13-m5","name":"MacBook Air 13 M5","name_ar":"ماك بوك Air 13 M5","details":{"memory":"16GB","storage":"512GB SSD","screen":"13.6-inch Liquid Retina","chip":"Apple M5","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":31,"category":"laptops","brand":"apple","family_slug":"f-31-macbook-pro-14-m5","slug":"p-31-macbook-pro-14-m5","name":"MacBook Pro 14 M5","name_ar":"ماك بوك Pro 14 M5","details":{"memory":"24GB","storage":"512GB SSD","screen":"14-inch Liquid Retina XDR","chip":"Apple M5","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":40,"category":"smartwatches","brand":"apple","family_slug":"f-40-apple-watch-series-11","slug":"p-40-apple-watch-series-11","name":"Apple Watch Series 11","name_ar":"Apple Watch Series 11","details":{"memory":"—","storage":"—","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":41,"category":"smartwatches","brand":"apple","family_slug":"f-41-apple-watch-ultra-3","slug":"p-41-apple-watch-ultra-3","name":"Apple Watch Ultra 3","name_ar":"Apple Watch Ultra 3","details":{"memory":"—","storage":"—","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":42,"category":"audio","brand":"apple","family_slug":"f-42-airpods-pro-3","slug":"p-42-airpods-pro-3","name":"AirPods Pro 3","name_ar":"AirPods Pro 3","details":{"memory":"—","storage":"—","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":100,"category":"smartphones","brand":"samsung","family_slug":"f-100-galaxy-s26-256gb","slug":"p-100-galaxy-s26-256gb","name":"Galaxy S26 256GB","name_ar":"جالكسي S26 - 256 جيجابايت","details":{"memory":"12GB","storage":"256GB","screen":"6.3-inch","chip":"Snapdragon","camera":"50MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":101,"category":"smartphones","brand":"samsung","family_slug":"f-101-galaxy-s26-512gb","slug":"p-101-galaxy-s26-512gb","name":"Galaxy S26 512GB","name_ar":"جالكسي S26 - 512 جيجابايت","details":{"memory":"12GB","storage":"512GB","screen":"6.3-inch","chip":"Snapdragon","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":102,"category":"smartphones","brand":"samsung","family_slug":"f-102-galaxy-s26-512gb","slug":"p-102-galaxy-s26-512gb","name":"Galaxy S26+ 512GB","name_ar":"جالكسي S26+ - 512 جيجابايت","details":{"memory":"12GB","storage":"512GB","screen":"6.7-inch","chip":"Snapdragon","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":103,"category":"smartphones","brand":"samsung","family_slug":"f-103-galaxy-s26-ultra-256gb","slug":"p-103-galaxy-s26-ultra-256gb","name":"Galaxy S26 Ultra 256GB","name_ar":"جالكسي S26 Ultra - 256 جيجابايت","details":{"memory":"12GB","storage":"256GB","screen":"6.9-inch","chip":null,"camera":"200MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":104,"category":"smartphones","brand":"samsung","family_slug":"f-104-galaxy-s26-ultra-512gb","slug":"p-104-galaxy-s26-ultra-512gb","name":"Galaxy S26 Ultra 512GB","name_ar":"جالكسي S26 Ultra - 512 جيجابايت","details":{"memory":"12GB","storage":"512GB","screen":"6.9-inch","chip":null,"camera":"200MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":105,"category":"smartphones","brand":"samsung","family_slug":"f-105-galaxy-s26-ultra-1tb","slug":"p-105-galaxy-s26-ultra-1tb","name":"Galaxy S26 Ultra 1TB","name_ar":"جالكسي S26 Ultra - 1 تيرابايت","details":{"memory":"16GB","storage":"1TB","screen":"6.9-inch","chip":null,"camera":"200MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":110,"category":"smartphones","brand":"samsung","family_slug":"f-110-galaxy-a57-256gb","slug":"p-110-galaxy-a57-256gb","name":"Galaxy A57 256GB","name_ar":"جالكسي A57 - 256 جيجابايت","details":{"memory":"8GB","storage":"256GB","screen":"6.7-inch AMOLED","chip":null,"camera":"50MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":111,"category":"smartphones","brand":"samsung","family_slug":"f-111-galaxy-a37-256gb","slug":"p-111-galaxy-a37-256gb","name":"Galaxy A37 256GB","name_ar":"جالكسي A37 - 256 جيجابايت","details":{"memory":"8GB","storage":"256GB","screen":"6.6-inch AMOLED","chip":null,"camera":"50MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":120,"category":"tablets","brand":"samsung","family_slug":"f-120-galaxy-tab-s11-256gb","slug":"p-120-galaxy-tab-s11-256gb","name":"Galaxy Tab S11 256GB","name_ar":"جالكسي Tab S11 - 256 جيجابايت","details":{"memory":"12GB","storage":"256GB","screen":"11-inch","chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":121,"category":"tablets","brand":"samsung","family_slug":"f-121-galaxy-tab-s11-ultra-256gb","slug":"p-121-galaxy-tab-s11-ultra-256gb","name":"Galaxy Tab S11 Ultra 256GB","name_ar":"جالكسي Tab S11 Ultra - 256 جيجابايت","details":{"memory":"12GB","storage":"256GB","screen":"14.6-inch","chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":130,"category":"smartwatches","brand":"samsung","family_slug":"f-130-galaxy-watch8-40mm","slug":"p-130-galaxy-watch8-40mm","name":"Galaxy Watch8 40mm","name_ar":"جالكسي Watch8 - 40mm","details":{"memory":"—","storage":"—","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":131,"category":"smartwatches","brand":"samsung","family_slug":"f-131-galaxy-watch8-44mm","slug":"p-131-galaxy-watch8-44mm","name":"Galaxy Watch8 44mm","name_ar":"جالكسي Watch8 - 44mm","details":{"memory":"—","storage":"—","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":200,"category":"smartphones","brand":"xiaomi","family_slug":"f-200-xiaomi-17-512gb","slug":"p-200-xiaomi-17-512gb","name":"Xiaomi 17 512GB","name_ar":"شاومي 17 - 512 جيجابايت","details":{"memory":"12GB","storage":"512GB","screen":"6.35-inch AMOLED","chip":"Snapdragon","camera":"50MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":201,"category":"smartphones","brand":"xiaomi","family_slug":"f-201-xiaomi-17-ultra-512gb","slug":"p-201-xiaomi-17-ultra-512gb","name":"Xiaomi 17 Ultra 512GB","name_ar":"شاومي 17 Ultra - 512 جيجابايت","details":{"memory":"16GB","storage":"512GB","screen":"6.8-inch","chip":"Snapdragon","camera":"200MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":202,"category":"smartphones","brand":"xiaomi","family_slug":"f-202-xiaomi-15-512gb","slug":"p-202-xiaomi-15-512gb","name":"Xiaomi 15 512GB","name_ar":"شاومي 15 - 512 جيجابايت","details":{"memory":"12GB","storage":"512GB","screen":"6.3-inch","chip":"Snapdragon","camera":"50MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":203,"category":"smartphones","brand":"xiaomi","family_slug":"f-203-redmi-note-15-pro-256gb","slug":"p-203-redmi-note-15-pro-256gb","name":"Redmi Note 15 Pro 256GB","name_ar":"ريدمي Note 15 Pro - 256 جيجابايت","details":{"memory":"8GB","storage":"256GB","screen":"6.83-inch AMOLED","chip":null,"camera":"200MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":300,"category":"smartphones","brand":"huawei","family_slug":"f-300-huawei-pura-80-pro","slug":"p-300-huawei-pura-80-pro","name":"Huawei Pura 80 Pro","name_ar":"هواوي Pura 80 Pro","details":{"memory":"12GB","storage":"512GB","screen":"6.8-inch OLED","chip":null,"camera":"50MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":301,"category":"smartphones","brand":"huawei","family_slug":"f-301-huawei-mate-x7","slug":"p-301-huawei-mate-x7","name":"Huawei Mate X7","name_ar":"هواوي Mate X7","details":{"memory":"12GB","storage":"512GB","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":400,"category":"smartphones","brand":"honor","family_slug":"f-400-honor-magic8-pro","slug":"p-400-honor-magic8-pro","name":"HONOR Magic8 Pro","name_ar":"هونر Magic8 Pro","details":{"memory":"12GB","storage":"512GB","screen":"6.7-inch AMOLED","chip":null,"camera":"200MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":401,"category":"smartphones","brand":"honor","family_slug":"f-401-honor-400-pro","slug":"p-401-honor-400-pro","name":"HONOR 400 Pro","name_ar":"هونر 400 Pro","details":{"memory":"12GB","storage":"512GB","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":500,"category":"smartphones","brand":"google","family_slug":"f-500-google-pixel-10-pro-256gb","slug":"p-500-google-pixel-10-pro-256gb","name":"Google Pixel 10 Pro 256GB","name_ar":"جوجل Pixel 10 Pro - 256 جيجابايت","details":{"memory":"16GB","storage":"256GB","screen":"6.3-inch OLED","chip":null,"camera":"50MP","front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":501,"category":"smartphones","brand":"google","family_slug":"f-501-google-pixel-10-128gb","slug":"p-501-google-pixel-10-128gb","name":"Google Pixel 10 128GB","name_ar":"جوجل Pixel 10 - 128 جيجابايت","details":{"memory":"12GB","storage":"128GB","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":600,"category":"laptops","brand":"lenovo","family_slug":"f-600-lenovo-yoga-7","slug":"p-600-lenovo-yoga-7","name":"Lenovo Yoga 7","name_ar":"لينوفو Yoga 7","details":{"memory":"16GB","storage":"512GB SSD","screen":"14-inch","chip":"AMD Ryzen","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":601,"category":"laptops","brand":"lenovo","family_slug":"f-601-lenovo-legion-5","slug":"p-601-lenovo-legion-5","name":"Lenovo Legion 5","name_ar":"لينوفو Legion 5","details":{"memory":"16GB","storage":"1TB SSD","screen":"15.6-inch","chip":"AMD Ryzen","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"165Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":700,"category":"laptops","brand":"asus","family_slug":"f-700-asus-zenbook-14","slug":"p-700-asus-zenbook-14","name":"ASUS Zenbook 14","name_ar":"ASUS Zenbook 14","details":{"memory":"16GB","storage":"1TB SSD","screen":"14-inch OLED","chip":"Intel Core Ultra","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":701,"category":"laptops","brand":"asus","family_slug":"f-701-asus-rog-zephyrus-g16","slug":"p-701-asus-rog-zephyrus-g16","name":"ASUS ROG Zephyrus G16","name_ar":"ASUS ROG Zephyrus G16","details":{"memory":"32GB","storage":"1TB SSD","screen":"16-inch OLED","chip":"Intel Core Ultra","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"240Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":800,"category":"laptops","brand":"hp","family_slug":"f-800-hp-pavilion-14","slug":"p-800-hp-pavilion-14","name":"HP Pavilion 14","name_ar":"HP Pavilion 14","details":{"memory":"16GB","storage":"512GB SSD","screen":"14-inch","chip":"Intel Core","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":801,"category":"laptops","brand":"hp","family_slug":"f-801-hp-victus-16","slug":"p-801-hp-victus-16","name":"HP Victus 16","name_ar":"HP Victus 16","details":{"memory":"16GB","storage":"1TB SSD","screen":"16.1-inch","chip":"Intel Core","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"144Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":900,"category":"laptops","brand":"msi","family_slug":"f-900-msi-katana-15","slug":"p-900-msi-katana-15","name":"MSI Katana 15","name_ar":"MSI Katana 15","details":{"memory":"16GB","storage":"1TB SSD","screen":"15.6-inch","chip":"Intel Core","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"144Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":901,"category":"laptops","brand":"msi","family_slug":"f-901-msi-raider-18","slug":"p-901-msi-raider-18","name":"MSI Raider 18","name_ar":"MSI Raider 18","details":{"memory":"32GB","storage":"2TB SSD","screen":"18-inch","chip":"Intel Core Ultra","camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"240Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":1000,"category":"audio","brand":"sony","family_slug":"f-1000-sony-wh-1000xm6","slug":"p-1000-sony-wh-1000xm6","name":"Sony WH-1000XM6","name_ar":"سوني WH-1000XM6","details":{"memory":"—","storage":"—","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":1001,"category":"gaming","brand":"sony","family_slug":"f-1001-sony-playstation-5","slug":"p-1001-sony-playstation-5","name":"Sony PlayStation 5","name_ar":"بلايستيشن 5","details":{"memory":"—","storage":"1TB","screen":null,"chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":null,"colors":[],"description":null,"amazon_url":null}},{"legacy_id":1100,"category":"tv","brand":"lg","family_slug":"f-1100-lg-oled-c5-55","slug":"p-1100-lg-oled-c5-55","name":"LG OLED C5 55","name_ar":"LG OLED C5 - 55 بوصة","details":{"memory":"—","storage":"—","screen":"55-inch OLED","chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"120Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":1101,"category":"tv","brand":"lg","family_slug":"f-1101-lg-oled-c5-65","slug":"p-1101-lg-oled-c5-65","name":"LG OLED C5 65","name_ar":"LG OLED C5 - 65 بوصة","details":{"memory":"—","storage":"—","screen":"65-inch OLED","chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"120Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":1200,"category":"tv","brand":"tcl","family_slug":"f-1200-tcl-c7k-55","slug":"p-1200-tcl-c7k-55","name":"TCL C7K 55","name_ar":"TCL C7K - 55 بوصة","details":{"memory":"—","storage":"—","screen":"55-inch QD-Mini LED","chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"144Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":1201,"category":"tv","brand":"tcl","family_slug":"f-1201-tcl-c7k-65","slug":"p-1201-tcl-c7k-65","name":"TCL C7K 65","name_ar":"TCL C7K - 65 بوصة","details":{"memory":"—","storage":"—","screen":"65-inch QD-Mini LED","chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"144Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":1300,"category":"tv","brand":"hisense","family_slug":"f-1300-hisense-u7-55","slug":"p-1300-hisense-u7-55","name":"Hisense U7 55","name_ar":"هايسنس U7 - 55 بوصة","details":{"memory":"—","storage":"—","screen":"55-inch Mini LED","chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"144Hz","colors":[],"description":null,"amazon_url":null}},{"legacy_id":1301,"category":"tv","brand":"hisense","family_slug":"f-1301-hisense-u7-65","slug":"p-1301-hisense-u7-65","name":"Hisense U7 65","name_ar":"هايسنس U7 - 65 بوصة","details":{"memory":"—","storage":"—","screen":"65-inch Mini LED","chip":null,"camera":null,"front_camera":null,"battery":null,"connectivity":null,"water_resistance":null,"refresh_rate":"144Hz","colors":[],"description":null,"amazon_url":null}}],"stores":[{"id":"apple","name":"Apple","name_ar":"أبل","is_marketplace":false},{"id":"amazon","name":"Amazon","name_ar":"أمازون","is_marketplace":true},{"id":"noon","name":"Noon","name_ar":"نون","is_marketplace":true},{"id":"jarir","name":"Jarir","name_ar":"جرير","is_marketplace":false},{"id":"extra","name":"eXtra","name_ar":"إكسترا","is_marketplace":false},{"id":"samsung","name":"Samsung","name_ar":"سامسونج","is_marketplace":false},{"id":"huawei","name":"Huawei","name_ar":"هواوي","is_marketplace":false},{"id":"honor","name":"HONOR","name_ar":"هونر","is_marketplace":false},{"id":"google","name":"Google","name_ar":"Google","is_marketplace":false},{"id":"lenovo","name":"Lenovo","name_ar":"لينوفو","is_marketplace":false},{"id":"asus","name":"ASUS","name_ar":"ASUS","is_marketplace":false},{"id":"hp","name":"HP","name_ar":"HP","is_marketplace":false},{"id":"msi","name":"MSI","name_ar":"MSI","is_marketplace":false},{"id":"sony","name":"Sony","name_ar":"سوني","is_marketplace":false},{"id":"lg","name":"LG","name_ar":"LG","is_marketplace":false},{"id":"tcl","name":"TCL","name_ar":"TCL","is_marketplace":false},{"id":"hisense","name":"Hisense","name_ar":"هايسنس","is_marketplace":false}]},"cars":{"category":{"slug":"cars","name_ar":"السيارات","name_en":"Cars","sort_order":1000},"specs":[{"key":"engine","label_ar":"المحرك"},{"key":"power","label_ar":"القوة"},{"key":"fuel","label_ar":"الوقود"}],"brands":[{"slug":"toyota","name":"Toyota","name_ar":"تويوتا"},{"slug":"hyundai","name":"Hyundai","name_ar":"هيونداي"},{"slug":"kia","name":"Kia","name_ar":"كيا"},{"slug":"nissan","name":"Nissan","name_ar":"نيسان"},{"slug":"mg","name":"MG","name_ar":"MG"},{"slug":"ford","name":"Ford","name_ar":"فورد"},{"slug":"honda","name":"Honda","name_ar":"هوندا"},{"slug":"mazda","name":"Mazda","name_ar":"مازدا"},{"slug":"suzuki","name":"Suzuki","name_ar":"سوزوكي"},{"slug":"isuzu","name":"Isuzu","name_ar":"إيسوزو"},{"slug":"changan","name":"Changan","name_ar":"شانجان"},{"slug":"geely","name":"Geely","name_ar":"جيلي"},{"slug":"gac","name":"GAC","name_ar":"GAC"},{"slug":"haval","name":"Haval","name_ar":"هافال"},{"slug":"jetour","name":"Jetour","name_ar":"جيتور"},{"slug":"chery","name":"Chery","name_ar":"شيري"},{"slug":"chevrolet","name":"Chevrolet","name_ar":"شفروليه"},{"slug":"gmc","name":"GMC","name_ar":"GMC"},{"slug":"mitsubishi","name":"Mitsubishi","name_ar":"ميتسوبيشي"},{"slug":"jeep","name":"Jeep","name_ar":"جيب"},{"slug":"lexus","name":"Lexus","name_ar":"لكزس"},{"slug":"bmw","name":"BMW","name_ar":"BMW"},{"slug":"mercedes","name":"Mercedes-Benz","name_ar":"مرسيدس-بنز"},{"slug":"audi","name":"Audi","name_ar":"أودي"},{"slug":"volkswagen","name":"Volkswagen","name_ar":"فولكس واجن"},{"slug":"byd","name":"BYD","name_ar":"BYD"},{"slug":"exeed","name":"Exeed","name_ar":"إكسيد"},{"slug":"hongqi","name":"Hongqi","name_ar":"هونشي"},{"slug":"greatwall","name":"Great Wall","name_ar":"جريت وول"},{"slug":"tank","name":"Tank","name_ar":"تانك"},{"slug":"jac","name":"JAC","name_ar":"جاك"},{"slug":"mahindra","name":"Mahindra","name_ar":"ماهيندرا"},{"slug":"renault","name":"Renault","name_ar":"رينو"},{"slug":"peugeot","name":"Peugeot","name_ar":"بيجو"},{"slug":"landrover","name":"Land Rover","name_ar":"لاند روفر"},{"slug":"volvo","name":"Volvo","name_ar":"فولفو"},{"slug":"porsche","name":"Porsche","name_ar":"بورشه"},{"slug":"tesla","name":"Tesla","name_ar":"تسلا"},{"slug":"lucid","name":"Lucid","name_ar":"لوسيد"},{"slug":"genesis","name":"Genesis","name_ar":"جينيسيس"}],"families":[{"slug":"car-toyota-yaris","brand":"toyota","name":"Yaris"},{"slug":"car-toyota-corolla","brand":"toyota","name":"Corolla"},{"slug":"car-toyota-camry","brand":"toyota","name":"Camry"},{"slug":"car-toyota-crown","brand":"toyota","name":"Crown"},{"slug":"car-toyota-gr86","brand":"toyota","name":"GR86"},{"slug":"car-toyota-supra","brand":"toyota","name":"Supra"},{"slug":"car-toyota-raize","brand":"toyota","name":"Raize"},{"slug":"car-toyota-urban-cruiser","brand":"toyota","name":"Urban Cruiser"},{"slug":"car-toyota-veloz","brand":"toyota","name":"Veloz"},{"slug":"car-toyota-corolla-cross","brand":"toyota","name":"Corolla Cross"},{"slug":"car-toyota-rav4","brand":"toyota","name":"RAV4"},{"slug":"car-toyota-innova","brand":"toyota","name":"Innova"},{"slug":"car-toyota-land-cruiser-hardtop","brand":"toyota","name":"Land Cruiser Hardtop"},{"slug":"car-toyota-fortuner","brand":"toyota","name":"Fortuner"},{"slug":"car-toyota-highlander","brand":"toyota","name":"Highlander"},{"slug":"car-toyota-prado","brand":"toyota","name":"Prado"},{"slug":"car-toyota-land-cruiser","brand":"toyota","name":"Land Cruiser"},{"slug":"car-toyota-lc300-hev-max","brand":"toyota","name":"LC300 HEV MAX"},{"slug":"car-toyota-corolla-hybrid","brand":"toyota","name":"Corolla Hybrid"},{"slug":"car-toyota-corolla-executive","brand":"toyota","name":"Corolla Executive"},{"slug":"car-toyota-camry-hybrid","brand":"toyota","name":"Camry Hybrid"},{"slug":"car-toyota-land-cruiser-70","brand":"toyota","name":"Land Cruiser 70"},{"slug":"car-toyota-land-cruiser-300","brand":"toyota","name":"Land Cruiser 300"},{"slug":"car-toyota-hilux","brand":"toyota","name":"Hilux"},{"slug":"car-toyota-hiace","brand":"toyota","name":"Hiace"},{"slug":"car-toyota-coaster","brand":"toyota","name":"Coaster"},{"slug":"car-hyundai-accent","brand":"hyundai","name":"Accent"},{"slug":"car-hyundai-elantra","brand":"hyundai","name":"Elantra"},{"slug":"car-hyundai-tucson","brand":"hyundai","name":"Tucson"},{"slug":"car-hyundai-creta","brand":"hyundai","name":"Creta"},{"slug":"car-hyundai-sonata","brand":"hyundai","name":"Sonata"},{"slug":"car-hyundai-kona","brand":"hyundai","name":"Kona"},{"slug":"car-hyundai-palisade","brand":"hyundai","name":"Palisade"},{"slug":"car-hyundai-staria-premium","brand":"hyundai","name":"Staria Premium"},{"slug":"car-hyundai-santa-fe","brand":"hyundai","name":"Santa Fe"},{"slug":"car-hyundai-santa-cruz","brand":"hyundai","name":"Santa Cruz"},{"slug":"car-hyundai-ioniq-5","brand":"hyundai","name":"Ioniq 5"},{"slug":"car-hyundai-ioniq-6","brand":"hyundai","name":"Ioniq 6"},{"slug":"car-hyundai-tucson-hybrid","brand":"hyundai","name":"Tucson Hybrid"},{"slug":"car-hyundai-palisade-hybrid","brand":"hyundai","name":"Palisade Hybrid"},{"slug":"car-hyundai-staria","brand":"hyundai","name":"Staria"},{"slug":"car-hyundai-h-1","brand":"hyundai","name":"H-1"},{"slug":"car-kia-k4","brand":"kia","name":"K4"},{"slug":"car-kia-k8","brand":"kia","name":"K8"},{"slug":"car-kia-k5","brand":"kia","name":"K5"},{"slug":"car-kia-pegas","brand":"kia","name":"Pegas"},{"slug":"car-kia-k3","brand":"kia","name":"K3"},{"slug":"car-kia-carens","brand":"kia","name":"Carens"},{"slug":"car-kia-sportage-l","brand":"kia","name":"Sportage L"},{"slug":"car-kia-sonet","brand":"kia","name":"Sonet"},{"slug":"car-kia-seltos","brand":"kia","name":"Seltos"},{"slug":"car-kia-carnival","brand":"kia","name":"Carnival"},{"slug":"car-kia-telluride","brand":"kia","name":"Telluride"},{"slug":"car-kia-sorento","brand":"kia","name":"Sorento"},{"slug":"car-kia-sorento-hybrid","brand":"kia","name":"Sorento Hybrid"},{"slug":"car-kia-ev3","brand":"kia","name":"EV3"},{"slug":"car-kia-ev6","brand":"kia","name":"EV6"},{"slug":"car-kia-ev9","brand":"kia","name":"EV9"},{"slug":"car-kia-stinger","brand":"kia","name":"Stinger"},{"slug":"car-nissan-magnite","brand":"nissan","name":"Magnite"},{"slug":"car-nissan-kicks","brand":"nissan","name":"Kicks"},{"slug":"car-nissan-x-trail","brand":"nissan","name":"X-Trail"},{"slug":"car-nissan-altima","brand":"nissan","name":"Altima"},{"slug":"car-nissan-x-terra","brand":"nissan","name":"X-Terra"},{"slug":"car-nissan-pathfinder","brand":"nissan","name":"Pathfinder"},{"slug":"car-nissan-patrol","brand":"nissan","name":"Patrol"},{"slug":"car-nissan-patrol-pro-4x","brand":"nissan","name":"Patrol PRO-4X"},{"slug":"car-nissan-patrol-nismo","brand":"nissan","name":"Patrol NISMO"},{"slug":"car-nissan-z","brand":"nissan","name":"Z"},{"slug":"car-nissan-sunny","brand":"nissan","name":"Sunny"},{"slug":"car-nissan-sentra","brand":"nissan","name":"Sentra"},{"slug":"car-nissan-murano","brand":"nissan","name":"Murano"},{"slug":"car-nissan-armada","brand":"nissan","name":"Armada"},{"slug":"car-nissan-navara","brand":"nissan","name":"Navara"},{"slug":"car-mg-mg-5","brand":"mg","name":"MG 5"},{"slug":"car-mg-mg-7","brand":"mg","name":"MG 7"},{"slug":"car-mg-mg-hs","brand":"mg","name":"MG HS"},{"slug":"car-mg-mg-hs-hybrid","brand":"mg","name":"MG HS Hybrid+"},{"slug":"car-mg-mg-rx9","brand":"mg","name":"MG RX9"},{"slug":"car-mg-mg-one","brand":"mg","name":"MG One"},{"slug":"car-mg-mg-3","brand":"mg","name":"MG 3"},{"slug":"car-mg-mg-gt","brand":"mg","name":"MG GT"},{"slug":"car-mg-mg-zs","brand":"mg","name":"MG ZS"},{"slug":"car-mg-mg-zs-ev","brand":"mg","name":"MG ZS EV"},{"slug":"car-mg-mg-whale","brand":"mg","name":"MG Whale"},{"slug":"car-ford-territory","brand":"ford","name":"Territory"},{"slug":"car-ford-taurus","brand":"ford","name":"Taurus"},{"slug":"car-ford-everest","brand":"ford","name":"Everest"},{"slug":"car-ford-explorer","brand":"ford","name":"Explorer"},{"slug":"car-ford-expedition","brand":"ford","name":"Expedition"},{"slug":"car-ford-bronco","brand":"ford","name":"Bronco"},{"slug":"car-ford-mustang","brand":"ford","name":"Mustang"},{"slug":"car-ford-f-150","brand":"ford","name":"F-150"},{"slug":"car-ford-ranger","brand":"ford","name":"Ranger"},{"slug":"car-ford-transit","brand":"ford","name":"Transit"},{"slug":"car-honda-city","brand":"honda","name":"City"},{"slug":"car-honda-civic","brand":"honda","name":"Civic"},{"slug":"car-honda-accord","brand":"honda","name":"Accord"},{"slug":"car-honda-hr-v","brand":"honda","name":"HR-V"},{"slug":"car-honda-cr-v","brand":"honda","name":"CR-V"},{"slug":"car-honda-pilot","brand":"honda","name":"Pilot"},{"slug":"car-honda-odyssey","brand":"honda","name":"Odyssey"},{"slug":"car-honda-zr-v","brand":"honda","name":"ZR-V"},{"slug":"car-mazda-mazda-2","brand":"mazda","name":"Mazda 2"},{"slug":"car-mazda-mazda-3","brand":"mazda","name":"Mazda 3"},{"slug":"car-mazda-mazda-6","brand":"mazda","name":"Mazda 6"},{"slug":"car-mazda-cx-3","brand":"mazda","name":"CX-3"},{"slug":"car-mazda-cx-30","brand":"mazda","name":"CX-30"},{"slug":"car-mazda-cx-5","brand":"mazda","name":"CX-5"},{"slug":"car-mazda-cx-60","brand":"mazda","name":"CX-60"},{"slug":"car-mazda-cx-90","brand":"mazda","name":"CX-90"},{"slug":"car-mazda-bt-50","brand":"mazda","name":"BT-50"},{"slug":"car-suzuki-swift","brand":"suzuki","name":"Swift"},{"slug":"car-suzuki-dzire","brand":"suzuki","name":"Dzire"},{"slug":"car-suzuki-baleno","brand":"suzuki","name":"Baleno"},{"slug":"car-suzuki-ciaz","brand":"suzuki","name":"Ciaz"},{"slug":"car-suzuki-fronx","brand":"suzuki","name":"Fronx"},{"slug":"car-suzuki-jimny","brand":"suzuki","name":"Jimny"},{"slug":"car-suzuki-ertiga","brand":"suzuki","name":"Ertiga"},{"slug":"car-suzuki-xl7","brand":"suzuki","name":"XL7"},{"slug":"car-suzuki-grand-vitara","brand":"suzuki","name":"Grand Vitara"},{"slug":"car-isuzu-d-max","brand":"isuzu","name":"D-Max"},{"slug":"car-isuzu-mu-x","brand":"isuzu","name":"MU-X"},{"slug":"car-isuzu-n-series","brand":"isuzu","name":"N-Series"},{"slug":"car-isuzu-f-series","brand":"isuzu","name":"F-Series"},{"slug":"car-isuzu-giga","brand":"isuzu","name":"Giga"},{"slug":"car-changan-alsvin","brand":"changan","name":"Alsvin"},{"slug":"car-changan-eado-plus","brand":"changan","name":"Eado Plus"},{"slug":"car-changan-cs35-plus","brand":"changan","name":"CS35 Plus"},{"slug":"car-changan-cs55-plus","brand":"changan","name":"CS55 Plus"},{"slug":"car-changan-cs75-plus","brand":"changan","name":"CS75 Plus"},{"slug":"car-changan-cs95","brand":"changan","name":"CS95"},{"slug":"car-changan-uni-t","brand":"changan","name":"UNI-T"},{"slug":"car-changan-uni-v","brand":"changan","name":"UNI-V"},{"slug":"car-changan-uni-k","brand":"changan","name":"UNI-K"},{"slug":"car-changan-uni-s","brand":"changan","name":"UNI-S"},{"slug":"car-geely-emgrand","brand":"geely","name":"Emgrand"},{"slug":"car-geely-coolray","brand":"geely","name":"Coolray"},{"slug":"car-geely-monjaro","brand":"geely","name":"Monjaro"},{"slug":"car-geely-okavango","brand":"geely","name":"Okavango"},{"slug":"car-geely-starray","brand":"geely","name":"Starray"},{"slug":"car-geely-tugella","brand":"geely","name":"Tugella"},{"slug":"car-geely-geometry-c","brand":"geely","name":"Geometry C"},{"slug":"car-geely-ex5","brand":"geely","name":"EX5"},{"slug":"car-gac-empow","brand":"gac","name":"Empow"},{"slug":"car-gac-emzoom","brand":"gac","name":"Emzoom"},{"slug":"car-gac-emkoo","brand":"gac","name":"Emkoo"},{"slug":"car-gac-gs3","brand":"gac","name":"GS3"},{"slug":"car-gac-gs4","brand":"gac","name":"GS4"},{"slug":"car-gac-gs8","brand":"gac","name":"GS8"},{"slug":"car-gac-m8","brand":"gac","name":"M8"},{"slug":"car-gac-aion-y","brand":"gac","name":"Aion Y"},{"slug":"car-gac-aion-v","brand":"gac","name":"Aion V"},{"slug":"car-haval-jolion","brand":"haval","name":"Jolion"},{"slug":"car-haval-jolion-pro","brand":"haval","name":"Jolion Pro"},{"slug":"car-haval-h6","brand":"haval","name":"H6"},{"slug":"car-haval-h6-gt","brand":"haval","name":"H6 GT"},{"slug":"car-haval-h9","brand":"haval","name":"H9"},{"slug":"car-haval-dargo","brand":"haval","name":"Dargo"},{"slug":"car-haval-dargo-x","brand":"haval","name":"Dargo X"},{"slug":"car-jetour-x50","brand":"jetour","name":"X50"},{"slug":"car-jetour-x70","brand":"jetour","name":"X70"},{"slug":"car-jetour-x70-plus","brand":"jetour","name":"X70 Plus"},{"slug":"car-jetour-x90-plus","brand":"jetour","name":"X90 Plus"},{"slug":"car-jetour-dashing","brand":"jetour","name":"Dashing"},{"slug":"car-jetour-x90","brand":"jetour","name":"X90"},{"slug":"car-jetour-t2","brand":"jetour","name":"T2"},{"slug":"car-jetour-t2-i-dm","brand":"jetour","name":"T2 i-DM"},{"slug":"car-chery-arrizo-5","brand":"chery","name":"Arrizo 5"},{"slug":"car-chery-arrizo-6-pro","brand":"chery","name":"Arrizo 6 Pro"},{"slug":"car-chery-tiggo-4-pro","brand":"chery","name":"Tiggo 4 Pro"},{"slug":"car-chery-tiggo-7-pro","brand":"chery","name":"Tiggo 7 Pro"},{"slug":"car-chery-tiggo-8-pro","brand":"chery","name":"Tiggo 8 Pro"},{"slug":"car-chery-tiggo-8-pro-max","brand":"chery","name":"Tiggo 8 Pro Max"},{"slug":"car-chery-tiggo-9","brand":"chery","name":"Tiggo 9"},{"slug":"car-chevrolet-groove","brand":"chevrolet","name":"Groove"},{"slug":"car-chevrolet-captiva","brand":"chevrolet","name":"Captiva"},{"slug":"car-chevrolet-equinox","brand":"chevrolet","name":"Equinox"},{"slug":"car-chevrolet-traverse","brand":"chevrolet","name":"Traverse"},{"slug":"car-chevrolet-tahoe","brand":"chevrolet","name":"Tahoe"},{"slug":"car-chevrolet-suburban","brand":"chevrolet","name":"Suburban"},{"slug":"car-chevrolet-trailblazer","brand":"chevrolet","name":"Trailblazer"},{"slug":"car-chevrolet-blazer","brand":"chevrolet","name":"Blazer"},{"slug":"car-chevrolet-silverado","brand":"chevrolet","name":"Silverado"},{"slug":"car-chevrolet-corvette","brand":"chevrolet","name":"Corvette"},{"slug":"car-chevrolet-camaro","brand":"chevrolet","name":"Camaro"},{"slug":"car-gmc-terrain","brand":"gmc","name":"Terrain"},{"slug":"car-gmc-acadia","brand":"gmc","name":"Acadia"},{"slug":"car-gmc-yukon","brand":"gmc","name":"Yukon"},{"slug":"car-gmc-yukon-xl","brand":"gmc","name":"Yukon XL"},{"slug":"car-gmc-sierra","brand":"gmc","name":"Sierra"},{"slug":"car-gmc-canyon","brand":"gmc","name":"Canyon"},{"slug":"car-gmc-hummer-ev","brand":"gmc","name":"Hummer EV"},{"slug":"car-mitsubishi-attrage","brand":"mitsubishi","name":"Attrage"},{"slug":"car-mitsubishi-asx","brand":"mitsubishi","name":"ASX"},{"slug":"car-mitsubishi-outlander","brand":"mitsubishi","name":"Outlander"},{"slug":"car-mitsubishi-outlander-sport","brand":"mitsubishi","name":"Outlander Sport"},{"slug":"car-mitsubishi-pajero-sport","brand":"mitsubishi","name":"Pajero Sport"},{"slug":"car-mitsubishi-montero-sport","brand":"mitsubishi","name":"Montero Sport"},{"slug":"car-mitsubishi-l200","brand":"mitsubishi","name":"L200"},{"slug":"car-jeep-renegade","brand":"jeep","name":"Renegade"},{"slug":"car-jeep-compass","brand":"jeep","name":"Compass"},{"slug":"car-jeep-cherokee","brand":"jeep","name":"Cherokee"},{"slug":"car-jeep-grand-cherokee","brand":"jeep","name":"Grand Cherokee"},{"slug":"car-jeep-wrangler","brand":"jeep","name":"Wrangler"},{"slug":"car-jeep-gladiator","brand":"jeep","name":"Gladiator"},{"slug":"car-jeep-wagoneer","brand":"jeep","name":"Wagoneer"},{"slug":"car-jeep-grand-wagoneer","brand":"jeep","name":"Grand Wagoneer"},{"slug":"car-lexus-is","brand":"lexus","name":"IS"},{"slug":"car-lexus-es","brand":"lexus","name":"ES"},{"slug":"car-lexus-ls","brand":"lexus","name":"LS"},{"slug":"car-lexus-ux","brand":"lexus","name":"UX"},{"slug":"car-lexus-nx","brand":"lexus","name":"NX"},{"slug":"car-lexus-rx","brand":"lexus","name":"RX"},{"slug":"car-lexus-gx","brand":"lexus","name":"GX"},{"slug":"car-lexus-lx","brand":"lexus","name":"LX"},{"slug":"car-lexus-lm","brand":"lexus","name":"LM"},{"slug":"car-lexus-lbx","brand":"lexus","name":"LBX"},{"slug":"car-bmw-2-series","brand":"bmw","name":"2 Series"},{"slug":"car-bmw-3-series","brand":"bmw","name":"3 Series"},{"slug":"car-bmw-4-series","brand":"bmw","name":"4 Series"},{"slug":"car-bmw-5-series","brand":"bmw","name":"5 Series"},{"slug":"car-bmw-7-series","brand":"bmw","name":"7 Series"},{"slug":"car-bmw-x1","brand":"bmw","name":"X1"},{"slug":"car-bmw-x2","brand":"bmw","name":"X2"},{"slug":"car-bmw-x3","brand":"bmw","name":"X3"},{"slug":"car-bmw-x5","brand":"bmw","name":"X5"},{"slug":"car-bmw-x6","brand":"bmw","name":"X6"},{"slug":"car-bmw-x7","brand":"bmw","name":"X7"},{"slug":"car-bmw-i4","brand":"bmw","name":"i4"},{"slug":"car-bmw-i5","brand":"bmw","name":"i5"},{"slug":"car-bmw-i7","brand":"bmw","name":"i7"},{"slug":"car-bmw-ix","brand":"bmw","name":"iX"},{"slug":"car-mercedes-a-class","brand":"mercedes","name":"A-Class"},{"slug":"car-mercedes-c-class","brand":"mercedes","name":"C-Class"},{"slug":"car-mercedes-e-class","brand":"mercedes","name":"E-Class"},{"slug":"car-mercedes-s-class","brand":"mercedes","name":"S-Class"},{"slug":"car-mercedes-cla","brand":"mercedes","name":"CLA"},{"slug":"car-mercedes-gla","brand":"mercedes","name":"GLA"},{"slug":"car-mercedes-glb","brand":"mercedes","name":"GLB"},{"slug":"car-mercedes-glc","brand":"mercedes","name":"GLC"},{"slug":"car-mercedes-gle","brand":"mercedes","name":"GLE"},{"slug":"car-mercedes-gls","brand":"mercedes","name":"GLS"},{"slug":"car-mercedes-g-class","brand":"mercedes","name":"G-Class"},{"slug":"car-mercedes-eqs","brand":"mercedes","name":"EQS"},{"slug":"car-mercedes-eqe","brand":"mercedes","name":"EQE"},{"slug":"car-audi-a3","brand":"audi","name":"A3"},{"slug":"car-audi-a4","brand":"audi","name":"A4"},{"slug":"car-audi-a5","brand":"audi","name":"A5"},{"slug":"car-audi-a6","brand":"audi","name":"A6"},{"slug":"car-audi-a8","brand":"audi","name":"A8"},{"slug":"car-audi-q2","brand":"audi","name":"Q2"},{"slug":"car-audi-q3","brand":"audi","name":"Q3"},{"slug":"car-audi-q5","brand":"audi","name":"Q5"},{"slug":"car-audi-q7","brand":"audi","name":"Q7"},{"slug":"car-audi-q8","brand":"audi","name":"Q8"},{"slug":"car-audi-e-tron","brand":"audi","name":"e-tron"},{"slug":"car-volkswagen-golf","brand":"volkswagen","name":"Golf"},{"slug":"car-volkswagen-jetta","brand":"volkswagen","name":"Jetta"},{"slug":"car-volkswagen-passat","brand":"volkswagen","name":"Passat"},{"slug":"car-volkswagen-tiguan","brand":"volkswagen","name":"Tiguan"},{"slug":"car-volkswagen-touareg","brand":"volkswagen","name":"Touareg"},{"slug":"car-volkswagen-teramont","brand":"volkswagen","name":"Teramont"},{"slug":"car-volkswagen-id-4","brand":"volkswagen","name":"ID.4"},{"slug":"car-volkswagen-id-7","brand":"volkswagen","name":"ID.7"},{"slug":"car-byd-atto-3","brand":"byd","name":"Atto 3"},{"slug":"car-byd-seal","brand":"byd","name":"Seal"},{"slug":"car-byd-han","brand":"byd","name":"Han"},{"slug":"car-byd-song-plus","brand":"byd","name":"Song Plus"},{"slug":"car-byd-qin-plus","brand":"byd","name":"Qin Plus"},{"slug":"car-byd-song-plus-dm-i","brand":"byd","name":"Song Plus DM-i"},{"slug":"car-byd-seagull","brand":"byd","name":"Seagull"},{"slug":"car-byd-dolphin","brand":"byd","name":"Dolphin"},{"slug":"car-exeed-lx","brand":"exeed","name":"LX"},{"slug":"car-exeed-txl","brand":"exeed","name":"TXL"},{"slug":"car-exeed-vx","brand":"exeed","name":"VX"},{"slug":"car-exeed-rx","brand":"exeed","name":"RX"},{"slug":"car-exeed-es","brand":"exeed","name":"ES"},{"slug":"car-hongqi-h5","brand":"hongqi","name":"H5"},{"slug":"car-hongqi-h6","brand":"hongqi","name":"H6"},{"slug":"car-hongqi-h9","brand":"hongqi","name":"H9"},{"slug":"car-hongqi-hs3","brand":"hongqi","name":"HS3"},{"slug":"car-hongqi-hs5","brand":"hongqi","name":"HS5"},{"slug":"car-hongqi-hs7","brand":"hongqi","name":"HS7"},{"slug":"car-hongqi-e-hs9","brand":"hongqi","name":"E-HS9"},{"slug":"car-greatwall-poer","brand":"greatwall","name":"Poer"},{"slug":"car-greatwall-poer-king-kong","brand":"greatwall","name":"Poer King Kong"},{"slug":"car-greatwall-wingle","brand":"greatwall","name":"Wingle"},{"slug":"car-greatwall-tank-300","brand":"greatwall","name":"Tank 300"},{"slug":"car-greatwall-tank-500","brand":"greatwall","name":"Tank 500"},{"slug":"car-greatwall-tank-700","brand":"greatwall","name":"Tank 700"},{"slug":"car-tank-tank-300","brand":"tank","name":"Tank 300"},{"slug":"car-tank-tank-500","brand":"tank","name":"Tank 500"},{"slug":"car-tank-tank-700","brand":"tank","name":"Tank 700"},{"slug":"car-tank-tank-800","brand":"tank","name":"Tank 800"},{"slug":"car-jac-js3","brand":"jac","name":"JS3"},{"slug":"car-jac-js4","brand":"jac","name":"JS4"},{"slug":"car-jac-js6","brand":"jac","name":"JS6"},{"slug":"car-jac-js8","brand":"jac","name":"JS8"},{"slug":"car-jac-t8","brand":"jac","name":"T8"},{"slug":"car-jac-t9","brand":"jac","name":"T9"},{"slug":"car-jac-x200","brand":"jac","name":"X200"},{"slug":"car-mahindra-xuv700","brand":"mahindra","name":"XUV700"},{"slug":"car-mahindra-scorpio","brand":"mahindra","name":"Scorpio"},{"slug":"car-mahindra-scorpio-n","brand":"mahindra","name":"Scorpio-N"},{"slug":"car-mahindra-thar","brand":"mahindra","name":"Thar"},{"slug":"car-mahindra-pik-up","brand":"mahindra","name":"Pik Up"},{"slug":"car-renault-symbol","brand":"renault","name":"Symbol"},{"slug":"car-renault-duster","brand":"renault","name":"Duster"},{"slug":"car-renault-koleos","brand":"renault","name":"Koleos"},{"slug":"car-renault-arkana","brand":"renault","name":"Arkana"},{"slug":"car-renault-megane","brand":"renault","name":"Megane"},{"slug":"car-renault-master","brand":"renault","name":"Master"},{"slug":"car-renault-express","brand":"renault","name":"Express"},{"slug":"car-peugeot-208","brand":"peugeot","name":"208"},{"slug":"car-peugeot-2008","brand":"peugeot","name":"2008"},{"slug":"car-peugeot-3008","brand":"peugeot","name":"3008"},{"slug":"car-peugeot-5008","brand":"peugeot","name":"5008"},{"slug":"car-peugeot-408","brand":"peugeot","name":"408"},{"slug":"car-peugeot-508","brand":"peugeot","name":"508"},{"slug":"car-peugeot-partner","brand":"peugeot","name":"Partner"},{"slug":"car-landrover-range-rover","brand":"landrover","name":"Range Rover"},{"slug":"car-landrover-range-rover-sport","brand":"landrover","name":"Range Rover Sport"},{"slug":"car-landrover-range-rover-velar","brand":"landrover","name":"Range Rover Velar"},{"slug":"car-landrover-range-rover-evoque","brand":"landrover","name":"Range Rover Evoque"},{"slug":"car-landrover-defender","brand":"landrover","name":"Defender"},{"slug":"car-landrover-discovery","brand":"landrover","name":"Discovery"},{"slug":"car-landrover-discovery-sport","brand":"landrover","name":"Discovery Sport"},{"slug":"car-volvo-s60","brand":"volvo","name":"S60"},{"slug":"car-volvo-s90","brand":"volvo","name":"S90"},{"slug":"car-volvo-xc40","brand":"volvo","name":"XC40"},{"slug":"car-volvo-xc60","brand":"volvo","name":"XC60"},{"slug":"car-volvo-xc90","brand":"volvo","name":"XC90"},{"slug":"car-volvo-ex30","brand":"volvo","name":"EX30"},{"slug":"car-volvo-ex40","brand":"volvo","name":"EX40"},{"slug":"car-volvo-ex90","brand":"volvo","name":"EX90"},{"slug":"car-porsche-718-cayman","brand":"porsche","name":"718 Cayman"},{"slug":"car-porsche-718-boxster","brand":"porsche","name":"718 Boxster"},{"slug":"car-porsche-911","brand":"porsche","name":"911"},{"slug":"car-porsche-taycan","brand":"porsche","name":"Taycan"},{"slug":"car-porsche-panamera","brand":"porsche","name":"Panamera"},{"slug":"car-porsche-macan","brand":"porsche","name":"Macan"},{"slug":"car-porsche-cayenne","brand":"porsche","name":"Cayenne"},{"slug":"car-tesla-model-3","brand":"tesla","name":"Model 3"},{"slug":"car-tesla-model-y","brand":"tesla","name":"Model Y"},{"slug":"car-tesla-model-s","brand":"tesla","name":"Model S"},{"slug":"car-tesla-model-x","brand":"tesla","name":"Model X"},{"slug":"car-tesla-cybertruck","brand":"tesla","name":"Cybertruck"},{"slug":"car-lucid-air","brand":"lucid","name":"Air"},{"slug":"car-lucid-gravity","brand":"lucid","name":"Gravity"},{"slug":"car-genesis-g70","brand":"genesis","name":"G70"},{"slug":"car-genesis-g80","brand":"genesis","name":"G80"},{"slug":"car-genesis-g90","brand":"genesis","name":"G90"},{"slug":"car-genesis-gv60","brand":"genesis","name":"GV60"},{"slug":"car-genesis-gv70","brand":"genesis","name":"GV70"},{"slug":"car-genesis-gv80","brand":"genesis","name":"GV80"},{"slug":"car-genesis-gv80-coupe","brand":"genesis","name":"GV80 Coupe"}],"products":[{"slug":"car-toyota-yaris-2026","family_slug":"car-toyota-yaris","brand":"toyota","name":"Toyota Yaris","name_ar":"تويوتا Yaris","model_year":2026,"trim":"غير محددة","specs":{"engine":"1.3L","power":"97 hp","fuel":"gasoline"}},{"slug":"car-toyota-corolla-2026-1-5l-xli","family_slug":"car-toyota-corolla","brand":"toyota","name":"Toyota Corolla","name_ar":"تويوتا Corolla","model_year":2026,"trim":"1.5L XLI","specs":{"engine":"1.5L","power":"119 hp","fuel":"gasoline"}},{"slug":"car-toyota-camry-2026","family_slug":"car-toyota-camry","brand":"toyota","name":"Toyota Camry","name_ar":"تويوتا Camry","model_year":2026,"trim":"غير محددة","specs":{"engine":"2.5L","power":null,"fuel":"gasoline/hybrid"}},{"slug":"car-toyota-crown-2026","family_slug":"car-toyota-crown","brand":"toyota","name":"Toyota Crown","name_ar":"تويوتا Crown","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"hybrid"}},{"slug":"car-toyota-gr86-2026","family_slug":"car-toyota-gr86","brand":"toyota","name":"Toyota GR86","name_ar":"تويوتا GR86","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-supra-2026","family_slug":"car-toyota-supra","brand":"toyota","name":"Toyota Supra","name_ar":"تويوتا Supra","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-raize-2026","family_slug":"car-toyota-raize","brand":"toyota","name":"Toyota Raize","name_ar":"تويوتا Raize","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-urban-cruiser-2026","family_slug":"car-toyota-urban-cruiser","brand":"toyota","name":"Toyota Urban Cruiser","name_ar":"تويوتا Urban Cruiser","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-veloz-2026","family_slug":"car-toyota-veloz","brand":"toyota","name":"Toyota Veloz","name_ar":"تويوتا Veloz","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-corolla-cross-2025","family_slug":"car-toyota-corolla-cross","brand":"toyota","name":"Toyota Corolla Cross","name_ar":"تويوتا Corolla Cross","model_year":2025,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-rav4-2026","family_slug":"car-toyota-rav4","brand":"toyota","name":"Toyota RAV4","name_ar":"تويوتا RAV4","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-innova-2026","family_slug":"car-toyota-innova","brand":"toyota","name":"Toyota Innova","name_ar":"تويوتا Innova","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-land-cruiser-hardtop-2026","family_slug":"car-toyota-land-cruiser-hardtop","brand":"toyota","name":"Toyota Land Cruiser Hardtop","name_ar":"تويوتا Land Cruiser Hardtop","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-fortuner-2026","family_slug":"car-toyota-fortuner","brand":"toyota","name":"Toyota Fortuner","name_ar":"تويوتا Fortuner","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-highlander-2026","family_slug":"car-toyota-highlander","brand":"toyota","name":"Toyota Highlander","name_ar":"تويوتا Highlander","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-prado-2026-tx-2","family_slug":"car-toyota-prado","brand":"toyota","name":"Toyota Prado","name_ar":"تويوتا Prado","model_year":2026,"trim":"TX-2","specs":{"engine":"2.4L turbo","power":"267 hp","fuel":"gasoline"}},{"slug":"car-toyota-land-cruiser-2026","family_slug":"car-toyota-land-cruiser","brand":"toyota","name":"Toyota Land Cruiser","name_ar":"تويوتا Land Cruiser","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-toyota-lc300-hev-max-2026","family_slug":"car-toyota-lc300-hev-max","brand":"toyota","name":"Toyota LC300 HEV MAX","name_ar":"تويوتا LC300 HEV MAX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"hybrid"}},{"slug":"car-toyota-corolla-hybrid-2026","family_slug":"car-toyota-corolla-hybrid","brand":"toyota","name":"Toyota Corolla Hybrid","name_ar":"تويوتا Corolla Hybrid","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-toyota-corolla-executive-2026","family_slug":"car-toyota-corolla-executive","brand":"toyota","name":"Toyota Corolla Executive","name_ar":"تويوتا Corolla Executive","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-toyota-camry-hybrid-2026","family_slug":"car-toyota-camry-hybrid","brand":"toyota","name":"Toyota Camry Hybrid","name_ar":"تويوتا Camry Hybrid","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-toyota-land-cruiser-70-2026","family_slug":"car-toyota-land-cruiser-70","brand":"toyota","name":"Toyota Land Cruiser 70","name_ar":"تويوتا Land Cruiser 70","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-toyota-land-cruiser-300-2026","family_slug":"car-toyota-land-cruiser-300","brand":"toyota","name":"Toyota Land Cruiser 300","name_ar":"تويوتا Land Cruiser 300","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-toyota-hilux-2026","family_slug":"car-toyota-hilux","brand":"toyota","name":"Toyota Hilux","name_ar":"تويوتا Hilux","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-toyota-hiace-2026","family_slug":"car-toyota-hiace","brand":"toyota","name":"Toyota Hiace","name_ar":"تويوتا Hiace","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-toyota-coaster-2026","family_slug":"car-toyota-coaster","brand":"toyota","name":"Toyota Coaster","name_ar":"تويوتا Coaster","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hyundai-accent-2026","family_slug":"car-hyundai-accent","brand":"hyundai","name":"Hyundai Accent","name_ar":"هيونداي Accent","model_year":2026,"trim":"غير محددة","specs":{"engine":"1.5L","power":"113 hp","fuel":"gasoline"}},{"slug":"car-hyundai-elantra-2026-1-5-gl","family_slug":"car-hyundai-elantra","brand":"hyundai","name":"Hyundai Elantra","name_ar":"هيونداي Elantra","model_year":2026,"trim":"1.5 GL","specs":{"engine":"1.5L","power":"157 hp","fuel":"gasoline"}},{"slug":"car-hyundai-tucson-2026","family_slug":"car-hyundai-tucson","brand":"hyundai","name":"Hyundai Tucson","name_ar":"هيونداي Tucson","model_year":2026,"trim":"غير محددة","specs":{"engine":"1.6L turbo","power":"178 hp","fuel":"gasoline"}},{"slug":"car-hyundai-creta-2026","family_slug":"car-hyundai-creta","brand":"hyundai","name":"Hyundai Creta","name_ar":"هيونداي Creta","model_year":2026,"trim":"غير محددة","specs":{"engine":"1.5L turbo","power":"160 hp","fuel":"gasoline"}},{"slug":"car-hyundai-sonata-2026","family_slug":"car-hyundai-sonata","brand":"hyundai","name":"Hyundai Sonata","name_ar":"هيونداي Sonata","model_year":2026,"trim":"غير محددة","specs":{"engine":"2.5L turbo","power":"290 hp","fuel":"gasoline"}},{"slug":"car-hyundai-kona-2026","family_slug":"car-hyundai-kona","brand":"hyundai","name":"Hyundai Kona","name_ar":"هيونداي Kona","model_year":2026,"trim":"غير محددة","specs":{"engine":"2.0L","power":"195 hp","fuel":"gasoline"}},{"slug":"car-hyundai-palisade-2026","family_slug":"car-hyundai-palisade","brand":"hyundai","name":"Hyundai Palisade","name_ar":"هيونداي Palisade","model_year":2026,"trim":"غير محددة","specs":{"engine":"2.5L turbo","power":"277 hp","fuel":"gasoline"}},{"slug":"car-hyundai-staria-premium-2026","family_slug":"car-hyundai-staria-premium","brand":"hyundai","name":"Hyundai Staria Premium","name_ar":"هيونداي Staria Premium","model_year":2026,"trim":"غير محددة","specs":{"engine":"3.5L","power":"268 hp","fuel":"gasoline"}},{"slug":"car-hyundai-santa-fe-2026","family_slug":"car-hyundai-santa-fe","brand":"hyundai","name":"Hyundai Santa Fe","name_ar":"هيونداي Santa Fe","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hyundai-santa-cruz-2026","family_slug":"car-hyundai-santa-cruz","brand":"hyundai","name":"Hyundai Santa Cruz","name_ar":"هيونداي Santa Cruz","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hyundai-ioniq-5-2026","family_slug":"car-hyundai-ioniq-5","brand":"hyundai","name":"Hyundai Ioniq 5","name_ar":"هيونداي Ioniq 5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hyundai-ioniq-6-2026","family_slug":"car-hyundai-ioniq-6","brand":"hyundai","name":"Hyundai Ioniq 6","name_ar":"هيونداي Ioniq 6","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hyundai-tucson-hybrid-2026","family_slug":"car-hyundai-tucson-hybrid","brand":"hyundai","name":"Hyundai Tucson Hybrid","name_ar":"هيونداي Tucson Hybrid","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hyundai-palisade-hybrid-2026","family_slug":"car-hyundai-palisade-hybrid","brand":"hyundai","name":"Hyundai Palisade Hybrid","name_ar":"هيونداي Palisade Hybrid","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hyundai-staria-2026","family_slug":"car-hyundai-staria","brand":"hyundai","name":"Hyundai Staria","name_ar":"هيونداي Staria","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hyundai-h-1-2026","family_slug":"car-hyundai-h-1","brand":"hyundai","name":"Hyundai H-1","name_ar":"هيونداي H-1","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-kia-k4-2026","family_slug":"car-kia-k4","brand":"kia","name":"Kia K4","name_ar":"كيا K4","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-k8-2026","family_slug":"car-kia-k8","brand":"kia","name":"Kia K8","name_ar":"كيا K8","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-k5-2026","family_slug":"car-kia-k5","brand":"kia","name":"Kia K5","name_ar":"كيا K5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-pegas-2026","family_slug":"car-kia-pegas","brand":"kia","name":"Kia Pegas","name_ar":"كيا Pegas","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-k3-2026","family_slug":"car-kia-k3","brand":"kia","name":"Kia K3","name_ar":"كيا K3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-carens-2026","family_slug":"car-kia-carens","brand":"kia","name":"Kia Carens","name_ar":"كيا Carens","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-sportage-l-2026","family_slug":"car-kia-sportage-l","brand":"kia","name":"Kia Sportage L","name_ar":"كيا Sportage L","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-sonet-2026","family_slug":"car-kia-sonet","brand":"kia","name":"Kia Sonet","name_ar":"كيا Sonet","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-seltos-2026","family_slug":"car-kia-seltos","brand":"kia","name":"Kia Seltos","name_ar":"كيا Seltos","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-carnival-2026","family_slug":"car-kia-carnival","brand":"kia","name":"Kia Carnival","name_ar":"كيا Carnival","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-telluride-2026","family_slug":"car-kia-telluride","brand":"kia","name":"Kia Telluride","name_ar":"كيا Telluride","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-kia-sorento-2026","family_slug":"car-kia-sorento","brand":"kia","name":"Kia Sorento","name_ar":"كيا Sorento","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-kia-sorento-hybrid-2026","family_slug":"car-kia-sorento-hybrid","brand":"kia","name":"Kia Sorento Hybrid","name_ar":"كيا Sorento Hybrid","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-kia-ev3-2026","family_slug":"car-kia-ev3","brand":"kia","name":"Kia EV3","name_ar":"كيا EV3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-kia-ev6-2026","family_slug":"car-kia-ev6","brand":"kia","name":"Kia EV6","name_ar":"كيا EV6","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-kia-ev9-2026","family_slug":"car-kia-ev9","brand":"kia","name":"Kia EV9","name_ar":"كيا EV9","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-kia-stinger-2026","family_slug":"car-kia-stinger","brand":"kia","name":"Kia Stinger","name_ar":"كيا Stinger","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-nissan-magnite-2026","family_slug":"car-nissan-magnite","brand":"nissan","name":"Nissan Magnite","name_ar":"نيسان Magnite","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-kicks-2026","family_slug":"car-nissan-kicks","brand":"nissan","name":"Nissan Kicks","name_ar":"نيسان Kicks","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-x-trail-2026","family_slug":"car-nissan-x-trail","brand":"nissan","name":"Nissan X-Trail","name_ar":"نيسان X-Trail","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-altima-2026","family_slug":"car-nissan-altima","brand":"nissan","name":"Nissan Altima","name_ar":"نيسان Altima","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-x-terra-2026","family_slug":"car-nissan-x-terra","brand":"nissan","name":"Nissan X-Terra","name_ar":"نيسان X-Terra","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-pathfinder-2026","family_slug":"car-nissan-pathfinder","brand":"nissan","name":"Nissan Pathfinder","name_ar":"نيسان Pathfinder","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-patrol-2026","family_slug":"car-nissan-patrol","brand":"nissan","name":"Nissan Patrol","name_ar":"نيسان Patrol","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-patrol-pro-4x-2026","family_slug":"car-nissan-patrol-pro-4x","brand":"nissan","name":"Nissan Patrol PRO-4X","name_ar":"نيسان Patrol PRO-4X","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-patrol-nismo-2026","family_slug":"car-nissan-patrol-nismo","brand":"nissan","name":"Nissan Patrol NISMO","name_ar":"نيسان Patrol NISMO","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-z-2026","family_slug":"car-nissan-z","brand":"nissan","name":"Nissan Z","name_ar":"نيسان Z","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":"gasoline"}},{"slug":"car-nissan-sunny-2026","family_slug":"car-nissan-sunny","brand":"nissan","name":"Nissan Sunny","name_ar":"نيسان Sunny","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-nissan-sentra-2026","family_slug":"car-nissan-sentra","brand":"nissan","name":"Nissan Sentra","name_ar":"نيسان Sentra","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-nissan-murano-2026","family_slug":"car-nissan-murano","brand":"nissan","name":"Nissan Murano","name_ar":"نيسان Murano","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-nissan-armada-2026","family_slug":"car-nissan-armada","brand":"nissan","name":"Nissan Armada","name_ar":"نيسان Armada","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-nissan-navara-2026","family_slug":"car-nissan-navara","brand":"nissan","name":"Nissan Navara","name_ar":"نيسان Navara","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mg-mg-5-2026","family_slug":"car-mg-mg-5","brand":"mg","name":"MG MG 5","name_ar":"MG MG 5","model_year":2026,"trim":"غير محددة","specs":{"engine":"1.5L","power":"110 hp","fuel":"gasoline"}},{"slug":"car-mg-mg-7-2026","family_slug":"car-mg-mg-7","brand":"mg","name":"MG MG 7","name_ar":"MG MG 7","model_year":2026,"trim":"غير محددة","specs":{"engine":"2.0L turbo","power":"261 hp","fuel":"gasoline"}},{"slug":"car-mg-mg-hs-2026","family_slug":"car-mg-mg-hs","brand":"mg","name":"MG MG HS","name_ar":"MG MG HS","model_year":2026,"trim":"غير محددة","specs":{"engine":"2.0L turbo","power":null,"fuel":"gasoline"}},{"slug":"car-mg-mg-hs-hybrid-2026","family_slug":"car-mg-mg-hs-hybrid","brand":"mg","name":"MG MG HS Hybrid+","name_ar":"MG MG HS Hybrid+","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":"221 hp","fuel":"hybrid"}},{"slug":"car-mg-mg-rx9-2026","family_slug":"car-mg-mg-rx9","brand":"mg","name":"MG MG RX9","name_ar":"MG MG RX9","model_year":2026,"trim":"غير محددة","specs":{"engine":"2.0L turbo","power":null,"fuel":"gasoline"}},{"slug":"car-mg-mg-one-2026","family_slug":"car-mg-mg-one","brand":"mg","name":"MG MG One","name_ar":"MG MG One","model_year":2026,"trim":"غير محددة","specs":{"engine":"1.5L turbo","power":"168 hp","fuel":"gasoline"}},{"slug":"car-mg-mg-3-2026","family_slug":"car-mg-mg-3","brand":"mg","name":"MG MG 3","name_ar":"MG MG 3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mg-mg-gt-2026","family_slug":"car-mg-mg-gt","brand":"mg","name":"MG MG GT","name_ar":"MG MG GT","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mg-mg-zs-2026","family_slug":"car-mg-mg-zs","brand":"mg","name":"MG MG ZS","name_ar":"MG MG ZS","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mg-mg-zs-ev-2026","family_slug":"car-mg-mg-zs-ev","brand":"mg","name":"MG MG ZS EV","name_ar":"MG MG ZS EV","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mg-mg-whale-2026","family_slug":"car-mg-mg-whale","brand":"mg","name":"MG MG Whale","name_ar":"MG MG Whale","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-territory-2026","family_slug":"car-ford-territory","brand":"ford","name":"Ford Territory","name_ar":"فورد Territory","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-taurus-2026","family_slug":"car-ford-taurus","brand":"ford","name":"Ford Taurus","name_ar":"فورد Taurus","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-everest-2026","family_slug":"car-ford-everest","brand":"ford","name":"Ford Everest","name_ar":"فورد Everest","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-explorer-2026","family_slug":"car-ford-explorer","brand":"ford","name":"Ford Explorer","name_ar":"فورد Explorer","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-expedition-2026","family_slug":"car-ford-expedition","brand":"ford","name":"Ford Expedition","name_ar":"فورد Expedition","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-bronco-2026","family_slug":"car-ford-bronco","brand":"ford","name":"Ford Bronco","name_ar":"فورد Bronco","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-mustang-2026","family_slug":"car-ford-mustang","brand":"ford","name":"Ford Mustang","name_ar":"فورد Mustang","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-f-150-2026","family_slug":"car-ford-f-150","brand":"ford","name":"Ford F-150","name_ar":"فورد F-150","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-ranger-2026","family_slug":"car-ford-ranger","brand":"ford","name":"Ford Ranger","name_ar":"فورد Ranger","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-ford-transit-2026","family_slug":"car-ford-transit","brand":"ford","name":"Ford Transit","name_ar":"فورد Transit","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-honda-city-2026","family_slug":"car-honda-city","brand":"honda","name":"Honda City","name_ar":"هوندا City","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-honda-civic-2026","family_slug":"car-honda-civic","brand":"honda","name":"Honda Civic","name_ar":"هوندا Civic","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-honda-accord-2026","family_slug":"car-honda-accord","brand":"honda","name":"Honda Accord","name_ar":"هوندا Accord","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-honda-hr-v-2026","family_slug":"car-honda-hr-v","brand":"honda","name":"Honda HR-V","name_ar":"هوندا HR-V","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-honda-cr-v-2026","family_slug":"car-honda-cr-v","brand":"honda","name":"Honda CR-V","name_ar":"هوندا CR-V","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-honda-pilot-2026","family_slug":"car-honda-pilot","brand":"honda","name":"Honda Pilot","name_ar":"هوندا Pilot","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-honda-odyssey-2026","family_slug":"car-honda-odyssey","brand":"honda","name":"Honda Odyssey","name_ar":"هوندا Odyssey","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-honda-zr-v-2026","family_slug":"car-honda-zr-v","brand":"honda","name":"Honda ZR-V","name_ar":"هوندا ZR-V","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mazda-mazda-2-2026","family_slug":"car-mazda-mazda-2","brand":"mazda","name":"Mazda Mazda 2","name_ar":"مازدا Mazda 2","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mazda-mazda-3-2026","family_slug":"car-mazda-mazda-3","brand":"mazda","name":"Mazda Mazda 3","name_ar":"مازدا Mazda 3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mazda-mazda-6-2026","family_slug":"car-mazda-mazda-6","brand":"mazda","name":"Mazda Mazda 6","name_ar":"مازدا Mazda 6","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mazda-cx-3-2026","family_slug":"car-mazda-cx-3","brand":"mazda","name":"Mazda CX-3","name_ar":"مازدا CX-3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mazda-cx-30-2026","family_slug":"car-mazda-cx-30","brand":"mazda","name":"Mazda CX-30","name_ar":"مازدا CX-30","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mazda-cx-5-2026","family_slug":"car-mazda-cx-5","brand":"mazda","name":"Mazda CX-5","name_ar":"مازدا CX-5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mazda-cx-60-2026","family_slug":"car-mazda-cx-60","brand":"mazda","name":"Mazda CX-60","name_ar":"مازدا CX-60","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mazda-cx-90-2026","family_slug":"car-mazda-cx-90","brand":"mazda","name":"Mazda CX-90","name_ar":"مازدا CX-90","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mazda-bt-50-2026","family_slug":"car-mazda-bt-50","brand":"mazda","name":"Mazda BT-50","name_ar":"مازدا BT-50","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-suzuki-swift-2026","family_slug":"car-suzuki-swift","brand":"suzuki","name":"Suzuki Swift","name_ar":"سوزوكي Swift","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-suzuki-dzire-2026","family_slug":"car-suzuki-dzire","brand":"suzuki","name":"Suzuki Dzire","name_ar":"سوزوكي Dzire","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-suzuki-baleno-2026","family_slug":"car-suzuki-baleno","brand":"suzuki","name":"Suzuki Baleno","name_ar":"سوزوكي Baleno","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-suzuki-ciaz-2026","family_slug":"car-suzuki-ciaz","brand":"suzuki","name":"Suzuki Ciaz","name_ar":"سوزوكي Ciaz","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-suzuki-fronx-2026","family_slug":"car-suzuki-fronx","brand":"suzuki","name":"Suzuki Fronx","name_ar":"سوزوكي Fronx","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-suzuki-jimny-2026","family_slug":"car-suzuki-jimny","brand":"suzuki","name":"Suzuki Jimny","name_ar":"سوزوكي Jimny","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-suzuki-ertiga-2026","family_slug":"car-suzuki-ertiga","brand":"suzuki","name":"Suzuki Ertiga","name_ar":"سوزوكي Ertiga","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-suzuki-xl7-2026","family_slug":"car-suzuki-xl7","brand":"suzuki","name":"Suzuki XL7","name_ar":"سوزوكي XL7","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-suzuki-grand-vitara-2026","family_slug":"car-suzuki-grand-vitara","brand":"suzuki","name":"Suzuki Grand Vitara","name_ar":"سوزوكي Grand Vitara","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-isuzu-d-max-2026","family_slug":"car-isuzu-d-max","brand":"isuzu","name":"Isuzu D-Max","name_ar":"إيسوزو D-Max","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-isuzu-mu-x-2026","family_slug":"car-isuzu-mu-x","brand":"isuzu","name":"Isuzu MU-X","name_ar":"إيسوزو MU-X","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-isuzu-n-series-2026","family_slug":"car-isuzu-n-series","brand":"isuzu","name":"Isuzu N-Series","name_ar":"إيسوزو N-Series","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-isuzu-f-series-2026","family_slug":"car-isuzu-f-series","brand":"isuzu","name":"Isuzu F-Series","name_ar":"إيسوزو F-Series","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-isuzu-giga-2026","family_slug":"car-isuzu-giga","brand":"isuzu","name":"Isuzu Giga","name_ar":"إيسوزو Giga","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-alsvin-2026","family_slug":"car-changan-alsvin","brand":"changan","name":"Changan Alsvin","name_ar":"شانجان Alsvin","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-eado-plus-2026","family_slug":"car-changan-eado-plus","brand":"changan","name":"Changan Eado Plus","name_ar":"شانجان Eado Plus","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-cs35-plus-2026","family_slug":"car-changan-cs35-plus","brand":"changan","name":"Changan CS35 Plus","name_ar":"شانجان CS35 Plus","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-cs55-plus-2026","family_slug":"car-changan-cs55-plus","brand":"changan","name":"Changan CS55 Plus","name_ar":"شانجان CS55 Plus","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-cs75-plus-2026","family_slug":"car-changan-cs75-plus","brand":"changan","name":"Changan CS75 Plus","name_ar":"شانجان CS75 Plus","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-cs95-2026","family_slug":"car-changan-cs95","brand":"changan","name":"Changan CS95","name_ar":"شانجان CS95","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-uni-t-2026","family_slug":"car-changan-uni-t","brand":"changan","name":"Changan UNI-T","name_ar":"شانجان UNI-T","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-uni-v-2026","family_slug":"car-changan-uni-v","brand":"changan","name":"Changan UNI-V","name_ar":"شانجان UNI-V","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-uni-k-2026","family_slug":"car-changan-uni-k","brand":"changan","name":"Changan UNI-K","name_ar":"شانجان UNI-K","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-changan-uni-s-2026","family_slug":"car-changan-uni-s","brand":"changan","name":"Changan UNI-S","name_ar":"شانجان UNI-S","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-geely-emgrand-2026","family_slug":"car-geely-emgrand","brand":"geely","name":"Geely Emgrand","name_ar":"جيلي Emgrand","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-geely-coolray-2026","family_slug":"car-geely-coolray","brand":"geely","name":"Geely Coolray","name_ar":"جيلي Coolray","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-geely-monjaro-2026","family_slug":"car-geely-monjaro","brand":"geely","name":"Geely Monjaro","name_ar":"جيلي Monjaro","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-geely-okavango-2026","family_slug":"car-geely-okavango","brand":"geely","name":"Geely Okavango","name_ar":"جيلي Okavango","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-geely-starray-2026","family_slug":"car-geely-starray","brand":"geely","name":"Geely Starray","name_ar":"جيلي Starray","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-geely-tugella-2026","family_slug":"car-geely-tugella","brand":"geely","name":"Geely Tugella","name_ar":"جيلي Tugella","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-geely-geometry-c-2026","family_slug":"car-geely-geometry-c","brand":"geely","name":"Geely Geometry C","name_ar":"جيلي Geometry C","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-geely-ex5-2026","family_slug":"car-geely-ex5","brand":"geely","name":"Geely EX5","name_ar":"جيلي EX5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gac-empow-2026","family_slug":"car-gac-empow","brand":"gac","name":"GAC Empow","name_ar":"GAC Empow","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gac-emzoom-2026","family_slug":"car-gac-emzoom","brand":"gac","name":"GAC Emzoom","name_ar":"GAC Emzoom","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gac-emkoo-2026","family_slug":"car-gac-emkoo","brand":"gac","name":"GAC Emkoo","name_ar":"GAC Emkoo","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gac-gs3-2026","family_slug":"car-gac-gs3","brand":"gac","name":"GAC GS3","name_ar":"GAC GS3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gac-gs4-2026","family_slug":"car-gac-gs4","brand":"gac","name":"GAC GS4","name_ar":"GAC GS4","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gac-gs8-2026","family_slug":"car-gac-gs8","brand":"gac","name":"GAC GS8","name_ar":"GAC GS8","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gac-m8-2026","family_slug":"car-gac-m8","brand":"gac","name":"GAC M8","name_ar":"GAC M8","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gac-aion-y-2026","family_slug":"car-gac-aion-y","brand":"gac","name":"GAC Aion Y","name_ar":"GAC Aion Y","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gac-aion-v-2026","family_slug":"car-gac-aion-v","brand":"gac","name":"GAC Aion V","name_ar":"GAC Aion V","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-haval-jolion-2026","family_slug":"car-haval-jolion","brand":"haval","name":"Haval Jolion","name_ar":"هافال Jolion","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-haval-jolion-pro-2026","family_slug":"car-haval-jolion-pro","brand":"haval","name":"Haval Jolion Pro","name_ar":"هافال Jolion Pro","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-haval-h6-2026","family_slug":"car-haval-h6","brand":"haval","name":"Haval H6","name_ar":"هافال H6","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-haval-h6-gt-2026","family_slug":"car-haval-h6-gt","brand":"haval","name":"Haval H6 GT","name_ar":"هافال H6 GT","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-haval-h9-2026","family_slug":"car-haval-h9","brand":"haval","name":"Haval H9","name_ar":"هافال H9","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-haval-dargo-2026","family_slug":"car-haval-dargo","brand":"haval","name":"Haval Dargo","name_ar":"هافال Dargo","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-haval-dargo-x-2026","family_slug":"car-haval-dargo-x","brand":"haval","name":"Haval Dargo X","name_ar":"هافال Dargo X","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jetour-x50-2026","family_slug":"car-jetour-x50","brand":"jetour","name":"Jetour X50","name_ar":"جيتور X50","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jetour-x70-2026","family_slug":"car-jetour-x70","brand":"jetour","name":"Jetour X70","name_ar":"جيتور X70","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jetour-x70-plus-2026","family_slug":"car-jetour-x70-plus","brand":"jetour","name":"Jetour X70 Plus","name_ar":"جيتور X70 Plus","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jetour-x90-plus-2026","family_slug":"car-jetour-x90-plus","brand":"jetour","name":"Jetour X90 Plus","name_ar":"جيتور X90 Plus","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jetour-dashing-2026","family_slug":"car-jetour-dashing","brand":"jetour","name":"Jetour Dashing","name_ar":"جيتور Dashing","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jetour-x90-2026","family_slug":"car-jetour-x90","brand":"jetour","name":"Jetour X90","name_ar":"جيتور X90","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jetour-t2-2026","family_slug":"car-jetour-t2","brand":"jetour","name":"Jetour T2","name_ar":"جيتور T2","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jetour-t2-i-dm-2026","family_slug":"car-jetour-t2-i-dm","brand":"jetour","name":"Jetour T2 i-DM","name_ar":"جيتور T2 i-DM","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chery-arrizo-5-2026","family_slug":"car-chery-arrizo-5","brand":"chery","name":"Chery Arrizo 5","name_ar":"شيري Arrizo 5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chery-arrizo-6-pro-2026","family_slug":"car-chery-arrizo-6-pro","brand":"chery","name":"Chery Arrizo 6 Pro","name_ar":"شيري Arrizo 6 Pro","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chery-tiggo-4-pro-2026","family_slug":"car-chery-tiggo-4-pro","brand":"chery","name":"Chery Tiggo 4 Pro","name_ar":"شيري Tiggo 4 Pro","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chery-tiggo-7-pro-2026","family_slug":"car-chery-tiggo-7-pro","brand":"chery","name":"Chery Tiggo 7 Pro","name_ar":"شيري Tiggo 7 Pro","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chery-tiggo-8-pro-2026","family_slug":"car-chery-tiggo-8-pro","brand":"chery","name":"Chery Tiggo 8 Pro","name_ar":"شيري Tiggo 8 Pro","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chery-tiggo-8-pro-max-2026","family_slug":"car-chery-tiggo-8-pro-max","brand":"chery","name":"Chery Tiggo 8 Pro Max","name_ar":"شيري Tiggo 8 Pro Max","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chery-tiggo-9-2026","family_slug":"car-chery-tiggo-9","brand":"chery","name":"Chery Tiggo 9","name_ar":"شيري Tiggo 9","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-groove-2026","family_slug":"car-chevrolet-groove","brand":"chevrolet","name":"Chevrolet Groove","name_ar":"شفروليه Groove","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-captiva-2026","family_slug":"car-chevrolet-captiva","brand":"chevrolet","name":"Chevrolet Captiva","name_ar":"شفروليه Captiva","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-equinox-2026","family_slug":"car-chevrolet-equinox","brand":"chevrolet","name":"Chevrolet Equinox","name_ar":"شفروليه Equinox","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-traverse-2026","family_slug":"car-chevrolet-traverse","brand":"chevrolet","name":"Chevrolet Traverse","name_ar":"شفروليه Traverse","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-tahoe-2026","family_slug":"car-chevrolet-tahoe","brand":"chevrolet","name":"Chevrolet Tahoe","name_ar":"شفروليه Tahoe","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-suburban-2026","family_slug":"car-chevrolet-suburban","brand":"chevrolet","name":"Chevrolet Suburban","name_ar":"شفروليه Suburban","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-trailblazer-2026","family_slug":"car-chevrolet-trailblazer","brand":"chevrolet","name":"Chevrolet Trailblazer","name_ar":"شفروليه Trailblazer","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-blazer-2026","family_slug":"car-chevrolet-blazer","brand":"chevrolet","name":"Chevrolet Blazer","name_ar":"شفروليه Blazer","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-silverado-2026","family_slug":"car-chevrolet-silverado","brand":"chevrolet","name":"Chevrolet Silverado","name_ar":"شفروليه Silverado","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-corvette-2026","family_slug":"car-chevrolet-corvette","brand":"chevrolet","name":"Chevrolet Corvette","name_ar":"شفروليه Corvette","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-chevrolet-camaro-2026","family_slug":"car-chevrolet-camaro","brand":"chevrolet","name":"Chevrolet Camaro","name_ar":"شفروليه Camaro","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gmc-terrain-2026","family_slug":"car-gmc-terrain","brand":"gmc","name":"GMC Terrain","name_ar":"GMC Terrain","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gmc-acadia-2026","family_slug":"car-gmc-acadia","brand":"gmc","name":"GMC Acadia","name_ar":"GMC Acadia","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gmc-yukon-2026","family_slug":"car-gmc-yukon","brand":"gmc","name":"GMC Yukon","name_ar":"GMC Yukon","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gmc-yukon-xl-2026","family_slug":"car-gmc-yukon-xl","brand":"gmc","name":"GMC Yukon XL","name_ar":"GMC Yukon XL","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gmc-sierra-2026","family_slug":"car-gmc-sierra","brand":"gmc","name":"GMC Sierra","name_ar":"GMC Sierra","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gmc-canyon-2026","family_slug":"car-gmc-canyon","brand":"gmc","name":"GMC Canyon","name_ar":"GMC Canyon","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-gmc-hummer-ev-2026","family_slug":"car-gmc-hummer-ev","brand":"gmc","name":"GMC Hummer EV","name_ar":"GMC Hummer EV","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mitsubishi-attrage-2026","family_slug":"car-mitsubishi-attrage","brand":"mitsubishi","name":"Mitsubishi Attrage","name_ar":"ميتسوبيشي Attrage","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mitsubishi-asx-2026","family_slug":"car-mitsubishi-asx","brand":"mitsubishi","name":"Mitsubishi ASX","name_ar":"ميتسوبيشي ASX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mitsubishi-outlander-2026","family_slug":"car-mitsubishi-outlander","brand":"mitsubishi","name":"Mitsubishi Outlander","name_ar":"ميتسوبيشي Outlander","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mitsubishi-outlander-sport-2026","family_slug":"car-mitsubishi-outlander-sport","brand":"mitsubishi","name":"Mitsubishi Outlander Sport","name_ar":"ميتسوبيشي Outlander Sport","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mitsubishi-pajero-sport-2026","family_slug":"car-mitsubishi-pajero-sport","brand":"mitsubishi","name":"Mitsubishi Pajero Sport","name_ar":"ميتسوبيشي Pajero Sport","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mitsubishi-montero-sport-2026","family_slug":"car-mitsubishi-montero-sport","brand":"mitsubishi","name":"Mitsubishi Montero Sport","name_ar":"ميتسوبيشي Montero Sport","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mitsubishi-l200-2026","family_slug":"car-mitsubishi-l200","brand":"mitsubishi","name":"Mitsubishi L200","name_ar":"ميتسوبيشي L200","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jeep-renegade-2026","family_slug":"car-jeep-renegade","brand":"jeep","name":"Jeep Renegade","name_ar":"جيب Renegade","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jeep-compass-2026","family_slug":"car-jeep-compass","brand":"jeep","name":"Jeep Compass","name_ar":"جيب Compass","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jeep-cherokee-2026","family_slug":"car-jeep-cherokee","brand":"jeep","name":"Jeep Cherokee","name_ar":"جيب Cherokee","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jeep-grand-cherokee-2026","family_slug":"car-jeep-grand-cherokee","brand":"jeep","name":"Jeep Grand Cherokee","name_ar":"جيب Grand Cherokee","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jeep-wrangler-2026","family_slug":"car-jeep-wrangler","brand":"jeep","name":"Jeep Wrangler","name_ar":"جيب Wrangler","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jeep-gladiator-2026","family_slug":"car-jeep-gladiator","brand":"jeep","name":"Jeep Gladiator","name_ar":"جيب Gladiator","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jeep-wagoneer-2026","family_slug":"car-jeep-wagoneer","brand":"jeep","name":"Jeep Wagoneer","name_ar":"جيب Wagoneer","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jeep-grand-wagoneer-2026","family_slug":"car-jeep-grand-wagoneer","brand":"jeep","name":"Jeep Grand Wagoneer","name_ar":"جيب Grand Wagoneer","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-is-2026","family_slug":"car-lexus-is","brand":"lexus","name":"Lexus IS","name_ar":"لكزس IS","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-es-2026","family_slug":"car-lexus-es","brand":"lexus","name":"Lexus ES","name_ar":"لكزس ES","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-ls-2026","family_slug":"car-lexus-ls","brand":"lexus","name":"Lexus LS","name_ar":"لكزس LS","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-ux-2026","family_slug":"car-lexus-ux","brand":"lexus","name":"Lexus UX","name_ar":"لكزس UX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-nx-2026","family_slug":"car-lexus-nx","brand":"lexus","name":"Lexus NX","name_ar":"لكزس NX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-rx-2026","family_slug":"car-lexus-rx","brand":"lexus","name":"Lexus RX","name_ar":"لكزس RX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-gx-2026","family_slug":"car-lexus-gx","brand":"lexus","name":"Lexus GX","name_ar":"لكزس GX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-lx-2026","family_slug":"car-lexus-lx","brand":"lexus","name":"Lexus LX","name_ar":"لكزس LX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-lm-2026","family_slug":"car-lexus-lm","brand":"lexus","name":"Lexus LM","name_ar":"لكزس LM","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lexus-lbx-2026","family_slug":"car-lexus-lbx","brand":"lexus","name":"Lexus LBX","name_ar":"لكزس LBX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-2-series-2026","family_slug":"car-bmw-2-series","brand":"bmw","name":"BMW 2 Series","name_ar":"BMW 2 Series","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-3-series-2026","family_slug":"car-bmw-3-series","brand":"bmw","name":"BMW 3 Series","name_ar":"BMW 3 Series","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-4-series-2026","family_slug":"car-bmw-4-series","brand":"bmw","name":"BMW 4 Series","name_ar":"BMW 4 Series","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-5-series-2026","family_slug":"car-bmw-5-series","brand":"bmw","name":"BMW 5 Series","name_ar":"BMW 5 Series","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-7-series-2026","family_slug":"car-bmw-7-series","brand":"bmw","name":"BMW 7 Series","name_ar":"BMW 7 Series","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-x1-2026","family_slug":"car-bmw-x1","brand":"bmw","name":"BMW X1","name_ar":"BMW X1","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-x2-2026","family_slug":"car-bmw-x2","brand":"bmw","name":"BMW X2","name_ar":"BMW X2","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-x3-2026","family_slug":"car-bmw-x3","brand":"bmw","name":"BMW X3","name_ar":"BMW X3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-x5-2026","family_slug":"car-bmw-x5","brand":"bmw","name":"BMW X5","name_ar":"BMW X5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-x6-2026","family_slug":"car-bmw-x6","brand":"bmw","name":"BMW X6","name_ar":"BMW X6","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-x7-2026","family_slug":"car-bmw-x7","brand":"bmw","name":"BMW X7","name_ar":"BMW X7","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-i4-2026","family_slug":"car-bmw-i4","brand":"bmw","name":"BMW i4","name_ar":"BMW i4","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-i5-2026","family_slug":"car-bmw-i5","brand":"bmw","name":"BMW i5","name_ar":"BMW i5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-i7-2026","family_slug":"car-bmw-i7","brand":"bmw","name":"BMW i7","name_ar":"BMW i7","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-bmw-ix-2026","family_slug":"car-bmw-ix","brand":"bmw","name":"BMW iX","name_ar":"BMW iX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-a-class-2026","family_slug":"car-mercedes-a-class","brand":"mercedes","name":"Mercedes-Benz A-Class","name_ar":"مرسيدس-بنز A-Class","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-c-class-2026","family_slug":"car-mercedes-c-class","brand":"mercedes","name":"Mercedes-Benz C-Class","name_ar":"مرسيدس-بنز C-Class","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-e-class-2026","family_slug":"car-mercedes-e-class","brand":"mercedes","name":"Mercedes-Benz E-Class","name_ar":"مرسيدس-بنز E-Class","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-s-class-2026","family_slug":"car-mercedes-s-class","brand":"mercedes","name":"Mercedes-Benz S-Class","name_ar":"مرسيدس-بنز S-Class","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-cla-2026","family_slug":"car-mercedes-cla","brand":"mercedes","name":"Mercedes-Benz CLA","name_ar":"مرسيدس-بنز CLA","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-gla-2026","family_slug":"car-mercedes-gla","brand":"mercedes","name":"Mercedes-Benz GLA","name_ar":"مرسيدس-بنز GLA","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-glb-2026","family_slug":"car-mercedes-glb","brand":"mercedes","name":"Mercedes-Benz GLB","name_ar":"مرسيدس-بنز GLB","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-glc-2026","family_slug":"car-mercedes-glc","brand":"mercedes","name":"Mercedes-Benz GLC","name_ar":"مرسيدس-بنز GLC","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-gle-2026","family_slug":"car-mercedes-gle","brand":"mercedes","name":"Mercedes-Benz GLE","name_ar":"مرسيدس-بنز GLE","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-gls-2026","family_slug":"car-mercedes-gls","brand":"mercedes","name":"Mercedes-Benz GLS","name_ar":"مرسيدس-بنز GLS","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-g-class-2026","family_slug":"car-mercedes-g-class","brand":"mercedes","name":"Mercedes-Benz G-Class","name_ar":"مرسيدس-بنز G-Class","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-eqs-2026","family_slug":"car-mercedes-eqs","brand":"mercedes","name":"Mercedes-Benz EQS","name_ar":"مرسيدس-بنز EQS","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mercedes-eqe-2026","family_slug":"car-mercedes-eqe","brand":"mercedes","name":"Mercedes-Benz EQE","name_ar":"مرسيدس-بنز EQE","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-a3-2026","family_slug":"car-audi-a3","brand":"audi","name":"Audi A3","name_ar":"أودي A3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-a4-2026","family_slug":"car-audi-a4","brand":"audi","name":"Audi A4","name_ar":"أودي A4","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-a5-2026","family_slug":"car-audi-a5","brand":"audi","name":"Audi A5","name_ar":"أودي A5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-a6-2026","family_slug":"car-audi-a6","brand":"audi","name":"Audi A6","name_ar":"أودي A6","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-a8-2026","family_slug":"car-audi-a8","brand":"audi","name":"Audi A8","name_ar":"أودي A8","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-q2-2026","family_slug":"car-audi-q2","brand":"audi","name":"Audi Q2","name_ar":"أودي Q2","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-q3-2026","family_slug":"car-audi-q3","brand":"audi","name":"Audi Q3","name_ar":"أودي Q3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-q5-2026","family_slug":"car-audi-q5","brand":"audi","name":"Audi Q5","name_ar":"أودي Q5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-q7-2026","family_slug":"car-audi-q7","brand":"audi","name":"Audi Q7","name_ar":"أودي Q7","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-q8-2026","family_slug":"car-audi-q8","brand":"audi","name":"Audi Q8","name_ar":"أودي Q8","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-audi-e-tron-2026","family_slug":"car-audi-e-tron","brand":"audi","name":"Audi e-tron","name_ar":"أودي e-tron","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volkswagen-golf-2026","family_slug":"car-volkswagen-golf","brand":"volkswagen","name":"Volkswagen Golf","name_ar":"فولكس واجن Golf","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volkswagen-jetta-2026","family_slug":"car-volkswagen-jetta","brand":"volkswagen","name":"Volkswagen Jetta","name_ar":"فولكس واجن Jetta","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volkswagen-passat-2026","family_slug":"car-volkswagen-passat","brand":"volkswagen","name":"Volkswagen Passat","name_ar":"فولكس واجن Passat","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volkswagen-tiguan-2026","family_slug":"car-volkswagen-tiguan","brand":"volkswagen","name":"Volkswagen Tiguan","name_ar":"فولكس واجن Tiguan","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volkswagen-touareg-2026","family_slug":"car-volkswagen-touareg","brand":"volkswagen","name":"Volkswagen Touareg","name_ar":"فولكس واجن Touareg","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volkswagen-teramont-2026","family_slug":"car-volkswagen-teramont","brand":"volkswagen","name":"Volkswagen Teramont","name_ar":"فولكس واجن Teramont","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volkswagen-id-4-2026","family_slug":"car-volkswagen-id-4","brand":"volkswagen","name":"Volkswagen ID.4","name_ar":"فولكس واجن ID.4","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volkswagen-id-7-2026","family_slug":"car-volkswagen-id-7","brand":"volkswagen","name":"Volkswagen ID.7","name_ar":"فولكس واجن ID.7","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-byd-atto-3-2026","family_slug":"car-byd-atto-3","brand":"byd","name":"BYD Atto 3","name_ar":"BYD Atto 3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-byd-seal-2026","family_slug":"car-byd-seal","brand":"byd","name":"BYD Seal","name_ar":"BYD Seal","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-byd-han-2026","family_slug":"car-byd-han","brand":"byd","name":"BYD Han","name_ar":"BYD Han","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-byd-song-plus-2026","family_slug":"car-byd-song-plus","brand":"byd","name":"BYD Song Plus","name_ar":"BYD Song Plus","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-byd-qin-plus-2026","family_slug":"car-byd-qin-plus","brand":"byd","name":"BYD Qin Plus","name_ar":"BYD Qin Plus","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-byd-song-plus-dm-i-2026","family_slug":"car-byd-song-plus-dm-i","brand":"byd","name":"BYD Song Plus DM-i","name_ar":"BYD Song Plus DM-i","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-byd-seagull-2026","family_slug":"car-byd-seagull","brand":"byd","name":"BYD Seagull","name_ar":"BYD Seagull","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-byd-dolphin-2026","family_slug":"car-byd-dolphin","brand":"byd","name":"BYD Dolphin","name_ar":"BYD Dolphin","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-exeed-lx-2026","family_slug":"car-exeed-lx","brand":"exeed","name":"Exeed LX","name_ar":"إكسيد LX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-exeed-txl-2026","family_slug":"car-exeed-txl","brand":"exeed","name":"Exeed TXL","name_ar":"إكسيد TXL","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-exeed-vx-2026","family_slug":"car-exeed-vx","brand":"exeed","name":"Exeed VX","name_ar":"إكسيد VX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-exeed-rx-2026","family_slug":"car-exeed-rx","brand":"exeed","name":"Exeed RX","name_ar":"إكسيد RX","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-exeed-es-2026","family_slug":"car-exeed-es","brand":"exeed","name":"Exeed ES","name_ar":"إكسيد ES","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hongqi-h5-2026","family_slug":"car-hongqi-h5","brand":"hongqi","name":"Hongqi H5","name_ar":"هونشي H5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hongqi-h6-2026","family_slug":"car-hongqi-h6","brand":"hongqi","name":"Hongqi H6","name_ar":"هونشي H6","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hongqi-h9-2026","family_slug":"car-hongqi-h9","brand":"hongqi","name":"Hongqi H9","name_ar":"هونشي H9","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hongqi-hs3-2026","family_slug":"car-hongqi-hs3","brand":"hongqi","name":"Hongqi HS3","name_ar":"هونشي HS3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hongqi-hs5-2026","family_slug":"car-hongqi-hs5","brand":"hongqi","name":"Hongqi HS5","name_ar":"هونشي HS5","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hongqi-hs7-2026","family_slug":"car-hongqi-hs7","brand":"hongqi","name":"Hongqi HS7","name_ar":"هونشي HS7","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-hongqi-e-hs9-2026","family_slug":"car-hongqi-e-hs9","brand":"hongqi","name":"Hongqi E-HS9","name_ar":"هونشي E-HS9","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-greatwall-poer-2026","family_slug":"car-greatwall-poer","brand":"greatwall","name":"Great Wall Poer","name_ar":"جريت وول Poer","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-greatwall-poer-king-kong-2026","family_slug":"car-greatwall-poer-king-kong","brand":"greatwall","name":"Great Wall Poer King Kong","name_ar":"جريت وول Poer King Kong","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-greatwall-wingle-2026","family_slug":"car-greatwall-wingle","brand":"greatwall","name":"Great Wall Wingle","name_ar":"جريت وول Wingle","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-greatwall-tank-300-2026","family_slug":"car-greatwall-tank-300","brand":"greatwall","name":"Great Wall Tank 300","name_ar":"جريت وول Tank 300","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-greatwall-tank-500-2026","family_slug":"car-greatwall-tank-500","brand":"greatwall","name":"Great Wall Tank 500","name_ar":"جريت وول Tank 500","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-greatwall-tank-700-2026","family_slug":"car-greatwall-tank-700","brand":"greatwall","name":"Great Wall Tank 700","name_ar":"جريت وول Tank 700","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-tank-tank-300-2026","family_slug":"car-tank-tank-300","brand":"tank","name":"Tank Tank 300","name_ar":"تانك Tank 300","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-tank-tank-500-2026","family_slug":"car-tank-tank-500","brand":"tank","name":"Tank Tank 500","name_ar":"تانك Tank 500","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-tank-tank-700-2026","family_slug":"car-tank-tank-700","brand":"tank","name":"Tank Tank 700","name_ar":"تانك Tank 700","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-tank-tank-800-2026","family_slug":"car-tank-tank-800","brand":"tank","name":"Tank Tank 800","name_ar":"تانك Tank 800","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jac-js3-2026","family_slug":"car-jac-js3","brand":"jac","name":"JAC JS3","name_ar":"جاك JS3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jac-js4-2026","family_slug":"car-jac-js4","brand":"jac","name":"JAC JS4","name_ar":"جاك JS4","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jac-js6-2026","family_slug":"car-jac-js6","brand":"jac","name":"JAC JS6","name_ar":"جاك JS6","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jac-js8-2026","family_slug":"car-jac-js8","brand":"jac","name":"JAC JS8","name_ar":"جاك JS8","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jac-t8-2026","family_slug":"car-jac-t8","brand":"jac","name":"JAC T8","name_ar":"جاك T8","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jac-t9-2026","family_slug":"car-jac-t9","brand":"jac","name":"JAC T9","name_ar":"جاك T9","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-jac-x200-2026","family_slug":"car-jac-x200","brand":"jac","name":"JAC X200","name_ar":"جاك X200","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mahindra-xuv700-2026","family_slug":"car-mahindra-xuv700","brand":"mahindra","name":"Mahindra XUV700","name_ar":"ماهيندرا XUV700","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mahindra-scorpio-2026","family_slug":"car-mahindra-scorpio","brand":"mahindra","name":"Mahindra Scorpio","name_ar":"ماهيندرا Scorpio","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mahindra-scorpio-n-2026","family_slug":"car-mahindra-scorpio-n","brand":"mahindra","name":"Mahindra Scorpio-N","name_ar":"ماهيندرا Scorpio-N","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mahindra-thar-2026","family_slug":"car-mahindra-thar","brand":"mahindra","name":"Mahindra Thar","name_ar":"ماهيندرا Thar","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-mahindra-pik-up-2026","family_slug":"car-mahindra-pik-up","brand":"mahindra","name":"Mahindra Pik Up","name_ar":"ماهيندرا Pik Up","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-renault-symbol-2026","family_slug":"car-renault-symbol","brand":"renault","name":"Renault Symbol","name_ar":"رينو Symbol","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-renault-duster-2026","family_slug":"car-renault-duster","brand":"renault","name":"Renault Duster","name_ar":"رينو Duster","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-renault-koleos-2026","family_slug":"car-renault-koleos","brand":"renault","name":"Renault Koleos","name_ar":"رينو Koleos","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-renault-arkana-2026","family_slug":"car-renault-arkana","brand":"renault","name":"Renault Arkana","name_ar":"رينو Arkana","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-renault-megane-2026","family_slug":"car-renault-megane","brand":"renault","name":"Renault Megane","name_ar":"رينو Megane","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-renault-master-2026","family_slug":"car-renault-master","brand":"renault","name":"Renault Master","name_ar":"رينو Master","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-renault-express-2026","family_slug":"car-renault-express","brand":"renault","name":"Renault Express","name_ar":"رينو Express","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-peugeot-208-2026","family_slug":"car-peugeot-208","brand":"peugeot","name":"Peugeot 208","name_ar":"بيجو 208","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-peugeot-2008-2026","family_slug":"car-peugeot-2008","brand":"peugeot","name":"Peugeot 2008","name_ar":"بيجو 2008","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-peugeot-3008-2026","family_slug":"car-peugeot-3008","brand":"peugeot","name":"Peugeot 3008","name_ar":"بيجو 3008","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-peugeot-5008-2026","family_slug":"car-peugeot-5008","brand":"peugeot","name":"Peugeot 5008","name_ar":"بيجو 5008","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-peugeot-408-2026","family_slug":"car-peugeot-408","brand":"peugeot","name":"Peugeot 408","name_ar":"بيجو 408","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-peugeot-508-2026","family_slug":"car-peugeot-508","brand":"peugeot","name":"Peugeot 508","name_ar":"بيجو 508","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-peugeot-partner-2026","family_slug":"car-peugeot-partner","brand":"peugeot","name":"Peugeot Partner","name_ar":"بيجو Partner","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-landrover-range-rover-2026","family_slug":"car-landrover-range-rover","brand":"landrover","name":"Land Rover Range Rover","name_ar":"لاند روفر Range Rover","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-landrover-range-rover-sport-2026","family_slug":"car-landrover-range-rover-sport","brand":"landrover","name":"Land Rover Range Rover Sport","name_ar":"لاند روفر Range Rover Sport","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-landrover-range-rover-velar-2026","family_slug":"car-landrover-range-rover-velar","brand":"landrover","name":"Land Rover Range Rover Velar","name_ar":"لاند روفر Range Rover Velar","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-landrover-range-rover-evoque-2026","family_slug":"car-landrover-range-rover-evoque","brand":"landrover","name":"Land Rover Range Rover Evoque","name_ar":"لاند روفر Range Rover Evoque","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-landrover-defender-2026","family_slug":"car-landrover-defender","brand":"landrover","name":"Land Rover Defender","name_ar":"لاند روفر Defender","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-landrover-discovery-2026","family_slug":"car-landrover-discovery","brand":"landrover","name":"Land Rover Discovery","name_ar":"لاند روفر Discovery","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-landrover-discovery-sport-2026","family_slug":"car-landrover-discovery-sport","brand":"landrover","name":"Land Rover Discovery Sport","name_ar":"لاند روفر Discovery Sport","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volvo-s60-2026","family_slug":"car-volvo-s60","brand":"volvo","name":"Volvo S60","name_ar":"فولفو S60","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volvo-s90-2026","family_slug":"car-volvo-s90","brand":"volvo","name":"Volvo S90","name_ar":"فولفو S90","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volvo-xc40-2026","family_slug":"car-volvo-xc40","brand":"volvo","name":"Volvo XC40","name_ar":"فولفو XC40","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volvo-xc60-2026","family_slug":"car-volvo-xc60","brand":"volvo","name":"Volvo XC60","name_ar":"فولفو XC60","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volvo-xc90-2026","family_slug":"car-volvo-xc90","brand":"volvo","name":"Volvo XC90","name_ar":"فولفو XC90","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volvo-ex30-2026","family_slug":"car-volvo-ex30","brand":"volvo","name":"Volvo EX30","name_ar":"فولفو EX30","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volvo-ex40-2026","family_slug":"car-volvo-ex40","brand":"volvo","name":"Volvo EX40","name_ar":"فولفو EX40","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-volvo-ex90-2026","family_slug":"car-volvo-ex90","brand":"volvo","name":"Volvo EX90","name_ar":"فولفو EX90","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-porsche-718-cayman-2026","family_slug":"car-porsche-718-cayman","brand":"porsche","name":"Porsche 718 Cayman","name_ar":"بورشه 718 Cayman","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-porsche-718-boxster-2026","family_slug":"car-porsche-718-boxster","brand":"porsche","name":"Porsche 718 Boxster","name_ar":"بورشه 718 Boxster","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-porsche-911-2026","family_slug":"car-porsche-911","brand":"porsche","name":"Porsche 911","name_ar":"بورشه 911","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-porsche-taycan-2026","family_slug":"car-porsche-taycan","brand":"porsche","name":"Porsche Taycan","name_ar":"بورشه Taycan","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-porsche-panamera-2026","family_slug":"car-porsche-panamera","brand":"porsche","name":"Porsche Panamera","name_ar":"بورشه Panamera","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-porsche-macan-2026","family_slug":"car-porsche-macan","brand":"porsche","name":"Porsche Macan","name_ar":"بورشه Macan","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-porsche-cayenne-2026","family_slug":"car-porsche-cayenne","brand":"porsche","name":"Porsche Cayenne","name_ar":"بورشه Cayenne","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-tesla-model-3-2026","family_slug":"car-tesla-model-3","brand":"tesla","name":"Tesla Model 3","name_ar":"تسلا Model 3","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-tesla-model-y-2026","family_slug":"car-tesla-model-y","brand":"tesla","name":"Tesla Model Y","name_ar":"تسلا Model Y","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-tesla-model-s-2026","family_slug":"car-tesla-model-s","brand":"tesla","name":"Tesla Model S","name_ar":"تسلا Model S","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-tesla-model-x-2026","family_slug":"car-tesla-model-x","brand":"tesla","name":"Tesla Model X","name_ar":"تسلا Model X","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-tesla-cybertruck-2026","family_slug":"car-tesla-cybertruck","brand":"tesla","name":"Tesla Cybertruck","name_ar":"تسلا Cybertruck","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lucid-air-2026","family_slug":"car-lucid-air","brand":"lucid","name":"Lucid Air","name_ar":"لوسيد Air","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-lucid-gravity-2026","family_slug":"car-lucid-gravity","brand":"lucid","name":"Lucid Gravity","name_ar":"لوسيد Gravity","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-genesis-g70-2026","family_slug":"car-genesis-g70","brand":"genesis","name":"Genesis G70","name_ar":"جينيسيس G70","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-genesis-g80-2026","family_slug":"car-genesis-g80","brand":"genesis","name":"Genesis G80","name_ar":"جينيسيس G80","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-genesis-g90-2026","family_slug":"car-genesis-g90","brand":"genesis","name":"Genesis G90","name_ar":"جينيسيس G90","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-genesis-gv60-2026","family_slug":"car-genesis-gv60","brand":"genesis","name":"Genesis GV60","name_ar":"جينيسيس GV60","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-genesis-gv70-2026","family_slug":"car-genesis-gv70","brand":"genesis","name":"Genesis GV70","name_ar":"جينيسيس GV70","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-genesis-gv80-2026","family_slug":"car-genesis-gv80","brand":"genesis","name":"Genesis GV80","name_ar":"جينيسيس GV80","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}},{"slug":"car-genesis-gv80-coupe-2026","family_slug":"car-genesis-gv80-coupe","brand":"genesis","name":"Genesis GV80 Coupe","name_ar":"جينيسيس GV80 Coupe","model_year":2026,"trim":"غير محددة","specs":{"engine":null,"power":null,"fuel":null}}],"stores":[{"id":"toyota-brand-site","name":"Toyota السعودية (موقع العلامة)","name_ar":"Toyota السعودية (موقع العلامة)"},{"id":"hyundai-brand-site","name":"موزعو هيونداي في السعودية (موقع العلامة)","name_ar":"موزعو هيونداي في السعودية (موقع العلامة)"},{"id":"kia-brand-site","name":"كيا الجبر (موقع العلامة)","name_ar":"كيا الجبر (موقع العلامة)"},{"id":"nissan-brand-site","name":"نيسان السعودية (موقع العلامة)","name_ar":"نيسان السعودية (موقع العلامة)"},{"id":"mg-brand-site","name":"MG السعودية (موقع العلامة)","name_ar":"MG السعودية (موقع العلامة)"},{"id":"ford-brand-site","name":"Ford السعودية (موقع العلامة)","name_ar":"Ford السعودية (موقع العلامة)"},{"id":"honda-brand-site","name":"Honda السعودية (موقع العلامة)","name_ar":"Honda السعودية (موقع العلامة)"},{"id":"suzuki-brand-site","name":"Suzuki السعودية (موقع العلامة)","name_ar":"Suzuki السعودية (موقع العلامة)"},{"id":"changan-brand-site","name":"Changan السعودية (موقع العلامة)","name_ar":"Changan السعودية (موقع العلامة)"}]},"sources":[{"id":"legacy-site-data","name":"بيانات الموقع الحالية (قبل MVP)","vertical":"electronics","permission_basis":"أسعار مرجعية مُدخلة يدويًا في الموقع الحالي — غير موثقة وتاريخها غير مؤكد"},{"id":"legacy-site-cars","name":"بيانات السيارات في الموقع الحالي (قبل MVP)","vertical":"cars","permission_basis":"أسعار سيارات مرجعية مُدخلة يدويًا في الموقع الحالي (app/data/cars.ts) — غير موثقة وتاريخها غير مؤكد، ولا تُعامل كأسعار وكلاء رسمية"}],"imports":[{"source":"legacy-site-data","file_name":"app-data-products.json","origin":"app/data/products.ts","rows":[{"store_id":"apple","offer_key":"legacy-1-apple","condition":"new","amount":"3799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 256GB","url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-17","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-17","product_slug":"p-1-iphone-17-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-1-amazon","condition":"new","amount":"3749","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 256GB","url":"https://www.amazon.sa/s?k=iPhone+17+256GB","canonical_url":"https://www.amazon.sa/s?k=iPhone+17+256GB","product_slug":"p-1-iphone-17-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-1-noon","condition":"new","amount":"3787","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 256GB","url":"https://www.noon.com/saudi-en/search?q=iPhone+17+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=iPhone+17+256GB","product_slug":"p-1-iphone-17-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-1-jarir","condition":"new","amount":"3799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 256GB","url":"https://www.jarir.com/sa-en/search.html?q=iPhone+17+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=iPhone+17+256GB","product_slug":"p-1-iphone-17-256gb","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-2-apple","condition":"new","amount":"4799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 512GB","url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-17","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-17","product_slug":"p-2-iphone-17-512gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-2-amazon","condition":"new","amount":"4749","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 512GB","url":"https://www.amazon.sa/s?k=iPhone+17+512GB","canonical_url":"https://www.amazon.sa/s?k=iPhone+17+512GB","product_slug":"p-2-iphone-17-512gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-2-noon","condition":"new","amount":"4799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 512GB","url":"https://www.noon.com/saudi-en/search?q=iPhone+17+512GB","canonical_url":"https://www.noon.com/saudi-en/search?q=iPhone+17+512GB","product_slug":"p-2-iphone-17-512gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-2-jarir","condition":"new","amount":"4799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 512GB","url":"https://www.jarir.com/sa-en/search.html?q=iPhone+17+512GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=iPhone+17+512GB","product_slug":"p-2-iphone-17-512gb","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-3-apple","condition":"new","amount":"5199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 Pro 256GB","url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-17-pro","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-17-pro","product_slug":"p-3-iphone-17-pro-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-3-amazon","condition":"new","amount":"5099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 Pro 256GB","url":"https://www.amazon.sa/s?k=iPhone+17+Pro+256GB","canonical_url":"https://www.amazon.sa/s?k=iPhone+17+Pro+256GB","product_slug":"p-3-iphone-17-pro-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-3-noon","condition":"new","amount":"5149","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 Pro 256GB","url":"https://www.noon.com/saudi-en/search?q=iPhone+17+Pro+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=iPhone+17+Pro+256GB","product_slug":"p-3-iphone-17-pro-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-3-jarir","condition":"new","amount":"5199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 Pro 256GB","url":"https://www.jarir.com/sa-en/search.html?q=iPhone+17+Pro+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=iPhone+17+Pro+256GB","product_slug":"p-3-iphone-17-pro-256gb","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-4-apple","condition":"new","amount":"5699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 Pro Max 256GB","url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-17-pro","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-17-pro","product_slug":"p-4-iphone-17-pro-max-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-4-amazon","condition":"new","amount":"5599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 Pro Max 256GB","url":"https://www.amazon.sa/s?k=iPhone+17+Pro+Max+256GB","canonical_url":"https://www.amazon.sa/s?k=iPhone+17+Pro+Max+256GB","product_slug":"p-4-iphone-17-pro-max-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-4-noon","condition":"new","amount":"5649","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 Pro Max 256GB","url":"https://www.noon.com/saudi-en/search?q=iPhone+17+Pro+Max+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=iPhone+17+Pro+Max+256GB","product_slug":"p-4-iphone-17-pro-max-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-4-jarir","condition":"new","amount":"5699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 17 Pro Max 256GB","url":"https://www.jarir.com/sa-en/search.html?q=iPhone+17+Pro+Max+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=iPhone+17+Pro+Max+256GB","product_slug":"p-4-iphone-17-pro-max-256gb","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-5-apple","condition":"new","amount":"3299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 16 128GB","url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-16","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/iphone-16","product_slug":"p-5-iphone-16-128gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-5-amazon","condition":"new","amount":"2999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 16 128GB","url":"https://www.amazon.sa/s?k=iPhone+16+128GB","canonical_url":"https://www.amazon.sa/s?k=iPhone+16+128GB","product_slug":"p-5-iphone-16-128gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-5-noon","condition":"new","amount":"3099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 16 128GB","url":"https://www.noon.com/saudi-en/search?q=iPhone+16+128GB","canonical_url":"https://www.noon.com/saudi-en/search?q=iPhone+16+128GB","product_slug":"p-5-iphone-16-128gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-5-jarir","condition":"new","amount":"3199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 16 128GB","url":"https://www.jarir.com/sa-en/search.html?q=iPhone+16+128GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=iPhone+16+128GB","product_slug":"p-5-iphone-16-128gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-6-amazon","condition":"new","amount":"2499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 15 128GB","url":"https://www.amazon.sa/s?k=iPhone+15+128GB","canonical_url":"https://www.amazon.sa/s?k=iPhone+15+128GB","product_slug":"p-6-iphone-15-128gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-6-noon","condition":"new","amount":"2599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 15 128GB","url":"https://www.noon.com/saudi-en/search?q=iPhone+15+128GB","canonical_url":"https://www.noon.com/saudi-en/search?q=iPhone+15+128GB","product_slug":"p-6-iphone-15-128gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-6-jarir","condition":"new","amount":"2699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 15 128GB","url":"https://www.jarir.com/sa-en/search.html?q=iPhone+15+128GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=iPhone+15+128GB","product_slug":"p-6-iphone-15-128gb","date_confirmed":false},{"store_id":"extra","offer_key":"legacy-6-extra","condition":"new","amount":"2649","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPhone 15 128GB","url":"https://www.extra.com/en-sa/search/?text=iPhone+15+128GB","canonical_url":"https://www.extra.com/en-sa/search/?text=iPhone+15+128GB","product_slug":"p-6-iphone-15-128gb","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-20-apple","condition":"new","amount":"2099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad 128GB Wi-Fi","url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-ipad/ipad","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-ipad/ipad","product_slug":"p-20-ipad-128gb-wi-fi","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-20-amazon","condition":"new","amount":"1999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad 128GB Wi-Fi","url":"https://www.amazon.sa/s?k=iPad+128GB","canonical_url":"https://www.amazon.sa/s?k=iPad+128GB","product_slug":"p-20-ipad-128gb-wi-fi","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-20-noon","condition":"new","amount":"2049","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad 128GB Wi-Fi","url":"https://www.noon.com/saudi-en/search?q=iPad+128GB","canonical_url":"https://www.noon.com/saudi-en/search?q=iPad+128GB","product_slug":"p-20-ipad-128gb-wi-fi","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-20-jarir","condition":"new","amount":"2099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad 128GB Wi-Fi","url":"https://www.jarir.com/sa-en/search.html?q=iPad+128GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=iPad+128GB","product_slug":"p-20-ipad-128gb-wi-fi","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-21-apple","condition":"new","amount":"3949","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad Air M4 11 256GB","url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-ipad/ipad-air","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-ipad/ipad-air","product_slug":"p-21-ipad-air-m4-11-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-21-amazon","condition":"new","amount":"3799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad Air M4 11 256GB","url":"https://www.amazon.sa/s?k=iPad+Air+M4+256GB","canonical_url":"https://www.amazon.sa/s?k=iPad+Air+M4+256GB","product_slug":"p-21-ipad-air-m4-11-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-21-noon","condition":"new","amount":"3899","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad Air M4 11 256GB","url":"https://www.noon.com/saudi-en/search?q=iPad+Air+M4+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=iPad+Air+M4+256GB","product_slug":"p-21-ipad-air-m4-11-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-21-jarir","condition":"new","amount":"3949","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad Air M4 11 256GB","url":"https://www.jarir.com/sa-en/search.html?q=iPad+Air+M4+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=iPad+Air+M4+256GB","product_slug":"p-21-ipad-air-m4-11-256gb","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-22-apple","condition":"new","amount":"5599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad Pro M5 11 256GB","url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-ipad/ipad-pro","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-ipad/ipad-pro","product_slug":"p-22-ipad-pro-m5-11-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-22-amazon","condition":"new","amount":"5399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad Pro M5 11 256GB","url":"https://www.amazon.sa/s?k=iPad+Pro+M5+256GB","canonical_url":"https://www.amazon.sa/s?k=iPad+Pro+M5+256GB","product_slug":"p-22-ipad-pro-m5-11-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-22-noon","condition":"new","amount":"5499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad Pro M5 11 256GB","url":"https://www.noon.com/saudi-en/search?q=iPad+Pro+M5+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=iPad+Pro+M5+256GB","product_slug":"p-22-ipad-pro-m5-11-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-22-jarir","condition":"new","amount":"5599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"iPad Pro M5 11 256GB","url":"https://www.jarir.com/sa-en/search.html?q=iPad+Pro+M5+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=iPad+Pro+M5+256GB","product_slug":"p-22-ipad-pro-m5-11-256gb","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-30-apple","condition":"new","amount":"5999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MacBook Air 13 M5","url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-mac/macbook-air","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-mac/macbook-air","product_slug":"p-30-macbook-air-13-m5","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-30-amazon","condition":"new","amount":"5799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MacBook Air 13 M5","url":"https://www.amazon.sa/s?k=MacBook+Air+M5","canonical_url":"https://www.amazon.sa/s?k=MacBook+Air+M5","product_slug":"p-30-macbook-air-13-m5","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-30-noon","condition":"new","amount":"5899","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MacBook Air 13 M5","url":"https://www.noon.com/saudi-en/search?q=MacBook+Air+M5","canonical_url":"https://www.noon.com/saudi-en/search?q=MacBook+Air+M5","product_slug":"p-30-macbook-air-13-m5","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-30-jarir","condition":"new","amount":"5999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MacBook Air 13 M5","url":"https://www.jarir.com/sa-en/search.html?q=MacBook+Air+M5","canonical_url":"https://www.jarir.com/sa-en/search.html?q=MacBook+Air+M5","product_slug":"p-30-macbook-air-13-m5","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-31-apple","condition":"new","amount":"9499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MacBook Pro 14 M5","url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-mac","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-mac","product_slug":"p-31-macbook-pro-14-m5","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-31-amazon","condition":"new","amount":"9199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MacBook Pro 14 M5","url":"https://www.amazon.sa/s?k=MacBook+Pro+14+M5","canonical_url":"https://www.amazon.sa/s?k=MacBook+Pro+14+M5","product_slug":"p-31-macbook-pro-14-m5","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-31-noon","condition":"new","amount":"9349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MacBook Pro 14 M5","url":"https://www.noon.com/saudi-en/search?q=MacBook+Pro+14+M5","canonical_url":"https://www.noon.com/saudi-en/search?q=MacBook+Pro+14+M5","product_slug":"p-31-macbook-pro-14-m5","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-31-jarir","condition":"new","amount":"9499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MacBook Pro 14 M5","url":"https://www.jarir.com/sa-en/search.html?q=MacBook+Pro+14+M5","canonical_url":"https://www.jarir.com/sa-en/search.html?q=MacBook+Pro+14+M5","product_slug":"p-31-macbook-pro-14-m5","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-40-apple","condition":"new","amount":"1799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Apple Watch Series 11","url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-watch","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-watch","product_slug":"p-40-apple-watch-series-11","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-40-amazon","condition":"new","amount":"1699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Apple Watch Series 11","url":"https://www.amazon.sa/s?k=Apple+Watch+Series+11","canonical_url":"https://www.amazon.sa/s?k=Apple+Watch+Series+11","product_slug":"p-40-apple-watch-series-11","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-40-noon","condition":"new","amount":"1749","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Apple Watch Series 11","url":"https://www.noon.com/saudi-en/search?q=Apple+Watch+Series+11","canonical_url":"https://www.noon.com/saudi-en/search?q=Apple+Watch+Series+11","product_slug":"p-40-apple-watch-series-11","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-40-jarir","condition":"new","amount":"1799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Apple Watch Series 11","url":"https://www.jarir.com/sa-en/search.html?q=Apple+Watch+Series+11","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Apple+Watch+Series+11","product_slug":"p-40-apple-watch-series-11","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-41-apple","condition":"new","amount":"3599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Apple Watch Ultra 3","url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-watch","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-watch","product_slug":"p-41-apple-watch-ultra-3","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-41-amazon","condition":"new","amount":"3449","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Apple Watch Ultra 3","url":"https://www.amazon.sa/s?k=Apple+Watch+Ultra+3","canonical_url":"https://www.amazon.sa/s?k=Apple+Watch+Ultra+3","product_slug":"p-41-apple-watch-ultra-3","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-41-noon","condition":"new","amount":"3499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Apple Watch Ultra 3","url":"https://www.noon.com/saudi-en/search?q=Apple+Watch+Ultra+3","canonical_url":"https://www.noon.com/saudi-en/search?q=Apple+Watch+Ultra+3","product_slug":"p-41-apple-watch-ultra-3","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-41-jarir","condition":"new","amount":"3599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Apple Watch Ultra 3","url":"https://www.jarir.com/sa-en/search.html?q=Apple+Watch+Ultra+3","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Apple+Watch+Ultra+3","product_slug":"p-41-apple-watch-ultra-3","date_confirmed":false},{"store_id":"apple","offer_key":"legacy-42-apple","condition":"new","amount":"1049","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"AirPods Pro 3","url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-airpods","canonical_url":"https://www.apple.com/sa-ar/shop/buy-iphone/../buy-airpods","product_slug":"p-42-airpods-pro-3","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-42-amazon","condition":"new","amount":"949","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"AirPods Pro 3","url":"https://www.amazon.sa/s?k=AirPods+Pro+3","canonical_url":"https://www.amazon.sa/s?k=AirPods+Pro+3","product_slug":"p-42-airpods-pro-3","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-42-noon","condition":"new","amount":"999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"AirPods Pro 3","url":"https://www.noon.com/saudi-en/search?q=AirPods+Pro+3","canonical_url":"https://www.noon.com/saudi-en/search?q=AirPods+Pro+3","product_slug":"p-42-airpods-pro-3","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-42-jarir","condition":"new","amount":"1049","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"AirPods Pro 3","url":"https://www.jarir.com/sa-en/search.html?q=AirPods+Pro+3","canonical_url":"https://www.jarir.com/sa-en/search.html?q=AirPods+Pro+3","product_slug":"p-42-airpods-pro-3","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-100-samsung","condition":"new","amount":"3499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 256GB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-100-galaxy-s26-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-100-amazon","condition":"new","amount":"3349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 256GB","url":"https://www.amazon.sa/s?k=Galaxy+S26+256GB","canonical_url":"https://www.amazon.sa/s?k=Galaxy+S26+256GB","product_slug":"p-100-galaxy-s26-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-100-noon","condition":"new","amount":"3399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 256GB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+256GB","product_slug":"p-100-galaxy-s26-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-100-jarir","condition":"new","amount":"3499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 256GB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+256GB","product_slug":"p-100-galaxy-s26-256gb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-101-samsung","condition":"new","amount":"4599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 512GB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-101-galaxy-s26-512gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-101-amazon","condition":"new","amount":"4399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 512GB","url":"https://www.amazon.sa/s?k=Galaxy+S26+512GB","canonical_url":"https://www.amazon.sa/s?k=Galaxy+S26+512GB","product_slug":"p-101-galaxy-s26-512gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-101-noon","condition":"new","amount":"4499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 512GB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+512GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+512GB","product_slug":"p-101-galaxy-s26-512gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-101-jarir","condition":"new","amount":"4599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 512GB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+512GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+512GB","product_slug":"p-101-galaxy-s26-512gb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-102-samsung","condition":"new","amount":"5349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26+ 512GB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-102-galaxy-s26-512gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-102-amazon","condition":"new","amount":"5149","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26+ 512GB","url":"https://www.amazon.sa/s?k=Galaxy+S26++512GB","canonical_url":"https://www.amazon.sa/s?k=Galaxy+S26++512GB","product_slug":"p-102-galaxy-s26-512gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-102-noon","condition":"new","amount":"5249","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26+ 512GB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26++512GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26++512GB","product_slug":"p-102-galaxy-s26-512gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-102-jarir","condition":"new","amount":"5349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26+ 512GB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26++512GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26++512GB","product_slug":"p-102-galaxy-s26-512gb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-103-samsung","condition":"new","amount":"5499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 256GB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-103-galaxy-s26-ultra-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-103-amazon","condition":"new","amount":"5199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 256GB","url":"https://www.amazon.sa/s?k=Galaxy+S26+Ultra+256GB","canonical_url":"https://www.amazon.sa/s?k=Galaxy+S26+Ultra+256GB","product_slug":"p-103-galaxy-s26-ultra-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-103-noon","condition":"new","amount":"5299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 256GB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+Ultra+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+Ultra+256GB","product_slug":"p-103-galaxy-s26-ultra-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-103-jarir","condition":"new","amount":"5399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 256GB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+Ultra+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+Ultra+256GB","product_slug":"p-103-galaxy-s26-ultra-256gb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-104-samsung","condition":"new","amount":"6299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 512GB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-104-galaxy-s26-ultra-512gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-104-amazon","condition":"new","amount":"5999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 512GB","url":"https://www.amazon.sa/s?k=Galaxy+S26+Ultra+512GB","canonical_url":"https://www.amazon.sa/s?k=Galaxy+S26+Ultra+512GB","product_slug":"p-104-galaxy-s26-ultra-512gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-104-noon","condition":"new","amount":"6099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 512GB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+Ultra+512GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+Ultra+512GB","product_slug":"p-104-galaxy-s26-ultra-512gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-104-jarir","condition":"new","amount":"6199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 512GB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+Ultra+512GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+Ultra+512GB","product_slug":"p-104-galaxy-s26-ultra-512gb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-105-samsung","condition":"new","amount":"7499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 1TB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-105-galaxy-s26-ultra-1tb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-105-amazon","condition":"new","amount":"7199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 1TB","url":"https://www.amazon.sa/s?k=Galaxy+S26+Ultra+1TB","canonical_url":"https://www.amazon.sa/s?k=Galaxy+S26+Ultra+1TB","product_slug":"p-105-galaxy-s26-ultra-1tb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-105-noon","condition":"new","amount":"7299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 1TB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+Ultra+1TB","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+S26+Ultra+1TB","product_slug":"p-105-galaxy-s26-ultra-1tb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-105-jarir","condition":"new","amount":"7399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy S26 Ultra 1TB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+Ultra+1TB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+S26+Ultra+1TB","product_slug":"p-105-galaxy-s26-ultra-1tb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-110-samsung","condition":"new","amount":"1799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy A57 256GB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-110-galaxy-a57-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-110-amazon","condition":"new","amount":"1699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy A57 256GB","url":"https://www.amazon.sa/s?k=Galaxy+A57+256GB","canonical_url":"https://www.amazon.sa/s?k=Galaxy+A57+256GB","product_slug":"p-110-galaxy-a57-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-110-noon","condition":"new","amount":"1749","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy A57 256GB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+A57+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+A57+256GB","product_slug":"p-110-galaxy-a57-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-110-jarir","condition":"new","amount":"1799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy A57 256GB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+A57+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+A57+256GB","product_slug":"p-110-galaxy-a57-256gb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-111-samsung","condition":"new","amount":"1399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy A37 256GB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-111-galaxy-a37-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-111-amazon","condition":"new","amount":"1299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy A37 256GB","url":"https://www.amazon.sa/s?k=Galaxy+A37+256GB","canonical_url":"https://www.amazon.sa/s?k=Galaxy+A37+256GB","product_slug":"p-111-galaxy-a37-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-111-noon","condition":"new","amount":"1349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy A37 256GB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+A37+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+A37+256GB","product_slug":"p-111-galaxy-a37-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-111-jarir","condition":"new","amount":"1399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy A37 256GB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+A37+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+A37+256GB","product_slug":"p-111-galaxy-a37-256gb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-120-samsung","condition":"new","amount":"4299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Tab S11 256GB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-120-galaxy-tab-s11-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-120-amazon","condition":"new","amount":"4099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Tab S11 256GB","url":"https://www.amazon.sa/s?k=Galaxy+Tab+S11+256GB","canonical_url":"https://www.amazon.sa/s?k=Galaxy+Tab+S11+256GB","product_slug":"p-120-galaxy-tab-s11-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-120-noon","condition":"new","amount":"4199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Tab S11 256GB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+Tab+S11+256GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+Tab+S11+256GB","product_slug":"p-120-galaxy-tab-s11-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-120-jarir","condition":"new","amount":"4299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Tab S11 256GB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+Tab+S11+256GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+Tab+S11+256GB","product_slug":"p-120-galaxy-tab-s11-256gb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-121-samsung","condition":"new","amount":"5599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Tab S11 Ultra 256GB","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-121-galaxy-tab-s11-ultra-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-121-amazon","condition":"new","amount":"5399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Tab S11 Ultra 256GB","url":"https://www.amazon.sa/s?k=Galaxy+Tab+S11+Ultra","canonical_url":"https://www.amazon.sa/s?k=Galaxy+Tab+S11+Ultra","product_slug":"p-121-galaxy-tab-s11-ultra-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-121-noon","condition":"new","amount":"5499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Tab S11 Ultra 256GB","url":"https://www.noon.com/saudi-en/search?q=Galaxy+Tab+S11+Ultra","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+Tab+S11+Ultra","product_slug":"p-121-galaxy-tab-s11-ultra-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-121-jarir","condition":"new","amount":"5599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Tab S11 Ultra 256GB","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+Tab+S11+Ultra","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+Tab+S11+Ultra","product_slug":"p-121-galaxy-tab-s11-ultra-256gb","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-130-samsung","condition":"new","amount":"1199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Watch8 40mm","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-130-galaxy-watch8-40mm","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-130-amazon","condition":"new","amount":"1099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Watch8 40mm","url":"https://www.amazon.sa/s?k=Galaxy+Watch8+40mm","canonical_url":"https://www.amazon.sa/s?k=Galaxy+Watch8+40mm","product_slug":"p-130-galaxy-watch8-40mm","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-130-noon","condition":"new","amount":"1149","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Watch8 40mm","url":"https://www.noon.com/saudi-en/search?q=Galaxy+Watch8+40mm","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+Watch8+40mm","product_slug":"p-130-galaxy-watch8-40mm","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-130-jarir","condition":"new","amount":"1199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Watch8 40mm","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+Watch8+40mm","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+Watch8+40mm","product_slug":"p-130-galaxy-watch8-40mm","date_confirmed":false},{"store_id":"samsung","offer_key":"legacy-131-samsung","condition":"new","amount":"1299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Watch8 44mm","url":"https://www.samsung.com/sa_en/sa_en","canonical_url":"https://www.samsung.com/sa_en/sa_en","product_slug":"p-131-galaxy-watch8-44mm","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-131-amazon","condition":"new","amount":"1199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Watch8 44mm","url":"https://www.amazon.sa/s?k=Galaxy+Watch8+44mm","canonical_url":"https://www.amazon.sa/s?k=Galaxy+Watch8+44mm","product_slug":"p-131-galaxy-watch8-44mm","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-131-noon","condition":"new","amount":"1249","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Watch8 44mm","url":"https://www.noon.com/saudi-en/search?q=Galaxy+Watch8+44mm","canonical_url":"https://www.noon.com/saudi-en/search?q=Galaxy+Watch8+44mm","product_slug":"p-131-galaxy-watch8-44mm","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-131-jarir","condition":"new","amount":"1299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Galaxy Watch8 44mm","url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+Watch8+44mm","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Galaxy+Watch8+44mm","product_slug":"p-131-galaxy-watch8-44mm","date_confirmed":false},{"store_id":"extra","offer_key":"legacy-200-extra","condition":"new","amount":"3799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 17 512GB","url":"https://www.extra.com/en-sa/search/?text=Xiaomi+17+512GB","canonical_url":"https://www.extra.com/en-sa/search/?text=Xiaomi+17+512GB","product_slug":"p-200-xiaomi-17-512gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-200-amazon","condition":"new","amount":"3599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 17 512GB","url":"https://www.amazon.sa/s?k=Xiaomi+17+512GB","canonical_url":"https://www.amazon.sa/s?k=Xiaomi+17+512GB","product_slug":"p-200-xiaomi-17-512gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-200-noon","condition":"new","amount":"3699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 17 512GB","url":"https://www.noon.com/saudi-en/search?q=Xiaomi+17+512GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Xiaomi+17+512GB","product_slug":"p-200-xiaomi-17-512gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-200-jarir","condition":"new","amount":"3799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 17 512GB","url":"https://www.jarir.com/sa-en/search.html?q=Xiaomi+17+512GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Xiaomi+17+512GB","product_slug":"p-200-xiaomi-17-512gb","date_confirmed":false},{"store_id":"extra","offer_key":"legacy-201-extra","condition":"new","amount":"5299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 17 Ultra 512GB","url":"https://www.extra.com/en-sa/search/?text=Xiaomi+17+Ultra","canonical_url":"https://www.extra.com/en-sa/search/?text=Xiaomi+17+Ultra","product_slug":"p-201-xiaomi-17-ultra-512gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-201-amazon","condition":"new","amount":"5099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 17 Ultra 512GB","url":"https://www.amazon.sa/s?k=Xiaomi+17+Ultra","canonical_url":"https://www.amazon.sa/s?k=Xiaomi+17+Ultra","product_slug":"p-201-xiaomi-17-ultra-512gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-201-noon","condition":"new","amount":"5199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 17 Ultra 512GB","url":"https://www.noon.com/saudi-en/search?q=Xiaomi+17+Ultra","canonical_url":"https://www.noon.com/saudi-en/search?q=Xiaomi+17+Ultra","product_slug":"p-201-xiaomi-17-ultra-512gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-201-jarir","condition":"new","amount":"5299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 17 Ultra 512GB","url":"https://www.jarir.com/sa-en/search.html?q=Xiaomi+17+Ultra","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Xiaomi+17+Ultra","product_slug":"p-201-xiaomi-17-ultra-512gb","date_confirmed":false},{"store_id":"extra","offer_key":"legacy-202-extra","condition":"new","amount":"3499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 15 512GB","url":"https://www.extra.com/en-sa/search/?text=Xiaomi+15+512GB","canonical_url":"https://www.extra.com/en-sa/search/?text=Xiaomi+15+512GB","product_slug":"p-202-xiaomi-15-512gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-202-amazon","condition":"new","amount":"3299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 15 512GB","url":"https://www.amazon.sa/s?k=Xiaomi+15+512GB","canonical_url":"https://www.amazon.sa/s?k=Xiaomi+15+512GB","product_slug":"p-202-xiaomi-15-512gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-202-noon","condition":"new","amount":"3399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 15 512GB","url":"https://www.noon.com/saudi-en/search?q=Xiaomi+15+512GB","canonical_url":"https://www.noon.com/saudi-en/search?q=Xiaomi+15+512GB","product_slug":"p-202-xiaomi-15-512gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-202-jarir","condition":"new","amount":"3499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Xiaomi 15 512GB","url":"https://www.jarir.com/sa-en/search.html?q=Xiaomi+15+512GB","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Xiaomi+15+512GB","product_slug":"p-202-xiaomi-15-512gb","date_confirmed":false},{"store_id":"extra","offer_key":"legacy-203-extra","condition":"new","amount":"1349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Redmi Note 15 Pro 256GB","url":"https://www.extra.com/en-sa/search/?text=Redmi+Note+15+Pro","canonical_url":"https://www.extra.com/en-sa/search/?text=Redmi+Note+15+Pro","product_slug":"p-203-redmi-note-15-pro-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-203-amazon","condition":"new","amount":"1199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Redmi Note 15 Pro 256GB","url":"https://www.amazon.sa/s?k=Redmi+Note+15+Pro","canonical_url":"https://www.amazon.sa/s?k=Redmi+Note+15+Pro","product_slug":"p-203-redmi-note-15-pro-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-203-noon","condition":"new","amount":"1249","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Redmi Note 15 Pro 256GB","url":"https://www.noon.com/saudi-en/search?q=Redmi+Note+15+Pro","canonical_url":"https://www.noon.com/saudi-en/search?q=Redmi+Note+15+Pro","product_slug":"p-203-redmi-note-15-pro-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-203-jarir","condition":"new","amount":"1349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Redmi Note 15 Pro 256GB","url":"https://www.jarir.com/sa-en/search.html?q=Redmi+Note+15+Pro","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Redmi+Note+15+Pro","product_slug":"p-203-redmi-note-15-pro-256gb","date_confirmed":false},{"store_id":"huawei","offer_key":"legacy-300-huawei","condition":"new","amount":"3999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Huawei Pura 80 Pro","url":"https://consumer.huawei.com/sa-en/","canonical_url":"https://consumer.huawei.com/sa-en/","product_slug":"p-300-huawei-pura-80-pro","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-300-amazon","condition":"new","amount":"3799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Huawei Pura 80 Pro","url":"https://www.amazon.sa/s?k=Huawei+Pura+80+Pro","canonical_url":"https://www.amazon.sa/s?k=Huawei+Pura+80+Pro","product_slug":"p-300-huawei-pura-80-pro","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-300-noon","condition":"new","amount":"3899","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Huawei Pura 80 Pro","url":"https://www.noon.com/saudi-en/search?q=Huawei+Pura+80+Pro","canonical_url":"https://www.noon.com/saudi-en/search?q=Huawei+Pura+80+Pro","product_slug":"p-300-huawei-pura-80-pro","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-300-jarir","condition":"new","amount":"3999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Huawei Pura 80 Pro","url":"https://www.jarir.com/sa-en/search.html?q=Huawei+Pura+80+Pro","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Huawei+Pura+80+Pro","product_slug":"p-300-huawei-pura-80-pro","date_confirmed":false},{"store_id":"huawei","offer_key":"legacy-301-huawei","condition":"new","amount":"6999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Huawei Mate X7","url":"https://consumer.huawei.com/sa-en/","canonical_url":"https://consumer.huawei.com/sa-en/","product_slug":"p-301-huawei-mate-x7","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-301-amazon","condition":"new","amount":"6799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Huawei Mate X7","url":"https://www.amazon.sa/s?k=Huawei+Mate+X7","canonical_url":"https://www.amazon.sa/s?k=Huawei+Mate+X7","product_slug":"p-301-huawei-mate-x7","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-301-noon","condition":"new","amount":"6899","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Huawei Mate X7","url":"https://www.noon.com/saudi-en/search?q=Huawei+Mate+X7","canonical_url":"https://www.noon.com/saudi-en/search?q=Huawei+Mate+X7","product_slug":"p-301-huawei-mate-x7","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-301-jarir","condition":"new","amount":"6999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Huawei Mate X7","url":"https://www.jarir.com/sa-en/search.html?q=Huawei+Mate+X7","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Huawei+Mate+X7","product_slug":"p-301-huawei-mate-x7","date_confirmed":false},{"store_id":"honor","offer_key":"legacy-400-honor","condition":"new","amount":"3999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HONOR Magic8 Pro","url":"https://www.honor.com/sa/","canonical_url":"https://www.honor.com/sa/","product_slug":"p-400-honor-magic8-pro","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-400-amazon","condition":"new","amount":"3799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HONOR Magic8 Pro","url":"https://www.amazon.sa/s?k=HONOR+Magic8+Pro","canonical_url":"https://www.amazon.sa/s?k=HONOR+Magic8+Pro","product_slug":"p-400-honor-magic8-pro","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-400-noon","condition":"new","amount":"3899","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HONOR Magic8 Pro","url":"https://www.noon.com/saudi-en/search?q=HONOR+Magic8+Pro","canonical_url":"https://www.noon.com/saudi-en/search?q=HONOR+Magic8+Pro","product_slug":"p-400-honor-magic8-pro","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-400-jarir","condition":"new","amount":"3999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HONOR Magic8 Pro","url":"https://www.jarir.com/sa-en/search.html?q=HONOR+Magic8+Pro","canonical_url":"https://www.jarir.com/sa-en/search.html?q=HONOR+Magic8+Pro","product_slug":"p-400-honor-magic8-pro","date_confirmed":false},{"store_id":"honor","offer_key":"legacy-401-honor","condition":"new","amount":"2499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HONOR 400 Pro","url":"https://www.honor.com/sa/","canonical_url":"https://www.honor.com/sa/","product_slug":"p-401-honor-400-pro","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-401-amazon","condition":"new","amount":"2299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HONOR 400 Pro","url":"https://www.amazon.sa/s?k=HONOR+400+Pro","canonical_url":"https://www.amazon.sa/s?k=HONOR+400+Pro","product_slug":"p-401-honor-400-pro","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-401-noon","condition":"new","amount":"2399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HONOR 400 Pro","url":"https://www.noon.com/saudi-en/search?q=HONOR+400+Pro","canonical_url":"https://www.noon.com/saudi-en/search?q=HONOR+400+Pro","product_slug":"p-401-honor-400-pro","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-401-jarir","condition":"new","amount":"2499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HONOR 400 Pro","url":"https://www.jarir.com/sa-en/search.html?q=HONOR+400+Pro","canonical_url":"https://www.jarir.com/sa-en/search.html?q=HONOR+400+Pro","product_slug":"p-401-honor-400-pro","date_confirmed":false},{"store_id":"google","offer_key":"legacy-500-google","condition":"new","amount":"3999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Google Pixel 10 Pro 256GB","url":"https://store.google.com/","canonical_url":"https://store.google.com/","product_slug":"p-500-google-pixel-10-pro-256gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-500-amazon","condition":"new","amount":"3799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Google Pixel 10 Pro 256GB","url":"https://www.amazon.sa/s?k=Google+Pixel+10+Pro","canonical_url":"https://www.amazon.sa/s?k=Google+Pixel+10+Pro","product_slug":"p-500-google-pixel-10-pro-256gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-500-noon","condition":"new","amount":"3899","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Google Pixel 10 Pro 256GB","url":"https://www.noon.com/saudi-en/search?q=Google+Pixel+10+Pro","canonical_url":"https://www.noon.com/saudi-en/search?q=Google+Pixel+10+Pro","product_slug":"p-500-google-pixel-10-pro-256gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-500-jarir","condition":"new","amount":"3999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Google Pixel 10 Pro 256GB","url":"https://www.jarir.com/sa-en/search.html?q=Google+Pixel+10+Pro","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Google+Pixel+10+Pro","product_slug":"p-500-google-pixel-10-pro-256gb","date_confirmed":false},{"store_id":"google","offer_key":"legacy-501-google","condition":"new","amount":"2999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Google Pixel 10 128GB","url":"https://store.google.com/","canonical_url":"https://store.google.com/","product_slug":"p-501-google-pixel-10-128gb","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-501-amazon","condition":"new","amount":"2799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Google Pixel 10 128GB","url":"https://www.amazon.sa/s?k=Google+Pixel+10","canonical_url":"https://www.amazon.sa/s?k=Google+Pixel+10","product_slug":"p-501-google-pixel-10-128gb","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-501-noon","condition":"new","amount":"2899","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Google Pixel 10 128GB","url":"https://www.noon.com/saudi-en/search?q=Google+Pixel+10","canonical_url":"https://www.noon.com/saudi-en/search?q=Google+Pixel+10","product_slug":"p-501-google-pixel-10-128gb","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-501-jarir","condition":"new","amount":"2999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Google Pixel 10 128GB","url":"https://www.jarir.com/sa-en/search.html?q=Google+Pixel+10","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Google+Pixel+10","product_slug":"p-501-google-pixel-10-128gb","date_confirmed":false},{"store_id":"lenovo","offer_key":"legacy-600-lenovo","condition":"new","amount":"3299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Lenovo Yoga 7","url":"https://www.lenovo.com/sa/en/","canonical_url":"https://www.lenovo.com/sa/en/","product_slug":"p-600-lenovo-yoga-7","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-600-amazon","condition":"new","amount":"3099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Lenovo Yoga 7","url":"https://www.amazon.sa/s?k=Lenovo+Yoga+7","canonical_url":"https://www.amazon.sa/s?k=Lenovo+Yoga+7","product_slug":"p-600-lenovo-yoga-7","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-600-noon","condition":"new","amount":"3199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Lenovo Yoga 7","url":"https://www.noon.com/saudi-en/search?q=Lenovo+Yoga+7","canonical_url":"https://www.noon.com/saudi-en/search?q=Lenovo+Yoga+7","product_slug":"p-600-lenovo-yoga-7","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-600-jarir","condition":"new","amount":"3299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Lenovo Yoga 7","url":"https://www.jarir.com/sa-en/search.html?q=Lenovo+Yoga+7","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Lenovo+Yoga+7","product_slug":"p-600-lenovo-yoga-7","date_confirmed":false},{"store_id":"lenovo","offer_key":"legacy-601-lenovo","condition":"new","amount":"5499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Lenovo Legion 5","url":"https://www.lenovo.com/sa/en/","canonical_url":"https://www.lenovo.com/sa/en/","product_slug":"p-601-lenovo-legion-5","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-601-amazon","condition":"new","amount":"5199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Lenovo Legion 5","url":"https://www.amazon.sa/s?k=Lenovo+Legion+5","canonical_url":"https://www.amazon.sa/s?k=Lenovo+Legion+5","product_slug":"p-601-lenovo-legion-5","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-601-noon","condition":"new","amount":"5349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Lenovo Legion 5","url":"https://www.noon.com/saudi-en/search?q=Lenovo+Legion+5","canonical_url":"https://www.noon.com/saudi-en/search?q=Lenovo+Legion+5","product_slug":"p-601-lenovo-legion-5","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-601-jarir","condition":"new","amount":"5499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Lenovo Legion 5","url":"https://www.jarir.com/sa-en/search.html?q=Lenovo+Legion+5","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Lenovo+Legion+5","product_slug":"p-601-lenovo-legion-5","date_confirmed":false},{"store_id":"asus","offer_key":"legacy-700-asus","condition":"new","amount":"4499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"ASUS Zenbook 14","url":"https://www.asus.com/sa-en/","canonical_url":"https://www.asus.com/sa-en/","product_slug":"p-700-asus-zenbook-14","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-700-amazon","condition":"new","amount":"4299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"ASUS Zenbook 14","url":"https://www.amazon.sa/s?k=ASUS+Zenbook+14","canonical_url":"https://www.amazon.sa/s?k=ASUS+Zenbook+14","product_slug":"p-700-asus-zenbook-14","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-700-noon","condition":"new","amount":"4399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"ASUS Zenbook 14","url":"https://www.noon.com/saudi-en/search?q=ASUS+Zenbook+14","canonical_url":"https://www.noon.com/saudi-en/search?q=ASUS+Zenbook+14","product_slug":"p-700-asus-zenbook-14","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-700-jarir","condition":"new","amount":"4499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"ASUS Zenbook 14","url":"https://www.jarir.com/sa-en/search.html?q=ASUS+Zenbook+14","canonical_url":"https://www.jarir.com/sa-en/search.html?q=ASUS+Zenbook+14","product_slug":"p-700-asus-zenbook-14","date_confirmed":false},{"store_id":"asus","offer_key":"legacy-701-asus","condition":"new","amount":"8999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"ASUS ROG Zephyrus G16","url":"https://www.asus.com/sa-en/","canonical_url":"https://www.asus.com/sa-en/","product_slug":"p-701-asus-rog-zephyrus-g16","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-701-amazon","condition":"new","amount":"8599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"ASUS ROG Zephyrus G16","url":"https://www.amazon.sa/s?k=ASUS+ROG+Zephyrus+G16","canonical_url":"https://www.amazon.sa/s?k=ASUS+ROG+Zephyrus+G16","product_slug":"p-701-asus-rog-zephyrus-g16","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-701-noon","condition":"new","amount":"8799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"ASUS ROG Zephyrus G16","url":"https://www.noon.com/saudi-en/search?q=ASUS+ROG+Zephyrus+G16","canonical_url":"https://www.noon.com/saudi-en/search?q=ASUS+ROG+Zephyrus+G16","product_slug":"p-701-asus-rog-zephyrus-g16","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-701-jarir","condition":"new","amount":"8999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"ASUS ROG Zephyrus G16","url":"https://www.jarir.com/sa-en/search.html?q=ASUS+ROG+Zephyrus+G16","canonical_url":"https://www.jarir.com/sa-en/search.html?q=ASUS+ROG+Zephyrus+G16","product_slug":"p-701-asus-rog-zephyrus-g16","date_confirmed":false},{"store_id":"hp","offer_key":"legacy-800-hp","condition":"new","amount":"2799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HP Pavilion 14","url":"https://www.hp.com/sa-en/","canonical_url":"https://www.hp.com/sa-en/","product_slug":"p-800-hp-pavilion-14","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-800-amazon","condition":"new","amount":"2599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HP Pavilion 14","url":"https://www.amazon.sa/s?k=HP+Pavilion+14","canonical_url":"https://www.amazon.sa/s?k=HP+Pavilion+14","product_slug":"p-800-hp-pavilion-14","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-800-noon","condition":"new","amount":"2699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HP Pavilion 14","url":"https://www.noon.com/saudi-en/search?q=HP+Pavilion+14","canonical_url":"https://www.noon.com/saudi-en/search?q=HP+Pavilion+14","product_slug":"p-800-hp-pavilion-14","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-800-jarir","condition":"new","amount":"2799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HP Pavilion 14","url":"https://www.jarir.com/sa-en/search.html?q=HP+Pavilion+14","canonical_url":"https://www.jarir.com/sa-en/search.html?q=HP+Pavilion+14","product_slug":"p-800-hp-pavilion-14","date_confirmed":false},{"store_id":"hp","offer_key":"legacy-801-hp","condition":"new","amount":"4499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HP Victus 16","url":"https://www.hp.com/sa-en/","canonical_url":"https://www.hp.com/sa-en/","product_slug":"p-801-hp-victus-16","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-801-amazon","condition":"new","amount":"4199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HP Victus 16","url":"https://www.amazon.sa/s?k=HP+Victus+16","canonical_url":"https://www.amazon.sa/s?k=HP+Victus+16","product_slug":"p-801-hp-victus-16","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-801-noon","condition":"new","amount":"4349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HP Victus 16","url":"https://www.noon.com/saudi-en/search?q=HP+Victus+16","canonical_url":"https://www.noon.com/saudi-en/search?q=HP+Victus+16","product_slug":"p-801-hp-victus-16","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-801-jarir","condition":"new","amount":"4499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"HP Victus 16","url":"https://www.jarir.com/sa-en/search.html?q=HP+Victus+16","canonical_url":"https://www.jarir.com/sa-en/search.html?q=HP+Victus+16","product_slug":"p-801-hp-victus-16","date_confirmed":false},{"store_id":"msi","offer_key":"legacy-900-msi","condition":"new","amount":"4999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MSI Katana 15","url":"https://www.msi.com/Laptop","canonical_url":"https://www.msi.com/Laptop","product_slug":"p-900-msi-katana-15","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-900-amazon","condition":"new","amount":"4699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MSI Katana 15","url":"https://www.amazon.sa/s?k=MSI+Katana+15","canonical_url":"https://www.amazon.sa/s?k=MSI+Katana+15","product_slug":"p-900-msi-katana-15","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-900-noon","condition":"new","amount":"4849","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MSI Katana 15","url":"https://www.noon.com/saudi-en/search?q=MSI+Katana+15","canonical_url":"https://www.noon.com/saudi-en/search?q=MSI+Katana+15","product_slug":"p-900-msi-katana-15","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-900-jarir","condition":"new","amount":"4999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MSI Katana 15","url":"https://www.jarir.com/sa-en/search.html?q=MSI+Katana+15","canonical_url":"https://www.jarir.com/sa-en/search.html?q=MSI+Katana+15","product_slug":"p-900-msi-katana-15","date_confirmed":false},{"store_id":"msi","offer_key":"legacy-901-msi","condition":"new","amount":"10999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MSI Raider 18","url":"https://www.msi.com/Laptop","canonical_url":"https://www.msi.com/Laptop","product_slug":"p-901-msi-raider-18","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-901-amazon","condition":"new","amount":"10499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MSI Raider 18","url":"https://www.amazon.sa/s?k=MSI+Raider+18","canonical_url":"https://www.amazon.sa/s?k=MSI+Raider+18","product_slug":"p-901-msi-raider-18","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-901-noon","condition":"new","amount":"10799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MSI Raider 18","url":"https://www.noon.com/saudi-en/search?q=MSI+Raider+18","canonical_url":"https://www.noon.com/saudi-en/search?q=MSI+Raider+18","product_slug":"p-901-msi-raider-18","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-901-jarir","condition":"new","amount":"10999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"MSI Raider 18","url":"https://www.jarir.com/sa-en/search.html?q=MSI+Raider+18","canonical_url":"https://www.jarir.com/sa-en/search.html?q=MSI+Raider+18","product_slug":"p-901-msi-raider-18","date_confirmed":false},{"store_id":"sony","offer_key":"legacy-1000-sony","condition":"new","amount":"1699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Sony WH-1000XM6","url":"https://www.sony.com/en-sa/","canonical_url":"https://www.sony.com/en-sa/","product_slug":"p-1000-sony-wh-1000xm6","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-1000-amazon","condition":"new","amount":"1549","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Sony WH-1000XM6","url":"https://www.amazon.sa/s?k=Sony+WH-1000XM6","canonical_url":"https://www.amazon.sa/s?k=Sony+WH-1000XM6","product_slug":"p-1000-sony-wh-1000xm6","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-1000-noon","condition":"new","amount":"1599","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Sony WH-1000XM6","url":"https://www.noon.com/saudi-en/search?q=Sony+WH-1000XM6","canonical_url":"https://www.noon.com/saudi-en/search?q=Sony+WH-1000XM6","product_slug":"p-1000-sony-wh-1000xm6","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-1000-jarir","condition":"new","amount":"1699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Sony WH-1000XM6","url":"https://www.jarir.com/sa-en/search.html?q=Sony+WH-1000XM6","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Sony+WH-1000XM6","product_slug":"p-1000-sony-wh-1000xm6","date_confirmed":false},{"store_id":"sony","offer_key":"legacy-1001-sony","condition":"new","amount":"2299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Sony PlayStation 5","url":"https://www.sony.com/en-sa/","canonical_url":"https://www.sony.com/en-sa/","product_slug":"p-1001-sony-playstation-5","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-1001-amazon","condition":"new","amount":"2099","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Sony PlayStation 5","url":"https://www.amazon.sa/s?k=PlayStation+5","canonical_url":"https://www.amazon.sa/s?k=PlayStation+5","product_slug":"p-1001-sony-playstation-5","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-1001-noon","condition":"new","amount":"2199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Sony PlayStation 5","url":"https://www.noon.com/saudi-en/search?q=PlayStation+5","canonical_url":"https://www.noon.com/saudi-en/search?q=PlayStation+5","product_slug":"p-1001-sony-playstation-5","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-1001-jarir","condition":"new","amount":"2299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Sony PlayStation 5","url":"https://www.jarir.com/sa-en/search.html?q=PlayStation+5","canonical_url":"https://www.jarir.com/sa-en/search.html?q=PlayStation+5","product_slug":"p-1001-sony-playstation-5","date_confirmed":false},{"store_id":"lg","offer_key":"legacy-1100-lg","condition":"new","amount":"5999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"LG OLED C5 55","url":"https://www.lg.com/sa_en/","canonical_url":"https://www.lg.com/sa_en/","product_slug":"p-1100-lg-oled-c5-55","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-1100-amazon","condition":"new","amount":"5499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"LG OLED C5 55","url":"https://www.amazon.sa/s?k=LG+OLED+C5+55","canonical_url":"https://www.amazon.sa/s?k=LG+OLED+C5+55","product_slug":"p-1100-lg-oled-c5-55","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-1100-noon","condition":"new","amount":"5699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"LG OLED C5 55","url":"https://www.noon.com/saudi-en/search?q=LG+OLED+C5+55","canonical_url":"https://www.noon.com/saudi-en/search?q=LG+OLED+C5+55","product_slug":"p-1100-lg-oled-c5-55","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-1100-jarir","condition":"new","amount":"5999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"LG OLED C5 55","url":"https://www.jarir.com/sa-en/search.html?q=LG+OLED+C5+55","canonical_url":"https://www.jarir.com/sa-en/search.html?q=LG+OLED+C5+55","product_slug":"p-1100-lg-oled-c5-55","date_confirmed":false},{"store_id":"lg","offer_key":"legacy-1101-lg","condition":"new","amount":"7999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"LG OLED C5 65","url":"https://www.lg.com/sa_en/","canonical_url":"https://www.lg.com/sa_en/","product_slug":"p-1101-lg-oled-c5-65","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-1101-amazon","condition":"new","amount":"7499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"LG OLED C5 65","url":"https://www.amazon.sa/s?k=LG+OLED+C5+65","canonical_url":"https://www.amazon.sa/s?k=LG+OLED+C5+65","product_slug":"p-1101-lg-oled-c5-65","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-1101-noon","condition":"new","amount":"7699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"LG OLED C5 65","url":"https://www.noon.com/saudi-en/search?q=LG+OLED+C5+65","canonical_url":"https://www.noon.com/saudi-en/search?q=LG+OLED+C5+65","product_slug":"p-1101-lg-oled-c5-65","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-1101-jarir","condition":"new","amount":"7999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"LG OLED C5 65","url":"https://www.jarir.com/sa-en/search.html?q=LG+OLED+C5+65","canonical_url":"https://www.jarir.com/sa-en/search.html?q=LG+OLED+C5+65","product_slug":"p-1101-lg-oled-c5-65","date_confirmed":false},{"store_id":"tcl","offer_key":"legacy-1200-tcl","condition":"new","amount":"2999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"TCL C7K 55","url":"https://www.tcl.com/sa/en","canonical_url":"https://www.tcl.com/sa/en","product_slug":"p-1200-tcl-c7k-55","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-1200-amazon","condition":"new","amount":"2799","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"TCL C7K 55","url":"https://www.amazon.sa/s?k=TCL+C7K+55","canonical_url":"https://www.amazon.sa/s?k=TCL+C7K+55","product_slug":"p-1200-tcl-c7k-55","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-1200-noon","condition":"new","amount":"2899","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"TCL C7K 55","url":"https://www.noon.com/saudi-en/search?q=TCL+C7K+55","canonical_url":"https://www.noon.com/saudi-en/search?q=TCL+C7K+55","product_slug":"p-1200-tcl-c7k-55","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-1200-jarir","condition":"new","amount":"2999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"TCL C7K 55","url":"https://www.jarir.com/sa-en/search.html?q=TCL+C7K+55","canonical_url":"https://www.jarir.com/sa-en/search.html?q=TCL+C7K+55","product_slug":"p-1200-tcl-c7k-55","date_confirmed":false},{"store_id":"tcl","offer_key":"legacy-1201-tcl","condition":"new","amount":"3999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"TCL C7K 65","url":"https://www.tcl.com/sa/en","canonical_url":"https://www.tcl.com/sa/en","product_slug":"p-1201-tcl-c7k-65","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-1201-amazon","condition":"new","amount":"3699","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"TCL C7K 65","url":"https://www.amazon.sa/s?k=TCL+C7K+65","canonical_url":"https://www.amazon.sa/s?k=TCL+C7K+65","product_slug":"p-1201-tcl-c7k-65","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-1201-noon","condition":"new","amount":"3849","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"TCL C7K 65","url":"https://www.noon.com/saudi-en/search?q=TCL+C7K+65","canonical_url":"https://www.noon.com/saudi-en/search?q=TCL+C7K+65","product_slug":"p-1201-tcl-c7k-65","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-1201-jarir","condition":"new","amount":"3999","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"TCL C7K 65","url":"https://www.jarir.com/sa-en/search.html?q=TCL+C7K+65","canonical_url":"https://www.jarir.com/sa-en/search.html?q=TCL+C7K+65","product_slug":"p-1201-tcl-c7k-65","date_confirmed":false},{"store_id":"hisense","offer_key":"legacy-1300-hisense","condition":"new","amount":"2499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Hisense U7 55","url":"https://global.hisense.com/","canonical_url":"https://global.hisense.com/","product_slug":"p-1300-hisense-u7-55","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-1300-amazon","condition":"new","amount":"2299","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Hisense U7 55","url":"https://www.amazon.sa/s?k=Hisense+U7+55","canonical_url":"https://www.amazon.sa/s?k=Hisense+U7+55","product_slug":"p-1300-hisense-u7-55","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-1300-noon","condition":"new","amount":"2399","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Hisense U7 55","url":"https://www.noon.com/saudi-en/search?q=Hisense+U7+55","canonical_url":"https://www.noon.com/saudi-en/search?q=Hisense+U7+55","product_slug":"p-1300-hisense-u7-55","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-1300-jarir","condition":"new","amount":"2499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Hisense U7 55","url":"https://www.jarir.com/sa-en/search.html?q=Hisense+U7+55","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Hisense+U7+55","product_slug":"p-1300-hisense-u7-55","date_confirmed":false},{"store_id":"hisense","offer_key":"legacy-1301-hisense","condition":"new","amount":"3499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Hisense U7 65","url":"https://global.hisense.com/","canonical_url":"https://global.hisense.com/","product_slug":"p-1301-hisense-u7-65","date_confirmed":false},{"store_id":"amazon","offer_key":"legacy-1301-amazon","condition":"new","amount":"3199","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Hisense U7 65","url":"https://www.amazon.sa/s?k=Hisense+U7+65","canonical_url":"https://www.amazon.sa/s?k=Hisense+U7+65","product_slug":"p-1301-hisense-u7-65","date_confirmed":false},{"store_id":"noon","offer_key":"legacy-1301-noon","condition":"new","amount":"3349","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Hisense U7 65","url":"https://www.noon.com/saudi-en/search?q=Hisense+U7+65","canonical_url":"https://www.noon.com/saudi-en/search?q=Hisense+U7+65","product_slug":"p-1301-hisense-u7-65","date_confirmed":false},{"store_id":"jarir","offer_key":"legacy-1301-jarir","condition":"new","amount":"3499","currency":"SAR","as_of":"2026-08-27T00:00:00+03:00","availability":"unknown","name":"Hisense U7 65","url":"https://www.jarir.com/sa-en/search.html?q=Hisense+U7+65","canonical_url":"https://www.jarir.com/sa-en/search.html?q=Hisense+U7+65","product_slug":"p-1301-hisense-u7-65","date_confirmed":false}]},{"source":"legacy-site-cars","file_name":"app-data-cars.json","origin":"app/data/cars.ts","rows":[{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-yaris-2026","condition":"new","amount":"66987.5","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Yaris 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-yaris-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-corolla-2026-1-5l-xli","condition":"new","amount":"82627.5","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Corolla 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-corolla-2026-1-5l-xli","date_confirmed":false,"car":{"model_year":2026,"trim":"1.5L XLI"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-camry-2026","condition":"new","amount":"109825","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Camry 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-camry-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-crown-2026","condition":"new","amount":"158355","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Crown 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-crown-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-gr86-2026","condition":"new","amount":"147487.5","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota GR86 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-gr86-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-supra-2026","condition":"new","amount":"278760","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Supra 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-supra-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-raize-2026","condition":"new","amount":"68827.5","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Raize 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-raize-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-urban-cruiser-2026","condition":"new","amount":"84755","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Urban Cruiser 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-urban-cruiser-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-veloz-2026","condition":"new","amount":"84007.5","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Veloz 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-veloz-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-corolla-cross-2025","condition":"new","amount":"103845","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Corolla Cross 2025","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-corolla-cross-2025","date_confirmed":false,"car":{"model_year":2025,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-rav4-2026","condition":"new","amount":"106662.5","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota RAV4 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-rav4-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-innova-2026","condition":"new","amount":"127765","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Innova 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-innova-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-land-cruiser-hardtop-2026","condition":"new","amount":"158240","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Land Cruiser Hardtop 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-land-cruiser-hardtop-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-fortuner-2026","condition":"new","amount":"128742.5","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Fortuner 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-fortuner-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-highlander-2026","condition":"new","amount":"151455","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Highlander 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-highlander-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-prado-2026-tx-2","condition":"new","amount":"199582.5","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Prado 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-prado-2026-tx-2","date_confirmed":false,"car":{"model_year":2026,"trim":"TX-2"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-land-cruiser-2026","condition":"new","amount":"263407.5","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota Land Cruiser 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-land-cruiser-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"toyota-brand-site","offer_key":"legacy-car-car-toyota-lc300-hev-max-2026","condition":"new","amount":"334535","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Toyota LC300 HEV MAX 2026","url":"https://www.toyota.com.sa/ar/vehicles","canonical_url":"https://www.toyota.com.sa/ar/vehicles","product_slug":"car-toyota-lc300-hev-max-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"hyundai-brand-site","offer_key":"legacy-car-car-hyundai-accent-2026","condition":"new","amount":"71484","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Hyundai Accent 2026","url":"https://hyundaiksa.com/","canonical_url":"https://hyundaiksa.com/","product_slug":"car-hyundai-accent-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"hyundai-brand-site","offer_key":"legacy-car-car-hyundai-elantra-2026-1-5-gl","condition":"new","amount":"86694","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Hyundai Elantra 2026","url":"https://hyundaiksa.com/","canonical_url":"https://hyundaiksa.com/","product_slug":"car-hyundai-elantra-2026-1-5-gl","date_confirmed":false,"car":{"model_year":2026,"trim":"1.5 GL"}},{"store_id":"hyundai-brand-site","offer_key":"legacy-car-car-hyundai-tucson-2026","condition":"new","amount":"107704","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Hyundai Tucson 2026","url":"https://hyundaiksa.com/","canonical_url":"https://hyundaiksa.com/","product_slug":"car-hyundai-tucson-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"hyundai-brand-site","offer_key":"legacy-car-car-hyundai-creta-2026","condition":"new","amount":"86200","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Hyundai Creta 2026","url":"https://hyundaiksa.com/","canonical_url":"https://hyundaiksa.com/","product_slug":"car-hyundai-creta-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"hyundai-brand-site","offer_key":"legacy-car-car-hyundai-sonata-2026","condition":"new","amount":"107904","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Hyundai Sonata 2026","url":"https://hyundaiksa.com/","canonical_url":"https://hyundaiksa.com/","product_slug":"car-hyundai-sonata-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"hyundai-brand-site","offer_key":"legacy-car-car-hyundai-kona-2026","condition":"new","amount":"86290","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Hyundai Kona 2026","url":"https://hyundaiksa.com/","canonical_url":"https://hyundaiksa.com/","product_slug":"car-hyundai-kona-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"hyundai-brand-site","offer_key":"legacy-car-car-hyundai-palisade-2026","condition":"new","amount":"177039","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Hyundai Palisade 2026","url":"https://hyundaiksa.com/","canonical_url":"https://hyundaiksa.com/","product_slug":"car-hyundai-palisade-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"hyundai-brand-site","offer_key":"legacy-car-car-hyundai-staria-premium-2026","condition":"new","amount":"177447","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Hyundai Staria Premium 2026","url":"https://hyundaiksa.com/","canonical_url":"https://hyundaiksa.com/","product_slug":"car-hyundai-staria-premium-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-k4-2026","condition":"new","amount":"86135","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia K4 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-k4-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-k8-2026","condition":"new","amount":"160885","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia K8 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-k8-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-k5-2026","condition":"new","amount":"103385","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia K5 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-k5-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-pegas-2026","condition":"new","amount":"53935","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia Pegas 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-pegas-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-k3-2026","condition":"new","amount":"72335","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia K3 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-k3-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-carens-2026","condition":"new","amount":"91885","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia Carens 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-carens-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-sportage-l-2026","condition":"new","amount":"103385","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia Sportage L 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-sportage-l-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-sonet-2026","condition":"new","amount":"74635","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia Sonet 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-sonet-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-seltos-2026","condition":"new","amount":"76935","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia Seltos 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-seltos-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-carnival-2026","condition":"new","amount":"149385","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia Carnival 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-carnival-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"kia-brand-site","offer_key":"legacy-car-car-kia-telluride-2026","condition":"new","amount":"160885","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Kia Telluride 2026","url":"https://www.kia.com/aljabr/ar/","canonical_url":"https://www.kia.com/aljabr/ar/","product_slug":"car-kia-telluride-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-magnite-2026","condition":"new","amount":"69999","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan Magnite 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-magnite-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-kicks-2026","condition":"new","amount":"89599","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan Kicks 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-kicks-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-x-trail-2026","condition":"new","amount":"104999","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan X-Trail 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-x-trail-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-altima-2026","condition":"new","amount":"112700","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan Altima 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-altima-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-x-terra-2026","condition":"new","amount":"118999","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan X-Terra 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-x-terra-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-pathfinder-2026","condition":"new","amount":"164999","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan Pathfinder 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-pathfinder-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-patrol-2026","condition":"new","amount":"270999","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan Patrol 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-patrol-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-patrol-pro-4x-2026","condition":"new","amount":"380999","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan Patrol PRO-4X 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-patrol-pro-4x-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-patrol-nismo-2026","condition":"new","amount":"450999","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan Patrol NISMO 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-patrol-nismo-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"nissan-brand-site","offer_key":"legacy-car-car-nissan-z-2026","condition":"new","amount":"261999","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Nissan Z 2026","url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","canonical_url":"https://ar.nissan-saudiarabia.com/vehicles/new.html","product_slug":"car-nissan-z-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"mg-brand-site","offer_key":"legacy-car-car-mg-mg-5-2026","condition":"new","amount":"54450","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"MG MG 5 2026","url":"https://www.mg-sa.com/ar/","canonical_url":"https://www.mg-sa.com/ar/","product_slug":"car-mg-mg-5-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"mg-brand-site","offer_key":"legacy-car-car-mg-mg-7-2026","condition":"new","amount":"86650","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"MG MG 7 2026","url":"https://www.mg-sa.com/ar/","canonical_url":"https://www.mg-sa.com/ar/","product_slug":"car-mg-mg-7-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"mg-brand-site","offer_key":"legacy-car-car-mg-mg-hs-2026","condition":"new","amount":"85040","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"MG MG HS 2026","url":"https://www.mg-sa.com/ar/","canonical_url":"https://www.mg-sa.com/ar/","product_slug":"car-mg-mg-hs-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"mg-brand-site","offer_key":"legacy-car-car-mg-mg-hs-hybrid-2026","condition":"new","amount":"116089","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"MG MG HS Hybrid+ 2026","url":"https://www.mg-sa.com/ar/","canonical_url":"https://www.mg-sa.com/ar/","product_slug":"car-mg-mg-hs-hybrid-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"mg-brand-site","offer_key":"legacy-car-car-mg-mg-rx9-2026","condition":"new","amount":"108765","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"MG MG RX9 2026","url":"https://www.mg-sa.com/ar/","canonical_url":"https://www.mg-sa.com/ar/","product_slug":"car-mg-mg-rx9-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"mg-brand-site","offer_key":"legacy-car-car-mg-mg-one-2026","condition":"new","amount":"74610","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"MG MG One 2026","url":"https://www.mg-sa.com/ar/","canonical_url":"https://www.mg-sa.com/ar/","product_slug":"car-mg-mg-one-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"ford-brand-site","offer_key":"legacy-car-car-ford-territory-2026","condition":"new","amount":"98175","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Ford Territory 2026","url":"https://www.me.ford.com/sa/","canonical_url":"https://www.me.ford.com/sa/","product_slug":"car-ford-territory-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"ford-brand-site","offer_key":"legacy-car-car-ford-explorer-2026","condition":"new","amount":"230000","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Ford Explorer 2026","url":"https://www.me.ford.com/sa/","canonical_url":"https://www.me.ford.com/sa/","product_slug":"car-ford-explorer-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"ford-brand-site","offer_key":"legacy-car-car-ford-expedition-2026","condition":"new","amount":"244950","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Ford Expedition 2026","url":"https://www.me.ford.com/sa/","canonical_url":"https://www.me.ford.com/sa/","product_slug":"car-ford-expedition-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"ford-brand-site","offer_key":"legacy-car-car-ford-bronco-2026","condition":"new","amount":"230000","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Ford Bronco 2026","url":"https://www.me.ford.com/sa/","canonical_url":"https://www.me.ford.com/sa/","product_slug":"car-ford-bronco-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"honda-brand-site","offer_key":"legacy-car-car-honda-city-2026","condition":"new","amount":"70725","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Honda City 2026","url":"https://honda-mideast.com/sa/","canonical_url":"https://honda-mideast.com/sa/","product_slug":"car-honda-city-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"honda-brand-site","offer_key":"legacy-car-car-honda-accord-2026","condition":"new","amount":"133285","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Honda Accord 2026","url":"https://honda-mideast.com/sa/","canonical_url":"https://honda-mideast.com/sa/","product_slug":"car-honda-accord-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"honda-brand-site","offer_key":"legacy-car-car-honda-hr-v-2026","condition":"new","amount":"91885","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Honda HR-V 2026","url":"https://honda-mideast.com/sa/","canonical_url":"https://honda-mideast.com/sa/","product_slug":"car-honda-hr-v-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"honda-brand-site","offer_key":"legacy-car-car-honda-cr-v-2026","condition":"new","amount":"149385","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Honda CR-V 2026","url":"https://honda-mideast.com/sa/","canonical_url":"https://honda-mideast.com/sa/","product_slug":"car-honda-cr-v-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"honda-brand-site","offer_key":"legacy-car-car-honda-pilot-2026","condition":"new","amount":"209300","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Honda Pilot 2026","url":"https://honda-mideast.com/sa/","canonical_url":"https://honda-mideast.com/sa/","product_slug":"car-honda-pilot-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"honda-brand-site","offer_key":"legacy-car-car-honda-odyssey-2026","condition":"new","amount":"189635","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Honda Odyssey 2026","url":"https://honda-mideast.com/sa/","canonical_url":"https://honda-mideast.com/sa/","product_slug":"car-honda-odyssey-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"suzuki-brand-site","offer_key":"legacy-car-car-suzuki-dzire-2026","condition":"new","amount":"57385","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Suzuki Dzire 2026","url":"https://suzuki.sa/","canonical_url":"https://suzuki.sa/","product_slug":"car-suzuki-dzire-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"suzuki-brand-site","offer_key":"legacy-car-car-suzuki-baleno-2026","condition":"new","amount":"72450","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Suzuki Baleno 2026","url":"https://suzuki.sa/","canonical_url":"https://suzuki.sa/","product_slug":"car-suzuki-baleno-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"suzuki-brand-site","offer_key":"legacy-car-car-suzuki-fronx-2026","condition":"new","amount":"69000","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Suzuki Fronx 2026","url":"https://suzuki.sa/","canonical_url":"https://suzuki.sa/","product_slug":"car-suzuki-fronx-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"suzuki-brand-site","offer_key":"legacy-car-car-suzuki-jimny-2026","condition":"new","amount":"85215","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Suzuki Jimny 2026","url":"https://suzuki.sa/","canonical_url":"https://suzuki.sa/","product_slug":"car-suzuki-jimny-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"suzuki-brand-site","offer_key":"legacy-car-car-suzuki-ertiga-2026","condition":"new","amount":"73600","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Suzuki Ertiga 2026","url":"https://suzuki.sa/","canonical_url":"https://suzuki.sa/","product_slug":"car-suzuki-ertiga-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"suzuki-brand-site","offer_key":"legacy-car-car-suzuki-grand-vitara-2026","condition":"new","amount":"79235","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Suzuki Grand Vitara 2026","url":"https://suzuki.sa/","canonical_url":"https://suzuki.sa/","product_slug":"car-suzuki-grand-vitara-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"changan-brand-site","offer_key":"legacy-car-car-changan-eado-plus-2026","condition":"new","amount":"69500","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Changan Eado Plus 2026","url":"https://changan.sa/","canonical_url":"https://changan.sa/","product_slug":"car-changan-eado-plus-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"changan-brand-site","offer_key":"legacy-car-car-changan-cs35-plus-2026","condition":"new","amount":"70900","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Changan CS35 Plus 2026","url":"https://changan.sa/","canonical_url":"https://changan.sa/","product_slug":"car-changan-cs35-plus-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"changan-brand-site","offer_key":"legacy-car-car-changan-cs75-plus-2026","condition":"new","amount":"102250","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Changan CS75 Plus 2026","url":"https://changan.sa/","canonical_url":"https://changan.sa/","product_slug":"car-changan-cs75-plus-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"changan-brand-site","offer_key":"legacy-car-car-changan-cs95-2026","condition":"new","amount":"116600","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Changan CS95 2026","url":"https://changan.sa/","canonical_url":"https://changan.sa/","product_slug":"car-changan-cs95-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"changan-brand-site","offer_key":"legacy-car-car-changan-uni-v-2026","condition":"new","amount":"91200","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Changan UNI-V 2026","url":"https://changan.sa/","canonical_url":"https://changan.sa/","product_slug":"car-changan-uni-v-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}},{"store_id":"changan-brand-site","offer_key":"legacy-car-car-changan-uni-s-2026","condition":"new","amount":"93725","currency":"SAR","as_of":"2026-09-19T22:05:34+03:00","availability":"unknown","name":"Changan UNI-S 2026","url":"https://changan.sa/","canonical_url":"https://changan.sa/","product_slug":"car-changan-uni-s-2026","date_confirmed":false,"car":{"model_year":2026,"trim":"غير محددة"}}]}]}$json$::jsonb;
  v_admin  uuid;
  v_cat    bigint;
  v_brand  bigint;
  v_fam    bigint;
  v_prod   bigint;
  v_spec   bigint;
  v_run    uuid;
  v_hash   text;
  v_rows   jsonb;
  v_n      int;
  v_text   text;
  e        jsonb;
  i        int;
begin
  select b.admins[1] into v_admin from tp.bootstrap_state b;
  if v_admin is null then
    raise exception 'لم تُنفَّذ تهيئة أول مشرف بعد: شغّل tp.bootstrap_first_admins أولًا';
  end if;

  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;

  -- ---------------- الإلكترونيات
  for e in select * from jsonb_array_elements(d -> 'electronics' -> 'categories') loop
    insert into tp.categories (kind, slug, name_ar, name_en, sort_order)
    values ('electronics', e ->> 'slug', e ->> 'name_ar', e ->> 'name_en', (e ->> 'sort_order')::int)
    on conflict (slug) do nothing;
  end loop;
  for e in select * from jsonb_array_elements((d -> 'electronics' -> 'brands') || (d -> 'cars' -> 'brands')) loop
    insert into tp.brands (slug, name, name_ar) values (e ->> 'slug', e ->> 'name', e ->> 'name_ar')
    on conflict (slug) do nothing;
  end loop;

  for e in select * from jsonb_array_elements(d -> 'electronics' -> 'products') loop
    continue when exists (select 1 from tp.products where legacy_id = (e ->> 'legacy_id')::int);
    select id into strict v_cat from tp.categories where slug = e ->> 'category';
    select id into strict v_brand from tp.brands where slug = e ->> 'brand';
    insert into tp.product_families (category_id, category_kind, brand_id, slug, name, name_ar)
    values (v_cat, 'electronics', v_brand, e ->> 'family_slug', e ->> 'name', e ->> 'name_ar')
    on conflict (slug) do nothing;
    select id into strict v_fam from tp.product_families where slug = e ->> 'family_slug';
    insert into tp.products (legacy_id, family_id, category_id, category_kind, brand_id, slug, name, name_ar, status)
    values ((e ->> 'legacy_id')::int, v_fam, v_cat, 'electronics', v_brand, e ->> 'slug', e ->> 'name', e ->> 'name_ar', 'active')
    returning id into v_prod;
    insert into tp.product_details (product_id, memory, storage, screen, chip, camera, front_camera, battery,
                                    connectivity, water_resistance, refresh_rate, colors, description, amazon_url)
    select v_prod, x.memory, x.storage, x.screen, x.chip, x.camera, x.front_camera, x.battery, x.connectivity,
           x.water_resistance, x.refresh_rate,
           coalesce(array(select jsonb_array_elements_text(e -> 'details' -> 'colors')), '{}'), x.description, x.amazon_url
    from jsonb_to_record(e -> 'details') as x(memory text, storage text, screen text, chip text, camera text,
         front_camera text, battery text, connectivity text, water_resistance text, refresh_rate text,
         description text, amazon_url text);
  end loop;

  for e in select * from jsonb_array_elements((d -> 'electronics' -> 'stores') || (d -> 'cars' -> 'stores')) loop
    insert into tp.stores (id, name, name_ar, is_marketplace, created_by)
    values (e ->> 'id', e ->> 'name', e ->> 'name_ar', coalesce((e ->> 'is_marketplace')::boolean, false), v_admin)
    on conflict (id) do nothing;
  end loop;

  -- ---------------- السيارات (جديدة: منتج = علامة + موديل + سنة + فئة؛ العائلة جاهزة للمستعمل لاحقًا)
  insert into tp.categories (kind, slug, name_ar, name_en, sort_order)
  values ('cars', d -> 'cars' -> 'category' ->> 'slug', d -> 'cars' -> 'category' ->> 'name_ar',
          d -> 'cars' -> 'category' ->> 'name_en', (d -> 'cars' -> 'category' ->> 'sort_order')::int)
  on conflict (slug) do nothing;
  select id into strict v_cat from tp.categories where slug = d -> 'cars' -> 'category' ->> 'slug' and kind = 'cars';

  for e in select * from jsonb_array_elements(d -> 'cars' -> 'specs') loop
    insert into tp.spec_definitions (category_id, key, label_ar, data_type)
    values (v_cat, e ->> 'key', e ->> 'label_ar', 'text')
    on conflict (category_id, key) do nothing;
  end loop;

  for e in select * from jsonb_array_elements(d -> 'cars' -> 'families') loop
    select id into strict v_brand from tp.brands where slug = e ->> 'brand';
    insert into tp.product_families (category_id, category_kind, brand_id, slug, name)
    values (v_cat, 'cars', v_brand, e ->> 'slug', e ->> 'name')
    on conflict (slug) do nothing;
  end loop;

  for e in select * from jsonb_array_elements(d -> 'cars' -> 'products') loop
    continue when exists (select 1 from tp.products where slug = e ->> 'slug');
    select f.id, f.brand_id into strict v_fam, v_brand from tp.product_families f where f.slug = e ->> 'family_slug';
    insert into tp.products (family_id, category_id, category_kind, brand_id, slug, name, name_ar, model_year, trim, status)
    values (v_fam, v_cat, 'cars', v_brand, e ->> 'slug', e ->> 'name', e ->> 'name_ar',
            (e ->> 'model_year')::smallint, e ->> 'trim', 'active')
    returning id into v_prod;
    for v_text in select k from jsonb_object_keys(e -> 'specs') k loop
      continue when e -> 'specs' ->> v_text is null;
      select id into strict v_spec from tp.spec_definitions where category_id = v_cat and key = v_text;
      insert into tp.product_specs (product_id, spec_id, category_id, value_text)
      values (v_prod, v_spec, v_cat, e -> 'specs' ->> v_text)
      on conflict do nothing;
    end loop;
  end loop;

  -- ---------------- مصادر البيانات الحالية: مرجعية يدوية غير موثقة
  for e in select * from jsonb_array_elements(d -> 'sources') loop
    insert into tp.sources (id, name, kind, vertical, default_currency, time_zone, status, permission_basis, approved_by, approved_at)
    values (e ->> 'id', e ->> 'name', 'legacy_manual', (e ->> 'vertical')::tp.category_kind, 'SAR', 'Asia/Riyadh',
            'approved', e ->> 'permission_basis', v_admin, now())
    on conflict (id) do nothing;
  end loop;

  -- ---------------- الأسعار الحالية عبر مسار الاستيراد نفسه (مرة واحدة لكل مصدر)
  for e in select * from jsonb_array_elements(d -> 'imports') loop
    continue when exists (select 1 from tp.import_runs where source_id = e ->> 'source' and status = 'committed');
    select jsonb_agg((r.x - 'product_slug') || jsonb_build_object('product_id', p.id::text) order by r.ord), count(p.id)
      into v_rows, v_n
    from jsonb_array_elements(e -> 'rows') with ordinality as r(x, ord)
    left join tp.products p on p.slug = r.x ->> 'product_slug';
    if v_n <> jsonb_array_length(e -> 'rows') then
      raise exception 'seed: % rows of % reference unknown products', jsonb_array_length(e -> 'rows') - v_n, e ->> 'source';
    end if;
    v_text := v_rows::text;
    v_hash := encode(sha256(convert_to(v_text, 'UTF8')), 'hex');
    v_run := admin_api.register_import(e ->> 'source', 'imports/legacy/' || v_hash, e ->> 'file_name',
                                       octet_length(v_text), v_hash, 'catalog-seed-1', 'manual',
                                       jsonb_build_object('source', e ->> 'origin'),
                                       jsonb_build_object('accepted', v_n));
    i := 0;
    while i < v_n loop
      perform admin_api.stage_import_rows(v_run, i + 1,
        (select jsonb_agg(x order by ord) from jsonb_array_elements(v_rows) with ordinality as t(x, ord)
          where ord > i and ord <= i + 500));
      i := i + 500;
    end loop;
    v_hash := admin_api.seal_import(v_run, v_n);
    perform admin_api.commit_import(v_run, v_hash);
  end loop;

  reset role;
end $seed$;

commit;

-- =====================================================================
-- [7] كلمة مرور tp_app + نتيجة الفحوص (هذه هي النتيجة الوحيدة التي تظهر في SQL Editor)
--     db/supabase/020_set_app_password.sql sha256=af24ed1b56eb77bdf76e7c57199049b090440610700026b4f9b990c42e1dde8e
--     انسخ database_url مباشرة إلى Vercel (DATABASE_URL) ولا ترسلها في أي رسالة.
--     أي فحص لا يطابق القيمة المتوقعة = توقف وأبلغني (بدون إرسال كلمة المرور).
-- =====================================================================
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

with pw as materialized (select pg_temp.tp_set_app_password() as p)
select
  'postgresql://tp_app.xlpzfnespldgaxkgskkg:' || pw.p || '@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' as database_url,
  (select count(*) from tp.privilege_violations())                          as privilege_violations_expect_0,
  (select string_agg(version, ', ' order by applied_at) from tp.schema_migrations) as migrations,
  (select string_agg(u.email, ', ' order by u.created_at)
     from tp.user_roles r join auth.users u on u.id = r.user_id where r.role_id = 'admin') as admins,
  (select count(*) from tp.products where category_kind = 'electronics')    as electronics_expect_52,
  (select count(*) from tp.products where category_kind = 'cars')           as cars_expect_357,
  (select count(*) from tp.price_observations)                              as legacy_prices_expect_283,
  (select count(*) from tp.verification_events)                             as verified_expect_0
from pw;
