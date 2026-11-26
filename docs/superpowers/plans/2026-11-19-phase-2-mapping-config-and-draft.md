# Phase 2: Mapping Configuration Engine, Clone/Reuse & Session Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the mapping configuration management engine in FastAPI, allowing users to save, edit, clone, and reuse mapping configurations, dynamically recalculate session rows, and persist working session drafts and overrides in SQLite.

**Architecture:** Database-Driven Mapping Engine: SQLite `mapping_configs` model -> Dynamic Rule Engine Adapter -> Recalculate Engine with orphan assignment and override preservation -> Session Draft Persistence -> REST APIs for Postman/CLI testing.

**Tech Stack:** Python 3.11+, FastAPI 0.115+, SQLAlchemy 2.0 (SQLite), Pydantic v2, Pytest 9.2+.

**Spec:** `docs/superpowers/specs/2026-11-19-phase-2-mapping-config-and-draft-design.md`

## Global Constraints

- **Python & FastAPI**: Confined to `server/`. All code follows PEP 8 and type hints.
- **Backward Compatibility**: Ingestion endpoints (`/ingest/upload`, `/ingest/demo`) must default to `map_default_pmo_49col` if no `mapping_id` is supplied, keeping Phase 1 tests passing 100%.
- **Default Mapping Protection**: `map_default_pmo_49col` cannot be deleted.
- **Override Preservation**: `recalculate` must always apply user overrides on top of re-mapped rows.

## Review Focus

1. **Default Mapping Protection**: Calling `DELETE /api/v1/mappings/map_default_pmo_49col` must return `400 Bad Request` with code `E_CANNOT_DELETE_DEFAULT_MAPPING`.
2. **Clone Isolation**: Modifying a cloned mapping configuration must never mutate the original configuration.
3. **Orphan Blocker Clearance**: Passing `orphan_assignments=[{"key": "PKD-202", "target_ma_da": "I.C.1.2"}]` to `/mapping/recalculate` attaches `PKD-202` to `I.C.1.2.subtasks`, removes it from `orphans`, and clears the `E_NO_CODE` blocker.
4. **Override Preservation During Recalculate**: User overrides passed in `recalculate` (e.g. `overrides={"I.C.1.2": {"pic": "Chuyên Viên Thủ Công"}}`) must override the recalculated value.
5. **Session Draft Retrieval**: `GET /api/v1/sessions/{id}/draft` returns the exact rows, overrides, and audit log history saved in `PUT /api/v1/sessions/{id}/draft`.

---

### Task 1: Mapping Configuration Database Model & Seed Data

**Files:**
- Create: `server/app/models/mapping.py`
- Create: `server/app/modules/mapping/seed.py`
- Modify: `server/app/models/__init__.py`
- Modify: `server/app/core/database.py`
- Test: `server/tests/test_mapping_model.py`

**Interfaces:**
- Consumes: SQLAlchemy `Base`, `SessionLocal`
- Produces:
  - Model `MappingConfig` (`id`, `name`, `description`, `is_default`, `status`, `version`, `columns_json`, `value_mappings_json`, `created_at`, `updated_at`, `created_by`)
  - `seed_default_mapping(db: Session) -> MappingConfig`: Creates `map_default_pmo_49col` with the full 77 rules if not present.

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_mapping_model.py
import json
from server.app.core.database import SessionLocal, Base, engine
from server.app.models.mapping import MappingConfig
from server.app.modules.mapping.seed import seed_default_mapping

def test_mapping_config_model_and_seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    default_map = seed_default_mapping(db)
    
    assert default_map.id == "map_default_pmo_49col"
    assert default_map.is_default is True
    cols = json.loads(default_map.columns_json)
    assert len(cols) == 49
    val_map = json.loads(default_map.value_mappings_json)
    assert "status_map" in val_map
    assert "progress_map" in val_map
    assert "In Progress" in val_map["status_map"]
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest server/tests/test_mapping_model.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.models.mapping'`

