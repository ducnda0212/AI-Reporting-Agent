import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { noEdit, fieldOf } from '@/lib/cell';
import { rangeBox } from '@/lib/grid';
import { useStore } from '@/store';
import { getState } from '@/store';
import { fillDrag } from '@/store/actions/grid';

/** Tay nắm ở góc dưới phải vùng chọn: kéo xuống/lên để điền (như Excel). */
export function FillHandle() {
  const sel = useStore((s) => s.sel);
  const range = useStore((s) => s.range);
  const view = useStore((s) => s.view);
  const busy = useStore((s) => !!s.pe || !!s.edit);
  const fields = useStore((s) => s.fields);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);

  const place = () => {
    if (dragging.current) return;
    const s = getState();
    const gw = document.querySelector('.gridwrap');
    if (s.view !== 'grid' || !s.sel || !gw || s.pe || s.edit) { setPos(null); return; }
    const end = s.range ? s.range.b : s.sel;
    const el = gw.querySelector(`[data-i="${end.i}"][data-f="${end.f}"]`);
    if (!el || noEdit(fieldOf(s, end.f))) { setPos(null); return; }
    const c = el.getBoundingClientRect(); const g = gw.getBoundingClientRect();
    if (c.bottom < g.top + 40 || c.bottom > g.bottom || c.right < g.left || c.right > g.right) { setPos(null); return; }
    setPos({ x: c.right - 4, y: c.bottom - 4 });
  };
  useLayoutEffect(place, [sel, range, view, busy, fields]);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    document.addEventListener('scroll', on, true); window.addEventListener('resize', on);
    return () => { document.removeEventListener('scroll', on, true); window.removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);

  const start = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const B = rangeBox(getState());
    let to = B.r2;
    dragging.current = true;
    document.body.classList.add('filling');
    const clear = () => document.querySelectorAll('.fillprev').forEach((x) => x.classList.remove('fillprev'));
    const move = (ev: MouseEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const cell = el && (el as HTMLElement).closest ? (el as HTMLElement).closest('[data-i][data-f]') : null;
      if (cell) {
        const r = B.O.indexOf(+cell.getAttribute('data-i')!);
        if (r >= 0) {
          to = r;
          const lo = r > B.r2 ? B.r2 + 1 : Math.min(r, B.r1);
          const hi = r > B.r2 ? r : r < B.r1 ? B.r1 - 1 : -1;
          clear();
          if (hi >= lo) for (let k = lo; k <= hi; k++) B.F.slice(B.c1, B.c2 + 1).forEach((fid) => document.querySelector(`.gridwrap [data-i="${B.O[k]}"][data-f="${fid}"]`)?.classList.add('fillprev'));
        }
      }
      const gw = document.querySelector('.gridwrap');
      if (gw) { const g = gw.getBoundingClientRect(); if (ev.clientY > g.bottom - 30) gw.scrollTop += 18; else if (ev.clientY < g.top + 70) gw.scrollTop -= 18; }
    };
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      dragging.current = false; document.body.classList.remove('filling'); clear();
      fillDrag(to);
    };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  };

  if (!pos) return null;
  return <div id="fillh" title="Kéo để điền xuống (hoặc lên)" onMouseDown={start} style={{ display: 'block', left: pos.x, top: pos.y }} />;
}
