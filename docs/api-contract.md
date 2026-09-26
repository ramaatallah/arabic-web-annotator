# API Contract — Arabic Web Annotator

هاد المرجع الوحيد لأسماء البيانات. أي تعديل عليه لازم يتفق عليه الثلاث مسارات.

## 1. شكل الملاحظة (Annotation)

كل ملاحظة عنصر واحد بهاد الشكل، بدون تقسيم لجدولين:

```json
{
  "id": "a1b2c3",
  "user_id": "u1",
  "page_url": "https://example.com/article",
  "selected_text": "النص المظلل",
  "prefix": "كلمات قبل النص",
  "suffix": "كلمات بعد النص",
  "annotation": "نص الملاحظة",
  "created_at": "2026-09-19T10:00:00Z"
}
```

| الحقل | النوع | ملاحظات |
|---|---|---|
| `id` | نص | فريد لكل ملاحظة |
| `user_id` | نص | مين كتب الملاحظة |
| `page_url` | نص | `location.href` بالضبط، بدون تعديل |
| `selected_text` | نص | النص اللي ظلله المستخدم |
| `prefix` / `suffix` | نص | كلمات قبل/بعد النص، لإعادة التظليل بدقة |
| `annotation` | نص | محتوى الملاحظة |
| `created_at` | نص | ISO 8601 |

## 2. تخزين الإضافة (`chrome.storage.local`)

مفتاحين فقط:

- **`enabled`**: `true` أو `false`. المسار 2 بيكتبها (زر التفعيل)، المسار 1 بيقرأها.
- **`annotations`**: مصفوفة فيها عناصر بالشكل فوق. المسار 1 بيضيف عليها، المسار 2 بيعرضها ويحذف منها.

لا نستخدم `highlights` أو `notes` منفصلين.

## 3. طلبات السيرفر (Backend API)

```
POST   /annotations          إضافة ملاحظة — الـ body هو عنصر annotation كامل
GET    /annotations?url=...  ملاحظات صفحة معينة (url = page_url مشفّر)
PUT    /annotations/:id      تعديل annotation لملاحظة موجودة
DELETE /annotations/:id      حذف ملاحظة
```

اسم عمود الجدول المطابق لـ `selected_text` هو **`selected_text`** (نفس اسم الحقل بالضبط، بدون تبديل ترتيب الكلمتين).

## 4. رسائل بين أجزاء الإضافة (Content Script / Popup ↔ Background)

`background.js` هو الوسيط الوحيد مع السيرفر. بيستقبل رسائل بـ `chrome.runtime.sendMessage`:

```json
{ "type": "SAVE_ANNOTATION", "annotation": { ... } }
{ "type": "GET_ANNOTATIONS", "page_url": "..." }
{ "type": "UPDATE_ANNOTATION", "id": "...", "changes": { "annotation": "..." } }
{ "type": "DELETE_ANNOTATION", "id": "..." }
```

وبيرجع دايماً:

```json
{ "ok": true, "data": ... }
{ "ok": false, "error": "..." }
```