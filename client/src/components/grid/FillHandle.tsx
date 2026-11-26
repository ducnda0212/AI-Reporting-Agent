/* Tay nắm điền #fillh ở góc dưới phải vùng chọn (prototype fillHandleHost / placeFillHandle L7241-7261, kéo L7262-7297):
   kéo xuống (hoặc lên) để chép giá trị vùng chọn, ô đích tô .fillprev khi đang kéo, tự cuộn khi sát mép. Lớp nổi ngoài .gridwrap. */
import { useEffect, useRef, type MouseEvent as RMouseEvent } from 'react';
import { effectiveKind, fieldById, locked } from '@/lib/cell';
import { getState, useAppState } from '@/store';
import { fillTo, rangeBox } from '@/store/actions/grid';

const clearPrev = (): void => { document.querySelectorAll('.fillprev').forEach((x) => x.classList.remove('fillprev')); };

export function FillHandle(): JSX.Element {
  useAppState((x) => x); // vẽ lại (và đặt lại tay nắm) mỗi khi state đổi
  const ref = useRef<HTMLDivElement>(null), drag = useRef<{ B: NonNullable<ReturnType<typeof rangeBox>>; to: number } | null>(null);

  /* đặt tay nắm sau mỗi lần vẽ, khi cuộn và khi đổi cỡ cửa sổ */
  useEffect(() => {
    const place = (): void => {
      const h = ref.current, st = getState(), c = st.sel, gw = document.querySelector('.gridwrap');
      if (!h || drag.current) return;
      const end = st.range ? st.range.b : c, f = end && fieldById(end.f);
      const el = end && gw ? gw.querySelector('[data-i="' + end.i + '"][data-f="' + end.f + '"]') : null;
      if (st.view !== 'grid' || !el || !f || st.pe || locked(f) || ['calc', 'none', 'future', 'past'].includes(effectiveKind(f))) { h.style.display = 'none'; return; }
      const r = el.getBoundingClientRect(), g = gw!.getBoundingClientRect();
      if (r.bottom < g.top + 40 || r.bottom > g.bottom || r.right < g.left || r.right > g.right) { h.style.display = 'none'; return; }
      h.style.display = 'block'; h.style.left = r.right - 4 + 'px'; h.style.top = r.bottom - 4 + 'px';
    };
    let raf = 0;
    const later = (): void => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };
    place(); later();
    document.addEventListener('scroll', later, true);
    window.addEventListener('resize', place);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('scroll', later, true); window.removeEventListener('resize', place); };
  });

  const start = (e: RMouseEvent): void => {
    e.preventDefault(); e.stopPropagation();
    const B = rangeBox(getState()); if (!B) return;
    drag.current = { B, to: B.r2 };
    document.body.classList.add('filling');
    const move = (ev: MouseEvent): void => {
      const D = drag.current, cell = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-i][data-f]'); if (!D || !cell) return;
      const r = D.B.O.indexOf(+cell.dataset.i!); if (r < 0) return;
      D.to = r;
      const { r1, r2, c1, c2, O, F } = D.B, lo = r > r2 ? r2 + 1 : Math.min(r, r1), hi = r > r2 ? r : r < r1 ? r1 - 1 : -1;
      clearPrev();
      for (let k = lo; k <= hi; k++) F.slice(c1, c2 + 1).forEach((fid) => document.querySelector('.gridwrap [data-i="' + O[k] + '"][data-f="' + fid + '"]')?.classList.add('fillprev'));
      const gw = document.querySelector('.gridwrap');
      if (gw) { const g = gw.getBoundingClientRect(); if (ev.clientY > g.bottom - 30) gw.scrollTop += 18; else if (ev.clientY < g.top + 70) gw.scrollTop -= 18; }
    };
    const up = (): void => {
      const D = drag.current; drag.current = null;
      document.body.classList.remove('filling'); clearPrev();
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up);
      if (D) fillTo(D.to);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  return <div id="fillh" ref={ref} title="Kéo để điền xuống (hoặc lên)" onMouseDown={start} />;
}
