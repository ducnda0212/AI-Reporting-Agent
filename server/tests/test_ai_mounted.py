"""App FastAPI chính phải có các route AI mà giao diện gọi (/api/ai/status, /api/ai/draft...)."""
import pytest

pytest.importorskip('fastapi')
pytest.importorskip('sqlalchemy')


def test_main_app_serves_ai_routes_next_to_v1_routes():
    from fastapi.testclient import TestClient
    from app.main import app

    # Route /api/v1/* do APIRouter đăng ký: bản FastAPI mới không liệt kê chúng phẳng trong app.routes,
    # nên kiểm tra qua OpenAPI thay vì duyệt app.routes.
    v1 = set(app.openapi()['paths'])
    assert '/health' in v1
    assert '/api/v1/ingest/upload' in v1

    # Route AI gắn bằng mount(): kiểm tra bằng request thật.
    client = TestClient(app)
    assert client.get('/health').status_code == 200
    r = client.get('/api/ai/status')
    assert r.status_code == 200
    assert {'mode', 'model', 'problems'} <= set(r.json())
