-- =====================================================================
-- TruePrice 004 — مساعد الرصد (assisted research)
--
-- لماذا: قاعدة «من يُدخل السعر لا يعتمده» تمنع المشرف الوحيد من اعتماد ما يستورده بنفسه.
-- الحل: مصدر جديد من نوع assisted_research يُدخل عبر مسار الخدمة (actor = service، بلا هوية مستخدم)
-- أسعارًا مرصودة يدويًا من صفحات عامة لمواقع الوكلاء والمتاجر، لكل سعر رابط وتاريخ. تدخل «غير موثقة»
-- ولا تظهر في الموقع حتى يفتح المشرف الرابط ويعتمدها، والاعتماد يشترط رابط دليل (مثل الإدخال اليدوي).
-- فصل المهام يبقى: المُدخل (المساعد) ≠ المعتمِد (إنسان)، وكل قرار في سجل التدقيق.
--
-- ما يتغير: قيمة جديدة في tp.source_kind، وتوسيع قيد allow_automated ليشملها، واشتراط الدليل لها في
-- admin_api.verify_observation، ومصدران معتمدان (إلكترونيات/سيارات) باسم أول مشرف. لا حذف لأي بيانات.
-- آمن لإعادة التشغيل. التراجع: تعليق المصدرين (status = 'suspended') يوقف أي استيراد جديد فورًا.
-- =====================================================================

-- القيمة الجديدة في معاملة مستقلة: لا تُستخدم قيمة enum جديدة قبل اعتماد معاملتها
begin;
alter type tp.source_kind add value if not exists 'assisted_research';
commit;

begin;

-- قيد allow_automated: نفس القيد السابق + assisted_research (يُستبدل بالاسم الثابت)
do $tp004$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'tp.sources'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%allow_automated%' and conname <> 'sources_automated_kind_check'
  loop
    execute format('alter table tp.sources drop constraint %I', c);
  end loop;
end $tp004$;
alter table tp.sources drop constraint if exists sources_automated_kind_check;
alter table tp.sources add constraint sources_automated_kind_check
  check (not allow_automated or kind in ('affiliate_feed', 'store_feed', 'official_api', 'assisted_research'));

-- الاعتماد يشترط رابط دليل لأسعار مساعد الرصد (نفس دالة 001، تغيير سطر واحد)
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
  if p_status = 'verified' and s.kind in ('manual_upload', 'legacy_manual', 'assisted_research') and p_evidence_url is null then
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


-- المصدران: معتمدان باسم أول مشرف (من تهيئة الملف 001)، يقبلان الريال فقط
insert into tp.sources (id, name, kind, vertical, default_currency, time_zone, allow_automated, status,
                        permission_basis, terms_reviewed_at, approved_by, approved_at)
select v.id, v.name, 'assisted_research', v.vertical::tp.category_kind, 'SAR', 'Asia/Riyadh', true, 'approved',
       'رصد يدوي بحجم بشري من صفحات عامة لمواقع الوكلاء والموزعين الرسميين والمتاجر في السعودية، مع رابط وتاريخ لكل سعر. '
       || 'لا جمع آلي ولا نسخ من مواقع المقارنة. كل سعر غير موثق حتى يعتمده مشرف بعد فتح الرابط.',
       now(), b.admins[1], now()
from (values ('assisted-research-electronics', 'مساعد الرصد — إلكترونيات', 'electronics'),
             ('assisted-research-cars',        'مساعد الرصد — سيارات',     'cars')) v(id, name, vertical)
cross join tp.bootstrap_state b
on conflict (id) do nothing;

insert into tp.schema_migrations (version) values ('004-assisted-research') on conflict do nothing;

commit;

select (select count(*) from tp.sources where kind = 'assisted_research' and status = 'approved') as research_sources_expect_2,
       (select count(*) from tp.privilege_violations()) as privilege_violations_expect_0,
       (select string_agg(version, ', ' order by applied_at) from tp.schema_migrations) as migrations;
