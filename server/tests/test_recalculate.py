import pytest

from server.app.core.database import Base, SessionLocal, engine
from server.app.modules.ingestion.file_handler import save_and_fingerprint
from server.app.modules.ingestion.service import run_pipeline, save_session
from server.app.modules.mapping.recalculate import recalculate_session
from server.app.modules.mapping.seed import seed_default_mapping
from server.app.schemas.mapping import OrphanAssignment
from server.tests.helpers import golden_csv

CYCLE = "2026_11_w3"


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    s = SessionLocal()
    seed_default_mapping(s)
    yield s
    s.close()


def _session(db, extra=None, cycle=CYCLE):
    content = golden_csv(extra)
    record, _ = save_and_fingerprint(content, "golden.csv", f"rc_{cycle}", db, True)
    resp, source_rows, headers = run_pipeline(content, "golden.csv", cycle, None)
    save_session(db, cycle, record.id, resp, source_rows, headers)
    return resp


def test_recalculate_clears_orphan_blocker_and_keeps_overrides(db):
    resp = _session(db, extra="PKD-202")
    assert any(b.code == "E_NO_CODE" and b.key == "PKD-202" for b in resp.blockers)
    assert any(o.key == "PKD-202" for o in resp.orphans)

    new_resp = recalculate_session(
        session_id=resp.session_id, mapping_id=None,
        orphan_assignments=[OrphanAssignment(key="PKD-202", target_ma_da="I.C.1.2")],
        overrides={"I.C.1.2": {"pic": "PIC Đã Sửa Tay"}}, db=db,
    )
    assert new_resp.session_id == resp.session_id
    assert not any(b.code == "E_NO_CODE" and b.key == "PKD-202" for b in new_resp.blockers)
    assert not any(o.key == "PKD-202" for o in new_resp.orphans)
    row = next(r for r in new_resp.rows if r.ma == "I.C.1.2")
    assert row.pic == "PIC Đã Sửa Tay" and row.ovr == {"pic": "PIC Đã Sửa Tay"}
    assert any(s.key == "PKD-202" for s in row.subtasks)

    # overrides survive a later recalculate that does not resend them
    again = recalculate_session(resp.session_id, None, [], {}, db)
    assert next(r for r in again.rows if r.ma == "I.C.1.2").pic == "PIC Đã Sửa Tay"


def test_recalculate_default_mapping_matches_ingest_and_custom_mapping_applies(db):
    from server.app.modules.mapping.service import clone_mapping, update_mapping
    from server.app.schemas.mapping import MappingConfigUpdate, ValueMappings

    resp = _session(db, cycle="2026_11_w2")
    same = recalculate_session(resp.session_id, "map_default_pmo_49col", [], {}, db)
    assert [r.model_dump() for r in same.rows] == [r.model_dump() for r in resp.rows]  # seed == Phase-1 rules

    clone = clone_mapping(db, "map_default_pmo_49col")
    update_mapping(db, clone.id, MappingConfigUpdate(value_mappings=ValueMappings(status_map={"In Progress": "Đang làm gấp"})))
    custom = recalculate_session(resp.session_id, clone.id, [], {}, db)
    assert any(r.tt == "Đang làm gấp" for r in custom.rows)


def test_recalculate_rejects_bad_input(db):
    resp = _session(db, cycle="2026_11_w1")
    with pytest.raises(LookupError, match="E_SESSION_NOT_FOUND"):
        recalculate_session("nope", None, [], {}, db)
    with pytest.raises(LookupError, match="E_MAPPING_NOT_FOUND"):
        recalculate_session(resp.session_id, "nope", [], {}, db)
    with pytest.raises(ValueError, match="E_ORPHAN_ASSIGNMENT_INVALID"):
        recalculate_session(resp.session_id, None, [OrphanAssignment(key="PMOGOLD-18", target_ma_da="Z.Z.9")], {}, db)
    with pytest.raises(ValueError, match="E_OVERRIDE_INVALID_FIELD"):
        recalculate_session(resp.session_id, None, [], {"I.C.1.2": {"nope": "x"}}, db)
