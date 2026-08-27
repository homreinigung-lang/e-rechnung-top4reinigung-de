# تقرير فحص فصل بيانات الشركات (Multi-Tenancy)

فحص للقراءة فقط. لم يُعدَّل أي كود. النتائج مبنية على قراءة سياسات قاعدة البيانات الفعلية وملفات الكود.

## الخلاصة

العزل بين الشركات على مستوى قاعدة البيانات **سليم وقوي**: كل الجداول الـ34 في المخطط العام عليها RLS مفعّلة، وكل جدول يحتوي بيانات شركة مربوط بـ `auth.uid() = user_id`. لم أجد أي سياسة تسمح لمستخدم بقراءة بيانات شركة أخرى.

الخطر الحقيقي ليس في RLS، بل في **عدد من دوال الخادم (server functions) التي تعمل بصلاحية service_role بدون أي تحقق من هوية المستدعي**.

## 1) RLS على الجداول الحساسة — سليم

| الجدول | الحالة |
|---|---|
| documents, document_items, customers, expenses | `auth.uid() = user_id` (+ إخفاء المحذوف soft-delete) |
| projects, project_lv_items, project_rooms, project_documents, project_assignments | `auth.uid() = user_id` |
| calculations, calculation_items | `auth.uid() = user_id` (ALL) |
| company_settings | `auth.uid() = user_id` + فهرس فريد على user_id |
| employees, time_entries, time_account_adjustments, chat_messages | مالك + قراءة ذاتية للموظف عبر `my_employee_id()` / `my_employee_owner()` |
| bank_connections, bank_transactions, recurring_*, map_locations, performance_rates, number_sequences, document_audit_log | مربوطة بـ user_id |
| Storage (firmen-dateien) | المسار يبدأ بـ `auth.uid()`، والمشغّل يصل لملفات موظفيه فقط |

الوصول الموسّع الوحيد للموظف مبني على دوال SECURITY DEFINER تربطه بصاحب العمل فقط — منطقياً صحيح.

## 2) سياسات فضفاضة — ثلاث ملاحظات فقط (لا تسريب بين الشركات)

| السياسة | التقييم | الخطورة |
|---|---|---|
| `plan_orders`: INSERT مسموح للجميع بـ `true` | مقصود (نموذج طلب باقة). لا قراءة للعامة. خطر إغراق/سبام فقط | منخفض |
| `platform_settings`: قراءة الصف `default` لأي زائر (anon) | يكشف IBAN/BIC/عنوان المنصة علنياً. مقصود للـ GiroCode لكنه بيانات بنكية مكشوفة | متوسط |
| `subscriptions` / `reviews` / `plans`: قراءة عامة مقيّدة (`visible_on_landing`, `approved`, `active`) | مقصود للصفحة التعريفية | منخفض |

## 3) الاستعلامات في الكود

- `kalkulation.tsx` وملفات الفواتير/المشاريع تستخدم عميل المتصفح فقط وتضع `user_id` عند الإدراج → معتمدة كلياً على RLS. **سليم**.
- `service_role` مستخدم في 12 ملفاً. الاستخدامات الآمنة: بوابة المستشار الضريبي (تحقق token + code ثم فلترة `user_id`)، دعوة الموظف، الاشتراك التجريبي، حذف الحساب (يتحقق من دور admin)، صيانة الصور (سكربت مجدول محمي بمفتاح).
- **الاستخدامات غير المحمية (أهم نتائج التقرير):**

| الدالة | المشكلة | الخطورة |
|---|---|---|
| `sendInvoiceEmail` (email.functions.ts) | بدون أي مصادقة: أي شخص يعرف الرابط يرسل بريداً بمرفق من نطاق الإرسال الخاص بك (تصيّد/سبام باسم الشركة، وحرق سمعة النطاق) | **عالٍ** |
| `recoverIncompleteAccount` (approval.functions.ts) | بدون مصادقة: تعيين كلمة مرور جديدة وتأكيد البريد لأي حساب "غير مكتمل" بمعرفة البريد فقط → استيلاء على حساب شركة مسجّلة حديثاً قبل تعبئة ملفها | **عالٍ** |
| `sendAuthConfirmationEmail` (auth-mail.functions.ts) | بدون مصادقة: توليد Magic-Link لأي بريد (يصل للبريد نفسه، فلا استيلاء مباشر) لكنه يسمح بإغراق البريد وبكشف وجود الحساب من عدمه (`unknown_account`) | متوسط |
| `getApprovalStatus` | تقبل أي `authUserId` وترجع حالته | منخفض |
| `geocodeAddresses`, `checkDomainDns` | بدون مصادقة → استهلاك حصص خدمات خارجية | منخفض |
| `accountant_access` (token+code) | لا يوجد حد لمحاولات إدخال الرمز (brute force) | متوسط |

## 4) ترقيم الفواتير — منفصل لكل شركة (سليم)

- `next_document_number` تعمل بـ `auth.uid()` وتحسب `MAX+1` ضمن مستندات المستخدم فقط.
- قيد فريد `documents(user_id, type, number)` → لا تعارض بين الشركات، وكل شركة تبدأ من RE-2026-0001 الخاصة بها.
- `number_sequences` مفتاحه `(user_id, kind, year)`، وسياسته قراءة ذاتية فقط.
- لا تسريب معلومات: الشركة لا ترى عدّاد غيرها.

## 5) الإعدادات المشتركة

- `company_settings` لكل شركة (فريد على user_id) — سليم.
- `platform_settings` مشترك عمداً (بيانات بنك المنصة) — ليس خطأ، لكن انظر البند 2.
- `plans` مشتركة عمداً (باقات المنصة).
- قوالب النصوص (`document-texts.ts`) ثوابت في الكود بلا أسماء شركات ثابتة — سليم للتعدد.
- `performance_rates` لكل مستخدم — سليم.

## توصيات مقترحة (للتنفيذ لاحقاً عند الطلب)

1. إضافة `requireSupabaseAuth` إلى `sendInvoiceEmail` وربط المرسل بإعدادات شركة المستخدم على الخادم.
2. حماية `recoverIncompleteAccount`: استبدالها بتدفق "إعادة تعيين كلمة المرور" القياسي عبر رابط بريدي بدل تعيين كلمة سر مباشرة.
3. تقييد `sendAuthConfirmationEmail` و`getApprovalStatus` (رد موحّد بلا كشف، وحد معدّل).
4. قصر قراءة `platform_settings` العامة على أعمدة غير بنكية، أو تمرير بيانات الدفع عبر دالة خادم بعد المصادقة.
5. إضافة عدّاد محاولات فاشلة/تعطيل مؤقت لبوابة المستشار الضريبي.
6. مصادقة `geocodeAddresses` و`checkDomainDns`.

لا حاجة لأي تغيير في RLS أو في منطق الترقيم من أجل استضافة شركات تنظيف إضافية.
