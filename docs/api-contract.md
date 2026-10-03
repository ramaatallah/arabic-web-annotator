# API Contract — Arabic Web Annotator (الإصدار 2)

آخر تحديث: 2026-10-03

هاد المرجع الوحيد لأسماء البيانات وأشكالها بين الأجزاء. أي تعديل عليه لازم يتفق عليه الثلاث أشخاص قبل ما ينكتب كود.

الفكرة: المستخدم بيظلل جملة، النظام بيطلّع الكلمات المهمة جواها وبيصنفها (NER)، والمستخدم بيكتب ملاحظة على الجملة. التصنيف بيظهر بالقائمة بس، والتظليل لون واحد.

## 0. الأجزاء والمنافذ

| الجزء | المنفذ | الملفات | الشخص |
|---|---|---|---|
| الواجهة على الصفحة | — | `extension/content.js`، `extension/styles.css` | 1 |
| NER والربط | 8000 | `ner-service/`، `extension/background.js`، `extension/manifest.json` | 2 |
| التخزين | 5000 | `backend/` (Node + SQLite) | 3 |
| البحث (RDF + SPARQL) | 8001 | `search-service/`، `extension/popup.js` | 3 |

`background.js` هو الوسيط الوحيد بين الإضافة وكل الخدمات (Node وNER). خدمة البحث بيناديها الـ popup مباشرة.

## 1. تعريفات مشتركة

### نص الصفحة وأماكن الكلمات
- **نص الصفحة** = كل النصوص المرئية بترتيب ظهورها بالـ DOM (نفس اللي بيمشي عليه `TreeWalker` بـ `content.js`، بدون الوسوم غير المرئية مثل `script` و`style`)، متصلة ببعض بدون أي تعديل.
- كل المواقع (`start_offset`، `end_offset`، `start`، `end`) أرقام حروف بدءاً من 0، والنهاية غير مشمولة (`النص = text.slice(start, end)`)، وبنفس طريقة جافاسكربت بالعد (UTF-16). للعربي بتطابق عد بايثون، لكن لو النص فيه إيموجي انتبهوا.
- ما في تطبيع للعربي (تشكيل، أشكال الألف...) على المواقع. التطبيع مؤجل لما نحسّن مطابقة النص.

### أنواع الكلمات (مؤقتة لحد ما الدكتور يأكد)

| `type` | الاسم | Class بالأنطولوجيا |
|---|---|---|
| `person` | شخص | `Person` |
| `city` | مدينة | `City` |
| `country` | دولة | `Country` |
| `university` | جامعة | `University` |
| `organization` | منظمة (غير الجامعات) | `Organization` |

خدمة NER بترجع هاي الأنواع بس. أي كلمة نوعها خارج القائمة ما بترجع. أي نوع جديد بيضاف هون وبالأنطولوجيا بنفس الوقت.

## 2. شكل البيانات

### الجملة (Annotation) كما بيرجعها السيرفر

```json
{
  "id": "anno_1727950000000",
  "user_id": null,
  "page_url": "https://example.com/universities",
  "selected_text": "جامعة النجاح الوطنية في نابلس",
  "prefix": "تُعدّ ",
  "suffix": " من أكبر الجامعات",
  "start_offset": 120,
  "end_offset": 149,
  "created_at": "2026-10-03T10:00:00Z",
  "entities": [
    { "id": 1, "text": "جامعة النجاح الوطنية", "type": "university", "start": 0, "end": 20 },
    { "id": 2, "text": "نابلس", "type": "city", "start": 24, "end": 29 }
  ],
  "notes": [
    { "id": 1, "text": "أكبر جامعة حكومية", "created_at": "2026-10-03T10:00:05Z" }
  ]
}
```

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | نص | تولّده الإضافة (`anno_` + `Date.now()`)، فريد |
| `user_id` | نص أو `null` | `null` لحد ما نعمل تسجيل دخول |
| `page_url` | نص | بعد التنظيف (القاعدة بقسم 5) |
| `selected_text` | نص | النص اللي ظلله المستخدم |
| `prefix` / `suffix` | نص | حتى 30 حرف من نص الصفحة قبل/بعد الجملة |
| `start_offset` / `end_offset` | رقم | موقع الجملة بنص الصفحة |
| `created_at` | نص | ISO 8601، بتجي من الإضافة |
| `entities` | مصفوفة | الكلمات المصنفة داخل الجملة |
| `notes` | مصفوفة | الملاحظات على الجملة، ممكن تكون فاضية |

