from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()


class AnalyzeRequest(BaseModel):
    text: str


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    return {"entities": []}