- [ ] **Step 3: Implement `mapping.py` and `seed.py`**

Create `server/app/models/mapping.py` with SQLAlchemy 2.0 mapped columns. Implement `seed_default_mapping` in `server/app/modules/mapping/seed.py` encoding the 77 PMO rules into `columns_json` and `value_mappings_json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest server/tests/test_mapping_model.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/models/mapping.py server/app/modules/mapping/seed.py server/app/models/__init__.py server/tests/test_mapping_model.py
git commit -m "feat(mapping): add MappingConfig database model and default 49-col seed"
```

---

### Task 2: Pydantic Schemas for Mapping Configuration & Recalculate

**Files:**
- Create: `server/app/schemas/mapping.py`
- Modify: `server/app/schemas/ingest.py`
- Test: `server/tests/test_mapping_schemas.py`

**Interfaces:**
- Consumes: None
- Produces:
  - `MappingColumnDef`: (`field_id`, `col_letter`, `name`, `source_type`, `source_field`, `fallbacks`, `required`)
  - `ValueMappings`: (`status_map`, `progress_map`, `phase_map`)
  - `MappingConfigCreate`: (`name`, `description`, `columns`, `value_mappings`)
  - `MappingConfigUpdate`: (`name`, `description`, `columns`, `value_mappings`)
  - `MappingConfigOut`: Full schema including `id`, `is_default`, `version`, `created_at`
  - `RecalculateRequest`: (`session_id`, `mapping_id`, `orphan_assignments`, `overrides`)
  - `SessionDraftSaveRequest`: (`session_id`, `cycle_id`, `mapping_id`, `rows`, `overrides`, `audit_logs`)

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_mapping_schemas.py
from server.app.schemas.mapping import MappingColumnDef, ValueMappings, MappingConfigCreate

def test_mapping_schemas_validation():
    col = MappingColumnDef(
        field_id="pic", col_letter="F", name="Đầu mối",
        source_type="jira", source_field="Assignee",
        fallbacks=["Custom field (PO)"], required=True
    )
    assert col.field_id == "pic"
    assert len(col.fallbacks) == 1

    vm = ValueMappings(
        status_map={"In Progress": "Đang thực hiện"},
        progress_map={"On-track": "Đúng tiến độ"},
        phase_map={"1": "1. Khảo sát"}
    )
    assert vm.status_map["In Progress"] == "Đang thực hiện"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest server/tests/test_mapping_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.schemas.mapping'`

- [ ] **Step 3: Implement `server/app/schemas/mapping.py`**

Implement Pydantic models for mapping configuration, column definitions, value maps, recalculate requests, and session draft schemas.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest server/tests/test_mapping_schemas.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/schemas/mapping.py server/tests/test_mapping_schemas.py
git commit -m "feat(schemas): define Pydantic schemas for mapping config and recalculate"
```

---

### Task 3: Mapping Configuration CRUD & Clone Service

**Files:**
- Create: `server/app/modules/mapping/service.py`
- Test: `server/tests/test_mapping_service.py`

**Interfaces:**
- Consumes: SQLAlchemy `Session`, schemas from Task 2
- Produces:
  - `list_mappings(db: Session) -> list[MappingConfig]`
  - `get_mapping(db: Session, mapping_id: str) -> MappingConfig | None`
  - `create_mapping(db: Session, data: MappingConfigCreate) -> MappingConfig`
  - `clone_mapping(db: Session, mapping_id: str, new_name: str | None = None) -> MappingConfig`
  - `update_mapping(db: Session, mapping_id: str, data: MappingConfigUpdate) -> MappingConfig`
  - `delete_mapping(db: Session, mapping_id: str) -> bool` (Raises `ValueError` if `is_default`)
  - `set_default_mapping(db: Session, mapping_id: str) -> MappingConfig`

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_mapping_service.py
import pytest
from server.app.core.database import SessionLocal, Base, engine
from server.app.modules.mapping.seed import seed_default_mapping
from server.app.modules.mapping.service import (
    clone_mapping, get_mapping, update_mapping, delete_mapping, set_default_mapping
)
from server.app.schemas.mapping import MappingConfigUpdate

def test_mapping_clone_and_protection():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    seed_default_mapping(db)
    
    # 1. Clone
    cloned = clone_mapping(db, "map_default_pmo_49col", new_name="Bản sao Test")
    assert cloned.id != "map_default_pmo_49col"
    assert cloned.is_default is False
    assert cloned.name == "Bản sao Test"
    
    # 2. Cannot delete default
    with pytest.raises(ValueError, match="E_CANNOT_DELETE_DEFAULT_MAPPING"):
        delete_mapping(db, "map_default_pmo_49col")
        
    # 3. Can delete clone
    assert delete_mapping(db, cloned.id) is True
    assert get_mapping(db, cloned.id) is None
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest server/tests/test_mapping_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.mapping.service'`

