from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.app.core.database import Base, SessionLocal, engine
from server.app.models import catalog, cycle, file, mapping, session  # noqa: F401  (register tables)
from server.app.modules.ingestion.router import router as ingest_router
from server.app.modules.mapping.router import router as mapping_router
from server.app.modules.mapping.seed import seed_default_mapping
from server.app.modules.session.router import router as session_router

Base.metadata.create_all(bind=engine)
with SessionLocal() as _db:  # import-time (like create_all) so TestClient(app) without lifespan is seeded too
    seed_default_mapping(_db)

app = FastAPI(title="PMO Reporting Agent API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"], allow_headers=["*"],
)
app.include_router(ingest_router)
app.include_router(mapping_router)
app.include_router(session_router)


@app.get("/health")
def health():
    return {"status": "ok"}
