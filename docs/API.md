# WAPilot0001 API

기준: `main` (2026-05-05, `2b1cdd1`)의 `main.py`, `app.py`, `app/models/schemas.py`, `app/services/word_service.py`,
`app/services/db.py`, `services/db.py`에서 직접 확인한 내용.

## 1. 개요

JLPT N2 어휘 훈련 웹앱이다. FastAPI + SQLite 단일 프로세스이며, 단어 팩(JSON)을 임포트해 퀴즈·SRS 복습을 돌린다.

- 화면: `GET /` (Jinja2 `templates/index.html`), 정적 자산 `/static/*`
- 데이터: SQLite 파일 하나와 `data/packs/*.json`
- 인증이 없는 개인용 앱이며, API는 모두 JSON

저장소에는 앱이 **두 개** 있다.

| 앱 | 진입점 | DB | 상태 |
| --- | --- | --- | --- |
| 현행 | `main.py` (`app: JPPilot0002 v0.2.0`) | `jppilot0002.db` (`app/services/db.py`) | `render.yaml`이 이 앱을 배포한다 |
| 구버전 | `app.py` (`JPPilot0001 v0.1.0`) | `vocab.db` (`services/db.py`) | 단어 스키마가 다르다. 같은 파일을 공유하지 않는다 |

## 2. 접속

| 구분 | 값 |
| --- | --- |
| 로컬 | `http://127.0.0.1:8000` (`uvicorn main:app --reload`) |
| Render | `uvicorn main:app --host 0.0.0.0 --port $PORT` (`render.yaml`) |
| API 베이스 | 루트(`/api/...`) — 별도 프리픽스 없음 |
| DB 파일 | 저장소 루트의 `jppilot0002.db`(`app/services/db.py`의 `BASE_DIR = parents[2]`) |
| 단어 팩 | 저장소 루트 `data/packs/*.json` |

CORS 미들웨어가 없다. 같은 출처에서 오는 브라우저 요청만 동작한다.

## 3. 인증·권한

없음. 모든 엔드포인트가 공개다. 개인·로컬 용도 전제이며, 공개 호스팅하면 누구나
`POST /api/reset`으로 전체 데이터를 지울 수 있다. 외부에 열 때는 앞단 인증이 필요하다.

## 4. 엔드포인트

합계 **13개 계약**(현행 12 + 구버전 1). 라우트 수로는 16개다(구버전이 `/api/words` GET·POST를 다른 스키마로 재정의).

