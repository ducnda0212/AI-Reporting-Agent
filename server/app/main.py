from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.app.core.database import Base, engine
from server.app.models import catalog, cycle, file, session  # noqa: F401  (register tables)
from server.app.modules.ingestion.router import router as ingest_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="PMO Reporting Agent API", version="0.1.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"], allow_headers=["*"],
)
app.include_router(ingest_router)


@app.get("/health")
def health():
    return {"status": "ok"}
