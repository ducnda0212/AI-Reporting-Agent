/* Cấu hình mẫu (prototype tvPanel L8172, bản gọn): chọn số tuần, thêm khối tuần sau, ẩn / hiện từng cột theo nhóm. Bảng đổi theo ngay.
   Mở bằng setPanel('tvcfg') (nút "Cấu hình mẫu" trong menu Cột). Không có "phiên bản mẫu" lưu riêng: bản gọn chỉ chọn tuần hiển thị. */
import { useState } from 'react';
import { FIELDS } from '@/data/constants';
import { activeWkOf, fieldById, grpName, wkShort } from '@/lib/cell';
import { useAppState } from '@/store';
import { setPanel } from '@/store/actions/flow';
import { toggleCol, tvGrpIds, tvLaterGrps, tvSetHidden, tvSetWeeks } from '@/store/actions/grid';
import type { FieldGroup } from '@/types';
import { PanelShell, PnExpand } from './PanelShell';

const GROUPS: FieldGroup[] = ['pin', 'info', 'prog', 'org', 'eval', 'w1', 'w2', 'w3', 'w4'];
const WK_ORDER: FieldGroup[] = ['w1', 'w2', 'w3', 'w4'];

export function TplConfigPanel(): JSX.Element {
  const s = useAppState((x) => x), hidden = s.hidden, [g0, setG] = useState<FieldGroup>('info');
  const vis = (g: FieldGroup): boolean => FIELDS.some((f) => f.grp === g && !hidden[f.id]);
  const grpLabel = (g: FieldGroup): string => grpName(g, s), cur = WK_ORDER.indexOf(activeWkOf(s)), later = tvLaterGrps(s);
  /* các tuần liền trước tuần đang làm còn hiện: 1 = chỉ tuần này … 3 */
  const weeks = ([1, 2, 3] as const).reduce<1 | 2 | 3>((n, k) => (cur - k + 1 >= 0 && vis(WK_ORDER[cur - k + 1]) ? k : n), 1);
  const weekSub = (n: 1 | 2 | 3): string => {
    const ks = WK_ORDER.slice(Math.max(0, cur - n + 1), cur + 1).map((g) => wkShort(g, s.cycleId));
    const short = ks.map((t, i) => (i < ks.length - 1 ? t.split('/')[0] : t));
    return short.length > 2 ? short.join(', ') : short.join(' và ');
  };
  const w4on = later.some(vis), nOn = FIELDS.filter((f) => f.key || !hidden[f.id]).length;
  const cnt = (g: FieldGroup): { on: number; n: number } => { const ids = tvGrpIds(g); return { on: ids.filter((i) => fieldById(i)!.key || !hidden[i]).length, n: ids.length }; };
  const ids0 = tvGrpIds(g0), lockedAll = ids0.every((i) => fieldById(i)!.key), c0 = cnt(g0);
  return (
    <PanelShell k="tvcfg" cls="" label="Cấu hình mẫu">
      <div className="phd"><div style={{ flex: '1 1 auto', minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>Cấu hình mẫu</div><div style={{ fontSize: 11.5, color: 'var(--mut)' }}>Báo cáo tuần chi tiết · bảng đổi theo ngay</div></div>
        <PnExpand k="tvcfg" /><button className="chip" data-act="tvPanel" style={{ cursor: 'pointer' }} onClick={() => setPanel(null)}>Đóng</button></div>
      <div className="tvpb">
        <h3 className="tvh">Số tuần trong báo cáo</h3>
        <div className="tvsegs" role="group" aria-label="Số tuần">
          {([1, 2, 3] as const).map((n) => <button key={n} className={'tvseg' + (weeks === n ? ' on' : '')} data-act="tvWeeks" data-n={n} aria-pressed={weeks === n} onClick={() => tvSetWeeks(n)}><b>{n + ' tuần'}</b><small>{weekSub(n)}</small></button>)}
        </div>
        <label className="tvck"><input type="checkbox" data-act="tvW4" checked={w4on} disabled={!later.length} onChange={(e) => tvSetHidden(later.flatMap(tvGrpIds), !e.target.checked)} /><span>Thêm khối tuần sau<small>{later.length ? later.map((g) => grpName(g, s)).join(', ') + ', chưa tới' : 'Chưa có tuần sau trong tháng'}</small></span></label>
        <h3 className="tvh">Cột hiển thị <span>{nOn + '/' + FIELDS.length}</span></h3>
        <div className="tvpls">{GROUPS.map((g) => {
          const c = cnt(g);
          return <button key={g} className={'tvpl' + (g0 === g ? ' on' : '')} data-act="tvGo" data-g={g} aria-pressed={g0 === g} onClick={() => setG(g)}>{grpLabel(g)}<em className={c.on === c.n ? 'all' : c.on ? 'part' : 'none'}>{c.on + '/' + c.n}</em></button>;
        })}</div>
        <div className="tvgh"><b>{grpLabel(g0)}</b><span>{c0.on + '/' + c0.n}</span><span className="tvsp" />
          {!lockedAll && <><button className="alink" data-act="tvGrp" data-g={g0} data-v="show" onClick={() => tvSetHidden(ids0, false)}>Hiện hết</button><button className="alink mut" data-act="tvGrp" data-g={g0} data-v="hide" onClick={() => tvSetHidden(ids0, true)}>Ẩn hết</button></>}</div>
        <div className="tvrs">{ids0.map((i) => {
          const f = fieldById(i)!, on = !!f.key || !hidden[i];
          return (
            <button key={i} className={'tvr' + (on ? ' on' : '')} data-act="tvCol" data-f={i} role="checkbox" aria-checked={on} disabled={!!f.key} title={f.key ? 'Cột khoá, luôn hiện' : f.required ? 'Cột bắt buộc: ẩn thì báo cáo sẽ thiếu cột này' : undefined} onClick={() => toggleCol(i)}>
              <i aria-hidden="true">{on ? '✓' : ''}</i><span className="tvl">{f.col}</span><span className="tvn">{f.name}</span>{f.key ? <small>khoá</small> : f.required ? <small>bắt buộc</small> : null}
            </button>
          );
        })}</div>
      </div>
    </PanelShell>
  );
}
