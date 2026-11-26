/* Giao diện sáng/tối, lưu trong localStorage (`pmo-theme`). Chỉ chạm DOM/localStorage khi có trình duyệt. */
export type Theme = 'light' | 'dark';

const KEY = 'pmo-theme';
const hasDom = (): boolean => typeof document !== 'undefined';

export function getStoredTheme(): Theme | null {
  try {
    const t = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return t === 'light' || t === 'dark' ? t : null;
  } catch { return null; }
}

/** Theme đang áp dụng: thuộc tính `data-theme`, không có thì theo hệ điều hành. */
export function currentTheme(): Theme {
  if (!hasDom()) return 'light';
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'light' || t === 'dark') return t;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(t: Theme): void {
  if (hasDom()) document.documentElement.setAttribute('data-theme', t);
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, t); } catch { /* chế độ riêng tư: bỏ qua */ }
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
