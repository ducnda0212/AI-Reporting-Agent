import { useEffect } from 'react';
import { fieldOf, locked } from '@/lib/cell';
import { navFields, rowOrder } from '@/lib/grid';
import { getState, mutate } from '@/store';
import * as G from '@/store/actions/grid';

/** Phím tắt kiểu Excel cho bảng: di chuyển, sửa, điền, định dạng, tìm. Lắng nghe ở pha capture, bỏ qua khi đang gõ trong ô nhập. */
export function useGridKeyboard() {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const s = getState();
      const t = ev.target as HTMLElement | null;
      const mod = ev.ctrlKey || ev.metaKey;
      const k = ev.key;
      const lower = k.toLowerCase();
      const busy = !!(s.modal || s.pop || s.pe || s.review || s.tour !== null);

      if (s.review || s.tour !== null) return; // do Spotlight xử lý
      if (mod && lower === 'f' && s.view === 'grid' && s.loaded) { ev.preventDefault(); ev.stopImmediatePropagation(); G.openFind(); return; }
      if (t && ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if (k === 'Escape') {
        if (s.pe) { G.closePE(); ev.stopImmediatePropagation(); return; }
        if (s.find.open && !s.modal) { G.closeFind(); ev.stopImmediatePropagation(); return; }
        if (s.view === 'grid' && !s.modal && !s.pop && (s.range || s.menu)) mutate((d) => { d.range = null; d.menu = null; });
        return;
      }
      if (k === 'F3' && s.find.open) { ev.preventDefault(); G.findGo(ev.shiftKey ? -1 : 1); return; }
      if (s.view !== 'grid' || !s.loaded || busy) return;
      if (mod && ['b', 'i', 'u'].includes(lower)) { if (!s.sel) return; ev.preventDefault(); G.setFmt(lower as 'b' | 'i' | 'u'); return; }
      if (!s.sel) return;
      const stop = () => { ev.preventDefault(); ev.stopImmediatePropagation(); };

      if (mod && lower === 'd') { stop(); G.fillDown(); return; }
      if (mod && lower === 'g') { stop(); const rb = document.getElementById('refbox') as HTMLInputElement | null; rb?.focus(); rb?.select(); return; }
      if (k === 'F2' && !s.range) { stop(); G.startEdit(s.sel.i, s.sel.f); return; }
      if (k === 'Enter' && !mod) { stop(); G.move(ev.shiftKey ? -1 : 1, 0); return; } // như Excel: Enter xuống ô dưới
      if (k === 'Tab') { stop(); G.move(0, ev.shiftKey ? -1 : 1); return; }
      if ((k === 'Delete' || k === 'Backspace') && !s.range) {
        if (!locked(fieldOf(s, s.sel.f))) { stop(); G.clearCell(s.sel.i, s.sel.f); }
        return;
      }
      const ARROW: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (ARROW[k]) {
        stop();
        const d = ARROW[k];
        if (mod) { G.jumpEdge(d[0], d[1], ev.shiftKey); return; }
        const O = rowOrder(s); const F = navFields(s);
        const cur = ev.shiftKey && s.range ? s.range.b : s.sel;
        const ri = Math.max(0, Math.min(O.length - 1, O.indexOf(cur.i) + d[0]));
        const ci = Math.max(0, Math.min(F.length - 1, F.indexOf(cur.f) + d[1]));
        G.selectCell(O[ri], F[ci], ev.shiftKey);
        return;
      }
      if (k === 'Home') { stop(); const O = rowOrder(s); G.selectCell(mod ? O[0] : s.sel.i, navFields(s)[0], ev.shiftKey); return; }
      if (k === 'End' && mod) { stop(); const O = rowOrder(s); const F = navFields(s); G.selectCell(O[O.length - 1], F[F.length - 1], ev.shiftKey); return; }
      if (k === 'PageDown' || k === 'PageUp') { stop(); G.move(k === 'PageDown' ? 15 : -15, 0); return; }
      /* gõ chữ là sửa (ghi đè) như Excel */
      if (k.length === 1 && !mod && !ev.altKey && !s.range) { stop(); G.typeIntoCell(k); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
}
