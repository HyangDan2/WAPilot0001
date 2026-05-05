from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.models.schemas import ReviewPayload, WordIn
from app.services.db import init_db
from app.services.word_service import (
    add_word,
    bulk_import_words,
    delete_word,
    export_words,
    get_dashboard_stats,
    get_due_words,
    get_packs,
    get_quiz_item,
    get_word,
    list_words,
    reset_database,
    update_review,
)

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="JPPilot0002", version="0.2.0")

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/", response_class=HTMLResponse)
def home(request: Request) -> HTMLResponse:
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/stats")
def api_stats() -> dict[str, Any]:
    return get_dashboard_stats()


@app.get("/api/words")
def api_words(
    q: str = "",
    level: str = "",
    part: str = "",
    tag: str = "",
    status: str = "",
    due_only: bool = False,
    limit: int = Query(default=500, ge=1, le=5000),
) -> list[dict[str, Any]]:
    return list_words(q=q, level=level, part=part, tag=tag, status=status, due_only=due_only, limit=limit)


@app.get("/api/words/{word_id}")
def api_word(word_id: int) -> dict[str, Any]:
    word = get_word(word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    return word


@app.post("/api/words")
def api_add_word(word: WordIn) -> dict[str, Any]:
    return add_word(word)


@app.delete("/api/words/{word_id}")
def api_delete_word(word_id: int) -> dict[str, str]:
    delete_word(word_id)
    return {"status": "ok"}


@app.patch("/api/words/{word_id}/review")
def api_review(word_id: int, payload: ReviewPayload) -> dict[str, Any]:
    return update_review(word_id, payload)


@app.get("/api/due")
def api_due(limit: int = Query(default=50, ge=1, le=500)) -> list[dict[str, Any]]:
    return get_due_words(limit=limit)


@app.get("/api/quiz")
def api_quiz(mode: str = "jp_en", due_only: bool = False) -> dict[str, Any]:
    item = get_quiz_item(mode=mode, due_only=due_only)
    if not item:
        raise HTTPException(status_code=404, detail="No words available")
    return item


@app.get("/api/packs")
def api_packs() -> list[dict[str, Any]]:
    return get_packs()


@app.post("/api/import/{pack_name}")
def api_import_pack(pack_name: str) -> dict[str, Any]:
    pack_path = BASE_DIR / "data" / "packs" / pack_name
    if not pack_path.exists() or pack_path.suffix.lower() != ".json":
        raise HTTPException(status_code=404, detail="Pack not found")

    try:
        data = json.loads(pack_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON pack") from exc

    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="Pack must be a list of words")

    return bulk_import_words(data, source=pack_name)


@app.get("/api/export")
def api_export() -> JSONResponse:
    return JSONResponse(content=export_words())


@app.post("/api/reset")
def api_reset() -> dict[str, str]:
    reset_database()
    return {"status": "ok"}
