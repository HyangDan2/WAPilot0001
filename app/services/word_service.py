from __future__ import annotations

import json
import random
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.models.schemas import ReviewPayload, WordIn
from app.services.db import get_conn, init_db

BASE_DIR = Path(__file__).resolve().parents[2]
PACK_DIR = BASE_DIR / "data" / "packs"


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def today_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def normalize_tags(tags: Any) -> str:
    if tags is None:
        return ""
    if isinstance(tags, str):
        return tags
    if isinstance(tags, list):
        return ",".join(str(t).strip() for t in tags if str(t).strip())
    return ""


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["tags_list"] = [x.strip() for x in d.get("tags", "").split(",") if x.strip()]
    return d


def get_dashboard_stats() -> dict[str, Any]:
    today = today_iso()
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
        due = conn.execute(
            "SELECT COUNT(*) FROM words WHERE next_review_at = '' OR next_review_at <= ?",
            (today,),
        ).fetchone()[0]
        learned = conn.execute(
            "SELECT COUNT(*) FROM words WHERE review_status IN ('good','easy')"
        ).fetchone()[0]
        weak = conn.execute(
            "SELECT COUNT(*) FROM words WHERE review_status IN ('forgot','hard')"
        ).fetchone()[0]
        logs = conn.execute("SELECT COUNT(*) FROM study_logs").fetchone()[0]
        correct = conn.execute(
            "SELECT COUNT(*) FROM study_logs WHERE result IN ('good','easy')"
        ).fetchone()[0]
    accuracy = round((correct / logs) * 100, 1) if logs else 0
    return {
        "total": total,
        "due": due,
        "learned": learned,
        "weak": weak,
        "study_logs": logs,
        "accuracy": accuracy,
    }


