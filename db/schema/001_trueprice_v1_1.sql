-- =====================================================================
-- TruePrice — مخطط قاعدة البيانات v1.1 (مسودة للمراجعة — لم يُنفَّذ على Supabase)
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
  loop
    execute format('alter %s %I.%I owner to tp_owner', case r.relkind when 'v' then 'view' else 'table' end, r.nspname, r.relname);
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

commit;
