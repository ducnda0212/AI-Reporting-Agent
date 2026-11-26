from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from server.app.core.database import get_db
from server.app.core.errors import api_error, from_service_error
from server.app.modules.mapping import service
from server.app.modules.mapping.recalculate import recalculate_session
from server.app.schemas.ingest import IngestResponse
from server.app.schemas.mapping import (
    CloneRequest, MappingConfigCreate, MappingConfigOut, MappingConfigUpdate, RecalculateRequest,
)

router = APIRouter(prefix="/api/v1", tags=["mapping"])


def _call(fn, *args, status: int = 404):
    """Run a service call, mapping LookupError -> 404 and ValueError -> `status`."""
    try:
        return fn(*args)
    except LookupError as e:
        raise from_service_error(e, 404)
    except ValueError as e:
        raise from_service_error(e, status)


@router.get("/mappings", response_model=list[MappingConfigOut])
def list_mappings(db: Session = Depends(get_db)):
    return [service.to_out(c) for c in service.list_mappings(db)]


@router.get("/mappings/{mapping_id}", response_model=MappingConfigOut)
def get_mapping(mapping_id: str, db: Session = Depends(get_db)):
    cfg = service.get_mapping(db, mapping_id)
    if cfg is None:
        raise api_error(404, "E_MAPPING_NOT_FOUND")
    return service.to_out(cfg)


@router.post("/mappings", response_model=MappingConfigOut)
def create_mapping(data: MappingConfigCreate, db: Session = Depends(get_db)):
    return service.to_out(service.create_mapping(db, data))


@router.post("/mappings/{mapping_id}/clone", response_model=MappingConfigOut)
def clone_mapping(mapping_id: str, req: CloneRequest | None = None, db: Session = Depends(get_db)):
    return service.to_out(_call(service.clone_mapping, db, mapping_id, req.new_name if req else None))


@router.put("/mappings/{mapping_id}", response_model=MappingConfigOut)
def update_mapping(mapping_id: str, data: MappingConfigUpdate, db: Session = Depends(get_db)):
    return service.to_out(_call(service.update_mapping, db, mapping_id, data))


@router.delete("/mappings/{mapping_id}")
def delete_mapping(mapping_id: str, db: Session = Depends(get_db)):
    if not _call(service.delete_mapping, db, mapping_id, status=400):
        raise api_error(404, "E_MAPPING_NOT_FOUND")
    return {"success": True, "id": mapping_id}


@router.post("/mappings/{mapping_id}/set-default", response_model=MappingConfigOut)
def set_default(mapping_id: str, db: Session = Depends(get_db)):
    return service.to_out(_call(service.set_default_mapping, db, mapping_id))


@router.post("/mapping/recalculate", response_model=IngestResponse)
def recalculate(req: RecalculateRequest, db: Session = Depends(get_db)):
    return _call(
        recalculate_session, req.session_id, req.mapping_id, req.orphan_assignments, req.overrides, db,
        req.src_overrides, req.value_mappings, status=422,
    )
