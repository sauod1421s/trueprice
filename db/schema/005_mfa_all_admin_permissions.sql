-- 005: التحقق الثنائي (aal2) شرط لكل صلاحيات الإدارة في القاعدة، لا الحساسة فقط.
-- التطبيق يشترط aal2 على كل صفحات وعمليات /admin؛ هذا يجعل القاعدة ترفض أيضًا أي جلسة aal1
-- حتى لو تجاوز أحد طبقة التطبيق. لا يحذف شيئًا. التراجع: 005_mfa_all_admin_permissions_rollback.sql
update tp.permissions set requires_mfa = true where not requires_mfa;