- [ ] **Step 3: Implement `server/app/modules/mapping/service.py`**

Implement CRUD operations, unique clone ID generation (`map_clone_{int(time.time())}_{uuid.uuid4().hex[:6]}`), name prefixing, and default mapping protection.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest server/tests/test_mapping_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/mapping/service.py server/tests/test_mapping_service.py
git commit -m "feat(mapping): implement mapping CRUD, clone, and default protection service"
```

---

### Task 4: Dynamic Rule Engine Integration with `MappingConfig`

**Files:**
- Modify: `server/app/modules/mapping/rule_engine.py`
- Modify: `server/app/modules/mapping/normalizer.py`
- Test: `server/tests/test_dynamic_rule_engine.py`

**Interfaces:**
- Consumes: `MappingConfig` or `dict`, raw Jira issue, `week_boundaries`
- Produces:
  - `map_jira_issue_to_row(issue, catalog_entry, week_boundaries, stt, mapping_config=None) -> ReportRow`:
    Dynamically respects custom source fields, fallbacks, and custom value mappings if `mapping_config` is provided. If `None`, defaults to PMO 77 rules without regressions.

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_dynamic_rule_engine.py
from datetime import date
from server.app.modules.mapping.rule_engine import map_jira_issue_to_row
from server.app.models.mapping import MappingConfig

def test_rule_engine_with_custom_mapping_config():
    custom_map = MappingConfig(
        id="custom_01", name="Custom", columns_json="[]",
        value_mappings_json='{"status_map": {"In Progress": "Đang làm gấp"}, "progress_map": {}, "phase_map": {}}'
    )
    issue = {
        "Issue key": "KEY-1", "Summary": "I.C.1.2 Test",
        "Status": "In Progress", "Assignee": "Test PIC"
    }
    week_bounds = [{"week": 1, "start": date(2026, 10, 31), "end": date(2026, 11, 6)}]
    row = map_jira_issue_to_row(issue, None, week_bounds, stt=1, mapping_config=custom_map)
    assert row.trang_thai == "Đang làm gấp"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest server/tests/test_dynamic_rule_engine.py -v`
Expected: FAIL with `trang_thai == 'Đang thực hiện' != 'Đang làm gấp'`

- [ ] **Step 3: Update `rule_engine.py` and `normalizer.py` to support dynamic mapping**

