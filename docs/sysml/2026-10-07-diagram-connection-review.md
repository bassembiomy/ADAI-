# مراجعة الدياجرمات والبورتات والكونكشن — 7 أكتوبر 2026

تمت مراجعة مسارات التحرير في التطبيق والنموذج الدلالي، مع اختبارات متصفح تستخدم الأدوات الفعلية للاتصال وتعديل البورتات. هذه مراجعة للسلوك الموجود، وليست شهادة مطابقة كاملة لـCameo أو لكل SysML 1.6.

## الإصلاحات

| المكان | سبب المشكلة | السلوك بعد الإصلاح |
| --- | --- | --- |
| IBD: بورتات البارت | البحث عن نوع البارت داخل العناصر المرسومة فقط؛ تعريف الـBlock عادة خارج الـIBD | يتم تحميل تعريف النوع بالـID، وتظهر بورتاته على كل بارت يستخدمه، بدون رسم تعريف الـBlock داخل الدياجرم |
| IBD: لوحة الخصائص | إرسال بيانات العرض للبورت كأنها بيانات دلالية؛ الـmultiplicity كانت نصًا | يمكن إنشاء البورت وتعديل اسمه ونوعه واتجاهه مع الحفاظ على multiplicity وconjugation وبيانات التعريف |
| IBD: البارت والكونكشن | خلط ID الدياجرم مع ID الـBlock الذي يملكه | ملكية الكونكشن تبقى للـBlock، وعرضه ومواقع البارتات والبورتات تُحفظ في الدياجرم النشط؛ إنشاء البارت وعرضه خطوة واحدة تدعم Undo/Redo |
| IBD: إطار الـBlock | الإطار لم يكن ظاهرًا في IBD فارغ؛ ومكان بورت الإطار المحفوظ لم يُطبّق عند الرسم | يظهر الإطار وبورتاته، ويطبّق مكان البورت الخاص بالدياجرم على الرمز وطرف الكونكشن |
| IBD: سحب بورت متصل | منطقة الضغط الشفافة للكونكشن كانت تغطي بورت الإطار | يُرسم الإطار خلف الكونكشن، وتُرسم بورتاته أمامه؛ يمكن سحب البورت المتصل، ويتحرك طرف الخط معه |
| IBD: إعادة typing | التحقق المحلي كان يكتفي بوجود النوع الجديد | يُرفض تغيير نوع البارت المتصل لو النوع الجديد لا يحتوي البورت الذي ينتهي عنده الكونكشن |
| Package | إسقاط بعض أنواع العلاقات إلى Trace | تُحفظ وتُعرض أنواع Import/Merge/Conform/Expose الأصلية |
| Requirements وعرض عناصر Use Case | إسقاط Actors/Subjects/UseCases من الإسقاط النشط، وعدم تحويل Satisfy/Refine الخاص بالـUse Case | الإسقاط يستعيد هذه العناصر؛ تم التحقق في المتصفح من ظهور Use Case وSatisfy في Requirements؛ عرض كل أنواع العناصر المختلطة يظل ضمن قيود الواجهة |
| Activity | Object Flow كان يرفض decision/merge/fork/join كأطراف | يمكن تمرير Object Flow عبرها، واستنتاجه بين عقدتي routing إذا اتصلت إحداهما بتدفق بيانات؛ اتجاه input/output pin ما زال يتحقق |
| Sequence والتحقق المشترك | تقرير scoped جزئي كان يمسح أخطاء النموذج القديمة بعد rename | تبقى التشخيصات القديمة ظاهرة؛ الوضع الافتراضي يرفض الأخطاء الجديدة، والوضع strict يرفض القديمة أيضًا؛ سلسلة rename لا تعيد المسح الكامل كل مرة |

