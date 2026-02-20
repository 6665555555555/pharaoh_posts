بوابتي — دليل التحضير للنشر

ملخص:
هذا المستودع يحتوي على واجهة أمامية بسيطة تستخدم HTML/CSS/Vanilla JS مع Firebase (Auth / Firestore / Storage).

خطوات إعداد للإطلاق (Production checklist):

1. إعداد Firebase
- افتح `firebase-config.js` وتأكد من استبدال القيم بقيم مشروعك الفعلية.
- تحقق من `storageBucket` إذا كانت بالشكل `your-project.appspot.com`.

2. حماية وتهيئة الخادم
- شغّل الموقع دائماً عبر HTTPS (TLS).
- أضف رؤوس أمان HTTP على مستوى الخادم (مثال Nginx/Express):
  - `Content-Security-Policy` (CSP) صارم — سمح فقط للمصادر الضرورية.
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer-when-downgrade`

مثال CSP بسيط (تعديل حسب حاجتك):
Content-Security-Policy: default-src 'self'; script-src 'self' https://www.gstatic.com https://www.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; connect-src 'self' https://*.firebaseio.com https://firestore.googleapis.com https://firebasestorage.googleapis.com;

3. التحقق من الأمان في الواجهة
- تأكد من أن الخادم يعيد التحقق من جميع المدخلات قبل حفظها أو تنفيذ عمليات عليها.
- لا تعتمد فقط على التحقق من الجانب العميل.
- استخدم تجزئة وكلمة مرور آمنة على الخادم (bcrypt/argon2) مع salt.

4. اختبارات يدوية سريعة (QA)
- افتح الموقع وتحقق من:
  - فتح/إغلاق نوافذ التسجيل وتسجيل الدخول بسلاسة.
  - تحقق من رسائل الخطأ العامة عند إدخال بيانات غير صالحة.
  - تحقق من عدم وجود إعادة تحميل للصفحة عند إرسال النماذج.
  - حاول إدخال نصوص HTML/JS في حقول النص وتحقق أن القيم المرسلة معقمة.

5. مراقبة وLogging
- أضف مراقبة أخطاء (Sentry أو ما شابه) لتجميع أخطاء العميل.
- سجّل الأحداث المهمة على الخادم (إنشاء حساب، فشل تسجيل دخول، محاولات رفع ملفات كبيرة).

6. تحسينات الأداء
- ضغط/تحزيم الأصول (CSS/JS) قبل النشر.
- استخدم CDN للمكتبات العامة إن أمكن.

كيفية تشغيل محلياً:

```bash
# من داخل المجلد
python -m http.server 8000
# ثم افتح http://localhost:8000
```

ملحوظة أخيرة:
- إذا رغبت، أقدّم لك مثال خادم Node/Express للتعامل الآمن مع نقاط النهاية (signup/login) وتنفيذ CSP على مستوى الخادم.

---
إذا أردت أكمّل: أقدر أضيف ملف `server.js` بسيط مع نقاط نهاية للتحقق على الخادم وشرح كيفية نشر إلى Heroku/Render/Vercel/Netlify.