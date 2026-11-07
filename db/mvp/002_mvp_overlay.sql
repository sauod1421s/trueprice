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
