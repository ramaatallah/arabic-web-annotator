# API Contract & Data Schema Definition (Phase 2)

## 1. Highlight Data Model
This object represents a text highlight created by the user on a web page.

```json
{
  "id": "string (UUID v4 or timestamp-based ID)",
  "url": "string (Full page URL where highlight was created)",
  "text": "string (Selected Arabic text content)",
  "color": "string (Hex code or predefined name, e.g., '#FFD700')",
  "range": {
    "startXPath": "string (XPath selector to start node)",
    "startOffset": "number (Character offset within start node)",
    "endXPath": "string (XPath selector to end node)",
    "endOffset": "number (Character offset within end node)"
  },
  "createdAt": "string (ISO 8601 timestamp)",
  "noteId": "string | null (Reference to associated note ID if present)"
}
{
  "id": "string (UUID v4 or timestamp-based ID)",
  "highlightId": "string (ID of the parent highlight)",
  "text": "string (Content of the note)",
  "createdAt": "string (ISO 8601 timestamp)",
  "updatedAt": "string (ISO 8601 timestamp)"
}ذ