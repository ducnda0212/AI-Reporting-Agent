"""Chạy backend: python run.py   (đọc server/.env, mặc định cổng 8000).

Tương đương `uvicorn app.main:app --port 8000` chạy từ gốc repo, kèm in trạng thái AI.
"""
import os
import sys

import uvicorn

ROOT = os.path.dirname(os.path.abspath(__file__))  # thư mục server/ (chứa package app)
sys.path.insert(0, ROOT)
from app.ai.settings import settings  # noqa: E402

if __name__ == '__main__':
    print(f'PMO Reporting API · AI_MODE={settings.mode} · model={settings.model if settings.mode == "vllm" else "mock"} · http://localhost:{settings.port}')
    for p in settings.problems():
        print('  ! ' + p)
    uvicorn.run('app.main:app', host='127.0.0.1', port=settings.port, reload='--reload' in sys.argv, app_dir=ROOT)
