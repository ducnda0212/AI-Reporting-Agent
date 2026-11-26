/* Con trỏ "✦ Agent" #agCur đi qua từng ô Agent soạn / áp dụng (prototype agCursor / agWalk L12230-12253, đọc `state.walk`)
   và nhãn #fxTip "Ô k/n · Mã DA · cột · lý do" bám theo ô khi bấm "N ô cần sửa →" (fxTip / fxSpot L12461-12479, đọc `state.fxTip`).
   Hai lớp nổi đặt ngoài .gridwrap; hiệu ứng chạy trên DOM sau khi vẽ như prototype. */
import { useEffect, useRef } from 'react';
import { fieldById } from '@/lib/cell';
import { getState, useAppState } from '@/store';
import { fxTipClose } from '@/store/actions/grid';
import { cursorTag } from '@/lib/agentRun';
import '@/styles/agent-fx.css';

const cellAt = (i: number, f: string): HTMLElement | null => document.querySelector('.cell[data-i="' + i + '"][data-f="' + f + '"]');
/** Chạy lại hiệu ứng CSS của một lớp trên ô. */
const replay = (el: Element, cls: string): void => { el.classList.remove(cls); void (el as HTMLElement).offsetWidth; el.classList.add(cls); };

export function AgentCursor(): JSX.Element {
  const walk = useAppState((x) => x.walk), tip = useAppState((x) => x.fxTip), cur = useRef<HTMLDivElement>(null), tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = cur.current; if (!walk || !c) return;
    const all = walk.list.map((x, k) => ({ x, tag: walk.tags?.[k] || '' }));
    const lab = c.querySelector('.agt');
    let L = all.filter((e) => cellAt(e.x[0], e.x[1])).slice(0, walk.n || 6);
    let k = 0, t = 0, tries = 0;
    const step = (): void => {
      if (k >= L.length) { t = window.setTimeout(() => c.classList.remove('on'), 700); return; }
      const e = L[k++], x = e.x, el = cellAt(x[0], x[1]); if (!el) return step();
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch { /* trình duyệt cũ */ }
      t = window.setTimeout(() => {
        const e2 = cellAt(x[0], x[1]); if (!e2) return step();
        const r = e2.getBoundingClientRect();
        c.style.left = r.left + 6 + 'px'; c.style.top = r.top - 22 + 'px'; c.classList.add('on');
        if (lab) lab.textContent = cursorTag(e.tag, walk.cls === 'aiflash');
        replay(e2, walk.cls);
        t = window.setTimeout(step, 520);
      }, 320);
    };
    /* áp dụng / xem lại: nháy tím mọi ô ngay, con trỏ đi qua tối đa 6 ô */
    /* ô có thể chưa được vẽ (bảng vừa cuộn tới): thử lại vài lần trước khi bỏ */
    const start = (): void => {
      L = all.filter((e) => cellAt(e.x[0], e.x[1])).slice(0, walk.n || 6);
      if (!L.length) { if (tries++ < 6) { t = window.setTimeout(start, 250); } else c.classList.remove('on'); return; }
      if (walk.cls === 'aiflash') walk.list.forEach((x) => cellAt(x[0], x[1])?.classList.add('aiflash'));
      step();
    };
    const t0 = window.setTimeout(start, 60);
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
      <div id="agCur" ref={cur}><span aria-hidden="true">✦</span>Agent<b className="agt" /></div>
      <div id="fxTip" ref={tipRef}>
        {tip && f && <><b>{'Ô ' + (tip.k + 1) + '/' + tip.n}</b>{' · ' + ma + ' · ' + f.name.split(' (')[0]}<br /><span>{tip.why}</span>{tip.n > 1 && <em>Bấm lại để sang ô kế</em>}</>}
      </div>
    </>
  );
}
