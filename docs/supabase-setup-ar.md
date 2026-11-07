# دليل إعداد Supabase لـ TruePrice — من لوحة التحكم فقط (بلا أوامر)

هذا الدليل لصاحب المشروع. كل الخطوات من موقع Supabase في المتصفح. أسماء القوائم قد تختلف قليلًا مع تحديثات
Supabase؛ المهم هو الإعداد نفسه. **لا تشارك أي كلمة مرور أو مفتاح سري في المحادثة أو في GitHub.**

> الترتيب: هذا الدليل (الإعدادات) ← الموافقة على `docs/supabase-production-plan.md` ← تنفيذ ملفات SQL ←
> (لاحقًا وبعد موافقة منفصلة) ربط الموقع على Vercel.

## 1) إغلاق التسجيل الذاتي

**Authentication → Sign In / Providers**

- مزود **Email**: مفعّل.
- **Allow new users to sign up**: أوقفه. لا أحد يستطيع إنشاء حساب بنفسه؛ المستخدمون تضيفهم أنت فقط.

## 2) التحقق الثنائي (MFA)

**Authentication → Multi-Factor**

- تأكد أن **TOTP (Authenticator app)** مفعّل (مجاني ومفعّل افتراضيًا عادةً).
- لوحة TruePrice تفرض التحقق الثنائي على كل مستخدم: في أول دخول تظهر صورة QR تمسحها بتطبيق مثل
  Google Authenticator أو Microsoft Authenticator، ثم تدخل الرمز المكوّن من 6 أرقام.

## 3) إنشاء أول مشرفَين

**Authentication → Users → Add user → Create new user**

- البريد وكلمة مرور قوية (12 حرفًا على الأقل)، وفعّل **Auto Confirm User**.
- كرّر لمشرف ثانٍ (مستحسن: الأسعار لا يعتمدها من استوردها، فوجود شخصين يجعل دورة العمل كاملة).
- انسخ **User UID** لكل منهما (يبدو هكذا: `3f1c…-…-…-…`). المعرّف ليس سرًا، ويُستخدم في خطوة التهيئة
  `tp.bootstrap_first_admins` في خطة التنفيذ.

لاحقًا، لإضافة مراجع أو مشاهد: أنشئه هنا بنفس الطريقة، ثم من لوحة TruePrice → **المستخدمون** الصق معرّفه
واختر دوره.

## 4) أمان الاتصال بالقاعدة

**Project Settings → Database → SSL Configuration**

- فعّل **Enforce SSL on incoming connections**.
- اضغط **Download certificate**: هذا الملف هو قيمة `DATABASE_CA_CERT` (ليس سرًا، لكنه يمنع أي خادم مزيف).

**Project Settings → Database → Network Restrictions** (اختياري): اتركه مفتوحًا حتى الربط مع Vercel، لأن عناوين
Vercel متغيرة في الخطة المجانية.

## 5) القيم التي سيحتاجها الموقع عند الإطلاق (لا تضعها في GitHub)

| المتغير | من أين | سري؟ |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL | لا |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → **Publishable key** | لا |
| `DATABASE_CA_CERT` | الملف المحمّل في الخطوة 4 | لا |
| `DATABASE_URL` | زر **Connect** → **Transaction pooler** (المنفذ 6543)، مع المستخدم `tp_app.<project-ref>` وكلمة المرور التي يولدها الملف `020_set_app_password.sql` | **نعم — مثل service_role** |
| `TP_DATA_SOURCE` | القيمة `db` | لا |

**لا تنسخ أبدًا** المفتاح السري (`sb_secret_…`) ولا `service_role`: الموقع لا يحتاجهما إطلاقًا، والكود يرفض
تشغيل الدخول إن وُضع مفتاح سري في متغير عام.

## 6) روابط الدخول

**Authentication → URL Configuration**

- **Site URL**: رابط الموقع الرسمي عند الإطلاق.
- **Redirect URLs**: نفس الرابط، ورابط معاينة Vercel إن استُخدم.

## 7) عند الإطلاق (يحتاج موافقة منفصلة — ليس الآن)

1. في Vercel: Settings → Environment Variables → أضف المتغيرات أعلاه لبيئة **Preview** أولًا.
2. افتح رابط المعاينة وتأكد: الصفحات تعمل، الدخول للوحة يطلب الرمز الثنائي، لا سعر يظهر قبل اعتماده.
3. بعدها فقط بيئة **Production**. لفتح اللوحة في الإنتاج يلزم أيضًا `TRUEPRICE_ADMIN_PREVIEW=on`.
4. للتراجع الفوري: احذف `TP_DATA_SOURCE` من Vercel وأعد النشر؛ يعود الموقع لملفاته الحالية كما هو.

## ملاحظات الخطة المجانية

- المشروع يتوقف بعد 7 أيام بلا نشاط ويُستأنف من اللوحة بضغطة (البيانات تبقى).
- لا نسخ احتياطية تلقائية: قبل أي تغيير كبير خذ نسخة من **Database → Backups** إن توفرت، أو اطلب مني تجهيز
  تصدير دوري. الترقية قرارك وحدك.
