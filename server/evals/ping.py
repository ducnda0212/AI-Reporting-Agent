"""Đo tốc độ V-LLM bằng một câu rất ngắn, gọi nhiều lần. Dùng server/.env thật.

Chạy (thư mục server, đã bật venv):
    python -m evals.ping                 # 5 lần với model trong .env
    python -m evals.ping -n 10
    python -m evals.ping --model v-llm-v1-medium
    python -m evals.ping --json          # thêm 1 lượt có ép JSON như Agent dùng

In ra từng lần: thời gian, số token trả về, và cấu hình đang dùng (không in khoá).
"""
from __future__ import annotations

import argparse
import statistics
import sys
import time
from dataclasses import replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # gốc repo, để import server.app...

from server.app.ai.settings import SERVER_DIR, load  # noqa: E402
from server.app.ai.llm import VllmClient, VllmError  # noqa: E402

SCHEMA = {'title': 'ping', 'type': 'object', 'additionalProperties': False,
          'properties': {'ok': {'type': 'string'}}, 'required': ['ok']}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('-n', type=int, default=5)
    ap.add_argument('--model', default='')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    try:
        from dotenv import dotenv_values
        env = {k: v for k, v in dotenv_values(SERVER_DIR / '.env').items() if v is not None}
    except ImportError:
        sys.exit('Cần python-dotenv (pip install python-dotenv).')
    cfg = load(env)
    if cfg.mode != 'vllm':
        sys.exit('server/.env cần AI_MODE=vllm')
    if cfg.problems():
        sys.exit('; '.join(cfg.problems()))
    if a.model:
        cfg = replace(cfg, model=a.model)
    c = VllmClient(cfg)
    print(f'model={cfg.model} thinking={cfg.thinking} jsonMode={cfg.json_mode} timeout={cfg.timeout}s guardrail={cfg.guardrail or "mặc định"}')
    times = []
    for i in range(a.n):
        t = time.time()
        try:
            res = c.chat([{'role': 'user', 'content': 'Trả lời đúng một từ: OK'}], max_tokens=16, temperature=0)
            ms = int((time.time() - t) * 1000)
            times.append(ms)
            print(f'  lần {i + 1}: {ms} ms  trả lời={res["content"].strip()[:20]!r}  token ra={(res["usage"] or {}).get("completion_tokens")}')
        except VllmError as e:
            print(f'  lần {i + 1}: LỖI {e}')
    if times:
        s = sorted(times)
        print(f'P50={statistics.median(s):.0f} ms  P95={s[min(len(s) - 1, round(0.95 * (len(s) - 1)))]} ms  nhanh nhất={s[0]}  chậm nhất={s[-1]}')
    if a.json:
        t = time.time()
        try:
            res = c.chat_json([{'role': 'user', 'content': 'Trả về JSON {"ok": "OK"}'}], SCHEMA, max_tokens=50)
            print(f'  JSON: {int((time.time() - t) * 1000)} ms  {res["data"]}  token ra={(res["usage"] or {}).get("completion_tokens")}')
        except VllmError as e:
            print(f'  JSON: LỖI {e}')


if __name__ == '__main__':
    main()
