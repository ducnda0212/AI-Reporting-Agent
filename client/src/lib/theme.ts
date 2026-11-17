/** Giao diện sáng/tối: lưu lựa chọn trong localStorage, gắn lên thuộc tính data-theme của <html>. */
export type Theme = 'light' | 'dark';
const KEY = 'pmo-theme';

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Áp dụng lựa chọn đã lưu (gọi một lần khi khởi động). */
export function applyStoredTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch { /* bỏ qua: trình duyệt chặn lưu */ }
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(KEY, next); } catch { /* bỏ qua */ }
  return next;
}
