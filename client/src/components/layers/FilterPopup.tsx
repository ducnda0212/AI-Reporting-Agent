/* Bộ lọc / sắp xếp theo cột #fltpop (prototype fltPopHtml L7355, vị trí renderXlLayer L7332, đóng khi bấm ra ngoài L7437,
   phím trong ô tìm #fltq L7463). Lớp nổi đặt ngoài .gridwrap. */
import { useEffect, useRef } from 'react';
import { fieldById } from '@/lib/cell';
import { useAppState } from '@/store';
import { fltAll, fltApply, fltClear, fltClose, fltPick, fltSetQ, fltValues, sortCol, vnorm } from '@/store/actions/grid';
import { LvlPill } from '@/components/common/RiskText';


/** Đặt khung lọc dưới nút phễu của cột. */
function place(pop: HTMLElement, fid: string): void {
  const btn = document.querySelector('.gridwrap [data-act="fltOpen"][data-f="' + fid + '"]'), r = btn ? btn.getBoundingClientRect() : { left: 200, bottom: 160 };
  pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left - 200)) + 'px';
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
}

export function FilterPopup(): JSX.Element | null {
  const s = useAppState((x) => x), P = s.fpop, ref = useRef<HTMLDivElement>(null), qRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (P && ref.current) place(ref.current, P.f); });
  useEffect(() => {
    if (!P) return;
    qRef.current?.focus();
    let raf = 0;
    const down = (e: MouseEvent): void => { const t = e.target as Element; if (!t.closest?.('#fltpop') && !t.closest?.('[data-act="fltOpen"]')) fltClose(); };
    const scroll = (e: Event): void => {
      if ((e.target as Element).id === 'fltl') return;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (ref.current) place(ref.current, P.f); });
    };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('scroll', scroll, true); cancelAnimationFrame(raf); };
  }, [P?.f]);

  if (!P || s.view !== 'grid') return null;
  const f = fieldById(P.f)!, vals = fltValues(s, P.f), q = vnorm(P.q || ''), shown = vals.filter((v) => !q || vnorm(v.k).indexOf(q) >= 0);
  const allOn = shown.every((v) => P.pick[v.k]), nOn = vals.filter((v) => P.pick[v.k]).length, S = s.sort && s.sort.f === P.f ? s.sort.dir : null;
  return (
    <div className="fltpop" id="fltpop" role="dialog" aria-label={'Lọc cột ' + f.name} data-stop="1" ref={ref}>
      <div className="flth"><span className="fltc">{f.col}</span><b>{f.name}</b></div>
      <button className={'fltso' + (S === 'asc' ? ' on' : '')} data-act="sortCol" onClick={() => sortCol(P.f, 'asc')}>{'↑ Sắp xếp A → Z' + (f.id === 'rui' || f.id === 'giatri' ? ' (Thấp → Cao)' : '')}</button>
      <button className={'fltso' + (S === 'desc' ? ' on' : '')} data-act="sortCol" onClick={() => sortCol(P.f, 'desc')}>↓ Sắp xếp Z → A</button>
      {s.sort && <button className="fltso mut" data-act="sortCol" onClick={() => sortCol(P.f, null)}>Bỏ sắp xếp</button>}
      <div className="fltsep" />
      <input id="fltq" ref={qRef} className="fltq" placeholder="Tìm giá trị…" value={P.q || ''} autoComplete="off" onChange={(e) => fltSetQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fltApply(); } else if (e.key === 'Escape') fltClose(); }} />
      <div className="fltl" id="fltl">
        <label className="fltv all"><input type="checkbox" data-act="fltAll" checked={allOn} onChange={(e) => fltAll(e.target.checked)} /><span>{'(Chọn tất cả' + (q ? ' kết quả tìm' : '') + ')'}</span></label>
        {shown.map((v) => (
          <label key={v.k} className="fltv">
            <input type="checkbox" data-act="fltPick" data-v={v.k} checked={!!P.pick[v.k]} onChange={(e) => fltPick(v.k, e.target.checked)} />
            <span title={v.k}>{v.k === '(Trống)' ? <i>(Trống)</i> : f.id === 'rui' ? <LvlPill v={v.k} /> : v.k}</span><em>{v.n}</em>
          </label>
        ))}
        {!shown.length && <div className="fltnone">Không có giá trị khớp</div>}
      </div>
      <div className="fltf">
        <span>{nOn + '/' + vals.length + ' giá trị'}</span><span className="sp" />
        {s.colFilter[P.f] && <button className="btn sm" data-act="fltClear" onClick={() => fltClear(P.f)}>Xoá lọc</button>}
        <button className="btn sm" data-act="fltClose" onClick={fltClose}>Huỷ</button>
        <button className="btn sm pri" data-act="fltApply" disabled={!nOn} onClick={fltApply}>Áp dụng</button>
      </div>
    </div>
  );
}