### الكلمة (Entity)

| الحقل | ملاحظات |
|---|---|
| `id` | رقم، السيرفر بيعطيه (مش موجود بالـ body وقت الحفظ) |
| `text` | الكلمة كما بتظهر بالجملة |
| `type` | واحد من قائمة الأنواع بقسم 1 |
| `start` / `end` | موقع الكلمة **نسبةً لبداية `selected_text`** (مش للصفحة). موقعها بالصفحة = `start_offset` للجملة + `start` |

بالقاعدة بتتخزن `start` و`end` بعمودين اسمهم `start_offset` و`end_offset` (لأنو `end` كلمة محجوزة بـ SQL). السيرفر هو الوحيد اللي بيعمل هاد التحويل، وكل الـ JSON بيضل `start` و`end`.

### الملاحظة (Note)

| الحقل | ملاحظات |
|---|---|
| `id` | رقم، السيرفر بيعطيه |
| `text` | نص الملاحظة، مش فاضي |
| `created_at` | ISO 8601، السيرفر بيعمله |

## 3. جداول قاعدة البيانات (SQLite)

```
annotations: id TEXT PK, user_id TEXT, page_url TEXT, selected_text TEXT,
             prefix TEXT, suffix TEXT, start_offset INTEGER, end_offset INTEGER,
             created_at TEXT
notes:       id INTEGER PK AUTOINCREMENT, annotation_id TEXT → annotations.id ON DELETE CASCADE,
             text TEXT, created_at TEXT
entities:    id INTEGER PK AUTOINCREMENT, annotation_id TEXT → annotations.id ON DELETE CASCADE,
             text TEXT, type TEXT, start_offset INTEGER, end_offset INTEGER
```

- لازم `PRAGMA foreign_keys = ON` عند كل اتصال، وإلا ما بيشتغل `ON DELETE CASCADE`.
- العمود القديم `annotation` بجدول `annotations` بيضل بدون استخدام. الصفوف القديمة اللي فيها نص بتتنسخ كملاحظة بجدول `notes` وقت التحويل.
- مسار الداتابيز بيتحدد بـ `path.join(__dirname, ...)`، مش مسار نسبي.

## 4. طلبات السيرفر (Node، المنفذ 5000)

| الطلب | الـ body | الرد |
|---|---|---|
| `POST /annotations` | جملة كاملة (بدون `notes`، وبدون `id` للكلمات) + `entities` + `note` (نص أو `null`) | `201` والجملة بشكلها الكامل |
| `GET /annotations?url=...` | — | `200` ومصفوفة جمل بالشكل الكامل (`url` = `page_url` مشفّر) |
| `DELETE /annotations/:id` | — | `200 { "deleted": true }` وبيحذف كلماتها وملاحظاتها |
| `POST /annotations/:id/notes` | `{ "text": "..." }` | `201` والملاحظة |
| `PUT /notes/:id` | `{ "text": "..." }` | `200` والملاحظة بعد التعديل |
| `DELETE /notes/:id` | — | `200 { "deleted": true }` |

أخطاء مشتركة: `400` لمدخلات غلط (نص فاضي، `type` خارج القائمة، `start`/`end` خارج `selected_text`)، `404` لعنصر مش موجود، `409` لـ `id` مكرر.

`POST /annotations` بتحفظ الجملة وكلماتها وملاحظتها بعملية وحدة (transaction). `PUT /annotations/:id` القديم انشال.

## 5. قواعد مشتركة

- **تنظيف `page_url`:** الإضافة بتحسبه بدالة وحدة وبتستخدمها بالحفظ وبالاسترجاع: `location.href` بدون `#hash` وبدون بارامترات `utm_*`. نفس القيمة بتروح لـ `POST` ولـ `GET`.
- **قاعدة الاسترجاع (بـ `content.js`):** بتجرب `start_offset` أول شي. إذا النص هناك مش نفس `selected_text`، بتدور على كل ظهور للنص وبتختار اللي بيطابق `prefix` و`suffix`. إذا ما لقته، بتتجاهل الجملة بدون ما تخرّب الصفحة.
- **التظليل بعد الحفظ بس:** ما بنلوّن النص لحد ما `SAVE_ANNOTATION` يرجع `ok: true`.

