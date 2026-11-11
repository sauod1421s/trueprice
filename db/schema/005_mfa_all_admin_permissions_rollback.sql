-- تراجع 005: إعادة الصلاحيات التي لم تكن تتطلب التحقق الثنائي قبل 005
update tp.permissions set requires_mfa = false
 where id in ('admin:read','audit:read','import:preview','match:review','price:reject','price:verify','requests:read','stats:read');
