/* Chuột trên bảng như Excel (prototype L7311 colrz/autofit, L10298 rowrz, L10316 EDGE, L10352 selDrag, L10292 Ctrl+lăn):
   kéo mép phải / dưới của bất kỳ ô nào (EDGE = 5px) hoặc tay .colrz/.rowrz để đổi rộng cột / cao dòng, nhấp đúp mép để
   vừa nội dung (cột) hoặc về mặc định (dòng), kéo chuột chọn vùng, Ctrl + lăn chuột phóng to/thu nhỏ.
   Cài một lần ở App (Task 9); không có tác dụng phụ lúc import. */
import { useEffect } from 'react';
import { getState } from '@/store';
import { autofitCol, selectRange, setColW, setRowHeight, setZoom } from '@/store/actions/grid';
import type { CellRef, FieldId } from '@/types';

let cv: CanvasRenderingContext2D | null | undefined;
/** Đo chiều rộng chữ (px) bằng canvas (mặc định phông ô bảng 400 11.5px như autofit); ngoài trình duyệt ước lượng theo số ký tự. */
export function measureText(t: string, weight = 400, size = 11.5): number {
  if (cv === undefined) cv = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!cv) return Math.ceil(t.length * size * 0.55);
  cv.font = weight + ' ' + size + 'px ' + (getComputedStyle(document.body).fontFamily || 'Inter, system-ui, sans-serif');
  return Math.ceil(cv.measureText(t).width);
}

const EDGE = 5;
type Edge = { t: 'x'; f: FieldId } | { t: 'y'; i: number; tr: HTMLElement };
function edgeOf(e: MouseEvent): Edge | null {
  const td = (e.target as HTMLElement).closest?.<HTMLElement>('.gridwrap tbody td');
  if (!td || td.classList.contains('ckc')) return null;
  const c = td.querySelector<HTMLElement>('[data-i][data-f]'); if (!c) return null;
  const r = td.getBoundingClientRect();
  if (e.clientX >= r.right - EDGE && e.clientX <= r.right + 1) return { t: 'x', f: c.dataset.f as FieldId };
  if (e.clientY >= r.bottom - EDGE && e.clientY <= r.bottom + 1) return { t: 'y', i: +c.dataset.i!, tr: td.parentElement! };
  return null;
}
const zoomK = (): number => getState().gx.zoom / 100;

