from __future__ import annotations

import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]
DB_PATH = BASE_DIR / "jppilot0002.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            japanese TEXT NOT NULL,
            reading TEXT DEFAULT '',
            meaning_en TEXT NOT NULL,
            meaning_ko TEXT DEFAULT '',
            part_of_speech TEXT DEFAULT '',
            jlpt_level TEXT DEFAULT 'N2',
            difficulty INTEGER DEFAULT 3,
            tags TEXT DEFAULT '',
            example_jp TEXT DEFAULT '',
            example_en TEXT DEFAULT '',
            example_ko TEXT DEFAULT '',
            note TEXT DEFAULT '',
            source TEXT DEFAULT 'manual',
            review_status TEXT DEFAULT 'new',
            review_count INTEGER DEFAULT 0,
            correct_count INTEGER DEFAULT 0,
            wrong_count INTEGER DEFAULT 0,
            interval_days INTEGER DEFAULT 0,
            ease_factor REAL DEFAULT 2.5,
            next_review_at TEXT DEFAULT '',
            last_reviewed_at TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(japanese, reading, meaning_en)
        )
        """)

        conn.execute("""
        CREATE TABLE IF NOT EXISTS study_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word_id INTEGER NOT NULL,
            mode TEXT NOT NULL,
            result TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
        )
        """)
