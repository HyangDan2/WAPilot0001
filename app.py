from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from services.db import get_conn, init_db

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "daily_recommend.json"

app = FastAPI(title="JPPilot0001", version="0.1.0")

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


class WordIn(BaseModel):
    japanese: str = Field(min_length=1)
    reading: str = Field(min_length=1)
    meaning_ko: str = Field(min_length=1)
    level: str = ""
    tags: list[str] = []


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/", response_class=HTMLResponse)
def home(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/recommend")
def get_recommendations() -> list[dict[str, Any]]:
    if not DATA_PATH.exists():
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/words")
def get_words() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM words ORDER BY id DESC").fetchall()
        return [dict(row) for row in rows]


@app.post("/api/words")
def add_word(word: WordIn):
    now = datetime.now().isoformat(timespec="seconds")
    tags = ",".join(word.tags)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO words (japanese, reading, meaning_ko, level, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (word.japanese, word.reading, word.meaning_ko, word.level, tags, now),
        )
    return {"status": "ok"}
