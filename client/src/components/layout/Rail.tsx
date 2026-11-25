/* Thanh trái bản gọn (prototype tabs L3748 + html.lite): đúng 3 mục Bảng, Phiên bản, Nhật ký. */
import { useAppState } from '@/store';
import { setView } from '@/store/actions/flow';
import type { ViewType } from '@/types';
import { RAIL_ICONS } from '@/components/common/Icons';

const ITEMS: [v: 'grid' | 'ver' | 'log', label: string][] = [['grid', 'Bảng'], ['ver', 'Phiên bản'], ['log', 'Nhật ký']];

export function Rail(): JSX.Element {
  const view = useAppState((s) => s.view);
  const on = (v: ViewType): boolean => view === v;
  return (
    <nav className="rail" aria-label="Điều hướng">
      {ITEMS.map(([v, label]) => (
        <button key={v} className={'ri' + (on(v) ? ' on' : '')} data-act="view" data-v={v} onClick={() => setView(v)} title={label} aria-current={on(v) ? 'page' : undefined}>
          {RAIL_ICONS[v]}{label}
        </button>
      ))}
    </nav>
  );
}
