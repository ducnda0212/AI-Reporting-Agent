/* Menu chuột phải #ctxm (prototype ctxHtml L7375 + handleXl ctx* L7421-7427; đóng khi bấm ra ngoài L7437, cuộn L7304).
   Lớp nổi đặt ngoài .gridwrap. */
import { useEffect, useRef } from 'react';
import { ck, displayText, effectiveKind, fieldById, locked, refOf } from '@/lib/cell';
import { filterKey } from '@/lib/grid';
import { useAppState } from '@/store';
import { autofitCol, ctxClear, ctxClose, ctxFilterVal, ctxJira, fillDown, sortCol, startEdit, toggleWrap } from '@/store/actions/grid';
import { measureText } from '@/hooks/useGridResize';

export function ContextMenu(): JSX.Element | null {
  const s = useAppState((x) => x), C = s.ctx, ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!C) return;
    const m = ref.current;
    if (m) { m.style.left = Math.min(C.x, window.innerWidth - m.offsetWidth - 8) + 'px'; m.style.top = Math.min(C.y, window.innerHeight - m.offsetHeight - 8) + 'px'; }
    const down = (e: MouseEvent): void => { if (!(e.target as Element).closest?.('#ctxm')) ctxClose(); };
    const scroll = (): void => { if (Date.now() - C.t > 350) ctxClose(); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('scroll', scroll, true); };
  }, [C]);

  if (!C || s.view !== 'grid') return null;
  const f = fieldById(C.f)!, r = s.allRows[C.i], lk = locked(f, s) || ['calc', 'none', 'future', 'past'].includes(effectiveKind(f, s)), v = displayText(r, f, s), fk = filterKey(r, f, s);
  const it = (label: string, kbd: string, dis: boolean, run: () => void): JSX.Element => (
    <button className="ctxi" disabled={dis} onClick={run}><span>{label}</span>{kbd && <kbd>{kbd}</kbd>}</button>
  );
  return (
    <div className="ctxm" id="ctxm" role="menu" data-stop="1" ref={ref}>
      <div className="ctxh">{refOf(r, f) + ' · ' + f.name}</div>
      {it('Soạn ô', 'F2', lk, () => { ctxClose(); startEdit(C.i, C.f); })}
      {it('Xoá nội dung', 'Del', lk || !v, ctxClear)}
      {it(s.range ? 'Chép dòng đầu xuống cả vùng' : 'Chép từ ô phía trên', 'Ctrl+D', lk, () => { ctxClose(); fillDown(); })}
      <div className="fltsep" />
      {it('Lọc theo “' + fk.slice(0, 26) + (fk.length > 26 ? '…' : '') + '”', '', false, ctxFilterVal)}
      {it('Sắp xếp cột này A → Z', '', false, () => sortCol(C.f, 'asc'))}
      {it(s.wrap[ck(C.i, C.f)] ? 'Bỏ xuống dòng trong ô' : 'Xuống dòng trong ô (xem đủ chữ)', '', false, () => toggleWrap([ck(C.i, C.f)]))}
      {it('Vừa độ rộng cột theo nội dung', '', false, () => autofitCol(C.f, measureText))}
      <div className="fltsep" />
      {it('Mở issue ' + (r.key || r.ma) + ' trên Jira', '', !r.key, ctxJira)}
    </div>
  );
}
