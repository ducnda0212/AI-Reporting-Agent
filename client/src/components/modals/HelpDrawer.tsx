/* Trung tâm hướng dẫn (prototype helpHTML L11113, bản gọn 3 bước): tìm #hpQ, mục theo màn hình (xổ ra từng bước + "Chỉ cho tôi trên màn hình →" chạy tour),
   Hỏi nhanh, Phím tắt. Chỉ vẽ khi state.help; Esc đóng. */
import { useEffect } from 'react';
import { FAQ, HELP, KEYS } from '@/data/constants';
import { useAppState } from '@/store';
import { helpClose, helpSetQuery, helpTourStart, helpToggleTopic } from '@/store/actions/help';
import type { TourKey } from '@/types';

const STEPS = ['Nhập file', 'Điền & duyệt', 'Chốt & xuất'];

function Drawer(): JSX.Element {
  const helpQ = useAppState((s) => s.helpQ), op = useAppState((s) => s.helpOpen), q = helpQ.trim().toLowerCase();
  useEffect(() => {
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); helpClose(); } };
    window.addEventListener('keydown', key, true);
    document.getElementById('hpQ')?.focus();
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  const hit = (t: string): boolean => !q || t.toLowerCase().includes(q);
  const topics = HELP.filter((h) => hit(h.t + ' ' + h.d + ' ' + h.s.join(' ')));
  const faq = FAQ.filter((f) => hit(f[0] + ' ' + f[1]));
  return (
    <>
      <div className="hpov" data-act="helpClose" onClick={helpClose} />
      <aside className="hpdr" role="dialog" aria-modal="true" aria-label="Hướng dẫn sử dụng">
        <div className="hphd"><b>Hướng dẫn sử dụng</b><button className="hpx" data-act="helpClose" aria-label="Đóng hướng dẫn" title="Đóng (Esc)" onClick={helpClose}>×</button></div>
        <label className="hpq"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input id="hpQ" type="search" autoComplete="off" placeholder="Tìm hướng dẫn, ví dụ: so sánh, phiên bản…" value={helpQ} aria-label="Tìm hướng dẫn" onChange={(e) => helpSetQuery(e.target.value)} /></label>
        <div className="hpbd">
          {!q && <div className="hpstart"><span>Mỗi tuần làm 3 bước</span><div className="hpsteps">{STEPS.map((s, i) => <div key={s}><i>{i + 1}</i>{s}</div>)}</div>
            <button className="btn sm pri" data-act="helpTour" data-k="all" onClick={() => helpTourStart('all')}>Xem tour 1 phút</button></div>}
          <div className="hpsec">Theo màn hình</div>
          {topics.length ? topics.map((h) => {
            const on = op === h.k || !!q;
            return (
              <div key={h.k} className={'hpt' + (on ? ' on' : '')}>
                <button className="hpth" data-act="helpOpen" data-k={h.k} aria-expanded={on} onClick={() => helpToggleTopic(h.k)}><span className="hpic">{h.ic}</span><span className="hptx"><b>{h.t}</b><span>{h.d}</span></span><span className="hpch">{on ? '−' : '+'}</span></button>
                {on && <div className="hptb"><ol>{h.s.map((x) => <li key={x}>{x}</li>)}</ol><button className="btn sm" data-act="helpTour" data-k={h.k} onClick={() => helpTourStart(h.k as TourKey)}>Chỉ cho tôi trên màn hình →</button></div>}
              </div>
            );
          }) : <div className="hpnone">Không tìm thấy.</div>}
          {faq.length > 0 && <><div className="hpsec">Hỏi nhanh</div>{faq.map((f) => <details key={f[0]} className="hpfq" open={!!q}><summary>{f[0]}</summary><p>{f[1]}</p></details>)}</>}
          {!q && <><div className="hpsec">Phím tắt</div><div className="hpkeys">{KEYS.map((k) => <div key={k[0]}><span>{k[1]}</span><kbd>{k[0]}</kbd></div>)}</div></>}
        </div>
      </aside>
    </>
  );
}

export function HelpDrawer(): JSX.Element | null {
  return useAppState((s) => s.help) ? <Drawer /> : null;
}
