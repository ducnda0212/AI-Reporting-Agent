# PMO Reporting Agent — server (Phase 1: Ingestion & Mapping)

FastAPI backend that turns a Jira CSV export into the 49-column PMO report rows (A–AW).
Pipeline: file → encoding/dedup (SHA256) → CSV cleaner → wiki parser → 77-rule mapping →
reconciler (Choice A: 1 row per main ticket, children = audit `subtasks`) → validator → diff.

## Run (from the repo root, not from `server/`)

```bash
pip install -r server/requirements.txt
uvicorn server.app.main:app --port 8000
```

Config via env / `server/.env` (see `.env.example`): `DATABASE_URL`, `UPLOADS_DIR`, `MAX_UPLOAD_MB`.
SQLite lives at `server/storage/pmo_reporting.db`; uploads in `server/storage/uploads/{cycle_id}/`.

## Test

```bash
PYTHONIOENCODING=utf-8 python -m pytest server/tests
```

Tests run against a throw-away temp DB/uploads dir (`tests/conftest.py`), so reruns are repeatable.

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | `{"status":"ok"}` |
| POST | `/api/v1/ingest/upload` | multipart `file` (.csv/.tsv/.txt), form `cycle_id` (e.g. `2026_11_w3`), `force_reload` |
| POST | `/api/v1/ingest/demo` | JSON `{"cycle_id": "..."}`; runs the golden dataset fixture |

Errors are `{"detail": {"code", "message"}}`: `E_FILE_UNSUPPORTED_FORMAT`, `E_FILE_INVALID_SCHEMA`,
`E_CYCLE_INVALID` (422), `E_FILE_TOO_LARGE` (413). Re-uploading identical bytes in the same cycle returns
the cached session with `is_duplicate_file: true` and a `W_DUPLICATE_FILE` warning, unless `force_reload=true`.

## Known limits (Phase 1)

- `.xlsx/.xls` upload is not parsed yet.
- Manual cell overrides are read from the stored session (`rows[].overrides`); there is no edit endpoint yet.
- Columns M, N, T–V, Y, AB–AE, AH, AK are manual/AI and stay empty; Market is fixed to `VN`.
- Weekly placeholders ("Không có cập nhật trong tuần") are an export-time concern; stored cells stay empty.

## AI

Phần AI (nháp, chấm rủi ro, Agent) nằm ở `app/ai`, route gắn vào cùng app này; xem `app/ai/README.md` (cấu hình V-LLM, API, kiểm thử, đánh giá).
