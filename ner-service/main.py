from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# قائمة الكلمات المعروفة (نسخة تجريبية)
KNOWN_WORDS = {
    "أحمد": "person",
    "جامعة النجاح": "university",
    "نابلس": "city",
    "فلسطين": "country",
    "وزارة الصحة": "organization",
}


class AnalyzeRequest(BaseModel):
    text: str


def find_entities(text: str):
    found = []
    # الكلمات الأطول أولاً، فلو تداخلت كلمتان بنختار الأطول
    for word in sorted(KNOWN_WORDS, key=len, reverse=True):
        start = text.find(word)
        while start != -1:
            end = start + len(word)
            overlaps = any(start < e["end"] and end > e["start"] for e in found)
            if not overlaps:
                found.append(
                    {"text": word, "type": KNOWN_WORDS[word], "start": start, "end": end}
                )
            start = text.find(word, start + 1)
    return sorted(found, key=lambda e: e["start"])


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    return {"entities": find_entities(req.text)}