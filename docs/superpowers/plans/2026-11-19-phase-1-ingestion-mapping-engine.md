# Phase 1: Ingestion & Engine 77 Mapping Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI core ingestion pipeline and mapping engine implementing all 77 technical rules, resolving Jira duplicate headers, parsing wiki Progress Report tables with `# *Blockers:*`, validating data quality, and reconciling Choice A project hierarchy.

**Architecture:** Modular Pipeline Backend: Raw file ingestion (encoding detection, SHA256 dedup, storage) -> CSV Cleaner (resolves 14 duplicate Jira headers) -> Normalizer & Wiki Parser (extracts dates and blockers) -> 77-Rule Mapping Engine -> Reconciler (Choice A: 1:1 main ticket with audit subtasks) -> Validator (Blockers & Warnings) -> Diff Engine (override preservation) -> FastAPI endpoints with SQLite persistence.

**Tech Stack:** Python 3.11+, FastAPI 0.115+, Uvicorn 0.32+, Pydantic v2, SQLAlchemy 2.0 (SQLite), charset-normalizer 3.5+, python-dateutil 2.9+, openpyxl 3.1.5, pytest 9.2+.

**Spec:** `docs/superpowers/specs/2026-11-19-modular-pipeline-backend-design.md`

## Global Constraints

- **Python Version**: Python 3.11+
- **Separation of Concerns**: Backend is confined to `server/`. AI/V-LLM service is isolated in `ai/` and must not be implemented inside `server/`.
- **Project Mapping Strategy**: Choice A strictly enforced (1 row per main ticket with DA code in Summary; subtasks/tasks linked via `subtasks` attribute for audit, no automatic rollup).
- **Single-User Local Run**: Single-user local runtime, no complex multi-user authentication or session locking in this phase.
- **Data Integrity**: 49-column row structure (A-AW) must strictly match the frontend React interface (`types/index.ts`).
- **Storage Paths**: Uploaded files stored in `server/storage/uploads/{cycle_id}/`, fixtures in `server/storage/fixtures/`, templates in `server/storage/templates/`.

## Review Focus

1. **Jira CSV with UTF-8 BOM (`\ufeff`) or Windows-1258 encoding and trailing empty rows**: Auto-detects encoding, strips BOM, removes completely empty rows, reports `skipped_empty_rows` without throwing unhandled exceptions.
2. **Progress Report wiki table containing markdown links with pipes `[Title|URL]`**: Parser must not split table cells on pipes inside brackets; cleans link or preserves text without corrupting column boundaries.
3. **Issue without valid DA code in Summary (e.g., `PKD-202`)**: Isolates issue into `orphans` list, generates blocker `E_NO_CODE`, does not crash pipeline.
4. **Logical conflict between On-track status and Blocker keywords or overdue date**: Generates warning `W_PROGRESS_CONFLICT` when column J is `Đúng tiến độ` but text has `# *Blockers:*` / `delay` / `chậm` or `Due date` is in the past.
5. **Duplicate file upload within the same cycle without `force_reload`**: SHA256 fingerprint matches existing record in `uploaded_files`, returns `is_duplicate_file: true` and cached data without duplicating storage.

---

### Task 1: Scaffolding, SQLite Models, Settings & Fixtures Setup

**Files:**
- Create: `server/pyproject.toml`
- Create: `server/requirements.txt`
- Create: `server/.env.example`
- Create: `server/app/core/config.py`
- Create: `server/app/core/database.py`
- Create: `server/app/models/base.py`
- Create: `server/app/models/file.py`
- Create: `server/app/models/cycle.py`
- Create: `server/app/models/catalog.py`
- Create: `server/storage/fixtures/golden_dataset.csv` (copied from uploaded golden dataset)
- Create: `server/storage/templates/20261111_DAN_Mau-bao-cao-PMO.xlsx` (copied from uploaded mapping master)
- Test: `server/tests/test_scaffolding.py`

**Interfaces:**
- Consumes: Environment variables, filesystem storage
- Produces:
  - `get_db() -> Generator[Session, None, None]`
  - `settings: Settings` (database URL, storage directories, cycle default)
  - SQLAlchemy models: `UploadedFile`, `ReportingCycle`, `MasterCatalogItem`

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_scaffolding.py
import os
from server.app.core.config import settings
from server.app.core.database import engine, Base, SessionLocal
from server.app.models.file import UploadedFile
from server.app.models.cycle import ReportingCycle
from server.app.models.catalog import MasterCatalogItem

