import { useLayoutEffect, useRef, useEffect } from 'react';
import { fieldOf } from '@/lib/cell';
import { fltValues, vnorm } from '@/lib/grid';
import { useStore } from '@/store';
import * as G from '@/store/actions/grid';
import { LvlPill } from '../common/RiskText';

/** Bộ lọc & sắp xếp cột kiểu Excel; neo theo nút lọc ở đầu cột. */
export function FilterPopup() {
  const s = useStore((x) => x);
  const P = s.fpop;
  const ref = useRef<HTMLDivElement>(null);
  const qRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!P || !ref.current) return;
    const btn = document.querySelector<HTMLElement>(`.gridwrap [data-flt="${P.f}"]`);
    const r = btn ? btn.getBoundingClientRect() : { left: 200, bottom: 160 };
    const pop = ref.current;
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left - 200)) + 'px';
    pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
  }, [P?.f, P && Object.keys(P.pick).length]);
  useEffect(() => { if (P) qRef.current?.focus(); }, [P?.f]);

  /* bấm ra ngoài hoặc Esc thì đóng */
  useEffect(() => {
    if (!P) return;
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('#fltpop') && !t.closest('[data-flt]')) G.closeFilter();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') G.closeFilter(); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); };
  }, [!!P]);

  if (!P || s.view !== 'grid') return null;
  const f = fieldOf(s, P.f);
  const vals = fltValues(s, P.f);
  const q = vnorm(P.q || '');
  const shown = vals.filter((v) => !q || vnorm(v.k).includes(q));
  const allOn = shown.every((v) => P.pick[v.k]);
  const nOn = vals.filter((v) => P.pick[v.k]).length;
  const S = s.sort && s.sort.f === P.f ? s.sort.dir : 0;
  return (
    <div className="fltpop" id="fltpop" ref={ref} role="dialog" aria-label={`Lọc cột ${f.name}`} data-stop="1">
      <div className="flth"><span className="fltc">{f.col}</span><b>{f.name}</b></div>
      <button className={'fltso' + (S === 1 ? ' on' : '')} onClick={() => G.sortCol(P.f, 1)}>↑ Sắp xếp A → Z{f.id === 'riskLevel' || f.id === 'businessValue' ? ' (Thấp → Cao)' : ''}</button>
      <button className={'fltso' + (S === -1 ? ' on' : '')} onClick={() => G.sortCol(P.f, -1)}>↓ Sắp xếp Z → A</button>
      {s.sort && <button className="fltso mut" onClick={() => G.sortCol('', 0)}>Bỏ sắp xếp</button>}
      <div className="fltsep" />
      <input ref={qRef} id="fltq" className="fltq" placeholder="Tìm giá trị…" value={P.q || ''} autoComplete="off"
        onChange={(e) => G.setFilterQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); G.applyFilter(); } }} />
      <div className="fltl" id="fltl">
        <label className="fltv all"><input type="checkbox" checked={allOn} onChange={(e) => G.pickFilterAll(e.target.checked)} /><span>(Chọn tất cả{q ? ' kết quả tìm' : ''})</span></label>
        {shown.map((v) => (
          <label className="fltv" key={v.k}>
            <input type="checkbox" checked={!!P.pick[v.k]} onChange={(e) => G.pickFilterValue(v.k, e.target.checked)} />
            <span title={v.k}>{v.k === '(Trống)' ? <i>(Trống)</i> : f.id === 'riskLevel' ? <LvlPill value={v.k} /> : v.k}</span><em>{v.n}</em>
          </label>
        ))}
        {!shown.length && <div className="fltnone">Không có giá trị khớp</div>}
      </div>
      <div className="fltf">
        <span>{nOn}/{vals.length} giá trị</span><span className="sp" />
        {s.colFilter[P.f] && <button className="btn sm" onClick={() => G.clearFilter(P.f)}>Xoá lọc</button>}
        <button className="btn sm" onClick={G.closeFilter}>Huỷ</button>
        <button className="btn sm pri" onClick={G.applyFilter} disabled={!nOn}>Áp dụng</button>
      </div>
    </div>
  );
}
