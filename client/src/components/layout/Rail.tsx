import type { ReactNode } from 'react';
import type { ViewId } from '@/store/types';
import { blockers, missingCat, pendingAI, warnings } from '@/lib/selectors';
import { exPending } from '@/lib/exec';
import { riskPending } from '@/lib/risk';
import { useAppState, useRows } from '@/hooks/useDerived';
import { setPanel, setView } from '@/store/actions/flow';
import { RailIcon } from '../common/Icons';

const Badge = ({ n, c = '' }: { n: number; c?: string }) => (n ? <span className={'rb ' + c}>{n > 99 ? '99+' : n}</span> : null);

function ViewItem({ v, label, icon, badge, extra = '' }: { v: ViewId; label: string; icon: ReactNode; badge?: ReactNode; extra?: string }) {
  const view = useAppState().view;
  return (
    <button className={'ri' + (view === v ? ' on' : '') + extra} onClick={() => setView(v)} title={label} aria-current={view === v ? 'page' : undefined}>
      {icon}{label}{badge}
    </button>
  );
}

export function Rail() {
  const s = useAppState();
  const rows = useRows();
  const b = blockers(s, rows).length;
  const w = warnings(s, rows).length;
  const p = pendingAI(rows);
  const openN = s.notes.filter((n) => !n.done).length;
  const catN = (s.loaded ? missingCat(s, rows).length : 0) + (s.catPend ? 1 : 0);
  const PanelItem = ({ pn, label, icon, badge, cls = '' }: { pn: 'issues' | 'ai' | 'note'; label: string; icon: ReactNode; badge: ReactNode; cls?: string }) => {
    const on = s.panel === pn || (pn === 'ai' && (s.panel === 'rev' || s.panel === 'ask'));
    return (
      <button className={'ri' + (cls ? ' ' + cls : '') + (on ? ' pon' : '')} onClick={() => setPanel(on ? null : pn)} title={label} aria-pressed={on}>
        {icon}{label}{badge}
      </button>
    );
  };
  return (
    <nav className="rail" aria-label="Điều hướng">
      <ViewItem v="grid" label="Bảng" icon={<RailIcon name="grid" />} />
      <ViewItem v="exec" label="Điều hành" icon={<RailIcon name="exec" />} badge={<Badge n={s.loaded ? exPending(s) : 0} c="a" />} />
      <ViewItem v="rid" label="Rủi ro" icon={<RailIcon name="rid" />} badge={<Badge n={s.loaded ? riskPending(s) : 0} c="e" />} />
      <ViewItem v="ver" label="Phiên bản" icon={<RailIcon name="ver" />} />
      <ViewItem v="log" label="Nhật ký" icon={<RailIcon name="log" />} />
      <ViewItem v="cat" label="Hệ thống" icon={<RailIcon name="cat" />} badge={<Badge n={catN} c="w" />} />
      <span className="rsep" />
      <PanelItem pn="issues" label="Cảnh báo" icon={<RailIcon name="iss" />} badge={<Badge n={b + w} c={b ? 'e' : ''} />} />
      <PanelItem pn="ai" label="AI" icon={<RailIcon name="ai" />} badge={<Badge n={p} c="a" />} cls="ai" />
      <PanelItem pn="note" label="Ghi chú" icon={<RailIcon name="note" />} badge={<Badge n={openN} />} />
      <span className="rsp" />
      <ViewItem v="tpl" label="Cấu hình" icon={<RailIcon name="cfg" />} extra=" cfgchip" />
    </nav>
  );
}
