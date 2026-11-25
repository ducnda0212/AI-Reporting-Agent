/* Con trỏ "✦ Agent" #agCur đi qua từng ô Agent soạn / áp dụng (prototype agCursor / agWalk L12230-12253, đọc `state.walk`)
   và nhãn #fxTip "Ô k/n · Mã DA · cột · lý do" bám theo ô khi bấm "N ô cần sửa →" (fxTip / fxSpot L12461-12479, đọc `state.fxTip`).
   Hai lớp nổi đặt ngoài .gridwrap; hiệu ứng chạy trên DOM sau khi vẽ như prototype. */
import { useEffect, useRef } from 'react';
import { fieldById } from '@/lib/cell';
import { getState, useAppState } from '@/store';
import { fxTipClose } from '@/store/actions/grid';

const cellAt = (i: number, f: string): HTMLElement | null => document.querySelector('.cell[data-i="' + i + '"][data-f="' + f + '"]');
/** Chạy lại hiệu ứng CSS của một lớp trên ô. */
const replay = (el: Element, cls: string): void => { el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls); };

export function AgentCursor(): JSX.Element {
  const walk = useAppState((x) => x.walk), tip = useAppState((x) => x.fxTip), cur = useRef<HTMLDivElement>(null), tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = cur.current; if (!walk || !c) return;
    const L = walk.list.filter((x) => cellAt(x[0], x[1])).slice(0, walk.n || 6);
    if (!L.length) { c.classList.remove('on'); return; }
    let k = 0, t = 0;
    const step = (): void => {
      if (k >= L.length) { t = window.setTimeout(() => c.classList.remove('on'), 700); return; }
      const x = L[k++], el = cellAt(x[0], x[1]); if (!el) return step();
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch { /* trình duyệt cũ */ }
      t = window.setTimeout(() => {
        const e2 = cellAt(x[0], x[1]); if (!e2) return step();
        const r = e2.getBoundingClientRect();
        c.style.left = r.left + 6 + 'px'; c.style.top = r.top - 22 + 'px'; c.classList.add('on');
        replay(e2, walk.cls);
        t = window.setTimeout(step, 520);
      }, 320);
    };
    /* áp dụng / xem lại: nháy tím mọi ô ngay, con trỏ đi qua tối đa 6 ô */
    const t0 = window.setTimeout(() => {
      if (walk.cls === 'aiflash') walk.list.forEach((x) => cellAt(x[0], x[1])?.classList.add('aiflash'));
      step();
    }, 60);
    return () => { clearTimeout(t0); clearTimeout(t); };
  }, [walk?.seq]);

  useEffect(() => {
    const T = tipRef.current; if (!tip || !T) return;
    const sel = (): Element | null => document.querySelector('.cell.sel') || document.querySelector('.cellsel.sel');
    let t2 = 0, t3 = 0;
    const t1 = window.setTimeout(() => {
      const c = sel(); if (!c) return;
      try { (c.closest('td') || c).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch { /* trình duyệt cũ */ }
      t2 = window.setTimeout(() => {
        const c2 = sel(); if (!c2) return;
        replay(c2, 'fxpulse');
        const r = c2.getBoundingClientRect();
        T.style.left = Math.min(window.innerWidth - 300, Math.max(8, r.left)) + 'px'; T.style.top = r.bottom + 6 + 'px';
        replay(T, 'on');
        t3 = window.setTimeout(() => { T.classList.remove('on'); if (getState().fxTip === tip) fxTipClose(); }, 2600);
      }, 380);
    }, 60);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); T.classList.remove('on'); };
  }, [tip]);

  const f = tip && fieldById(tip.f), ma = tip && getState().allRows[tip.i]?.ma;
  return (
    <>
      <div id="agCur" ref={cur}><span aria-hidden="true">✦</span>Agent</div>
      <div id="fxTip" ref={tipRef}>
        {tip && f && <><b>{'Ô ' + (tip.k + 1) + '/' + tip.n}</b>{' · ' + ma + ' · ' + f.name.split(' (')[0]}<br /><span>{tip.why}</span>{tip.n > 1 && <em>Bấm lại để sang ô kế</em>}</>}
      </div>
    </>
  );
}
