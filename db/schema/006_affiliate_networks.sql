-- 006: تسجيل شبكتي العمولة ArabClicks و Admitad كمسودة (draft) لربط مصادر "ملف شبكة عمولة" بهما.
-- لا يعتمد أي مصدر ولا يضيف أي سعر ولا يحذف شيئًا. الاعتماد يتم لاحقًا لكل مصدر على حدة بأساس إذن مكتوب.
-- التراجع: 006_affiliate_networks_rollback.sql
insert into tp.affiliate_networks (id, name, website, status) values
  ('arabclicks', 'ArabClicks', 'https://www.arabclicks.com', 'draft'),
  ('admitad', 'Admitad', 'https://www.admitad.com', 'draft')
on conflict (id) do nothing;
