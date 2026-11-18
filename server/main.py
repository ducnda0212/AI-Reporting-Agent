from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.core import config
from server.routers.import_router import router as import_router

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(import_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
