-- =====================================================================
-- إعادة تفعيل ميزات عطّلها MVP مؤقتًا (002_mvp_overlay.sql). لا يُنفَّذ تلقائيًا.
-- يُنفَّذ فقط بعد موافقة صريحة، بدور الترحيل نفسه. كل جزء مستقل ويمكن تنفيذه وحده.
-- =====================================================================
begin;
set local role tp_owner;

-- (أ) قبول عملات غير الريال في الاستيراد (يتطلب أيضًا (ب) حتى تُحوَّل للريال وتظهر)
alter table tp.import_staged_rows drop constraint if exists mvp_sar_only;

-- (ب) تحويل العملات من لوحة الإدارة
grant execute on function admin_api.add_fx_rate(text, numeric, text, text, timestamptz) to authenticated;
grant execute on function admin_api.approve_fx_rate(bigint) to authenticated;
update tp.settings set value = 1 where key = 'mvp_fx_enabled';

-- (ج) الاستيراد الآلي
grant execute on function ingest_api.register_import(text, text, text, bigint, text, text, text, jsonb, jsonb, jsonb, jsonb),
  ingest_api.stage_import_rows(uuid, int, jsonb), ingest_api.seal_import(uuid, int),
  ingest_api.commit_import(uuid, text) to ingest_service;
update tp.settings set value = 1 where key = 'mvp_automated_import_enabled';

-- (د) الاستيراد الضخم: إعادة الحد الأصلي
update tp.settings s set value = o.value
from tp.settings o where s.key = 'max_commit_rows' and o.key = 'mvp_original_max_commit_rows';

commit;
