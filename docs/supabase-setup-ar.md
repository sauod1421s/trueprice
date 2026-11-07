# دليل إعداد Supabase لـ TruePrice — من لوحة التحكم فقط (بلا أوامر)

هذا الدليل لصاحب المشروع. كل الخطوات من موقع Supabase في المتصفح. أسماء القوائم قد تختلف قليلًا مع تحديثات
Supabase؛ المهم هو الإعداد نفسه. **لا تشارك أي كلمة مرور أو مفتاح سري في المحادثة أو في GitHub.**

> الترتيب: الخطوات 1–3 ← تشغيل `db/supabase/setup_all.sql` مرة واحدة (3ب) ← الشهادة (4) ← متغيرات المعاينة على
> Vercel (7). خطة القاعدة وما يحتويه الملف: `docs/supabase-production-plan.md`.

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
- لا حاجة لنسخ أي معرّف: ملف الإعداد يمنح صلاحية المشرف تلقائيًا لكل مستخدم موجود في Authentication، لذلك
  يجب أن يكون فيه مستخدم أو مستخدمان فقط (المشرفون) عند تشغيله، وإلا يتوقف قبل أي تغيير.

لاحقًا، لإضافة مراجع أو مشاهد: أنشئه هنا بنفس الطريقة، ثم من لوحة TruePrice → **المستخدمون** الصق معرّفه
واختر دوره.

## 3ب) تشغيل ملف الإعداد (مرة واحدة)

**SQL Editor → New query**: الصق محتوى `db/supabase/setup_all.sql` كاملًا ← **Run** (إن ظهر تنبيه عملية مدمرة
فالتأكيد آمن: الكلمات سببها إعادة إنشاء سياسات RLS بأسمائها). النتيجة صف واحد:

- `database_url` — **سري**: انسخه مباشرة إلى Vercel (الخطوة 7) ولا ترسله في أي رسالة.
- بقية الأعمدة فحوص: يجب أن تطابق القيمة في اسم العمود (`expect_0` = صفر، `expect_52` = 52، ...).

## 4) أمان الاتصال بالقاعدة

**Project Settings → Database → SSL Configuration**

- فعّل **Enforce SSL on incoming connections**.
- اضغط **Download certificate**: هذا الملف هو قيمة `DATABASE_CA_CERT` (ليس سرًا، لكنه يمنع أي خادم مزيف).

**Project Settings → Database → Network Restrictions** (اختياري): اتركه مفتوحًا حتى الربط مع Vercel، لأن عناوين
Vercel متغيرة في الخطة المجانية.

## 5) القيم التي يحتاجها الموقع (لا تضعها في GitHub)

| المتغير | القيمة | سري؟ |
| --- | --- | --- |
| `TP_DATA_SOURCE` | `db` | لا |
| `DATABASE_URL` | عمود `database_url` من نتيجة ملف الإعداد (تأكد أن اسم الخادم بعد `@` يطابق **Connect → Transaction pooler**) | **نعم — مثل service_role** |
| `DATABASE_CA_CERT` | محتوى الشهادة المحمّلة في الخطوة 4 (يبدأ بـ `-----BEGIN CERTIFICATE-----`) | لا |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xlpzfnespldgaxkgskkg.supabase.co` | لا |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | المفتاح العام `sb_publishable_…` من Project Settings → API Keys | لا |
| `TRUEPRICE_ADMIN_PREVIEW` | `on` (لفتح لوحة الإدارة) | لا |

**لا تنسخ أبدًا** المفتاح السري (`sb_secret_…`) ولا `service_role`: الموقع لا يحتاجهما إطلاقًا، والكود يرفض
تشغيل الدخول إن وُضع مفتاح سري في متغير عام.

## 6) روابط الدخول

**Authentication → URL Configuration**

- **Site URL**: رابط الموقع الرسمي عند الإطلاق.
- **Redirect URLs**: نفس الرابط، ورابط معاينة Vercel إن استُخدم.

## 7) ربط المعاينة على Vercel (فرع `mvp-live-preview` فقط)

1. Vercel → المشروع → **Settings → Environment Variables** → لكل متغير من الجدول أعلاه: البيئة **Preview** فقط،
   ثم في خانة الفرع اختر/اكتب `mvp-live-preview` (حتى لا يصل لأي فرع آخر). **لا تختر Production.**
2. **Deployments** → آخر نشر للفرع `mvp-live-preview` → **Redeploy** (المتغيرات تُقرأ وقت البناء).
3. افتح `/api/health` على رابط المعاينة: المتوقع `"dataSource":"db"` و`"db":{"ok":true}` و`"adminLogin":"supabase"`.
   إن ظهر `reason` فهو رمز يحدد المشكلة دون كشف أي سر (مثل `tls` = الشهادة، `auth_failed` = كلمة المرور،
   `tenant_not_found` = اسم الخادم في الرابط).
4. للتراجع الفوري: احذف `TP_DATA_SOURCE` من متغيرات المعاينة وأعد النشر؛ تعود المعاينة لملفات الموقع الحالية.

الإنتاج (الموقع الرسمي) خارج هذه الخطوات تمامًا ويحتاج موافقتك الصريحة: `docs/rollback-and-launch-ar.md`.

## ملاحظات الخطة المجانية

- المشروع يتوقف بعد 7 أيام بلا نشاط ويُستأنف من اللوحة بضغطة (البيانات تبقى).
- لا نسخ احتياطية تلقائية: قبل أي تغيير كبير خذ نسخة من **Database → Backups** إن توفرت، أو اطلب مني تجهيز
  تصدير دوري. الترقية قرارك وحدك.
