# تشخيص: 568 € مقابل 202 € في صفحة الكلكولاسيون

## النتيجة: هذا سلوك متوقع، وليس خللاً في المزامنة

- «Vorschlag Grundkalkulation (netto)» = قيمة محسوبة مباشرة من حقول النموذج (النوع، المساحة/الساعات، التكرار، الدرج، الإضافات، الرابات) عبر `buildConsolidatedPositions` → `suggested`. إنها مجرد معاينة حيّة ولا تُكتب في أي مكان.
- «Positionen im Leistungsverzeichnis / Gesamt netto» = مجموع بنود `aiItems` فقط (`positionsTotal(lvPositions)`).
- الرابط الوحيد بينهما هو زر «Kalkulation übernehmen» (`applyCalculation`)، الذي يستبدل `aiItems` ببنود الاقتراح.

بما أن الزر لم يُضغط بعد، فالـ5 بنود الحالية (202 €) مصدرها آخر: اقتراح الذكاء الاصطناعي، أو استيراد LV من المشروع، أو إدخال يدوي. النص التوضيحي أسفل المربع يذكر ذلك صراحة، والمجموع المعتمد للعرض/الـPDF هو 202 € (LV) — أي أن قاعدة «LV هو المصدر الوحيد» لا تزال مطبّقة.

## ملاحظة جانبية (خلل حقيقي صغير اكتُشف أثناء الفحص)

`applyCalculation` يستبدل كامل `aiItems` ولا ينقل `section` ولا `sourceLvItemId`. فإذا كان المستخدم قد استورد بنود LV من مشروع (أقسام مختلفة) ثم ضغط «Kalkulation übernehmen»، تُمحى تلك البنود ويفقد ربطها بـ `project_lv_items` — وهو عكس ما عالجناه في إصلاح الـUpsert الأخير.

### إصلاح مقترح (اختياري، عند الموافقة)

- في `applyCalculation`: عدم مسح البنود المرتبطة بأقسام أخرى؛ استبدال بنود قسم «Kalkulation» فقط والحفاظ على البنود التي تحمل `sourceLvItemId` أو `section !== "Kalkulation"`.
- وسم البنود المُنشأة حديثاً بـ `section: KALK_SECTION` و `sourceLvItemId: null` صراحةً.
- إظهار تنبيه تأكيد عندما يوجد بنود من أقسام أخرى ستبقى دون تغيير.

ملف واحد فقط: `src/routes/_authenticated/kalkulation.tsx`.