في IBD البورت يُعرّف على الـBlock الذي يكتب البارت، لذلك إضافته تظهر على البارتات التي تستخدم نفس النوع. هذا يتفق مع [دليل Cameo لعرض parts and ports](https://docs.nomagic.com/MT/2026x-refresh1/magic-cyber-systems-engineer---cameo-systems-modeler/displaying-parts-and-ports-in-sysml-v1-303991203.html). فصل تعريف العنصر عن عرضه في الدياجرم هو أساس الإصلاح، مع مقارنة مسار الاتصال بـ[دليل Cameo للـIBD](https://docs.nomagic.com/MT/2026x/magic-systems-of-systems-architect---cameo-enterprise-architecture/connecting-blocks-in-sysml-internal-block-diagram-272731190.html).

## نطاق مراجعة باقي الدياجرمات وحدود المطابقة

| الدياجرم | ما تمت مراجعته | ما لا تزال المراجعة تعتبره ناقصًا |
| --- | --- | --- |
| BDD | علاقات typing/association/generalization، تحويل حقول البورتات، فصل المواقع حسب الدياجرم، واختبارات التحريك | compartments المسماة للأجزاء والقيم والعمليات غير مكتملة؛ بعض classifiers ليس لها رمز ومحرر كامل |
| IBD | Standard/Flow/Proxy/Full Ports، Assembly وDelegation، العزل بين الدياجرمات، تحريك البورت والحفظ وإعادة الفتح | inherited parts/ports لا تُرسم بالكامل؛ الأجزاء المتداخلة لها layout تلقائي؛ خطوط Allocate لا تُرسم على IBD |
| Requirements | Satisfy/Verify/Refine/Trace وقواعد الاتجاه، عناصر Use Case المعروضة، ومراجع State عبر الدياجرمات | ليست مراجعة شاملة لكل وظائف إدارة المتطلبات في Cameo |
| Package | سياسة العلاقات وإسقاطها، وأداة Import في المتصفح | View لا يولّد تلقائيًا المحتوى الذي يعرضه؛ المخاوف ليست UML Comments |
| Use Case | سياسة Include/Extend/Association/Generalization واختبارات المكوّن، واتصال Include في المتصفح | تحرير وحذف Extension Points من الواجهة وأداة Allocate غير مكتملين |
| Activity | قواعد endpoints وguards وpins وrouting، واتصال pin → decision → pin في المتصفح | type propagation عبر عقد routing غير متحقق بالكامل؛ structured/interruptible/expansion regions والتنفيذ غير متاحين |
| Sequence | قواعد lifelines/messages/replies/fragments، اختبارات الواجهة، واتصال synchronous call/reply في المتصفح | gates/coregions والتنفيذ والتحويل العكسي من PlantUML غير متاحين |
| State Machine | اتصال State بالمتطلبات عبر الدياجرمات وقواعد الاتجاه في اختبارات النموذج والمتصفح | لا يوجد ادعاء بمطابقة كل semantic variation point في UML/Cameo |
| Parametric | النموذج الدلالي لـConstraintBlocks والـbinding وقواعده وحفظه | لا يوجد canvas إنتاجي للـParametric، ولا محرر كامل للـparameters/expressions، ولا constraint solver |

التفاصيل الأصلية للحدود موثقة كذلك في `src/engine/sysml/profile.ts`. لم تُغيّر workers أو بروتوكولات الحساب أو الـsolvers. الحصول على بيانات أنواع البارتات يتم بالـIDs الموجودة بدل إسقاط كامل النموذج على كل رسم؛ الـfull validation الخاص بتعديلات typing مقصود حتى تُثبت قواعده المحلية باختبارات تكافؤ.

## التحقق

الأوامر المستخدمة:

```powershell
npx tsc --noEmit
npx vitest run src/engine/sysml src/components/sysml src/features/sysml src/services/sysml src/services/reportModelConsistency.test.ts --no-file-parallelism
npx playwright test tests/e2e/sysml-ibd-part-ports.spec.ts tests/e2e/sysml-diagram-connections-review.spec.ts tests/e2e/sysml-state-requirement-cross-diagram.spec.ts tests/e2e/smooth-block-movement.spec.ts --project=chromium --workers=1
```

النتيجة النهائية: **1834 اختبارًا ناجحًا في 186 ملفًا**، و**20 سيناريو متصفح ناجحًا على Chromium العادي**، وفحص TypeScript ناجح. فحص whitespace للتعديلات ناجح. تشمل سيناريوهات المتصفح اختبارات التحريك السابقة والحفظ وإعادة الفتح، والبورتات الأربعة وAssembly/Delegation وUse Case Include وSequence call/reply وActivity routing وPackage Import وRequirements Satisfy وState traceability.

اختبارات الاتصال تستخدم أزرار وأطراف الواجهة الفعلية؛ يتم تجهيز النموذج فقط عبر command gateway. اختبار الحفظ ينزّل ملف `.adia` ويعيد فتحه عبر file input الحقيقي. اختبار سحب بورت الإطار المتصل يقارن موضع الرمز بموضع بداية مسار الكونكشن على الشاشة، ولا يكتفي بوجود الخط.
