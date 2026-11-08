-- بصمة بنية TruePrice (للمقارنة بين نسخة الاختبار وقاعدة Supabase): الجداول والأعمدة والقيود والدوال والسياسات
-- والصلاحيات والمالكين في مخططات المشروع. تُطبَّع أسماء دور الترحيل المحلي (supa_postgres) إلى postgres،
-- ونهايات الأسطر في نصوص الدوال (اللصق في SQL Editor قد يحوّلها إلى CRLF دون أي أثر وظيفي).
-- قراءة فقط.
select md5(string_agg(x, E'\n' order by x)) as fingerprint, count(*) as items from (
  select replace(x, 'supa_postgres', 'postgres') as x from (
    select format('rel %s.%s %s acl=%s rls=%s owner=%s', n.nspname, c.relname, c.relkind,
                  (select string_agg(a::text, ',' order by a::text) from unnest(c.relacl) a), c.relrowsecurity,
                  pg_get_userbyid(c.relowner))
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('tp','pub','admin_api','ingest_api','research_api')
    union all
    select format('col %s.%s.%s %s notnull=%s default=%s', n.nspname, c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                  a.attnotnull, pg_get_expr(d.adbin, d.adrelid))
      from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname in ('tp','pub','admin_api','ingest_api','research_api') and a.attnum > 0 and not a.attisdropped and c.relkind in ('r','v')
    union all
    select format('con %s.%s %s %s', n.nspname, c.relname, k.conname, pg_get_constraintdef(k.oid))
      from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('tp','pub','admin_api','ingest_api','research_api')
    union all
    select format('fn %s.%s(%s) %s acl=%s owner=%s secdef=%s cfg=%s', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid), md5(replace(p.prosrc, chr(13), '')),
                  (select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a), pg_get_userbyid(p.proowner),
                  p.prosecdef, p.proconfig)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('tp','pub','admin_api','ingest_api','research_api')
    union all
    select format('pol %s.%s %s %s %s %s', schemaname, tablename, policyname, roles, cmd, md5(coalesce(qual,'') || coalesce(with_check,'')))
      from pg_policies where schemaname in ('tp','pub','admin_api','ingest_api','research_api')
    union all
    select format('trg %s.%s %s', n.nspname, c.relname, pg_get_triggerdef(t.oid))
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('tp','pub','admin_api','ingest_api','research_api') and not t.tgisinternal
    union all
    select format('nsp %s acl=%s owner=%s', nspname, (select string_agg(a::text, ',' order by a::text) from unnest(nspacl) a),
                  pg_get_userbyid(nspowner))
      from pg_namespace where nspname in ('tp','pub','admin_api','ingest_api','research_api')
    union all
    select format('enum %s %s', t.typname, (select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))
      from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'tp' and t.typtype = 'e'
    union all
    select format('role %s login=%s inherit=%s', rolname, rolcanlogin, rolinherit)
      from pg_roles where rolname in ('tp_owner','tp_app','web_reader','ingest_service','tp_research')
  ) raw(x)
) s(x);
