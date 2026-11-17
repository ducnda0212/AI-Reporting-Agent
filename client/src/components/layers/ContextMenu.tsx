import { useEffect, useLayoutEffect, useRef } from 'react';
import { displayText, fieldOf, fkey, noEdit } from '@/lib/cell';
import { refOf } from '@/lib/grid';
import { useStore } from '@/store';
import * as G from '@/store/actions/grid';
import { toast } from '@/store/actions/flow';

/** Menu chuột phải trên ô bảng. */
export function ContextMenu() {
  const s = useStore((x) => x);
  const C = s.ctx;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!C || !ref.current) return;
    ref.current.style.left = Math.min(C.x, window.innerWidth - ref.current.offsetWidth - 8) + 'px';
    ref.current.style.top = Math.min(C.y, window.innerHeight - ref.current.offsetHeight - 8) + 'px';
  }, [C?.x, C?.y]);
  useEffect(() => {
    if (!C) return;
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('#ctxm')) G.closeContext(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') G.closeContext(); };
    const scroll = () => G.closeContext();
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    document.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('mousedown', down, true); document.removeEventListener('keydown', key, true); document.removeEventListener('scroll', scroll, true); };
  }, [!!C]);
  if (!C || s.view !== 'grid') return null;
  const f = fieldOf(s, C.f);
  const r = s.allRows[C.i];
  const lk = noEdit(f);
  const v = displayText(s, r, f);
  const k = fkey(s, r, f);
  const Item = ({ label, kbd, dis, onClick }: { label: string; kbd?: string; dis?: boolean; onClick: () => void }) => (
    <button className="ctxi" disabled={dis} onClick={() => { G.closeContext(); onClick(); }}><span>{label}</span>{kbd && <kbd>{kbd}</kbd>}</button>
  );
  return (
    <div className="ctxm" id="ctxm" ref={ref} role="menu" data-stop="1">
      <div className="ctxh">{refOf(r, f)} · {f.name}</div>
      <Item label="Soạn ô" kbd="F2" dis={lk} onClick={() => G.startEdit(C.i, C.f)} />
      <Item label="Xoá nội dung" kbd="Del" dis={lk || !v} onClick={() => G.clearCell(C.i, C.f)} />
      <Item label={s.range ? 'Chép dòng đầu xuống cả vùng' : 'Chép từ ô phía trên'} kbd="Ctrl+D" dis={lk} onClick={G.fillDown} />
      <div className="fltsep" />
      <Item label={`Lọc theo “${k.slice(0, 26)}${k.length > 26 ? '…' : ''}”`} onClick={() => G.filterByCellValue(C.i, C.f)} />
      <Item label="Sắp xếp cột này A → Z" onClick={() => G.sortCol(C.f, 1)} />
      <Item label={s.wrap[C.f] ? 'Bỏ xuống dòng trong cột' : 'Xuống dòng trong cột (xem đủ chữ)'} onClick={() => G.toggleWrap(C.f)} />
      <Item label="Vừa độ rộng cột theo nội dung" onClick={() => G.autofitCol(C.f)} />
      <div className="fltsep" />
      <Item label={`Mở issue ${r.key || r.code} trên Jira`} dis={!r.key} onClick={() => toast('Bản thật sẽ mở ' + (r.key || '') + ' trên Jira ở tab mới')} />
    </div>
  );
}