def test_database_and_storage_initialization():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    assert session is not None
    session.close()

    assert os.path.exists(settings.STORAGE_DIR)
    assert os.path.exists(settings.FIXTURES_DIR)
    assert os.path.exists(settings.TEMPLATES_DIR)
    assert os.path.exists(os.path.join(settings.FIXTURES_DIR, "golden_dataset.csv"))
    assert os.path.exists(os.path.join(settings.TEMPLATES_DIR, "20261111_DAN_Mau-bao-cao-PMO.xlsx"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_scaffolding.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server'`

- [ ] **Step 3: Implement scaffolding, models, and fixture copy**

Create `server/pyproject.toml`, `server/requirements.txt`, `server/.env.example`, `server/app/core/config.py` (with Pydantic `BaseSettings`), `server/app/core/database.py` (SQLAlchemy 2.0 engine, `declarative_base`, `sessionmaker`), models `file.py`, `cycle.py`, `catalog.py`.
Copy fixture files from `C:\Users\os\.gemini\antigravity\brain\843cc163-a599-425e-bab6-04817b189ba4\.user_uploaded/` into `server/storage/fixtures/golden_dataset.csv` and `server/storage/templates/20261111_DAN_Mau-bao-cao-PMO.xlsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_scaffolding.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat(server): initialize scaffolding, database models, and fixtures"
```

---

### Task 2: Pydantic Schemas & Data Contracts

**Files:**
- Create: `server/app/schemas/common.py`
- Create: `server/app/schemas/row.py`
- Create: `server/app/schemas/ingest.py`
- Create: `server/app/schemas/cycle.py`
- Test: `server/tests/test_schemas.py`

**Interfaces:**
- Consumes: None
- Produces:
  - `ReportRow`: 49 columns matching client interface (`stt`, `ma_da`, `cong_viec`, `mang_viec`, `muc_tieu`, `kpi`, `pic`, `bat_dau`, `ket_thuc`, `trang_thai`, `tien_do`, `milestone`, `ai_lifecycle_phase`, `hoan_thanh_w1`..`w4`, `ke_hoach_w1`..`w4`, `van_de_w1`..`w4`, `subtasks`, `overrides`, `needs_review`)
  - `SubtaskAudit`: (`key`, `summary`, `status`, `assignee`)
  - `OrphanIssue`: (`key`, `summary`, `issue_type`, `status`, `reason`)
  - `BlockerIssue`, `WarningIssue`: (`code`, `message`, `key`, `field`)
  - `FileStats`: (`total_rows`, `total_cols`, `skipped_empty_rows`, `matched_projects`)
  - `DiffSummary`: (`has_previous_session`, `added_projects`, `removed_projects`, `modified_count`, `schema_changes`)
  - `IngestResponse`: (`success`, `session_id`, `is_duplicate_file`, `file_stats`, `diff_summary`, `rows`, `orphans`, `blockers`, `warnings`)

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_schemas.py
from datetime import date
from server.app.schemas.row import ReportRow, SubtaskAudit
from server.app.schemas.ingest import IngestResponse, FileStats, BlockerIssue

def test_report_row_schema_validation():
    row = ReportRow(
        stt=1,
        ma_da="I.C.1.2",
        cong_viec="Xây dựng API gợi ý điểm đỗ",
        mang_viec="AI Optimization",
        muc_tieu="Đạt AUC 0.85",
        kpi="Độ trễ P95 < 200ms",
        pic="Trần Văn B",
        bat_dau=date(2026, 10, 1),
        ket_thuc=date(2026, 11, 30),
        trang_thai="Đang thực hiện",
        tien_do="Đúng tiến độ",
        subtasks=[SubtaskAudit(key="LADP-101", summary="Subtask 1", status="Done", assignee="B")]
    )
    assert row.ma_da == "I.C.1.2"
    assert len(row.subtasks) == 1
    assert row.subtasks[0].key == "LADP-101"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.schemas'`

- [ ] **Step 3: Implement Pydantic Schemas**

Implement `server/app/schemas/common.py`, `row.py`, `ingest.py`, `cycle.py` using Pydantic v2 `BaseModel`, `Field`, `ConfigDict`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/schemas/
git commit -m "feat(server): define Pydantic schemas and 49-column row contract"
```

---

### Task 3: CSV Cleaner, Delimiter & BOM Encoding Handler (`csv_cleaner.py`)

**Files:**
- Create: `server/app/modules/mapping/csv_cleaner.py`
- Test: `server/tests/test_csv_cleaner.py`

**Interfaces:**
- Consumes: Raw bytes of CSV file
- Produces:
  - `clean_csv(file_bytes: bytes) -> tuple[list[str], list[dict[str, str]], int]`
    Returns `(headers, records, skipped_empty_rows)`.
    Resolves 14 duplicate Jira headers by indexing: e.g. `Component/s` -> `Component/s_0`, `Component/s_1`.
    Detects delimiter (`,`, `;`, `\t`).
    Strips UTF-8 BOM (`\ufeff`) or decodes Windows-1258 via `charset-normalizer`.
    Skips rows where all cells are empty.

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_csv_cleaner.py
from server.app.modules.mapping/csv_cleaner import clean_csv

def test_clean_csv_bom_and_duplicate_headers():
    # CSV with UTF-8 BOM, duplicate headers 'Component/s', and an empty row
    csv_content = "\ufeffSummary,Issue key,Component/s,Component/s\nProj 1,KEY-1,CompA,CompB\n,,,\nProj 2,KEY-2,CompC,"
    file_bytes = csv_content.encode("utf-8")
    
    headers, records, skipped = clean_csv(file_bytes)
    assert "Component/s_0" in headers
    assert "Component/s_1" in headers
    assert skipped == 1
    assert len(records) == 2
    assert records[0]["Issue key"] == "KEY-1"
    assert records[0]["Component/s_0"] == "CompA"
    assert records[0]["Component/s_1"] == "CompB"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_csv_cleaner.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.mapping.csv_cleaner'`

- [ ] **Step 3: Implement `csv_cleaner.py`**

Implement `clean_csv` using `charset-normalizer` to detect encoding, `csv.Sniffer` for delimiter detection, duplicate header counter/indexer, and row emptiness filter.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_csv_cleaner.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/mapping/csv_cleaner.py server/tests/test_csv_cleaner.py
git commit -m "feat(mapping): implement csv cleaner with BOM, encoding, and duplicate header resolution"
```

---

### Task 4: Text Sanitizer & Jira Wiki Table Parser (`wiki_parser.py`)

**Files:**
- Create: `server/app/modules/mapping/wiki_parser.py`
- Test: `server/tests/test_wiki_parser.py`

**Interfaces:**
- Consumes: Raw text fields from Jira records (Progress Report, Description, Risk Notes)
- Produces:
  - `sanitize_jira_markup(text: str) -> str`: Strips `{color:...}`, `{panel}`, `ApprovalsCFValue{...}`, converts `[title|url]` to readable title or clean link without breaking internal table pipes.
  - `parse_progress_report(wiki_table_str: str, week_boundaries: list[dict]) -> dict[int, dict[str, str]]`:
    Parses table rows with `|{{YYYY-MM-DD}}|`.
    Separates Col 2 text into completed/progress vs. blockers (text starting with `# *Blockers:*` or `Blockers:`).
    Maps into week index (1 to 4) based on `week_boundaries`:
    Returns `{1: {"completed": "...", "plan": "...", "blockers": "..."}, 2: ...}`.
  - `parse_milestones(description_str: str) -> tuple[str, str]`:
    Splits Goal (text before `MILESTONES?`) and Milestone text (text after `MILESTONE:`).

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_wiki_parser.py
from datetime import date
from server.app.modules.mapping.wiki_parser import sanitize_jira_markup, parse_progress_report, parse_milestones

def test_sanitize_jira_markup_links_and_colors():
    raw = "{color:red}Important{color} with link [Feature Link|https://jira.example.com] and ApprovalsCFValue{approvals=[]}"
    clean = sanitize_jira_markup(raw)
    assert "{color" not in clean
    assert "ApprovalsCFValue" not in clean
    assert "Feature Link" in clean

def test_parse_progress_report_with_blockers():
    sample_table = (
        "||*Week*||*Mục tiêu/Tiến độ*||*Công việc sẽ làm*||\n"
        "|{{2026-10-31}}|# *Mục tiêu và tiến độ:* Pilot giai đoạn 1.\n"
        "# *Blockers:* Tỉ lệ chấp nhận ngày đầu thấp.|* Tối ưu hiển thị notification|\n"
        "|{{2026-11-07}}|# *Mục tiêu và tiến độ:* Mở rộng pilot lên 10% tài xế.\n"
        "# *Blockers:* Cần phê duyệt từ Ban Giám đốc.|* Chuẩn bị slide báo cáo|\n"
    )
    week_boundaries = [
        {"week": 1, "start": date(2026, 10, 31), "end": date(2026, 11, 6)},
        {"week": 2, "start": date(2026, 11, 7), "end": date(2026, 11, 14)},
        {"week": 3, "start": date(2026, 11, 15), "end": date(2026, 11, 22)},
        {"week": 4, "start": date(2026, 11, 23), "end": date(2026, 11, 30)},
    ]
    parsed = parse_progress_report(sample_table, week_boundaries)
    assert 1 in parsed
    assert "Pilot giai đoạn 1" in parsed[1]["completed"]
    assert "Tỉ lệ chấp nhận ngày đầu thấp" in parsed[1]["blockers"]
    assert "Tối ưu hiển thị notification" in parsed[1]["plan"]
    assert 2 in parsed
    assert "Cần phê duyệt từ Ban Giám đốc" in parsed[2]["blockers"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_wiki_parser.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.mapping.wiki_parser'`

- [ ] **Step 3: Implement `wiki_parser.py`**

Implement regex parser for Jira wiki tables, escaping inner bracketed links `\[.*?\]` before pipe splitting, matching `|{{(\d{4}-\d{2}-\d{2})}}|`, splitting Col 2 into `completed` and `blockers`, and assigning to the matching week boundary.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_wiki_parser.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/mapping/wiki_parser.py server/tests/test_wiki_parser.py
git commit -m "feat(mapping): implement jira wiki parser for progress report and markup sanitization"
```

---

### Task 5: Value Normalizer & Lifecycle Mapper (`normalizer.py`)

**Files:**
- Create: `server/app/modules/mapping/normalizer.py`
- Test: `server/tests/test_normalizer.py`

**Interfaces:**
- Consumes: Raw Jira field strings
- Produces:
  - `normalize_status(val: str | None) -> str`: Maps Jira status (`To Do`, `Open` -> `Chưa bắt đầu`; `In Progress`, `Reopened` -> `Đang thực hiện`; `Hold`, `Waiting` -> `Tạm dừng`; `Done`, `Closed`, `Resolved` -> `Đã hoàn thành`).
  - `normalize_progress(val: str | None) -> str`: Maps (`On-track`, `Đúng tiến độ` -> `Đúng tiến độ`; `Delayed`, `Trễ hạn` -> `Chậm tiến độ`; `At Risk`, `Rủi ro` -> `Có rủi ro`).
  - `normalize_phase(val: str | None) -> str`: Maps numbered phases (`1. Khảo sát`, `Phase 2` -> standard 12 AI Lifecycle steps).
  - `parse_jira_date(val: str | None) -> date | None`: Parses formats `%m/%d/%Y %H:%M`, `%d/%b/%y %I:%M %p`, `%Y-%m-%d`, `%d/%m/%Y`.

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_normalizer.py
from datetime import date
from server.app.modules.mapping.normalizer import normalize_status, normalize_progress, normalize_phase, parse_jira_date

def test_normalization_rules():
    assert normalize_status("In Progress") == "Đang thực hiện"
    assert normalize_status("Closed") == "Đã hoàn thành"
    assert normalize_status("Unknown Status") == "Unknown Status" # Preserves unknown for warning

    assert normalize_progress("On-track") == "Đúng tiến độ"
    assert normalize_progress("At Risk") == "Có rủi ro"

    assert "Thử nghiệm" in normalize_phase("7. Triển khai thử nghiệm pilot")

    assert parse_jira_date("10/31/2026 18:00") == date(2026, 10, 31)
    assert parse_jira_date("07/Nov/26 12:00 AM") == date(2026, 11, 7)
    assert parse_jira_date("2026-11-15") == date(2026, 11, 15)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_normalizer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.mapping.normalizer'`

- [ ] **Step 3: Implement `normalizer.py`**

Implement mappings based on sheet `3_Quy_doi_gia_tri` from `media_1795058507883_f796ff8b.xlsx`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_normalizer.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/mapping/normalizer.py server/tests/test_normalizer.py
git commit -m "feat(mapping): implement value normalization for status, progress, phase and dates"
```

---

### Task 6: 77 Mapping Rules Engine (`rule_engine.py`)

**Files:**
- Create: `server/app/modules/mapping/rule_engine.py`
- Test: `server/tests/test_rule_engine.py`

**Interfaces:**
- Consumes: Cleaned Jira issue dictionary, week boundaries, catalog lookup dictionary
- Produces:
  - `extract_project_code_and_name(summary: str) -> tuple[str | None, str]`:
    Regex `^\s*([IVX]+\.[A-Z0-9]+(?:\.[0-9]+)+)\s+(.*)$` -> `(ma_da, cong_viec)`.
  - `map_jira_issue_to_row(issue: dict, catalog_entry: dict | None, week_boundaries: list[dict], stt: int) -> ReportRow`:
    Fills columns A through AW:
    - Col A: `catalog_entry['mang_viec']` or category prefix
    - Col B: `ma_da`
    - Col C: `cong_viec`
    - Col D: Goal from `MILESTONES?` split or `Custom field (Goals)`
    - Col E: KPI from `Custom field (KPI/Outcome)`
    - Col F: PIC (`Assignee` -> `Custom field (PO)` -> `Custom field (Tech lead)`)
    - Col G, H: `Custom field (Start date)` and `Due date`
    - Col I: `Trạng thái`
    - Col J: `Tiến độ`
    - Col K: `Milestone` text
    - Col L: `Bước AI Lifecycle`
    - Col AA: `= Trạng thái + " " + Tiến độ`
    - Col AF: `KHHĐ 2026`
    - Col AI: `VN` (from Location/Department)
    - Col AL-AW: 4 weeks of (Hoàn thành, Kế hoạch, Vấn đề) from parsed progress report

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_rule_engine.py
from datetime import date
from server.app.modules.mapping.rule_engine import extract_project_code_and_name, map_jira_issue_to_row

def test_extract_project_code():
    code, name = extract_project_code_and_name("I.C.1.2 Xây dựng mô hình gợi ý điểm đỗ theo cụm")
    assert code == "I.C.1.2"
    assert name == "Xây dựng mô hình gợi ý điểm đỗ theo cụm"

    bad_code, bad_name = extract_project_code_and_name("Chỉ là tiêu đề thường không có mã")
    assert bad_code is None
    assert bad_name == "Chỉ là tiêu đề thường không có mã"

def test_map_jira_issue_to_row():
    issue = {
        "Issue key": "PMOGOLD-1",
        "Summary": "I.C.1.2 Thuật toán gợi ý điểm đỗ",
        "Description": "Mục tiêu hệ thống\nMILESTONES: {{2026-11-20}} Go-live",
        "Assignee": "Đức Nguyễn",
        "Custom field (Start date)": "10/01/2026 00:00",
        "Due date": "11/30/2026 23:59",
        "Status": "In Progress",
        "Custom field (Progress)": "On-track",
        "Custom field (AI Lifecycle)": "4. Phát triển mô hình AI",
    }
    week_boundaries = [
        {"week": 1, "start": date(2026, 10, 31), "end": date(2026, 11, 6)},
        {"week": 2, "start": date(2026, 11, 7), "end": date(2026, 11, 14)},
        {"week": 3, "start": date(2026, 11, 15), "end": date(2026, 11, 22)},
        {"week": 4, "start": date(2026, 11, 23), "end": date(2026, 11, 30)},
    ]
    catalog = {"I.C.1.2": {"mang_viec": "AI Mobility"}}
    row = map_jira_issue_to_row(issue, catalog.get("I.C.1.2"), week_boundaries, stt=1)
    
    assert row.ma_da == "I.C.1.2"
    assert row.mang_viec == "AI Mobility"
    assert row.pic == "Đức Nguyễn"
    assert row.trang_thai == "Đang thực hiện"
    assert row.tien_do == "Đúng tiến độ"
    assert row.trang_thai_1 == "Đang thực hiện Đúng tiến độ"
    assert row.loai_du_an == "KHHĐ 2026"
    assert row.market == "VN"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_rule_engine.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.mapping.rule_engine'`

- [ ] **Step 3: Implement `rule_engine.py`**

Implement mapping logic adhering to sheet `Dev_Mapping_chi_tiet` (77 rules).

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_rule_engine.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/mapping/rule_engine.py server/tests/test_rule_engine.py
git commit -m "feat(mapping): implement 77 technical rules mapping engine"
```

---

### Task 7: Project Hierarchy Reconciler & Orphan Isolation (`reconciler.py`)

**Files:**
- Create: `server/app/modules/mapping/reconciler.py`
- Test: `server/tests/test_reconciler.py`

**Interfaces:**
- Consumes: Cleaned records list, valid catalog codes set, week boundaries
- Produces:
  - `reconcile_issues(records: list[dict], catalog: dict, week_boundaries: list[dict]) -> tuple[list[ReportRow], list[OrphanIssue]]`:
    - Identifies main issues: Records where `Summary` starts with valid DA code matching `catalog` (or regex).
    - Links child issues (by `Parent key` or `Issue Type == 'Sub-task'` or outward issue links) to `parent_row.subtasks` for audit.
    - Isolates orphan issues: Issues without DA code or with DA code not in catalog into `OrphanIssue(key, summary, issue_type, status, reason)`.

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_reconciler.py
from datetime import date
from server.app.modules.mapping.reconciler import reconcile_issues

def test_reconciler_choice_a_and_orphans():
    records = [
        {"Issue key": "MAIN-1", "Summary": "I.C.1.2 Dự án gợi ý điểm đỗ", "Issue Type": "Epic", "Status": "In Progress"},
        {"Issue key": "SUB-1", "Parent key": "MAIN-1", "Summary": "Viết API Docker", "Issue Type": "Sub-task", "Status": "Done"},
        {"Issue key": "ORPHAN-1", "Summary": "Hỗ trợ họp PMO không mã DA", "Issue Type": "Task", "Status": "Open"}
    ]
    catalog = {"I.C.1.2": {"mang_viec": "AI Mobility"}}
    week_boundaries = [{"week": 1, "start": date(2026, 10, 31), "end": date(2026, 11, 6)}]
    
    rows, orphans = reconcile_issues(records, catalog, week_boundaries)
    assert len(rows) == 1
    assert rows[0].ma_da == "I.C.1.2"
    assert len(rows[0].subtasks) == 1
    assert rows[0].subtasks[0].key == "SUB-1"
    
    assert len(orphans) == 1
    assert orphans[0].key == "ORPHAN-1"
    assert orphans[0].reason == "NO_DA_CODE"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_reconciler.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.mapping.reconciler'`

- [ ] **Step 3: Implement `reconciler.py`**

Implement Choice A matching: Epic/Parent priority, child attachment into `subtasks`, and unmapped issue routing into `orphans`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_reconciler.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/mapping/reconciler.py server/tests/test_reconciler.py
git commit -m "feat(mapping): implement Choice A project reconciler and orphan issue extraction"
```

---

### Task 8: Data Quality Validator & Cross-Validator (`validator.py`, `cross_validator.py`)

**Files:**
- Create: `server/app/modules/ingestion/validator.py`
- Create: `server/app/modules/ingestion/cross_validator.py`
- Test: `server/tests/test_validator.py`

**Interfaces:**
- Consumes: `rows: list[ReportRow]`, `orphans: list[OrphanIssue]`, `reference_date: date`
- Produces:
  - `validate_rows(rows: list[ReportRow], orphans: list[OrphanIssue], ref_date: date) -> tuple[list[BlockerIssue], list[WarningIssue]]`:
    - Blockers:
      - `E_NO_CODE`: Orphans with missing DA code.
      - `E_REQUIRED`: Active project missing required fields (`pic`, `bat_dau`, `ket_thuc`).
    - Warnings:
      - `W_PROGRESS_CONFLICT`: Status is `Đúng tiến độ` (`On-track`) but progress text contains blocker keywords (`delay`, `lùi lịch`, `chậm`, `# *Blockers:*`) OR `ket_thuc < ref_date`.
      - `W_UNMAPPED_VALUE`: Status or Progress is unmapped custom string.

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_validator.py
from datetime import date
from server.app.schemas.row import ReportRow
from server.app.schemas.ingest import OrphanIssue
from server.app.modules.ingestion.validator import validate_rows

def test_validator_detects_blockers_and_progress_conflicts():
    # Row with progress conflict: On-track but due date expired and blockers mentioned
    row_conflict = ReportRow(
        stt=1, ma_da="I.C.1.2", cong_viec="Test",
        trang_thai="Đang thực hiện", tien_do="Đúng tiến độ",
        ket_thuc=date(2026, 11, 10),
        van_de_w2="Cần phê duyệt từ Ban Giám đốc do bị chậm",
        pic="Nguyen Van A", bat_dau=date(2026, 10, 1)
    )
    # Orphan without code
    orphan = OrphanIssue(key="PKD-202", summary="Không có mã", issue_type="Task", status="Open", reason="NO_DA_CODE")
    
    blockers, warnings = validate_rows([row_conflict], [orphan], ref_date=date(2026, 11, 19))
    
    assert any(b.code == "E_NO_CODE" and b.key == "PKD-202" for b in blockers)
    assert any(w.code == "W_PROGRESS_CONFLICT" for w in warnings)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_validator.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.ingestion.validator'`

- [ ] **Step 3: Implement `validator.py` and `cross_validator.py`**

Implement blocker rules `E_NO_CODE`, `E_REQUIRED`, and cross-validation warning rules `W_PROGRESS_CONFLICT`, `W_UNMAPPED_VALUE`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_validator.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/ingestion/validator.py server/app/modules/ingestion/cross_validator.py server/tests/test_validator.py
git commit -m "feat(ingestion): implement data quality validator and cross-validation conflict checks"
```

---

### Task 9: Ingestion File Handler, SHA256 Deduplication & Diff Engine (`file_handler.py`, `diff_engine.py`)

**Files:**
- Create: `server/app/modules/ingestion/file_handler.py`
- Create: `server/app/modules/ingestion/diff_engine.py`
- Test: `server/tests/test_ingestion_and_diff.py`

**Interfaces:**
- Consumes: `file_bytes`, `filename`, `cycle_id`, `db: Session`, `previous_rows`, `user_overrides`
- Produces:
  - `save_and_fingerprint(file_bytes: bytes, filename: str, cycle_id: str, db: Session, force_reload: bool) -> tuple[UploadedFile, bool]`:
    Computes SHA256, checks database for existing hash in same `cycle_id`. Returns `(uploaded_file, is_duplicate)`.
  - `compute_diff(prev_rows: list[ReportRow], new_rows: list[ReportRow], overrides: dict) -> tuple[DiffSummary, list[ReportRow]]`:
    Detects added/removed/modified DA codes, applies existing user overrides to new rows while flagging modified source fields with `needs_review: True`.

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_ingestion_and_diff.py
from server.app.core.database import SessionLocal, Base, engine
from server.app.modules.ingestion.file_handler import save_and_fingerprint
from server.app.modules.ingestion.diff_engine import compute_diff
from server.app.schemas.row import ReportRow

def test_file_fingerprint_and_diff_override_preservation():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    content = b"Summary,Issue key\nTest,T-1"
    file1, is_dup1 = save_and_fingerprint(content, "test.csv", "cycle_2026_11", db, force_reload=False)
    assert not is_dup1
    
    # Upload same content again
    file2, is_dup2 = save_and_fingerprint(content, "test.csv", "cycle_2026_11", db, force_reload=False)
    assert is_dup2
    db.close()
    
    # Diff test
    prev_row = ReportRow(stt=1, ma_da="I.C.1.2", cong_viec="Old Name", pic="Manual PIC")
    new_row = ReportRow(stt=1, ma_da="I.C.1.2", cong_viec="New Name from Jira", pic="Jira PIC")
    overrides = {"I.C.1.2": {"pic": "Manual PIC"}}
    
    diff_summary, merged_rows = compute_diff([prev_row], [new_row], overrides)
    assert diff_summary.modified_count == 1
    assert merged_rows[0].pic == "Manual PIC" # Preserved override
    assert merged_rows[0].needs_review is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_ingestion_and_diff.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.ingestion.file_handler'`

- [ ] **Step 3: Implement `file_handler.py` and `diff_engine.py`**

Implement SHA256 hashing, file persistence under `storage/uploads/{cycle_id}/`, deduplication query in SQLite, and diff calculation with override preservation.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_ingestion_and_diff.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/ingestion/file_handler.py server/app/modules/ingestion/diff_engine.py server/tests/test_ingestion_and_diff.py
git commit -m "feat(ingestion): implement SHA256 deduplication and diff engine with override preservation"
```

---

### Task 10: FastAPI Ingestion Endpoints & Application Assembly (`router.py`, `main.py`)

**Files:**
- Create: `server/app/modules/ingestion/router.py`
- Create: `server/app/main.py`
- Test: `server/tests/test_api_ingest.py`

**Interfaces:**
- Consumes: HTTP requests
- Produces:
  - `POST /api/v1/ingest/upload`: Multipart file upload, returns `IngestResponse`
  - `POST /api/v1/ingest/demo`: Returns `IngestResponse` using the Golden Dataset fixture
  - `GET /health`: Health check endpoint

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_api_ingest.py
from fastapi.testclient import TestClient
from server.app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_demo_ingest_endpoint():
    response = client.post("/api/v1/ingest/demo", json={"cycle_id": "2026_11_w3"})
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["rows"]) > 0
    assert "file_stats" in data
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_api_ingest.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.main'`

- [ ] **Step 3: Implement `router.py` and `main.py`**

Implement FastAPI routes, CORS middleware, dependency injection of DB session, upload handling, demo dataset loader.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest server/tests/test_api_ingest.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/ingestion/router.py server/app/main.py server/tests/test_api_ingest.py
git commit -m "feat(api): implement FastAPI ingest endpoints for upload and demo mode"
```

---

### Task 11: End-to-End Verification with Golden Dataset (19 issues) & Full Suite Test

**Files:**
- Create: `server/tests/test_golden_dataset_e2e.py`
- Test: `server/tests/test_golden_dataset_e2e.py`

**Interfaces:**
- Consumes: `server/storage/fixtures/golden_dataset.csv`
- Produces:
  - Comprehensive end-to-end integration test verifying:
    1. All 19 issues of the Golden Dataset are ingested without error.
    2. Exactly 4 main Epic projects (`I.C.1.2`, `I.C.1.3`, `I.C.1.4`, `I.C.1.5`) form primary rows.
    3. Subtasks are attached to their respective parents.
    4. Issues without matching DA codes (`PMOGOLD-18`, `PKD-202`) are isolated into orphans.
    5. Issue `PKD-202` generates blocker `E_NO_CODE`.
    6. Progress Report wiki tables are accurately split across W1 to W4.
    7. Overrides and diffing retain user edits.

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_golden_dataset_e2e.py
import os
from fastapi.testclient import TestClient
from server.app.main import app
from server.app.core.config import settings

client = TestClient(app)

def test_e2e_golden_dataset_processing():
    golden_csv_path = os.path.join(settings.FIXTURES_DIR, "golden_dataset.csv")
    assert os.path.exists(golden_csv_path)

    with open(golden_csv_path, "rb") as f:
        response = client.post(
            "/api/v1/ingest/upload",
            files={"file": ("golden_dataset.csv", f, "text/csv")},
            data={"cycle_id": "2026_11_w3", "force_reload": "true"}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["file_stats"]["total_rows"] == 19
    
    # Verify main projects
    mapped_codes = [r["ma_da"] for r in data["rows"]]
    assert "I.C.1.2" in mapped_codes
    
    # Verify subtasks attached
    ic12_row = next(r for r in data["rows"] if r["ma_da"] == "I.C.1.2")
    assert len(ic12_row["subtasks"]) > 0
    
    # Verify orphan and blocker
    assert any(o["key"] == "PKD-202" for o in data["orphans"])
    assert any(b["code"] == "E_NO_CODE" and b["key"] == "PKD-202" for b in data["blockers"])
    
    # Verify progress report parsed into W1 and W2
    assert ic12_row["hoan_thanh_w1"] is not None
    assert ic12_row["van_de_w1"] is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest server/tests/test_golden_dataset_e2e.py -v`
Expected: FAIL until all components from Tasks 1-10 are integrated.

- [ ] **Step 3: Integrate and run full test suite**

Ensure all integration points between modules run cleanly and end-to-end assertions hold.

- [ ] **Step 4: Run all tests in repository**

Run: `pytest server/tests/ -v`
Expected: All tests PASS (100% passing across all 11 test modules).

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "test(e2e): verify complete ingestion pipeline against 19 issues Golden Dataset"
```
