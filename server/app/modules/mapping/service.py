"""MappingConfig CRUD. Errors: LookupError("E_MAPPING_NOT_FOUND"), ValueError("E_CANNOT_DELETE_DEFAULT_MAPPING")."""
import json
import time
import uuid

from sqlalchemy.orm import Session

from app.models.mapping import MappingConfig
from app.modules.mapping.seed import DEFAULT_MAPPING_ID
from app.schemas.mapping import MappingConfigCreate, MappingConfigOut, MappingConfigUpdate


def _dump(model) -> str:
    return json.dumps(model.model_dump(mode="json"), ensure_ascii=False)


def _require(db: Session, mapping_id: str) -> MappingConfig:
    cfg = db.get(MappingConfig, mapping_id)
    if cfg is None:
        raise LookupError("E_MAPPING_NOT_FOUND")
    return cfg


def list_mappings(db: Session) -> list[MappingConfig]:
    return db.query(MappingConfig).order_by(MappingConfig.is_default.desc(), MappingConfig.created_at).all()


def get_mapping(db: Session, mapping_id: str) -> MappingConfig | None:
    return db.get(MappingConfig, mapping_id)


def create_mapping(db: Session, data: MappingConfigCreate) -> MappingConfig:
    cfg = MappingConfig(
        id=f"map_{uuid.uuid4().hex[:12]}", name=data.name, description=data.description,
        columns_json=json.dumps([c.model_dump(mode="json") for c in data.columns], ensure_ascii=False),
        value_mappings_json=_dump(data.value_mappings),
    )
    db.add(cfg)
    db.commit()
    return cfg


def clone_mapping(db: Session, mapping_id: str, new_name: str | None = None) -> MappingConfig:
    src = _require(db, mapping_id)
    clone = MappingConfig(
        id=f"map_clone_{int(time.time())}_{uuid.uuid4().hex[:6]}",
        name=new_name or f"{src.name} (Bản sao)", description=src.description,
        is_default=False, status="draft",
        columns_json=src.columns_json, value_mappings_json=src.value_mappings_json,  # JSON strings: no shared state
    )
    db.add(clone)
    db.commit()
    return clone


def update_mapping(db: Session, mapping_id: str, data: MappingConfigUpdate) -> MappingConfig:
    cfg = _require(db, mapping_id)
    if data.name is not None:
        cfg.name = data.name
    if data.description is not None:
        cfg.description = data.description
    if data.columns is not None:
        cfg.columns_json = json.dumps([c.model_dump(mode="json") for c in data.columns], ensure_ascii=False)
    if data.value_mappings is not None:
        cfg.value_mappings_json = _dump(data.value_mappings)
    cfg.version += 1
    db.commit()
    return cfg


def delete_mapping(db: Session, mapping_id: str) -> bool:
    cfg = db.get(MappingConfig, mapping_id)
    if cfg is None:
        return False
    if cfg.is_default or cfg.id == DEFAULT_MAPPING_ID:
        raise ValueError("E_CANNOT_DELETE_DEFAULT_MAPPING")
    db.delete(cfg)
    db.commit()
    return True


def set_default_mapping(db: Session, mapping_id: str) -> MappingConfig:
    cfg = _require(db, mapping_id)
    db.query(MappingConfig).filter(MappingConfig.id != mapping_id).update({MappingConfig.is_default: False})
    cfg.is_default = True
    db.commit()
    return cfg


def mapping_or_default(db: Session, mapping_id: str | None) -> MappingConfig | None:
    """Explicit id (LookupError if unknown), else the system default; None = built-in Phase-1 rules."""
    if mapping_id is not None:
        return _require(db, mapping_id)
    return db.query(MappingConfig).filter_by(is_default=True).first()


def to_out(cfg: MappingConfig) -> MappingConfigOut:
    return MappingConfigOut(
        id=cfg.id, name=cfg.name, description=cfg.description, is_default=cfg.is_default, status=cfg.status,
        version=cfg.version, columns=json.loads(cfg.columns_json), value_mappings=json.loads(cfg.value_mappings_json),
        created_at=cfg.created_at, updated_at=cfg.updated_at, created_by=cfg.created_by,
    )
