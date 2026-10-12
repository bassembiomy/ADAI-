# مراجعة ثانية لتحريك البلوكات — 8 أكتوبر 2026

تمت إعادة إنتاج الأعطال باختبارات متصفح قبل إصلاحها، بدل الاكتفاء باختبارات السحب البسيط السابقة.

| المشكلة المثبتة | الإصلاح |
| --- | --- |
| حركة بلوك محدد تضيع إذا اكتمل السحب قبل تحديث React | إنشاء gesture synchronously للبلوك المحدد وغير المحدد، مع حفظ العناصر التي تتحرك وقت الضغط |
| IBD Part سريع السحب لا يتحرك أو يستخدم التحديد القديم | مشاركة نفس دورة السحب مع Parts ورموز Requirements وPackage |
| السحب ينتهي عند مغادرة الكانفاس رغم استمرار الضغط | متابعة الحركة والإفلات من window handlers ثابتة؛ لا يعتبر mouseleave إفلاتًا أثناء السحب |
| الحركة تستمر بعد فقدان تركيز النافذة | إنهاء gesture عند blur باستخدام آخر موقع ماوس، وتنظيف سحب البورتات والحركة المؤجلة أيضًا |
| حركتان منفصلتان تُدمجان في Undo واحد | عدم استخدام coalesce key ثابت بين gestures منفصلة |
| Undo حركة مجموعة يعيد عنصرًا واحدًا فقط | حفظ كل مواقع المجموعة في batch واحدة عند الإفلات |
| Snap يغيّر المسافات بين عناصر المجموعة | تقريب موضع العنصر المضغوط وتطبيق delta نفسها على بقية المجموعة |
| مجموعة IBD تتقلص مسافاتها عند الاصطدام بالإطار | تقييد delta المجموعة المشتركة عند حدود الإطار |
| إطار IBD يرجع بعد الإفلات مع خطأ Presentation not found | إنشاء presentation للإطار الضمني بأبعاده الكاملة ضمن نفس batch التي تحفظ حركته وحركة Parts التابعة له |

تحديث المواضع أثناء الحركة يبقى في presentation drafts وبمعدل animation frame. لا يُسجّل snapshot لبيانات State Machine عند سحب رمز SysML. لم تتغير workers أو solvers أو بروتوكولات الحساب.

النطاق المؤكد في هذه الجولة: Blocks في BDD وRequirements وPackage، وParts وإطار IBD. لا تدّعي هذه الجولة إعادة تحقق شامل من حركة State Machine أو React Flow في X-Bridges/OPM.

## التحقق

```powershell
npx playwright test tests/e2e/smooth-block-movement.spec.ts tests/e2e/sysml-ibd-part-ports.spec.ts tests/e2e/sysml-diagram-connections-review.spec.ts --project=chromium --workers=1
npx vitest run src/engine/sysml/patches.test.ts src/services/sysmlPresentationCommands.test.ts src/services/sysmlProjectionState.test.ts --no-file-parallelism
npx tsc --noEmit
```

النتائج النهائية: 31 اختبار متصفح ناجح، و21 اختبار وحدة ناجح، وTypeScript بدون أخطاء. اختبارات المتصفح تشمل الحفظ وإعادة الفتح، والـAssembly/Delegation، وموقع طرف الكونكشن بعد تحريك البورت، ومراجعة اتصال Use Case وSequence وActivity وPackage وRequirements السابقة. تمت مراجعة التعديلات بواسطة مراجع مستقل، وفحص diff بدون أخطاء whitespace.
