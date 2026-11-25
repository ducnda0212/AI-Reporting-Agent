/* Phím tắt kiểu Excel cho bảng, giữ đúng thứ tự ưu tiên của prototype:
   - L7030 (capture): Ctrl+F mở Tìm; Esc đóng khung soạn #pe / khung Tìm; F3 tìm tiếp.
   - L7456 (capture, chạy trước bộ phím cũ): Esc đóng bộ lọc / menu chuột phải; Ctrl+D chép xuống; Ctrl+G tới ô địa chỉ;
     Enter / Shift+Enter xuống / lên một ô, Tab / Shift+Tab sang phải / trái (Enter KHÔNG mở sửa — F2 hoặc nhấp đúp mới sửa);
     Ctrl+mũi tên nhảy mép vùng có dữ liệu; Home, Ctrl+Home, Ctrl+End, PageUp/PageDown; gõ chữ là sửa (ghi đè).
   - L10088: Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) hoàn tác / làm lại.
   - L6386: Ctrl+B/I/U; F2 sửa; Delete/Backspace xoá ô; Esc bỏ vùng chọn / đóng menu; mũi tên (Shift = nới vùng).
   - L10725: Alt+←/→ quay lại / tiến tới màn trước.
   - L9629: Enter/Space trên "N ô cần sửa →"; Esc đóng #pkPop.
   Ô nhập riêng (#refbox, #fq, #fltq, #peText, ô sửa .fxval) tự xử lý phím của mình. Cài một lần ở App (Task 9). */
import { useEffect } from 'react';
import { getState } from '@/store';
import { navGo } from '@/store/actions/flow';
import {
  arrow, clearCell, ctxClose, edgeJump, escGrid, fillDown, findGo, findOpen, findClose, fixGo, fltClose, gridOrder, move, peClose, pkClose,
  redo, selectCell, setFmt, startEdit, typeKey, undo
} from '@/store/actions/grid';
import { visibleFields } from '@/lib/grid';

const ARROWS: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const isField = (t: HTMLElement | null): boolean => !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

export function onGridKey(ev: KeyboardEvent): void {
  const s = getState(), t = ev.target as HTMLElement | null, mod = ev.ctrlKey || ev.metaKey, k = ev.key;
  const stop = (): void => { ev.preventDefault(); ev.stopImmediatePropagation(); };
  if (s.pvFs) return; // xem file toàn màn hình (#pvfs) tự xử lý phím

  /* Tìm, khung soạn (L7030) */
  if (mod && k.toLowerCase() === 'f' && s.view === 'grid' && s.loaded) { stop(); findOpen(); (document.getElementById('fq') as HTMLInputElement | null)?.select(); return; }
  if (t && ['refbox', 'fq', 'fltq', 'peText'].includes(t.id)) return;
  if (k === 'Escape' && s.pk) { pkClose(); return; }
  if (k === 'Escape' && s.pe) { stop(); peClose(); return; }
  if (k === 'Escape' && s.find.open && !s.modal) { stop(); findClose(); return; }
  if (k === 'F3' && s.find.open) { ev.preventDefault(); findGo(ev.shiftKey ? -1 : 1); return; }
  if (k === 'Escape' && s.fpop) { stop(); fltClose(); return; }
  if (k === 'Escape' && s.ctx) { stop(); ctxClose(); return; }

  /* nút "N ô cần sửa →" đang được focus */
  if (t && (k === 'Enter' || k === ' ') && t.classList.contains('fixgo')) { stop(); fixGo(t.dataset.g!); return; }

  if (isField(t)) return;
  if (ev.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) { ev.preventDefault(); navGo(k === 'ArrowLeft' ? -1 : 1); return; }
  if (s.view !== 'grid' || !s.loaded || s.modal || s.pop || s.pk) return;

  /* hoàn tác / làm lại */
  if (mod && (k.toLowerCase() === 'z' || k.toLowerCase() === 'y')) {
    if (s.review || s.tour !== null) return;
    ev.preventDefault(); if (k.toLowerCase() === 'y' || ev.shiftKey) redo(); else undo();
    return;
  }
  if (k === 'Escape' && (s.range || s.menu)) { escGrid(); return; }
  if (s.pe || s.review || s.tour !== null || !s.sel) return;
  const sel = s.sel;

  /* phím kiểu Excel (L7456) */
  if (mod && k.toLowerCase() === 'd') { stop(); fillDown(); return; }
  if (mod && k.toLowerCase() === 'g') { stop(); const rb = document.getElementById('refbox') as HTMLInputElement | null; rb?.focus(); rb?.select(); return; }
  if (k === 'Enter' && !mod) { stop(); move(ev.shiftKey ? -1 : 1, 0); return; }
  if (k === 'Tab') { stop(); move(0, ev.shiftKey ? -1 : 1); return; }
  if (mod && ARROWS[k]) { stop(); const to = edgeJump(s, ...ARROWS[k]); if (to) selectCell(to.i, to.f, ev.shiftKey); return; }
  const O = gridOrder(s), F = visibleFields(s.hidden).map((f) => f.id);
  if (k === 'Home' && F.length) { stop(); selectCell(mod ? O[0] : sel.i, F[0], ev.shiftKey); return; }
  if (k === 'End' && mod && O.length) { stop(); selectCell(O[O.length - 1], F[F.length - 1], ev.shiftKey); return; }
  if (k === 'PageDown' || k === 'PageUp') { stop(); move(k === 'PageDown' ? 15 : -15, 0); return; }
  if (k.length === 1 && !mod && !ev.altKey && !s.range) { stop(); typeKey(k); return; }

  /* bộ phím cũ (L6386) */
  if (mod && ['b', 'i', 'u'].includes(k.toLowerCase())) { ev.preventDefault(); setFmt(k.toLowerCase() as 'b' | 'i' | 'u'); return; }
  if (k === 'F2' && !s.range) { ev.preventDefault(); startEdit(sel.i, sel.f); return; }
  if ((k === 'Delete' || k === 'Backspace') && !s.range) { if (clearCell()) ev.preventDefault(); return; }
  if (ARROWS[k]) { ev.preventDefault(); arrow(...ARROWS[k], ev.shiftKey); }
}

/** Cài phím tắt của bảng lên document (pha capture, như prototype). */
export function useKeyboard(): void {
  useEffect(() => {
    document.addEventListener('keydown', onGridKey, true);
    return () => document.removeEventListener('keydown', onGridKey, true);
  }, []);
}