Extract status, progress, phase mapping from `mapping_config.value_mappings_json` if provided, falling back to default constants.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest server/tests/test_dynamic_rule_engine.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/mapping/rule_engine.py server/app/modules/mapping/normalizer.py server/tests/test_dynamic_rule_engine.py
git commit -m "feat(mapping): adapt rule engine to dynamically use MappingConfig"
```

---

### Task 5: Recalculate Engine (`recalculate.py`)

**Files:**
- Create: `server/app/modules/mapping/recalculate.py`
- Test: `server/tests/test_recalculate.py`

**Interfaces:**
- Consumes: `session_id`, `mapping_id`, `orphan_assignments`, `overrides`, `db: Session`
- Produces:
  - `recalculate_session(session_id, mapping_id, orphan_assignments, overrides, db) -> IngestResponse`:
    - Re-runs parsing with specified `mapping_config`.
    - Handles `orphan_assignments`: moves orphan to target project's `subtasks`, removes from `orphans`, clears `E_NO_CODE` blocker.
    - Applies `overrides` to final rows.
    - Re-runs quality checks (`validate_rows`, `cross_validator`).

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_recalculate.py
from server.app.core.database import SessionLocal, Base, engine
from server.app.modules.ingestion.service import run_pipeline
from server.app.modules.mapping.recalculate import recalculate_session
from server.app.models.session import IngestSession
from server.app.core.config import settings

def test_recalculate_clears_orphan_blocker_and_keeps_overrides():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    with open(f"{settings.FIXTURES_DIR}/golden_dataset.csv", "rb") as f:
        content = f.read()
    
    # 1. Initial pipeline run
    resp, headers, source_rows = run_pipeline(content, "2026_11_w3")
    session = IngestSession(
        id="sess_test_recalc", cycle_id="2026_11_w3", file_id=1,
        headers_json=headers, source_rows_json=source_rows, response_json=resp.model_dump_json()
    )
    db.add(session)
    db.commit()
    
    # Initial has PKD-202 orphan and E_NO_CODE blocker
    assert any(b.code == "E_NO_CODE" and b.key == "PKD-202" for b in resp.blockers)
    
    # 2. Recalculate with orphan assignment + override
    new_resp = recalculate_session(
        session_id="sess_test_recalc",
        mapping_id=None,
        orphan_assignments=[{"key": "PKD-202", "target_ma_da": "I.C.1.2"}],
        overrides={"I.C.1.2": {"pic": "PIC Đã Sửa Tay"}},
        db=db
    )
    # E_NO_CODE blocker cleared
    assert not any(b.code == "E_NO_CODE" and b.key == "PKD-202" for b in new_resp.blockers)
    # Override preserved
    row_ic12 = next(r for r in new_resp.rows if r.ma_da == "I.C.1.2")
    assert row_ic12.pic == "PIC Đã Sửa Tay"
    # Subtask attached
    assert any(sub.key == "PKD-202" for sub in row_ic12.subtasks)
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest server/tests/test_recalculate.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.mapping.recalculate'`

- [ ] **Step 3: Implement `recalculate.py`**

Implement `recalculate_session` orchestrating `rule_engine`, `reconciler`, orphan re-linking, override application, and validation re-check.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest server/tests/test_recalculate.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/mapping/recalculate.py server/tests/test_recalculate.py
git commit -m "feat(mapping): implement recalculate engine with orphan assignment and override preservation"
```

---

### Task 6: Session Draft & Audit Log Persistence

**Files:**
- Modify: `server/app/models/session.py`
- Create: `server/app/modules/session/service.py`
- Test: `server/tests/test_session_draft.py`

**Interfaces:**
- Consumes: SQLAlchemy `Session`, `SessionDraftSaveRequest`
- Produces:
  - Model `SessionDraft` (`session_id`, `cycle_id`, `mapping_id`, `rows_json`, `overrides_json`, `audit_logs_json`, `updated_at`)
  - `save_session_draft(db, data: SessionDraftSaveRequest) -> SessionDraft`
  - `get_session_draft(db, session_id: str) -> SessionDraft | None`

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_session_draft.py
from server.app.core.database import SessionLocal, Base, engine
from server.app.modules.session.service import save_session_draft, get_session_draft
from server.app.schemas.mapping import SessionDraftSaveRequest

def test_session_draft_save_and_retrieve():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    req = SessionDraftSaveRequest(
        session_id="sess_draft_001",
        cycle_id="2026_11_w3",
        mapping_id="map_default_pmo_49col",
        rows=[{"stt": 1, "ma_da": "I.C.1.2", "cong_viec": "Task 1"}],
        overrides={"I.C.1.2": {"pic": "Chuyên Viên A"}},
        audit_logs=[{"at": "2026-11-19T22:00:00", "ma_da": "I.C.1.2", "field": "pic", "old_val": "Cũ", "new_val": "Mới", "by": "PMO"}]
    )
    draft = save_session_draft(db, req)
    assert draft.session_id == "sess_draft_001"
    
    retrieved = get_session_draft(db, "sess_draft_001")
    assert retrieved is not None
    assert retrieved.cycle_id == "2026_11_w3"
    assert "Chuyên Viên A" in retrieved.overrides_json
    db.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest server/tests/test_session_draft.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'server.app.modules.session.service'`

