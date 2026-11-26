/* Dropdown chọn 1 chạm #pkPop (prototype pkOpen R10 L12509 + pkLabel L12508 + đóng L11792-11803; Esc đóng ở useKeyboard):
   "Theo Jira" (cột có nguồn: bỏ giá trị sửa tay), các giá trị dạng nhãn có ✓, "Bỏ giá trị" (cột nhập tay đang có giá trị).
   Đặt ở lớp nổi ngoài .gridwrap (bảng có zoom); vị trí bám theo ô. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cellValue, fieldById, isSrc, optsFor, sourceValue, spillCls } from '@/lib/cell';
import { useAppState } from '@/store';
import { pkCanPick, pkClose, pkPick } from '@/store/actions/grid';
import type { Field } from '@/types';
import { LvlPill } from '@/components/common/RiskText';

const pkLabel = (f: Field, o: string): ReactNode =>
  ['tt', 'td', 'tt1'].includes(f.id) ? <span className={'spill ' + spillCls(o)}>{o}</span> : f.id === 'rui' ? <LvlPill v={o} /> : o;

export function PickerPop(): JSX.Element | null {
  const s = useAppState((x) => x), P = s.pk, ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });

  useEffect(() => {
    if (!P) return;
    const d = ref.current, btn = document.querySelector<HTMLElement>('.gridwrap [data-i="' + P.i + '"][data-f="' + P.f + '"]'), at = Date.now();
    if (d && btn) {
      try { btn.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* trình duyệt cũ */ }
      const rc = btn.getBoundingClientRect(), w = Math.max(rc.width, 220), h = d.offsetHeight;
      setPos({ left: Math.min(rc.left, window.innerWidth - w - 8), top: rc.bottom + 4 + h > window.innerHeight ? Math.max(8, rc.top - h - 4) : rc.bottom + 4, minWidth: w });
      d.querySelector('.pkl .pko.on')?.scrollIntoView({ block: 'nearest' });
    }
    const down = (e: MouseEvent): void => { if (!(e.target as Element).closest?.('#pkPop')) pkClose(); };
    const scroll = (e: Event): void => { if (Date.now() - at > 400 && !(e.target instanceof Element && e.target.closest('#pkPop'))) pkClose(); };
    document.addEventListener('mousedown', down, true);
    document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('scroll', scroll, true);
      setPos({ visibility: 'hidden' });
    };
  }, [P?.i, P?.f]);

  if (!P || !pkCanPick(P.f) || !s.allRows[P.i]) return null;
  const r = s.allRows[P.i], f = fieldById(P.f)!, opts = optsFor(f)!, cur = cellValue(r, f, s) || '';
  const src = isSrc(f) ? sourceValue(r, f, s) || '' : null, ovr = src !== null && !!r.ovr[f.id];
  const item = (v: string, body: ReactNode, on: boolean, cls = ''): JSX.Element => (
    <button key={cls + v} className={'pko' + (on ? ' on' : '') + (cls ? ' ' + cls : '')} role="option" aria-selected={on} data-v={v} onClick={() => pkPick(P.i, f.id, v)}>
      <span className="pkt">{body}</span>{on && <i>✓</i>}
    </button>
  );
  return (
    <div id="pkPop" className="pkpop" role="listbox" ref={ref} style={pos}>
      <div className="pkh">{f.name.split(' (')[0]}</div>
      {src !== null && <>{item('', <><span className="pksrc">Theo Jira</span>{src ? pkLabel(f, src) : <span className="pknil">trống</span>}</>, !ovr, 'pkjira')}<div className="pkdiv" /></>}
      <div className="pkl">{opts.map((o) => item(o, pkLabel(f, o), o === cur && (src === null || ovr)))}</div>
      {src === null && !!cur && <><div className="pkdiv" />{item('', <span className="pknil">Bỏ giá trị</span>, false, 'pkclr')}</>}
    </div>
  );
}