export function useGridResize(): void {
  useEffect(() => {
    const body = document.body;
    let colDrag: { f: FieldId; x0: number; w0: number; th: HTMLElement; w: number } | null = null;
    let rzRow: { i: number; tr: HTMLElement; y: number; h: number; nh: number } | null = null;
    let selDrag: { a: CellRef; last: CellRef | null } | null = null, dragged = false, raf = 0;

    const startCol = (f: FieldId, x: number): void => {
      const th = document.querySelector<HTMLElement>('.gridwrap th .hd[data-f="' + f + '"]')?.closest('th');
      if (th) { colDrag = { f, x0: x, w0: th.getBoundingClientRect().width, th, w: 0 }; body.classList.add('colresizing'); }
    };
    const startRow = (i: number, tr: HTMLElement, y: number): void => {
      rzRow = { i, tr, y, h: tr.getBoundingClientRect().height / zoomK(), nh: 0 };
      body.classList.add('rowresizing'); tr.classList.add('rhset');
    };

    const down = (e: MouseEvent): void => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement, cz = t.closest?.<HTMLElement>('.colrz'), rz = t.closest?.<HTMLElement>('.rowrz');
      if (cz || rz) {
        e.preventDefault(); e.stopPropagation();
        if (cz) startCol(cz.dataset.rz as FieldId, e.clientX); else startRow(+rz!.dataset.rowi!, rz!.closest('tr')!, e.clientY);
        return;
      }
      const ed = edgeOf(e);
      if (ed) {
        e.preventDefault(); e.stopPropagation();
        if (ed.t === 'x') startCol(ed.f, e.clientX); else startRow(ed.i, ed.tr, e.clientY);
        return;
      }
      if (e.shiftKey) return;
      const c = t.closest?.<HTMLElement>('.gridwrap [data-i][data-f]');
      if (!c || t.closest('select, input, textarea, .malink')) return;
      selDrag = { a: { i: +c.dataset.i!, f: c.dataset.f as FieldId }, last: null }; dragged = false;
    };

    const move = (e: MouseEvent): void => {
      if (colDrag) {
        const w = Math.max(60, Math.min(640, colDrag.w0 + e.clientX - colDrag.x0)), px = w + 'px';
        colDrag.w = w; colDrag.th.style.width = colDrag.th.style.minWidth = colDrag.th.style.maxWidth = px;
        document.querySelectorAll<HTMLElement>('.gridwrap td [data-f="' + colDrag.f + '"]').forEach((x) => { x.style.width = px; x.style.maxWidth = px; });
        return;
      }
      if (rzRow) { rzRow.nh = Math.max(28, Math.round(rzRow.h + (e.clientY - rzRow.y) / zoomK())); rzRow.tr.style.height = rzRow.nh + 'px'; return; }
      if (selDrag && e.buttons & 1) {
        const el = document.elementFromPoint(e.clientX, e.clientY), c = el?.closest<HTMLElement>('.gridwrap [data-i][data-f]'); if (!c) return;
        const b = { i: +c.dataset.i!, f: c.dataset.f as FieldId }, a = selDrag.a, l = selDrag.last;
        if ((!dragged && b.i === a.i && b.f === a.f) || (l && l.i === b.i && l.f === b.f)) return;
        selDrag.last = b; dragged = true; e.preventDefault(); body.classList.add('seldragging');
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (selDrag?.last) selectRange(selDrag.a, selDrag.last); });
        return;
      }
      const ed = edgeOf(e);
      body.classList.toggle('edgex', !!ed && ed.t === 'x');
      body.classList.toggle('edgey', !!ed && ed.t === 'y');
    };

    const up = (): void => {
      if (colDrag) { const d = colDrag; colDrag = null; body.classList.remove('colresizing'); if (d.w) setColW(d.f, d.w); }
      if (rzRow) { const d = rzRow; rzRow = null; body.classList.remove('rowresizing'); if (d.nh) setRowHeight(d.i, d.nh); }
      if (selDrag) { selDrag = null; body.classList.remove('seldragging'); }
    };

    /* nhả chuột sau khi kéo chọn / kéo mép: không coi là bấm ô (không mở dropdown, không chọn lại ô) */
    const click = (e: MouseEvent): void => {
      const t = e.target as HTMLElement;
      if (dragged) { dragged = false; if (t.closest?.('.gridwrap')) { e.preventDefault(); e.stopPropagation(); } return; }
      if ((body.classList.contains('edgex') || body.classList.contains('edgey')) && edgeOf(e)) { e.preventDefault(); e.stopPropagation(); }
    };

    const dbl = (e: MouseEvent): void => {
      const t = e.target as HTMLElement, cz = t.closest?.<HTMLElement>('.colrz'), rz = t.closest?.<HTMLElement>('.rowrz');
      const ed = cz ? { t: 'x' as const, f: cz.dataset.rz as FieldId } : rz ? { t: 'y' as const, i: +rz.dataset.rowi! } : edgeOf(e);
      if (!ed) return;
      e.preventDefault(); e.stopPropagation();
      if (ed.t === 'x') autofitCol(ed.f, measureText); else setRowHeight(ed.i, null);
    };

    const wheel = (e: WheelEvent): void => {
      if (!e.ctrlKey || !(e.target as HTMLElement).closest?.('.gridwrap')) return;
      e.preventDefault(); setZoom(e.deltaY < 0 ? 10 : -10);
    };

    document.addEventListener('mousedown', down, true);
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
    document.addEventListener('click', click, true);
    document.addEventListener('dblclick', dbl, true);
    document.addEventListener('wheel', wheel, { passive: false });
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
      document.removeEventListener('click', click, true);
      document.removeEventListener('dblclick', dbl, true);
      document.removeEventListener('wheel', wheel);
      cancelAnimationFrame(raf);
    };
  }, []);
}
