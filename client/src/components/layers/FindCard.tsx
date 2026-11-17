import { useEffect, useLayoutEffect, useRef } from 'react';
import { fieldOf } from '@/lib/cell';
import { findMatches, refOf, snippetParts } from '@/lib/grid';
import { useStore } from '@/store';
import * as G from '@/store/actions/grid';
import { Mark } from '../common/RiskText';
import { SearchIcon } from '../common/Icons';

/** Khung tìm kiếm nổi (Ctrl+F) kiểu Excel: tìm tiếp, tìm tất cả, phạm vi, lọc dòng khớp. */
export function FindCard() {
  const s = useStore((x) => x);
  const F = s.find;
  const open = F.open && s.view === 'grid' && s.loaded;
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const list = open ? findMatches(s) : [];
  const n = list.length;
  const cur = s.sel ? list.findIndex((m) => m.i === s.sel!.i && m.f === s.sel!.f) : -1;

  useEffect(() => { if (open) { inputRef.current?.focus(); inputRef.current?.select(); } }, [open]);
  /* đặt khung ở góc trên phải vùng bảng, dưới thanh định dạng */
  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    const gw = document.querySelector('.gridwrap');
    const fb = document.querySelector('.fbar');
    if (!gw) return;
    const g = gw.getBoundingClientRect();
    const top = Math.max((fb ? fb.getBoundingClientRect().bottom : g.top) + 8, g.top + 8);
    const c = cardRef.current;
    c.style.top = top + 'px'; c.style.left = Math.max(12, g.right - c.offsetWidth - 18) + 'px'; c.style.maxHeight = window.innerHeight - top - 16 + 'px';
  });
  if (!open) return null;

  const opt = (k: 'cs' | 'whole', label: string) => (
    <label className="fopt"><input type="checkbox" checked={F[k]} onChange={(e) => G.setFindOpt(k, e.target.checked)} />{label}</label>
  );
  const sc = (v: 'all' | 'week' | 'col', label: string) => <button className={'fsc' + (F.scope === v ? ' on' : '')} onClick={() => G.setFindScope(v)}>{label}</button>;
  const byRow: Record<number, Array<{ m: (typeof list)[number]; k: number }>> = {};
  const order: number[] = [];
  list.forEach((m, k) => { if (!byRow[m.i]) { byRow[m.i] = []; order.push(m.i); } byRow[m.i].push({ m, k }); });

  return (
    <div className="findc" id="findc" ref={cardRef} role="search" data-stop="1">
      <div className="frow1">
        <span className="fico" aria-hidden="true"><SearchIcon /></span>
        <input ref={inputRef} id="fq" placeholder="Tìm trong bảng…" aria-label="Tìm trong bảng" autoComplete="off" value={F.q}
          onChange={(e) => G.setFindQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); G.findGo(e.shiftKey || e.key === 'ArrowUp' ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); G.closeFind(); }
            e.stopPropagation();
          }} />
        <span className={'fcnt' + (F.q.trim() && !n ? ' no' : '')} id="fcnt" aria-live="polite">
          {!F.q.trim() ? '' : n ? (cur >= 0 ? `${cur + 1}/${n}` : `${n} ô`) : 'Không thấy'}
        </span>
        <button className="fbtn" disabled={!n} onClick={() => G.findGo(-1)} title="Tìm trước (Shift+Enter, ↑)" aria-label="Tìm trước">↑</button>
        <button className="fbtn" disabled={!n} onClick={() => G.findGo(1)} title="Tìm tiếp (Enter, ↓)" aria-label="Tìm tiếp">↓</button>
        <button className="fbtn x" onClick={G.closeFind} title="Đóng (Esc)" aria-label="Đóng tìm kiếm">×</button>
      </div>
      <div id="fbody">
        <div className="frow2">{sc('all', 'Cả bảng')}{sc('week', 'Tuần này')}{sc('col', 'Cột đang chọn')}<span className="sp" />{opt('cs', 'Aa')}{opt('whole', 'Cả ô')}</div>
        <div className="frow3">
          <button className={'flink' + (F.all ? ' on' : '')} disabled={!F.q.trim()} onClick={() => G.setFindOpt('all', !F.all)}>{F.all ? '▾' : '▸'} Tìm tất cả{n ? ' · ' + n : ''}</button>
          <label className="fopt"><input type="checkbox" checked={F.filter} disabled={!F.q.trim()} onChange={(e) => G.setFindOpt('filter', e.target.checked)} />Chỉ hiện dòng khớp</label>
        </div>
        {F.all && F.q.trim() && (
          <div className="fres" id="fres" role="listbox" aria-label="Kết quả tìm">
            {n ? <>
              {order.slice(0, 60).map((i) => {
                const r = s.allRows[i];
                return (
                  <div className="frg" key={i}>
                    <div className="frh"><b>{r.code}</b><span>{r.task}</span><em>{byRow[i].length}</em></div>
                    {byRow[i].map(({ m, k }) => {
                      const f = fieldOf(s, m.f);
                      const sn = snippetParts(m.t, F);
                      return (
                        <button key={k} className={'fri' + (k === cur ? ' on' : '')} onClick={() => G.findJump(k)} role="option" aria-selected={k === cur}>
                          <span className="frr">{refOf(r, f)}</span><span className="frc">{f.name}</span>
                          <span className="frs">{sn.pre && '…'}<Mark text={sn.parts.map((p) => p.text).join('')} q={F.q} cs={F.cs} />{sn.post && '…'}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {order.length > 60 && <div className="fmore">Còn {order.length - 60} dự án — gõ cụ thể hơn để thu hẹp</div>}
            </> : <div className="fnone">Không có ô nào chứa “{F.q}”{F.scope !== 'all' ? ' trong phạm vi đang chọn' : ''}.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