def list_words(
    q: str = "",
    level: str = "",
    part: str = "",
    tag: str = "",
    status: str = "",
    due_only: bool = False,
    limit: int = 500,
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM words WHERE 1=1"
    params: list[Any] = []

    if q:
        like = f"%{q}%"
        sql += """ AND (
            japanese LIKE ? OR reading LIKE ? OR meaning_en LIKE ? OR meaning_ko LIKE ?
            OR example_jp LIKE ? OR example_en LIKE ?
        )"""
        params.extend([like, like, like, like, like, like])
    if level:
        sql += " AND jlpt_level = ?"
        params.append(level)
    if part:
        sql += " AND part_of_speech LIKE ?"
        params.append(f"%{part}%")
    if tag:
        sql += " AND tags LIKE ?"
        params.append(f"%{tag}%")
    if status:
        sql += " AND review_status = ?"
        params.append(status)
    if due_only:
        sql += " AND (next_review_at = '' OR next_review_at <= ?)"
        params.append(today_iso())

    sql += " ORDER BY id DESC LIMIT ?"
    params.append(limit)

    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        return [row_to_dict(r) for r in rows]


def get_word(word_id: int) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM words WHERE id = ?", (word_id,)).fetchone()
        return row_to_dict(row) if row else None


def add_word(word: WordIn) -> dict[str, Any]:
    now = now_iso()
    tags = normalize_tags(word.tags)
    with get_conn() as conn:
        try:
            cur = conn.execute(
                """
                INSERT INTO words (
                    japanese, reading, meaning_en, meaning_ko, part_of_speech,
                    jlpt_level, difficulty, tags, example_jp, example_en,
                    example_ko, note, source, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    word.japanese.strip(),
                    word.reading.strip(),
                    word.meaning_en.strip(),
                    word.meaning_ko.strip(),
                    word.part_of_speech.strip(),
                    word.jlpt_level.strip() or "N2",
                    word.difficulty,
                    tags,
                    word.example_jp.strip(),
                    word.example_en.strip(),
                    word.example_ko.strip(),
                    word.note.strip(),
                    word.source.strip() or "manual",
                    now,
                    now,
                ),
            )
            return {"status": "ok", "id": cur.lastrowid}
        except sqlite3.IntegrityError as exc:
            raise HTTPException(status_code=409, detail="Already exists") from exc


def bulk_import_words(data: list[dict[str, Any]], source: str = "pack") -> dict[str, Any]:
    imported = 0
    skipped = 0
    errors: list[str] = []

    for idx, item in enumerate(data, start=1):
        try:
            word = WordIn(
                japanese=str(item.get("japanese", "")).strip(),
                reading=str(item.get("reading", "")).strip(),
                meaning_en=str(item.get("meaning_en", item.get("english", ""))).strip(),
                meaning_ko=str(item.get("meaning_ko", "")).strip(),
                part_of_speech=str(item.get("part_of_speech", item.get("part", ""))).strip(),
                jlpt_level=str(item.get("jlpt_level", item.get("level", "N2"))).strip() or "N2",
                difficulty=int(item.get("difficulty", 3)),
                tags=item.get("tags", []),
                example_jp=str(item.get("example_jp", "")).strip(),
                example_en=str(item.get("example_en", "")).strip(),
                example_ko=str(item.get("example_ko", "")).strip(),
                note=str(item.get("note", "")).strip(),
                source=source,
            )
            add_word(word)
            imported += 1
        except HTTPException as exc:
            if exc.status_code == 409:
                skipped += 1
            else:
                errors.append(f"row {idx}: {exc.detail}")
        except Exception as exc:
            errors.append(f"row {idx}: {exc}")

    return {"status": "ok", "imported": imported, "skipped": skipped, "errors": errors[:20]}


def delete_word(word_id: int) -> None:
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM words WHERE id = ?", (word_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Word not found")


def update_review(word_id: int, payload: ReviewPayload) -> dict[str, Any]:
    result = payload.result
    now = now_iso()

    if result == "forgot":
        interval = 0
        status = "forgot"
        correct_delta = 0
        wrong_delta = 1
    elif result == "hard":
        interval = 1
        status = "hard"
        correct_delta = 0
        wrong_delta = 1
    elif result == "good":
        interval = 3
        status = "good"
        correct_delta = 1
        wrong_delta = 0
    else:
        interval = 7
        status = "easy"
        correct_delta = 1
        wrong_delta = 0

    next_review = (datetime.now() + timedelta(days=interval)).isoformat(timespec="seconds")

    with get_conn() as conn:
        cur = conn.execute(
            """
            UPDATE words
            SET review_status = ?,
                review_count = review_count + 1,
                correct_count = correct_count + ?,
                wrong_count = wrong_count + ?,
                interval_days = ?,
                next_review_at = ?,
                last_reviewed_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (status, correct_delta, wrong_delta, interval, next_review, now, now, word_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Word not found")

        conn.execute(
            "INSERT INTO study_logs (word_id, mode, result, created_at) VALUES (?, ?, ?, ?)",
            (word_id, payload.mode, result, now),
        )

    return {"status": "ok", "review_status": status, "next_review_at": next_review}


def get_due_words(limit: int = 50) -> list[dict[str, Any]]:
    return list_words(due_only=True, limit=limit)


def get_quiz_item(mode: str = "jp_en", due_only: bool = False) -> dict[str, Any] | None:
    candidates = list_words(due_only=due_only, limit=1000)
    if not candidates:
        candidates = list_words(limit=1000)
    if not candidates:
        return None

    word = random.choice(candidates)

    if mode == "en_jp":
        question = word["meaning_en"]
        answer = f'{word["japanese"]} ({word["reading"]})'
        hint = "English → Japanese"
    elif mode == "reading":
        question = word["japanese"]
        answer = word["reading"] or "(no reading)"
        hint = "Kanji → Reading"
    elif mode == "example":
        blank = "____"
        question = word["example_jp"].replace(word["japanese"], blank, 1) if word["example_jp"] else word["meaning_en"]
        answer = word["japanese"]
        hint = "Fill in the blank"
    else:
        question = word["japanese"]
        answer = word["meaning_en"]
        hint = "Japanese → English"

    return {
        "mode": mode,
        "hint": hint,
        "word": word,
        "question": question,
        "answer": answer,
        "example_jp": word.get("example_jp", ""),
        "example_en": word.get("example_en", ""),
    }


def get_packs() -> list[dict[str, Any]]:
    packs = []
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    for path in sorted(PACK_DIR.glob("*.json")):
        count = 0
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                count = len(data)
        except Exception:
            pass
        packs.append({"name": path.name, "count": count})
    return packs


def export_words() -> list[dict[str, Any]]:
    return list_words(limit=5000)


def reset_database() -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM study_logs")
        conn.execute("DELETE FROM words")
