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
