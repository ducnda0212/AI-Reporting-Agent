"""Ẩn tên người trước khi gửi AI và trả lại tên thật trong kết quả."""
from __future__ import annotations

import re


class Masker:
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.fwd: dict[str, str] = {}
        self.back: dict[str, str] = {}

    def add(self, *names: str | None) -> None:
        for raw in names:
            for n in re.split(r'[,;/\n]+', raw or ''):
                n = re.sub(r'\s*\(.*?\)\s*$', '', n).strip()
                if len(n) < 3 or n in self.fwd or '@' in n:
                    continue
                tag = f'[Người {len(self.fwd) + 1}]'
                self.fwd[n] = tag
                self.back[tag] = n

    def mask(self, text: str) -> str:
        if not self.enabled or not text:
            return text or ''
        for n in sorted(self.fwd, key=len, reverse=True):
            text = re.sub(re.escape(n), self.fwd[n], text, flags=re.I)
        # email luôn bị ẩn
        return re.sub(r'[\w.+-]+@[\w-]+\.[\w.-]+', '[email]', text)

    def unmask(self, value):
        if not self.enabled:
            return value
        if isinstance(value, str):
            for tag, n in self.back.items():
                value = value.replace(tag, n)
            return value
        if isinstance(value, list):
            return [self.unmask(v) for v in value]
        if isinstance(value, dict):
            return {k: self.unmask(v) for k, v in value.items()}
        return value