## 6. خدمة NER (Python، المنفذ 8000)

```
POST http://localhost:8000/analyze
طلب: { "text": "درس أحمد في جامعة النجاح في نابلس" }
رد:  { "entities": [
         { "text": "أحمد", "type": "person", "start": 4, "end": 8 },
         { "text": "جامعة النجاح", "type": "university", "start": 12, "end": 24 },
         { "text": "نابلس", "type": "city", "start": 28, "end": 33 } ] }
```

- `start` و`end` نسبةً لبداية `text` المرسل.
- الكلمات مرتبة بـ `start`، وما بيتداخلوا. لو ما في كلمات: `{ "entities": [] }`.
- `400` لو `text` فاضي، والحد الأقصى 5000 حرف.
- `background.js` بيستنى 3 ثواني بحد أقصى. لو تأخرت الخدمة أو وقعت، الإضافة بتكمل بقائمة كلمات فاضية والمستخدم بيقدر يحفظ الملاحظة عادي.
- النسخة الأولى وهمية (قائمة كلمات صغيرة) بنفس شكل الرد، لحد ما النموذج الحقيقي يجهز.

## 7. رسائل بين أجزاء الإضافة (Content Script / Popup ↔ Background)

`background.js` بيستقبل رسائل بـ `chrome.runtime.sendMessage`:

```json
{ "type": "ANALYZE_TEXT", "text": "..." }
{ "type": "SAVE_ANNOTATION", "annotation": { "...": "جملة + entities + note" } }
{ "type": "GET_ANNOTATIONS", "page_url": "..." }
{ "type": "ADD_NOTE", "annotation_id": "...", "text": "..." }
{ "type": "UPDATE_NOTE", "id": 1, "text": "..." }
{ "type": "DELETE_NOTE", "id": 1 }
{ "type": "DELETE_ANNOTATION", "id": "..." }
```

وبيرجع دايماً:

```json
{ "ok": true, "data": ... }
{ "ok": false, "error": "..." }
```

| الرسالة | `data` |
|---|---|
| `ANALYZE_TEXT` | `{ "entities": [ ... ] }` |
| `SAVE_ANNOTATION` | الجملة بشكلها الكامل |
| `GET_ANNOTATIONS` | مصفوفة جمل بالشكل الكامل |
| `ADD_NOTE` / `UPDATE_NOTE` | الملاحظة |
| `DELETE_NOTE` / `DELETE_ANNOTATION` | `{ "deleted": true }` |

الرسالة `UPDATE_ANNOTATION` القديمة انشالت.

## 8. تخزين الإضافة (`chrome.storage.local`)

مفتاح واحد بس:

- **`enabled`**: `true` أو `false`. الـ popup (الشخص 3) بيكتبها بزر التفعيل، و`content.js` (الشخص 1) بيقرأها.

الجمل والملاحظات مش بتتخزن بالإضافة. مكانها السيرفر.

## 9. خدمة البحث (Python، المنفذ 8001) — مسودة

بتقرا `database.sqlite` للقراءة فقط وبتبني منه triples (RDF). الشكل التالي مسودة، والشخص 3 بيثبته هون قبل ما الـ popup يعتمد عليه:

```
POST http://localhost:8001/sparql
طلب: { "query": "SELECT ?u WHERE { ?u rdf:type ex:University }" }
رد:  { "results": [ ... ] }
```

أسماء Classes بالأنطولوجيا لازم تطابق قائمة الأنواع بقسم 1.

## 10. قرارات اتخذناها بالمسودة وبدها تأكيد بالـ PR

- `prefix` و`suffix`: 30 حرف.
- `page_url`: بدون `#hash` وبدون `utm_*`.
- مواقع الكلمات على نص الصفحة الخام، بدون تطبيع للعربي.
- قائمة الأنواع الخمسة مؤقتة لحد ما الدكتور يحدد.
- `user_id`: `null` لحد ما نعمل تسجيل دخول.

## سجل التغييرات

- **v2 (2026-10-03):** تقسيم الملاحظة لثلاث جداول (`annotations`، `notes`، `entities`)، وإضافة خدمة NER وطلبات الملاحظات والرسائل الجديدة، وحذف `PUT /annotations/:id` ورسالة `UPDATE_ANNOTATION` ومفتاح `annotations` من `chrome.storage`.
- **v1:** جدول واحد وملاحظة وحدة لكل جملة.