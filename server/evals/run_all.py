"""Chạy MỘT LẦN mọi kiểm thử và đánh giá AI, ghi toàn bộ kết quả vào test_ai_ket_qua.txt ở gốc repo.

Cách dùng: nhấp đúp test_ai.bat ở gốc repo, hoặc (thư mục server, đã mở venv):
    python -m evals.run_all              # tất cả
    python -m evals.run_all --ai-only    # bỏ pytest và test giao diện, chỉ chạy phần V-LLM
    python -m evals.run_all --no-ai      # chỉ pytest + test giao diện (không cần mạng công ty)
Các bước V-LLM cần mạng công ty và server/.env có AI_MODE=vllm. Không in khoá hay mật khẩu nào.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
ROOT = SERVER.parent
CLIENT = ROOT / 'client'
LOG = ROOT / 'test_ai_ket_qua.txt'
PY = sys.executable
EXPERIMENT = 'Thử nghiệm: V-LLM đọc cả file một lần (ingest_probe)'   # chỉ để so sánh, không tính đạt / lỗi
sys.path.insert(0, str(ROOT))   # import server.app...


def _steps(ai: bool, tests: bool) -> list[tuple[str, list[str] | str, Path, dict]]:
    out: list[tuple[str, list[str] | str, Path, dict]] = []
    if tests:
        out += [
            ('Server: pytest', [PY, '-m', 'pytest', 'tests', '-q', '-p', 'no:cacheprovider'], SERVER, {}),
            ('Giao diện: typecheck', 'npm run typecheck', CLIENT, {}),
            ('Giao diện: vitest', 'npm test', CLIENT, {}),
        ]
    if ai:
        out += [
            ('V-LLM: cấu hình + đo tốc độ', [PY, '-m', 'evals.run_all', '--status'], SERVER, {}),
            ('Chatbot trả lời đúng file 64DA (router)', [PY, '-m', 'evals.qa_truth', '--mode', 'live'], SERVER, {'AI_AGENT_MODE': 'router'}),
            ('Chatbot trả lời đúng file 64DA (tools)', [PY, '-m', 'evals.qa_truth', '--mode', 'live'], SERVER, {'AI_AGENT_MODE': 'tools'}),
            ('Chatbot trả lời đúng file 64DA (chat)', [PY, '-m', 'evals.qa_truth', '--mode', 'live'], SERVER, {'AI_AGENT_MODE': 'chat'}),
            ('V-LLM chọn công cụ (tools_eval)', [PY, '-m', 'evals.tools_eval'], SERVER, {}),
            ('V-LLM đọc ý định + sửa nối tiếp (robust_eval)', [PY, '-m', 'evals.robust_eval', '--mode', 'live'], SERVER, {}),
            (EXPERIMENT, [PY, '-m', 'evals.ingest_probe'], SERVER, {'VLLM_TIMEOUT': '300'}),
        ]
    return out


def status() -> int:
    """In cấu hình AI đang dùng (không in khoá) và gọi V-LLM 3 lần bằng một câu rất ngắn."""
    from server.app.ai.llm import VllmError, client
    from server.app.ai.settings import settings as s
    print(f'mode={s.mode} provider={getattr(s, "provider", "")} model={s.model} agent_model={s.agent_model} agent_mode={getattr(s, "agent_mode", "router")}')
    print(f'embeddings={"bật" if getattr(s, "rag_embeddings", False) else "tắt"} embed_model={getattr(s, "embed_model", "")} rerank_model={getattr(s, "rerank_model", "")} timeout={s.timeout}s')
    if s.mode != 'vllm' or s.problems():
        print('Chưa gọi được V-LLM:', s.problems() or 'AI_MODE đang là mock')
        return 2
    bad = 0
    for i in range(3):
        t = time.time()
        try:
            r = client.chat([{'role': 'user', 'content': 'Trả lời đúng một từ: OK'}], max_tokens=16, temperature=0)
            print(f'  chat lần {i + 1}: {int((time.time() - t) * 1000)} ms, trả lời {r["content"].strip()[:20]!r}')
        except VllmError as e:
            bad += 1
            print(f'  chat lần {i + 1}: LỖI {e}')
    if getattr(s, 'rag_embeddings', False) and getattr(s, 'embed_model', ''):
        t = time.time()
        try:
            v = client.embed(['kiểm tra embeddings'])
            print(f'  embeddings: {int((time.time() - t) * 1000)} ms, vector {len(v[0]) if v else 0} chiều')
        except VllmError as e:
            bad += 1
            print('  embeddings: LỖI', e)
    return 1 if bad else 0


def _run(name: str, cmd, cwd: Path, env: dict, log) -> tuple[int, float]:
    head = f'\n{"=" * 78}\n## {name}\n   (thư mục {cwd.name}{", " + ", ".join(f"{k}={v}" for k, v in env.items()) if env else ""})\n{"=" * 78}\n'
    print(head, end='')
    log.write(head)
    t = time.time()
    e = {**os.environ, 'PYTHONIOENCODING': 'utf-8', 'PYTHONUTF8': '1', **env}
    try:
        p = subprocess.Popen(cmd, cwd=cwd, env=e, shell=isinstance(cmd, str), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, encoding='utf-8', errors='replace')
    except OSError as ex:
        msg = f'Không chạy được: {ex}\n'
        print(msg, end='')
        log.write(msg)
        return 127, 0.0
    for line in p.stdout:
        print(line, end='')
        log.write(line)
        log.flush()
    return p.wait(), time.time() - t


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--ai-only', action='store_true')
    ap.add_argument('--no-ai', action='store_true')
    ap.add_argument('--status', action='store_true', help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    if a.status:
        return status()
    steps = _steps(ai=not a.no_ai, tests=not a.ai_only)
    results = []
    with LOG.open('w', encoding='utf-8') as log:
        log.write(f'Kết quả kiểm thử AI — {datetime.now():%d/%m/%Y %H:%M}\n')
        offline = False
        for name, cmd, cwd, env in steps:
            if offline:   # không gọi được V-LLM: các bước sau chỉ hết giờ chờ, bỏ qua cho nhanh
                results.append((name, 2, 0.0))
                continue
            code, sec = _run(name, cmd, cwd, env, log)
            results.append((name, code, sec))
            if name.startswith('V-LLM: cấu hình') and code != 0:
                offline = True
                msg = ('\nKhông gọi được V-LLM nên bỏ qua các bước AI còn lại. Kiểm tra: máy đang ở mạng nội bộ công ty (LAN / Wi-Fi công ty, không phải Wi-Fi khách),'
                       ' VPN nếu cần, và proxy công ty (đặt HTTPS_PROXY trước khi chạy nếu trình duyệt dùng proxy).\n')
                print(msg, end='')
                log.write(msg)
        mark = lambda n, c: 'THỬ ' if n == EXPERIMENT and c in (0, 1) else 'ĐẠT ' if c == 0 else 'BỎ  ' if c == 2 else 'LỖI '  # noqa: E731
        summary = f'\n{"=" * 78}\nTÓM TẮT\n' + '\n'.join(f'  {mark(n, c)} {n}  ({s:.0f}s, mã {c})' for n, c, s in results) \
            + f'\n\nToàn bộ kết quả: {LOG}\nGửi file này cho Claude để đọc và sửa tiếp.\n'
        print(summary)
        log.write(summary)
    return 0 if all(c == 0 or (n == EXPERIMENT and c == 1) for n, c, _ in results) else 1


if __name__ == '__main__':
    sys.exit(main())
