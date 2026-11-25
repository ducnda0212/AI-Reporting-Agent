/* Khung bên phải dùng chung (prototype pnDecorate L10127): tay kéo .pnrz (rộng tối thiểu 300px, tối đa 75% màn, nhấp đúp = phóng to),
   nút phóng to .pnexp (62% màn, tối đa 980px) và mục gập .pnsh (nhớ ở pmo-proto-panel-v1). Trạng thái ở state.pn. */
import { useRef, type ReactNode } from 'react';
import { useAppState } from '@/store';
import { pnSetWidth, pnToggleBig, setPanel } from '@/store/actions/flow';

const sv = (d: string): JSX.Element => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const EXP_I = sv('M15 4h5v5M9 20H4v-5M20 4l-6 6M4 20l6-6'), SHR_I = sv('M14 10h6M14 10V4M10 14H4M10 14v6M14 10l7-7M10 14l-7 7');

/** Nút phóng to / thu nhỏ khung, đặt trong tiêu đề khung ngay trước nút đóng. */
export function PnExpand({ k }: { k: string }): JSX.Element {
  const big = useAppState((s) => s.pn.big === k), t = big ? 'Thu nhỏ khung' : 'Phóng to khung';
  return <button className="pnexp" data-act="pnBig" title={t} aria-label={t} onClick={() => pnToggleBig(k)}>{big ? SHR_I : EXP_I}</button>;
}

/** Nút đóng khung (✕). */
export const PnClose = (): JSX.Element => <button className="pclose" data-act="panel" data-p="" aria-label="Đóng panel" onClick={() => setPanel(null)}>✕</button>;

export function PanelShell({ k, cls, label, children }: { k: string; cls: string; label?: string; children: ReactNode }): JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const big = useAppState((s) => s.pn.big === k), w = useAppState((s) => s.pn.w[k]);
  const width = big ? (typeof window === 'undefined' ? 600 : Math.round(Math.min(window.innerWidth * 0.62, 980))) : w;
  const drag = (e: React.MouseEvent): void => {
    const el = ref.current; if (!el) return;
    e.preventDefault();
    const right = el.getBoundingClientRect().right; let nw = 0;
    document.body.classList.add('pnresizing');
    const mv = (ev: MouseEvent): void => { nw = Math.max(300, Math.min(window.innerWidth * 0.75, right - ev.clientX)); el.style.width = nw + 'px'; };
    const up = (): void => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      document.body.classList.remove('pnresizing');
      if (nw) pnSetWidth(k, nw);
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  };
  return (
    <aside ref={ref} className={'panel ' + cls + (big ? ' pnbig' : '')} aria-label={label} style={width ? { width } : undefined}>
      <div className="pnrz" title="Kéo để đổi độ rộng · nhấp đúp để phóng to / thu nhỏ" aria-hidden="true" onMouseDown={drag} onDoubleClick={() => pnToggleBig(k)}><i /></div>
      {children}
    </aside>
  );
}
