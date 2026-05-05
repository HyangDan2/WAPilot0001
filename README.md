# JPPilot0002

EN ↔ JP JLPT N2 vocabulary trainer.

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
cd JPPilot0002
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
    "example_ko": "그의 설명은 애매해서 잘 이해할 수 없었다."
  }
]
```

## Notes

JLPT does not publish an official vocabulary list. This app uses replaceable custom study packs designed for N2 coverage.
