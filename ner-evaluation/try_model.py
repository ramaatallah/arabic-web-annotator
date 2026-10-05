"""تجربة نموذج NER عربي جاهز (CAMeLBERT) على جمل الاختبار.

سكربت تجريبي منفصل: ما بيغيّر خدمة ner-service.
النموذج بيعرف 3 أنواع عامة بس: PERS (شخص) و LOC (مكان) و ORG (منظمة).
فبنقارن على هالأنواع العامة. التفريق بين مدينة ودولة وجامعة بيجي بعدين بقوائم وقواعد.

الاستخدام (والبيئة .venv مفعّلة):
    python try_model.py
"""
import json
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

MODEL_NAME = "CAMeL-Lab/bert-base-arabic-camelbert-msa-ner"
SENTENCES_FILE = Path(__file__).parent / "sentences.json"

# أنواعنا الخمسة -> النوع العام عند النموذج
COARSE = {
    "person": "PERS",
    "city": "LOC",
    "country": "LOC",
    "university": "ORG",
    "organization": "ORG",
}
KEEP = {"PERS", "LOC", "ORG"}  # أي نوع تاني (مثل MISC) بنتجاهله


def load_model():
    try:
        from camel_tools.ner import NERecognizer
        from camel_tools.tokenizers.word import simple_word_tokenize
    except ImportError:
        print("مكتبة camel-tools مش منزّلة بالبيئة. نفذي: pip install camel-tools")
        sys.exit(1)
    print("جاري تحميل النموذج (أول مرة بياخد وقت لأنو بينزل من الإنترنت)...")
    recognizer = NERecognizer(MODEL_NAME, use_gpu=False)
    return recognizer, simple_word_tokenize


def predict_entities(text, recognizer, tokenize):
    """بتحول تصنيف كل كلمة (B-LOC, I-LOC, O) لكيانات: (النص، النوع العام)."""
    tokens = tokenize(text)
    labels = recognizer.predict_sentence(tokens)
    entities = []
    current = None  # [النوع، بداية، نهاية]
    position = 0

    def flush():
        nonlocal current
        if current and current[0] in KEEP:
            kind, start, end = current
            entities.append((text[start:end], kind))
        current = None

    for token, label in zip(tokens, labels):
        start = text.find(token, position)
        if start == -1:  # ما قدرنا نحدد مكان الكلمة بالنص
            flush()
            continue
        end = start + len(token)
        position = end
        if label == "O":
            flush()
            continue
        prefix, _, kind = label.partition("-")
        if prefix == "B" or current is None or current[0] != kind:
            flush()
            current = [kind, start, end]
        else:  # I- يعني تكملة لنفس الكيان
            current[2] = end
    flush()
    return entities


def run(recognizer, tokenize):
    sentences = json.loads(SENTENCES_FILE.read_text(encoding="utf-8"))
    correct = wrong = missing = 0
    mistakes = []
    started = time.time()

    for number, item in enumerate(sentences, start=1):
        got_list = predict_entities(item["text"], recognizer, tokenize)
        got = set(got_list)
        expected = {(e["text"], COARSE[e["type"]]) for e in item["expected"]}
        extra = got - expected
        absent = expected - got
        correct += len(got & expected)
        wrong += len(extra)
        missing += len(absent)
        if extra or absent:
            mistakes.append((number, item["text"], extra, absent, got_list))

    precision = correct / (correct + wrong) if correct + wrong else 0
    recall = correct / (correct + missing) if correct + missing else 0

    print(f"\nعدد الجمل: {len(sentences)}  (الوقت: {time.time() - started:.1f} ثانية)")
    print("المقارنة على الأنواع العامة: PERS و LOC و ORG")
    print(f"كلمات صحيحة: {correct}")
    print(f"كلمات خاطئة: {wrong}")
    print(f"كلمات ناقصة: {missing}")
    print(f"الدقة (precision): {precision:.0%}")
    print(f"الاسترجاع (recall): {recall:.0%}")

    if mistakes:
        print("\n--- الأخطاء جملة جملة ---")
    for number, text, extra, absent, got_list in mistakes:
        print(f"\nجملة {number}: {text}")
        print(f"  النموذج رجّع: {got_list if got_list else 'ولا شي'}")
        for word, kind in sorted(absent):
            print(f"  ناقص: {word} ({kind})")
        for word, kind in sorted(extra):
            print(f"  زائد: {word} ({kind})")


if __name__ == "__main__":
    model, tokenizer = load_model()
    run(model, tokenizer)