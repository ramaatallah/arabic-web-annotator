
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

app = FastAPI()

MAX_LENGTH = 5000

MODEL_NAME = "CAMeL-Lab/bert-base-arabic-camelbert-msa-ner"

print("جاري تحميل نموذج CAMeLBERT...")

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForTokenClassification.from_pretrained(MODEL_NAME)

ner_pipeline = pipeline(
    "ner",
    model=model,
    tokenizer=tokenizer,
    aggregation_strategy="simple",
)

print("تم تحميل نموذج CAMeLBERT بنجاح.")


# =========================
# Gazetteer
# =========================

GAZETTEER = {
    # Persons
    "أحمد": "person",
    "خالد": "person",
    "فاطمة": "person",
    "يوسف": "person",
    "محمود درويش": "person",
    "ليلى": "person",
    "سامر": "person",
    "محمد": "person",
    "نور": "person",
    "مريم": "person",
    "سلمى": "person",

    # Universities
    "جامعة النجاح": "university",
    "جامعة بيرزيت": "university",
    "الجامعة الأردنية": "university",
    "جامعة القاهرة": "university",
    "جامعة القدس": "university",

    # Cities
    "نابلس": "city",
    "رام الله": "city",
    "القاهرة": "city",
    "بيروت": "city",
    "عمان": "city",
    "حيفا": "city",
    "الخليل": "city",
    "جنين": "city",
    "غزة": "city",
    "القدس": "city",

    # Countries
    "فلسطين": "country",
    "الأردن": "country",
    "مصر": "country",
    "لبنان": "country",
    "تونس": "country",
    "المغرب": "country",
    "السعودية": "country",

    # Organizations
    "وزارة الصحة": "organization",
    "منظمة الصحة العالمية": "organization",
    "جامعة الدول العربية": "organization",
    "وزارة التربية والتعليم": "organization",
    "بنك فلسطين": "organization",
    "الأمم المتحدة": "organization",
    "الهلال الأحمر الفلسطيني": "organization",
    "شركة الاتصالات الفلسطينية": "organization",
    "مستشفى رفيديا": "organization",
}


class AnalyzeRequest(BaseModel):
    text: str


# =========================
# Arabic helpers
# =========================

ATTACHED_PREFIXES = ("و", "ب", "ل")


def is_arabic_letter(char):
    if not char:
        return False

    return (
        "\u0600" <= char <= "\u06FF"
        or "\u0750" <= char <= "\u077F"
        or "\u08A0" <= char <= "\u08FF"
    )



def has_word_boundaries(text, start, end):
    before = text[start - 1] if start > 0 else ""
    after = text[end] if end < len(text) else ""

    # لا نسمح أن يستمر الكيان داخل كلمة عربية أكبر
    if is_arabic_letter(after):
        return False

    # إذا كان قبله حرف عربي، نسمح فقط بـ و / ب / ل
    # بشرط أن يكون هذا الحرف نفسه بداية الكلمة.
    if is_arabic_letter(before):
        if before not in ATTACHED_PREFIXES:
            return False

        prefix_start = start - 1

        # مثال:
        # "ولبنان" -> مسموح
        # "بنابلس" -> مسموح
        # "لرام الله" -> مسموح
        #
        # لكن:
        # "الفلسطيني" -> غير مسموح
        # لأن الـ "ل" جزء من الكلمة وليست prefix منفصلًا.
        if prefix_start > 0 and is_arabic_letter(text[prefix_start - 1]):
            return False

    return True

    # الحرف بعد الكيان يجب ألا يكون حرفًا عربيًا.
    # هذا يمنع "فلسطين" داخل "الفلسطيني".
    if is_arabic_letter(after):
        return False

    # إذا كان قبل الكيان حرف عربي، يجب أن يكون
    # أحد البادئات المسموح بها: و / ب / ل.
    if is_arabic_letter(before):
        if before not in ATTACHED_PREFIXES:
            return False

    return True


def clean_entity_prefix(text, start, end):
    entity_text = text[start:end]

    if len(entity_text) > 1 and entity_text[0] in ATTACHED_PREFIXES:
        new_start = start + 1
        new_text = text[new_start:end]

        if new_text in GAZETTEER:
            return new_start, end, new_text

    return start, end, entity_text


# =========================
# Gazetteer matching
# =========================

def find_gazetteer_entities(text):
    found = []

    sorted_items = sorted(
        GAZETTEER.items(),
        key=lambda item: len(item[0]),
        reverse=True,
    )

    for phrase, entity_type in sorted_items:
        start = text.find(phrase)

        while start != -1:
            end = start + len(phrase)

            if has_word_boundaries(text, start, end):
                overlaps = any(
                    start < entity["end"]
                    and end > entity["start"]
                    for entity in found
                )

                if not overlaps:
                    found.append(
                        {
                            "text": phrase,
                            "type": entity_type,
                            "start": start,
                            "end": end,
                            "source": "gazetteer",
                        }
                    )

            start = text.find(phrase, start + 1)

    return found


# =========================
# Model entity type mapping
# =========================

def map_model_type(entity_group):
    if not entity_group:
        return None

    entity_group = entity_group.upper()

    if "PERS" in entity_group or "PER" in entity_group:
        return "person"

    if "ORG" in entity_group:
        return "organization"

    # LOC لا يتم تحويله مباشرة إلى city/country.
    # Gazetteer مسؤول عن تحديد النوع.
    if "LOC" in entity_group:
        return None

    return None


# =========================
# CAMeLBERT entities
# =========================

def find_model_entities(text):
    raw_entities = ner_pipeline(text)

    found = []

    for entity in raw_entities:
        start = entity.get("start")
        end = entity.get("end")
        entity_group = entity.get("entity_group")

        if start is None or end is None:
            continue

        mapped_type = map_model_type(entity_group)

        if mapped_type is None:
            continue

        clean_start, clean_end, clean_text = clean_entity_prefix(
            text,
            start,
            end,
        )

        found.append(
            {
                "text": clean_text,
                "type": mapped_type,
                "start": clean_start,
                "end": clean_end,
                "source": "model",
            }
        )

    return found


# =========================
# Merge model + Gazetteer
# =========================

def merge_entities(text, model_entities, gazetteer_entities):
    candidates = []

    # Gazetteer له الأولوية.
    for entity in gazetteer_entities:
        candidates.append(entity)

    # نضيف نتائج النموذج التي لا تتداخل
    # مع كيان موجود في Gazetteer.
    for entity in model_entities:
        overlaps = any(
            entity["start"] < existing["end"]
            and entity["end"] > existing["start"]
            for existing in candidates
        )

        if not overlaps:
            candidates.append(entity)

    final_entities = []

    for entity in sorted(
        candidates,
        key=lambda item: item["start"],
    ):
        final_entities.append(
            {
                "text": entity["text"],
                "type": entity["type"],
                "start": entity["start"],
                "end": entity["end"],
            }
        )

    return final_entities


# =========================
# API endpoint
# =========================

@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.text.strip():
        raise HTTPException(
            status_code=400,
            detail="text is empty",
        )

    if len(req.text) > MAX_LENGTH:
        raise HTTPException(
            status_code=400,
            detail="text is longer than 5000 characters",
        )

    text = req.text

    model_entities = find_model_entities(text)

    gazetteer_entities = find_gazetteer_entities(text)

    entities = merge_entities(
        text,
        model_entities,
        gazetteer_entities,
    )

    return {
        "entities": entities
    }