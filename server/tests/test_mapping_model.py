import json

from app.core.database import Base, SessionLocal, engine
from app.modules.mapping.seed import seed_default_mapping


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
    assert seed_default_mapping(db).id == default_map.id  # idempotent
    db.close()
