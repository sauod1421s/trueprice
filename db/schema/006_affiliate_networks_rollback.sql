-- تراجع 006: يحذف الشبكتين فقط إن لم يرتبط بهما أي مصدر
delete from tp.affiliate_networks n
 where n.id in ('arabclicks', 'admitad')
   and not exists (select 1 from tp.sources s where s.network_id = n.id);
