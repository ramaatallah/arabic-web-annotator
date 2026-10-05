"""قياس دقة خدمة التحليل (NER) على جمل الاختبار.

الاستخدام:
    1. شغلي الخدمة من مجلد ner-service:  uvicorn main:app --port 8000
    2. من مجلد ner-eval:                 python evaluate.py
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

# عشان العربي يطلع صح بالـ Terminal
sys.stdout.reconfigure(encoding="utf-8")

API_URL = "http://localhost:8000/analyze"
SENTENCES_FILE = Path(__file__).parent / "sentences.json"


def analyze(text):
    """يبعت الجملة للخدمة ويرجع قائمة الكلمات اللي لقتها."""
    body = json.dumps({"text": text}).encode("utf-8")
    request = urllib.request.Request(
        API_URL, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        return json.load(response)["entities"]


def as_set(entities):
    """كل كلمة بتصير زوج (النص، النوع) عشان نقارن بسهولة."""
    return {(e["text"], e["type"]) for e in entities}


def main():
    sentences = json.loads(SENTENCES_FILE.read_text(encoding="utf-8"))
    correct = wrong = missing = 0
    mistakes = []

    for number, item in enumerate(sentences, start=1):
        try:
            got = as_set(analyze(item["text"]))
        except urllib.error.HTTPError as err:
            print(f"الخدمة ردت بخطأ {err.code} على الجملة {number}.")
            return
        except urllib.error.URLError:
            print("ما قدرت أتصل بالخدمة. تأكدي إنو uvicorn شغّال على المنفذ 8000.")
            return

        expected = as_set(item["expected"])
        extra = got - expected    # الخدمة رجّعتها وهي غلط
        absent = expected - got   # كان لازم تلاقيها وما لقتها

        correct += len(got & expected)
        wrong += len(extra)
        missing += len(absent)
        if extra or absent:
            mistakes.append((number, item["text"], extra, absent))

    precision = correct / (correct + wrong) if correct + wrong else 0
    recall = correct / (correct + missing) if correct + missing else 0

    print(f"عدد الجمل: {len(sentences)}")
    print(f"كلمات صحيحة (لقتها الخدمة وكانت صح): {correct}")
    print(f"كلمات خاطئة (رجّعتها الخدمة وهي غلط): {wrong}")
    print(f"كلمات ناقصة (كان لازم تلاقيها وما لقتها): {missing}")
    print(f"الدقة (precision): {precision:.0%}")
    print(f"الاسترجاع (recall): {recall:.0%}")

    if mistakes:
        print("\n--- الأخطاء جملة جملة ---")
    for number, text, extra, absent in mistakes:
        print(f"\nجملة {number}: {text}")
        for word, kind in sorted(absent):
            print(f"  ناقص: {word} ({kind})")
        for word, kind in sorted(extra):
            print(f"  زائد: {word} ({kind})")


if __name__ == "__main__":
    main()