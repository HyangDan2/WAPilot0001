# WAPilot0001

Web-app style JLPT N2 Vocabulary trainer.

## Features

- FastAPI + SQLite web app
- Replaceable JSON word packs
- JP → EN quiz
- EN → JP quiz
- Reading quiz
- Example blank quiz
- Simple SRS review: Forgot / Hard / Good / Easy
- Browser Japanese TTS
- Search and filters
- Manual add
- JSON export

## Run

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

## Import seed pack

Open the web app:

```text
Packs → Import n2_core_seed_060.json
```

## Replace word pack

Put JSON files here:

```text
data/packs/
```

Format:

```json
[
  {
    "japanese": "曖昧",
    "reading": "あいまい",
    "meaning_en": "vague; ambiguous; unclear",
    "meaning_ko": "애매함, 모호함",
    "part_of_speech": "na-adjective / noun",
    "jlpt_level": "N2",
    "difficulty": 3,
    "tags": ["abstract", "communication", "n2"],
    "example_jp": "彼の説明は曖昧で、よく分からなかった。",
    "example_en": "His explanation was vague, so I could not understand it well.",
    "example_ko": "그의 설명은 애매해서 잘 이해할 수 없었다。"
  }
]
```

## Notes

JLPT does not publish an official vocabulary list. This app uses replaceable custom study packs designed for N2 coverage.

## Vercel + PostgreSQL

This repo is prepared for a Vercel FastAPI deployment:

- Vercel entrypoint: `index.py`, which exports the FastAPI app from `main.py`
- Routing config: `vercel.json`
- Database: PostgreSQL through the `DATABASE_URL` or `POSTGRES_URL` environment variable
- Admin safety: server write APIs require the `x-admin-token` header matching `ADMIN_TOKEN`

Vercel Postgres is no longer created directly as a first-party database for new projects. Use a Vercel Marketplace Postgres provider such as Neon or Supabase, then connect its `DATABASE_URL` to the Vercel project.

Local development still falls back to `jppilot0002.db` when no PostgreSQL URL is set. Vercel deployments require `DATABASE_URL` or `POSTGRES_URL`.

## Data Ownership Model

The deployed database is the canonical server dataset, but public users should not mutate it.

Public users can read study data and keep their learning progress locally in the browser. Review status, hidden words, and study progress are stored in local browser storage.

Server write operations are admin-only:

- `POST /api/words`
- `DELETE /api/words/{word_id}`
- `PATCH /api/words/{word_id}/review`
- `POST /api/import/{pack_name}`
- `POST /api/reset`

To call an admin endpoint, send:

```text
x-admin-token: <ADMIN_TOKEN>
```

Store `ADMIN_TOKEN` only as a Vercel environment variable or in a local ignored `.env` file. Do not commit it to Git.
