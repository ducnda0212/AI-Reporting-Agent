/* Tìm trong bảng #findc (prototype syncFind L6715, findBodyHtml L6689, snippet L6670, phím #fq L7038, gõ L7021):
   ô nhập giữ nguyên khi gõ; bộ đếm và danh sách cập nhật ngay, tô vàng trên bảng sau 180ms ngừng gõ. Lớp nổi ngoài .gridwrap. */
import { useEffect, useRef, useState } from 'react';
import { fieldById, refOf } from '@/lib/cell';
import { findMatches } from '@/lib/grid';
import { rowsOf, useAppState } from '@/store';
import { findClose, findGo, findPick, findSet } from '@/store/actions/grid';
import type { FindState } from '@/types';
import { markParts } from '@/components/grid/Cell';

function snippet(t: string, F: Pick<FindState, 'q' | 'cs'>): (string | JSX.Element)[] {
  const flat = t.replace(/\n+/g, ' · '), at = (F.cs ? flat : flat.toLowerCase()).indexOf(F.cs ? F.q.trim() : F.q.trim().toLowerCase());
  const a = Math.max(0, at - 26), b = Math.min(flat.length, at + F.q.trim().length + 44);
  return [a > 0 ? '…' : '', ...markParts(flat.slice(a, b), F.q, F.cs) as (string | JSX.Element)[], b < flat.length ? '…' : ''];
}

export function FindCard(): JSX.Element | null {
  const open = useAppState((x) => x.find.open && x.view === 'grid' && x.loaded);
  return open ? <FindBody /> : null;
}

function FindBody(): JSX.Element {
  const s = useAppState((x) => x), F = s.find, ref = useRef<HTMLDivElement>(null), qRef = useRef<HTMLInputElement>(null), resRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState(F.q), timer = useRef(0);

  useEffect(() => { qRef.current?.focus(); qRef.current?.select(); }, []);
  useEffect(() => {
    const card = ref.current, gw = document.querySelector('.gridwrap'), fb = document.querySelector('.fbar');
    if (card && gw) {
      const g = gw.getBoundingClientRect(), top = Math.max((fb ? fb.getBoundingClientRect().bottom : g.top) + 8, g.top + 8);
      card.style.top = top + 'px'; card.style.left = Math.max(12, g.right - card.offsetWidth - 18) + 'px'; card.style.maxHeight = window.innerHeight - top - 16 + 'px';
    }
    const fr = resRef.current, on = fr?.querySelector('.fri.on');
    if (fr && on) { const a = on.getBoundingClientRect(), b = fr.getBoundingClientRect(); if (a.top < b.top + 30 || a.bottom > b.bottom - 4) fr.scrollTop += a.top - b.top - fr.clientHeight / 2 + a.height / 2; }
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const rows = rowsOf(s), Fq = { ...F, q }, list = findMatches({ ...s, find: Fq }, rows), n = list.length;
  const cur = s.sel ? list.findIndex((m) => m.i === s.sel!.i && m.f === s.sel!.f) : -1, has = !!q.trim();
  /* đẩy từ khoá vào bảng ngay (trước khi nhảy kết quả) */
  const flush = (): void => { clearTimeout(timer.current); if (q !== F.q) findSet({ q, idx: -1 }); };
  const go = (d: 1 | -1): void => { flush(); findGo(d); qRef.current?.focus(); };
  const opt = (k: 'cs' | 'whole' | 'filter', label: string, dis = false): JSX.Element => (
    <label className="fopt"><input type="checkbox" data-act="findOpt" data-k={k} checked={F[k]} disabled={dis} onChange={(e) => { flush(); findSet({ [k]: e.target.checked }); }} />{label}</label>
  );
  const sc = (v: FindState['scope'], label: string): JSX.Element => <button className={'fsc' + (F.scope === v ? ' on' : '')} data-act="findScope" data-v={v} onClick={() => { flush(); findSet({ scope: v }); }}>{label}</button>;

  const byRow: Record<number, { k: number; m: (typeof list)[number] }[]> = {}, order: number[] = [];
  list.forEach((m, k) => { if (!byRow[m.i]) { byRow[m.i] = []; order.push(m.i); } byRow[m.i].push({ k, m }); });

  return (
    <div className="findc" id="findc" role="search" data-stop="1" ref={ref}>
      <div className="frow1">
        <span className="fico" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg></span>
        <input id="fq" ref={qRef} placeholder="Tìm trong bảng…" aria-label="Tìm trong bảng" autoComplete="off" value={q}
          onChange={(e) => { const v = e.target.value; setQ(v); clearTimeout(timer.current); timer.current = window.setTimeout(() => findSet({ q: v, idx: -1 }), 180); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); go(e.shiftKey || e.key === 'ArrowUp' ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); clearTimeout(timer.current); findClose(); }
          }} />
        <span className={'fcnt' + (has && !n ? ' no' : '')} id="fcnt" aria-live="polite">{!has ? '' : n ? (cur >= 0 ? cur + 1 + '/' + n : n + ' ô') : 'Không thấy'}</span>
        <button className="fbtn" id="fprev" data-act="findPrev" title="Tìm trước (Shift+Enter, ↑)" aria-label="Tìm trước" disabled={!n} onClick={() => go(-1)}>↑</button>
        <button className="fbtn" id="fnext" data-act="findNext" title="Tìm tiếp (Enter, ↓)" aria-label="Tìm tiếp" disabled={!n} onClick={() => go(1)}>↓</button>
        <button className="fbtn x" data-act="findClose" title="Đóng (Esc)" aria-label="Đóng tìm kiếm" onClick={findClose}>×</button>
      </div>
      <div id="fbody">
        <div className="frow2">{sc('all', 'Cả bảng')}{sc('week', 'Tuần này')}{sc('col', 'Cột đang chọn')}<span className="sp" />{opt('cs', 'Aa')}{opt('whole', 'Cả ô')}</div>
        <div className="frow3">
          <button className={'flink' + (F.all ? ' on' : '')} data-act="findAll" disabled={!has} onClick={() => { flush(); findSet({ all: !F.all }); }}>{(F.all ? '▾' : '▸') + ' Tìm tất cả' + (n ? ' · ' + n : '')}</button>
          {opt('filter', 'Chỉ hiện dòng khớp', !has)}
        </div>
        {F.all && has && (
          <div className="fres" id="fres" role="listbox" aria-label="Kết quả tìm" ref={resRef}>
            {n ? <>
              {order.slice(0, 60).map((i) => {
                const r = s.allRows[i];
                return (
                  <div key={i} className="frg">
                    <div className="frh"><b>{r.ma}</b><span>{r.viec}</span><em>{byRow[i].length}</em></div>
                    {byRow[i].map(({ k, m }) => {
                      const f = fieldById(m.f)!, on = k === cur;
                      return (
                        <button key={k} className={'fri' + (on ? ' on' : '')} data-act="findPick" data-k={k} role="option" aria-selected={on} onClick={() => { flush(); findPick(k); }}>
                          <span className="frr">{refOf(r, f)}</span><span className="frc">{f.name}</span><span className="frs">{snippet(m.t, Fq)}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {order.length > 60 && <div className="fmore">{'Còn ' + (order.length - 60) + ' dự án — gõ cụ thể hơn để thu hẹp'}</div>}
            </> : <div className="fnone">{'Không có ô nào chứa “' + q + '”' + (F.scope !== 'all' ? ' trong phạm vi đang chọn' : '') + '.'}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
