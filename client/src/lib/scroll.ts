/** Cuộn bảng để ô đang chọn nằm trong vùng nhìn thấy (trừ cột ghim, tiêu đề cột và khung tìm). */

function scrollerOf(el: HTMLElement, axis: 'x' | 'y'): HTMLElement {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const ov = axis === 'y' ? cs.overflowY : cs.overflowX;
    const big = axis === 'y' ? n.scrollHeight > n.clientHeight + 1 : n.scrollWidth > n.clientWidth + 1;
    if (/(auto|scroll)/.test(ov) && big) return n;
  }
  return document.scrollingElement as HTMLElement;
}

export function scrollToCell(i: number, fid: string, quiet: boolean) {
  const gw = document.querySelector<HTMLElement>('.gridwrap');
  if (!gw) return;
  const el = gw.querySelector<HTMLElement>(`[data-i="${i}"][data-f="${fid}"]`);
  if (!el) return;
  const sx = scrollerOf(el, 'x');
  const sy = scrollerOf(el, 'y');
  const X = sx.getBoundingClientRect();
  const Y = sy === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : sy.getBoundingClientRect();
  const c = el.getBoundingClientRect();
  let left = X.left;
  gw.querySelectorAll('thead tr:last-child th.key, thead tr:last-child th.key2, thead tr:last-child th.ckc').forEach((p) => { left = Math.max(left, p.getBoundingClientRect().right); });
  const head = gw.querySelector('thead');
  const hb = head ? head.getBoundingClientRect().bottom : Y.top;
  const top = Math.max(Y.top, Math.min(hb, Y.top + 120));
  const bottom = Math.min(Y.bottom, window.innerHeight - 30);
  let right = X.right;
  const fc = document.getElementById('findc');
  if (fc) { const f = fc.getBoundingClientRect(); if (f.left < right && f.left > left + 260) right = f.left - 8; }
  if (c.left < left || c.right > right) sx.scrollLeft += c.left + c.width / 2 - (left + right) / 2;
  if (c.top < top || c.bottom > bottom) sy.scrollTop += c.top + c.height / 2 - (top + bottom) / 2;
  if (!quiet) { el.classList.remove('fflash'); void el.offsetWidth; el.classList.add('fflash'); }
}
