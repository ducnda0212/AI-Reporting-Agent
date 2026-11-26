from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.ai.api import mount as mount_ai
from app.core.database import Base, SessionLocal, engine
from app.models import catalog, cycle, file, mapping, session, version  # noqa: F401  (register tables)
from app.modules.ingestion.router import cycles_router, router as ingest_router
from app.modules.mapping.router import router as mapping_router
from app.modules.mapping.seed import migrate_schema, seed_default_mapping
from app.modules.reporting.router import router as reporting_router
from app.modules.session.router import router as session_router

Base.metadata.create_all(bind=engine)
migrate_schema(engine)
with SessionLocal() as _db:  # import-time (like create_all) so TestClient(app) without lifespan is seeded too
    seed_default_mapping(_db)

app = FastAPI(title="PMO Reporting Agent API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition", "X-Exported-Filename"],
)
app.include_router(ingest_router)
app.include_router(cycles_router)
app.include_router(mapping_router)
app.include_router(session_router)
app.include_router(reporting_router)
mount_ai(app)  # /api/ai/*, /api/risk/assess, /api/agent/ask (phần AI, không dùng DB)


@app.get("/health")
def health():
    return {"status": "ok"}