### 4-1. 현행 앱 `main.py` (12)

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/stats` | 대시보드 통계 |
| GET | `/api/words` | 단어 목록·검색·필터 |
| GET | `/api/words/{word_id}` | 단어 단건 |
| POST | `/api/words` | 단어 추가 |
| DELETE | `/api/words/{word_id}` | 단어 삭제 |
| PATCH | `/api/words/{word_id}/review` | 복습 결과 기록(SRS 갱신) |
| GET | `/api/due` | 복습 예정 단어 |
| GET | `/api/quiz` | 퀴즈 1문항 |
| GET | `/api/packs` | 팩 목록과 단어 수 |
| POST | `/api/import/{pack_name}` | 팩 임포트 |
| GET | `/api/export` | 전체 단어 JSON 내보내기 |
| POST | `/api/reset` | 전체 데이터 삭제 |

### 4-2. 구버전 앱 `app.py` (1 + 재정의 2)

| Method | Path | 설명 |
| --- | --- | --- |
| GET | `/api/recommend` | `data/daily_recommend.json`을 그대로 반환 |
| GET | `/api/words` | `words` 전체를 구 스키마로 반환 |
| POST | `/api/words` | `{japanese, reading, meaning_ko, level, tags[]}`만 받는다 |

### 4-3. 단어 스키마 (현행)

`GET /api/words`의 각 항목:

```json
{
  "id": 1,
  "japanese": "曖昧",
  "reading": "あいまい",
  "meaning_en": "vague; ambiguous; unclear",
  "meaning_ko": "애매함, 모호함",
  "part_of_speech": "na-adjective / noun",
  "jlpt_level": "N2",
  "difficulty": 3,
  "tags": "abstract,communication,n2",
  "tags_list": ["abstract", "communication", "n2"],
  "example_jp": "彼の説明は曖昧で、よく分からなかった。",
  "example_en": "His explanation was vague, so I could not understand it well.",
  "example_ko": "그의 설명은 애매해서 잘 이해할 수 없었다.",
  "note": "",
  "source": "n2_core_seed_060.json",
  "review_status": "new",
  "review_count": 0,
  "correct_count": 0,
  "wrong_count": 0,
  "interval_days": 0,
  "ease_factor": 2.5,
  "next_review_at": "",
  "last_reviewed_at": "",
  "created_at": "2026-11-19T06:40:39",
  "updated_at": "2026-11-19T06:40:39"
}
```

- DB 컬럼 24개(`app/services/db.py`). `tags`는 DB에 쉼표 문자열로 저장하고 `tags_list`를 응답에 덧붙인다.
- `UNIQUE(japanese, reading, meaning_en)` — 중복 추가는 409.
- `review_status` 값: `new` · `forgot` · `hard` · `good` · `easy`.
- `next_review_at`이 빈 문자열이면 "복습 대상"이다.

### 4-4. `GET /api/words` 쿼리

| 파라미터 | 기본값 | 설명 |
| --- | --- | --- |
| `q` | `""` | `japanese`·`reading`·`meaning_en`·`meaning_ko`·`example_jp`·`example_en` 부분일치 |
| `level` | `""` | `jlpt_level` 완전일치(예: `N2`) |
| `part` | `""` | `part_of_speech` 부분일치 |
| `tag` | `""` | `tags` 부분일치 |
| `status` | `""` | `review_status` 완전일치 |
| `due_only` | `false` | `next_review_at`이 비었거나 현재 이하 |
| `limit` | `500` | 1~5000 |

정렬은 `id DESC`.

### 4-5. `GET /api/quiz`

| 파라미터 | 기본값 | 값 |
| --- | --- | --- |
| `mode` | `jp_en` | `jp_en` · `en_jp` · `reading` · `example` |
| `due_only` | `false` | 복습 대상만 출제 |

```json
{
  "mode": "jp_en",
  "hint": "Japanese → English",
  "word": {"id": 1, "japanese": "曖昧", "…": "…"},
  "question": "曖昧",
  "answer": "vague; ambiguous; unclear",
  "example_jp": "彼の説明は曖昧で、よく分からなかった。",
  "example_en": "…"
}
```

- `en_jp`: 질문은 영어 뜻, 정답은 `일본어 (읽기)`.
- `reading`: 질문은 한자, 정답은 읽기.
- `example`: 예문의 표제어를 `____`로 비운다. 예문이 없으면 영어 뜻을 질문으로 쓴다.
- 후보가 없으면 404 `{"detail":"No words available"}`. `due_only`인데 대상이 없으면 전체에서 고른다.

### 4-6. `PATCH /api/words/{word_id}/review`

```json
{"result": "good", "mode": "jp_en"}
```

| `result` | 다음 간격 | `review_status` | correct/wrong |
| --- | --- | --- | --- |
| `forgot` | 0일 | `forgot` | wrong +1 |
| `hard` | 1일 | `hard` | wrong +1 |
| `good` | 3일 | `good` | correct +1 |
| `easy` | 7일 | `easy` | correct +1 |

응답: `{"status":"ok","review_status":"good","next_review_at":"2026-11-22T06:40:39"}`.
`study_logs`에 `(word_id, mode, result, created_at)`를 남긴다. 없는 단어는 404.

### 4-7. `GET /api/stats`

```json
{"total": 60, "due": 12, "learned": 31, "weak": 7, "study_logs": 148, "accuracy": 68.2}
```

- `learned`: `review_status IN ('good','easy')`
- `weak`: `review_status IN ('forgot','hard')`
- `accuracy`: `study_logs` 중 `good`/`easy` 비율(%). 로그가 없으면 0.

### 4-8. `GET /api/due`

`limit` 1~500(기본 50). `due_only=true` 목록과 같다.

### 4-9. `GET /api/packs`

```json
[{"name": "n2_core_seed_060.json", "count": 60}, {"name": "n2_full_datapack.json", "count": 1980}]
```

`data/packs/*.json`을 이름순으로 훑어 배열 길이를 센다. 깨진 JSON은 `count: 0`으로 표시하고 넘어간다.

### 4-10. `POST /api/import/{pack_name}`

```json
{"status":"ok","imported":60,"skipped":0,"errors":[]}
```

- 파일이 없거나 `.json`이 아니면 404 `{"detail":"Pack not found"}`.
- JSON 배열이 아니면 400 `{"detail":"Pack must be a list of words"}`.
- 항목은 `WordIn`으로 검증한다. 필드 별칭 허용: `english`→`meaning_en`, `part`→`part_of_speech`, `level`→`jlpt_level`.
- 중복(`japanese`+`reading`+`meaning_en`)은 `skipped`, 그 밖의 오류는 `errors`(최대 20개)로 모은다.
- 한 건씩 커밋하므로 부분 성공이 가능하다.

### 4-11. `GET /api/export`

단어 배열(최대 5000건)을 그대로 반환한다. `Content-Disposition`은 붙지 않는다.

### 4-12. `POST /api/reset`

`study_logs`와 `words`를 모두 `DELETE`하고 `{"status":"ok"}`. 확인 절차도 되돌리기도 없다.

### 4-13. 구버전 `GET /api/recommend`

`data/daily_recommend.json`을 읽어 배열을 그대로 돌려준다. 파일이 없으면 `[]`.
구버전의 `GET /api/words`·`POST /api/words`는 6컬럼 스키마(`japanese`, `reading`, `meaning_ko`, `level`, `tags`)를 쓴다.
현행 `WordIn`과 호환되지 않으므로 같은 DB 파일로 두 앱을 번갈아 실행하면 안 된다.

## 5. 요청·응답 예시

### 5-1. 단어 추가

```bash
curl -s -X POST http://127.0.0.1:8000/api/words \
  -H 'Content-Type: application/json' \
  -d '{"japanese":"曖昧","reading":"あいまい","meaning_en":"vague; ambiguous","meaning_ko":"애매함",
       "part_of_speech":"na-adjective","jlpt_level":"N2","difficulty":3,
       "tags":["abstract","n2"],"example_jp":"彼の説明は曖昧だ。","example_en":"His explanation is vague.",
       "example_ko":"그의 설명은 애매하다."}'
```

```json
{"status": "ok", "id": 61}
```

같은 `japanese`+`reading`+`meaning_en`이 있으면 409 `{"detail":"Already exists"}`.

### 5-2. 검색과 복습

```bash
curl -s 'http://127.0.0.1:8000/api/words?q=曖昧&level=N2&limit=20'
curl -s -X PATCH http://127.0.0.1:8000/api/words/61/review \
  -H 'Content-Type: application/json' -d '{"result":"easy","mode":"jp_en"}'
```

### 5-3. 퀴즈 → 채점

```bash
curl -s 'http://127.0.0.1:8000/api/quiz?mode=reading&due_only=true'
```

응답의 `word.id`로 `PATCH /api/words/{id}/review`를 호출해 결과를 남긴다. 정답 비교는 클라이언트가 한다.

### 5-4. 팩 임포트

```bash
curl -s http://127.0.0.1:8000/api/packs           # 사용 가능한 팩
curl -s -X POST http://127.0.0.1:8000/api/import/n2_core_seed_060.json
```

## 6. 오류 코드

| HTTP | 본문 | 의미 / 조치 |
| --- | --- | --- |
| 404 | `{"detail":"Word not found"}` | 없는 단어 ID(조회·삭제·복습) |
| 404 | `{"detail":"No words available"}` | 퀴즈 후보가 하나도 없음 → 단어 추가·임포트 |
| 404 | `{"detail":"Pack not found"}` | 팩 파일 없음/`.json` 아님 |
| 400 | `{"detail":"Invalid JSON pack"}` / `{"detail":"Pack must be a list of words"}` | 팩 형식 오류 |
| 409 | `{"detail":"Already exists"}` | 중복 단어 |
| 422 | FastAPI `detail[]` | `WordIn`/`ReviewPayload` 검증 실패(필수 누락, `result` 정규식, `difficulty` 1~5, `limit` 범위) |
| 405 | FastAPI 기본 | 허용되지 않은 메서드 |

## 7. 환경변수·배포

| 항목 | 값 |
| --- | --- |
| 환경변수 | **없음**. 포트·DB 경로·팩 경로가 모두 코드/CWD 기준이다 |
| DB | `jppilot0002.db` — 저장소 루트 기준. Render 무료 티어는 휘발성이라 재배포 시 데이터가 사라진다 |
| 팩 경로 | `data/packs/` |
| 실행 | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| 의존성 | fastapi 0.110.0, starlette 0.36.3, jinja2 3.0.3, uvicorn 0.27.1, pydantic 2.6.3 |

기동 시 `init_db()`가 테이블을 만든다(`words`, `study_logs`, `PRAGMA foreign_keys=ON`).

### 운영 주의

- **경로 조작**: `POST /api/import/{pack_name}`은 `data/packs/`에 경로 조각을 그대로 붙인다
  (`BASE_DIR / "data" / "packs" / pack_name`). `.json` 확장자만 확인하므로, 슬래시가 섞인 값이 전달될 수 있는
  환경에서는 `data/packs` 밖의 `.json` 파일을 읽게 된다. `os.path.basename` 적용과 허용 목록 검사를 권한다.
- **무인증 파괴 경로**: `POST /api/reset`, `DELETE /api/words/{id}`가 공개다. 외부 노출 시 앞단 인증이 필수다.
- `app.py`(구버전)와 `main.py`(현행)는 DB 파일과 스키마가 다르다. 배포는 `main:app` 하나만 쓴다.

## 8. 변경 이력

| 날짜 | 내용 |
| --- | --- |
| 2026-11-19 | `main`(`2b1cdd1`) 소스 기준 최초 작성. 현행 12개 + 구버전 1개 계약, 스키마·SRS 규칙·오류·운영 주의 정리 |
