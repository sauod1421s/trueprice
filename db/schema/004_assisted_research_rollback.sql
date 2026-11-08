-- =====================================================================
-- TruePrice 004 — التراجع (يعيد الدوال إلى نص 001 ويزيل مساعد الرصد)
-- مولَّد بـ scripts/mvp/build-004.mjs من 001 (sha256=d4f5f7657e97b6075b95a24969f63b23aeeddaff3ad2c3783310e15b5ff5d544) — لا يُعدَّل يدويًا.
-- =====================================================================
--
-- لا يُنفَّذ إلا بموافقة صريحة. محمي بسطر تأكيد. معاملة واحدة: أي خطأ = لا يتغير شيء.
--
-- ما يفعله:
--   • يوقف (suspended) أي مصدر مساعد رصد معتمد ⇒ تختفي أسعاره من الموقع فورًا، ويبقى سجلها كما هو (لا حذف لأسعار).
--   • يحذف مصادر مساعد الرصد التي لم يُستورد منها أي ملف قط (مسودات بلا تاريخ).
--   • يعيد الدوال الاثنتي عشرة إلى نص 001 الحرفي، ويحذف دوال الحماية ومخطط research_api ودور tp_research.
--   • يحذف القيود الثلاثة وعمود service_submission (بعد إيقاف المصادر لا يُستخدم).
--   • يعيد price:verify و price:reject إلى قيمة 001 (بلا اشتراط تحقق ثنائي على مستوى القاعدة؛ اللوحة تبقى تشترطه).
--   • يبقى: قيمة enum 'assisted_research' (لا يمكن حذف قيمة enum في PostgreSQL دون إعادة بناء النوع؛ غير مستخدمة بعد
--     التراجع ولا أثر لها)، ومصادر مساعد الرصد الموقوفة التي لها سجل استيراد، وسجل التدقيق كاملًا.

begin;

do $tp004rb$
declare
  v_confirm text := 'لا';   -- ← غيّرها إلى: نعم-تراجع-004
begin
  if v_confirm <> 'نعم-تراجع-004' then
    raise exception 'لم يُؤكَّد التراجع (غيّر قيمة v_confirm في أول الملف). لم يتغير شيء.';
  end if;
end $tp004rb$;

update tp.sources set status = 'suspended' where kind = 'assisted_research' and status = 'approved';
delete from tp.sources s
where s.kind = 'assisted_research' and not exists (select 1 from tp.import_files f where f.source_id = s.id);

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

drop function if exists tp.assert_not_research_source(text);
drop function if exists tp.assert_not_research_run(uuid);
drop function if exists tp.assert_research_run(uuid);
drop schema if exists research_api cascade;
do $tp004rb$
begin
  if exists (select 1 from pg_roles where rolname = 'tp_research') then
    drop role tp_research;
  end if;
end $tp004rb$;
alter table tp.sources drop constraint if exists sources_research_terms_check;
alter table tp.sources drop constraint if exists sources_research_shape_check;
alter table tp.sources drop constraint if exists sources_service_submission_check;
alter table tp.sources drop column if exists service_submission;
update tp.permissions set requires_mfa = false where id in ('price:verify', 'price:reject');
delete from tp.schema_migrations where version = '004-assisted-research';

commit;

select (select count(*) from pg_namespace where nspname = 'research_api') as research_api_expect_0,
       (select count(*) from pg_roles where rolname = 'tp_research') as research_role_expect_0,
       (select count(*) from tp.sources where kind = 'assisted_research' and status = 'approved') as approved_research_expect_0,
       (select count(*) from tp.privilege_violations()) as privilege_violations_expect_0;