- [ ] **Step 3: Implement `SessionDraft` model and session draft service**

Add `SessionDraft` model to `server/app/models/session.py`. Implement `save_session_draft` (upsert logic) and `get_session_draft` in `server/app/modules/session/service.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest server/tests/test_session_draft.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/models/session.py server/app/modules/session/service.py server/tests/test_session_draft.py
git commit -m "feat(session): implement SessionDraft model and draft persistence service"
```

---

### Task 7: FastAPI Endpoints Assembly

**Files:**
- Create: `server/app/modules/mapping/router.py`
- Create: `server/app/modules/session/router.py`
- Modify: `server/app/modules/ingestion/router.py`
- Modify: `server/app/main.py`
- Test: `server/tests/test_api_mappings_and_drafts.py`

**Interfaces:**
- Consumes: HTTP Requests
- Produces:
  - `GET /api/v1/mappings`
  - `GET /api/v1/mappings/{id}`
  - `POST /api/v1/mappings`
  - `POST /api/v1/mappings/{id}/clone`
  - `PUT /api/v1/mappings/{id}`
  - `DELETE /api/v1/mappings/{id}`
  - `POST /api/v1/mappings/{id}/set-default`
  - `POST /api/v1/mapping/recalculate`
  - `PUT /api/v1/sessions/{id}/draft`
  - `GET /api/v1/sessions/{id}/draft`

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_api_mappings_and_drafts.py
from fastapi.testclient import TestClient
from server.app.main import app

client = TestClient(app)

def test_mappings_api_crud_and_clone():
    # 1. Get list
    r = client.get("/api/v1/mappings")
    assert r.status_code == 200
    assert len(r.json()) >= 1
    
    # 2. Clone default
    clone_r = client.post("/api/v1/mappings/map_default_pmo_49col/clone", json={"new_name": "API Clone"})
    assert clone_r.status_code == 200
    cloned_id = clone_r.json()["id"]
    
    # 3. Update clone
    upd_r = client.put(f"/api/v1/mappings/{cloned_id}", json={"description": "Updated via API"})
    assert upd_r.status_code == 200
    assert upd_r.json()["description"] == "Updated via API"
    
    # 4. Delete clone
    del_r = client.delete(f"/api/v1/mappings/{cloned_id}")
    assert del_r.status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest server/tests/test_api_mappings_and_drafts.py -v`
Expected: FAIL with `404 Not Found`

- [ ] **Step 3: Implement routers and register in `main.py`**

Implement routes in `server/app/modules/mapping/router.py` and `server/app/modules/session/router.py`. Include both routers in `server/app/main.py`. Ensure startup event calls `seed_default_mapping(db)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest server/tests/test_api_mappings_and_drafts.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app/modules/mapping/router.py server/app/modules/session/router.py server/app/main.py server/tests/test_api_mappings_and_drafts.py
git commit -m "feat(api): expose mapping CRUD, clone, recalculate, and draft endpoints"
```

---

### Task 8: Postman-Ready E2E Integration Test Suite

**Files:**
- Create: `server/tests/test_phase2_e2e.py`
- Test: `server/tests/test_phase2_e2e.py`

**Interfaces:**
- Consumes: Running FastAPI app, `server/storage/fixtures/golden_dataset.csv`
- Produces:
  - Comprehensive end-to-end integration test validating the exact user Postman flow:
    1. Query `/api/v1/mappings` (gets default).
    2. Clone to custom mapping.
    3. Modify custom mapping (e.g. status mapping rule).
    4. Ingest demo 19 issues (`/api/v1/ingest/demo`).
    5. Trigger `/api/v1/mapping/recalculate` with cloned mapping + assign orphan `PKD-202` to `I.C.1.2` + set manual override on PIC.
    6. Verify: `PKD-202` attached, `E_NO_CODE` cleared, manual override retained.
    7. Save session draft (`PUT /api/v1/sessions/{id}/draft`).
    8. Retrieve session draft (`GET /api/v1/sessions/{id}/draft`).

- [ ] **Step 1: Write the failing test**

```python
# server/tests/test_phase2_e2e.py
from fastapi.testclient import TestClient
from server.app.main import app

