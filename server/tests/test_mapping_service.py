import json

import pytest

from app.core.database import Base, SessionLocal, engine
from app.modules.mapping.seed import seed_default_mapping
from app.modules.mapping.service import (
    clone_mapping, create_mapping, delete_mapping, get_mapping, list_mappings, set_default_mapping, update_mapping,
)
from app.schemas.mapping import MappingConfigCreate, MappingConfigUpdate, ValueMappings


@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    s = SessionLocal()
    seed_default_mapping(s)
    yield s
    s.close()


def test_mapping_clone_and_protection(db):
    cloned = clone_mapping(db, "map_default_pmo_49col", new_name="Bản sao Test")
    assert cloned.id != "map_default_pmo_49col"
    assert cloned.is_default is False
    assert cloned.name == "Bản sao Test"
    assert cloned.status == "draft"

    with pytest.raises(ValueError, match="E_CANNOT_DELETE_DEFAULT_MAPPING"):
        delete_mapping(db, "map_default_pmo_49col")

    assert delete_mapping(db, cloned.id) is True
    assert get_mapping(db, cloned.id) is None


def test_clone_default_name_and_isolation(db):
    cloned = clone_mapping(db, "map_default_pmo_49col")
    assert cloned.name.endswith("(Bản sao)")
    update_mapping(db, cloned.id, MappingConfigUpdate(value_mappings=ValueMappings(status_map={"Pending": "Tạm dừng"})))
    original = get_mapping(db, "map_default_pmo_49col")
    assert json.loads(original.value_mappings_json)["status_map"]["In Progress"] == "Đang thực hiện"
    assert get_mapping(db, cloned.id).version == 2 and original.version == 1
    assert json.loads(get_mapping(db, cloned.id).value_mappings_json)["status_map"] == {"Pending": "Tạm dừng"}
    delete_mapping(db, cloned.id)


def test_create_list_set_default_and_missing(db):
    new = create_mapping(db, MappingConfigCreate(name="N", columns=[], value_mappings=ValueMappings()))
    assert new.id in {m.id for m in list_mappings(db)} and new.is_default is False
    assert set_default_mapping(db, new.id).is_default is True
    assert get_mapping(db, "map_default_pmo_49col").is_default is False
    with pytest.raises(ValueError, match="E_CANNOT_DELETE_DEFAULT_MAPPING"):
        delete_mapping(db, new.id)
    set_default_mapping(db, "map_default_pmo_49col")
    assert delete_mapping(db, new.id) is True
    assert delete_mapping(db, "nope") is False
    with pytest.raises(LookupError, match="E_MAPPING_NOT_FOUND"):
        update_mapping(db, "nope", MappingConfigUpdate(name="x"))
