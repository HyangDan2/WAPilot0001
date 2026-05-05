import sqlite3

def get_conn():
    conn = sqlite3.connect("vocab.db")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    conn.execute("""
    CREATE TABLE IF NOT EXISTS words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        japanese TEXT,
        reading TEXT,
        meaning_ko TEXT,
        level TEXT,
        tags TEXT,
        created_at TEXT
    )
    """)
    conn.commit()
    conn.close()