client = TestClient(app)

def test_full_phase2_postman_flow():
    # 1. List mappings
    mappings = client.get("/api/v1/mappings").json()
    assert any(m["id"] == "map_default_pmo_49col" for m in mappings)
    
    # 2. Clone mapping
    clone = client.post("/api/v1/mappings/map_default_pmo_49col/clone", json={"new_name": "PMO Postman Variant"}).json()
    clone_id = clone["id"]
    
    # 3. Ingest demo
    demo = client.post("/api/v1/ingest/demo", json={"cycle_id": "2026_11_w3"}).json()
    session_id = demo["session_id"]
    assert any(b["code"] == "E_NO_CODE" and b["key"] == "PKD-202" for b in demo["blockers"])
    
    # 4. Recalculate with orphan assignment + override
    recalc = client.post("/api/v1/mapping/recalculate", json={
        "session_id": session_id,
        "mapping_id": clone_id,
        "orphan_assignments": [{"key": "PKD-202", "target_ma_da": "I.C.1.2"}],
        "overrides": {"I.C.1.2": {"pic": "Chuyên Viên PMO Postman"}}
    }).json()
    
    assert recalc["success"] is True
    # Blocker cleared
    assert not any(b["code"] == "E_NO_CODE" and b["key"] == "PKD-202" for b in recalc["blockers"])
    # Row override preserved
    ic12 = next(r for r in recalc["rows"] if r["ma_da"] == "I.C.1.2")
    assert ic12["pic"] == "Chuyên Viên PMO Postman"
    
    # 5. Save draft
    draft_saved = client.put(f"/api/v1/sessions/{session_id}/draft", json={
        "session_id": session_id,
        "cycle_id": "2026_11_w3",
        "mapping_id": clone_id,
        "rows": recalc["rows"],
        "overrides": {"I.C.1.2": {"pic": "Chuyên Viên PMO Postman"}},
        "audit_logs": [{"at": "2026-11-19T22:30:00", "ma_da": "I.C.1.2", "field": "pic", "old_val": "Nguyen Van A", "new_val": "Chuyên Viên PMO Postman", "by": "Tester"}]
    }).json()
    assert draft_saved["success"] is True
    
    # 6. Retrieve draft
    draft_got = client.get(f"/api/v1/sessions/{session_id}/draft").json()
    assert draft_got["session_id"] == session_id
    assert draft_got["mapping_id"] == clone_id
    assert "Chuyên Viên PMO Postman" in draft_got["overrides_json"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest server/tests/test_phase2_e2e.py -v`
Expected: FAIL until all tasks 1-7 are implemented.

- [ ] **Step 3: Run full server test suite**

Run: `python -m pytest server/tests/ -v`
Expected: All tests pass (Phase 1 tests + Phase 2 tests).

- [ ] **Step 4: Commit**

```bash
git add server/
git commit -m "test(e2e): verify end-to-end mapping clone, recalculate, and draft flow"
```
