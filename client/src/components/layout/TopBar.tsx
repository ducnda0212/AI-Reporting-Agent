import { WEEKS } from '@/data/constants';
import type { AppState } from '@/store/types';
import { checkCount, fillCount } from '@/lib/selectors';
import { changedSinceLock, lastCur } from '@/lib/versions';
import { useAppState, useRows } from '@/hooks/useDerived';
import { curStep, goStep, neighbourWeek, openVersions, setMenu, setModal, switchWeek, toast, tourGo } from '@/store/actions/flow';
import { useState } from 'react';
import { currentTheme, toggleTheme } from '@/lib/theme';
import { Calendar, Chevron, Help, Logo, Moon, Sun, WeekChevron } from '../common/Icons';
import { TestMenu } from './TestBanner';

function Step({ n, label, done, now, cur, cnt }: { n: number; label: string; done: boolean; now: boolean; cur: boolean; cnt: number }) {
  return (
    <button className={'stp' + (done ? ' done' : now ? ' now' : '') + (cur ? ' cur' : '')} onClick={() => goStep(n)} aria-current={cur ? 'step' : undefined}>
      <i>{done ? '✓' : n}</i><span className="lb">{label}</span>{cnt ? <b>{cnt}</b> : null}
    </button>
  );
}
function ThemeButton() {
  const [dark, setDark] = useState(() => currentTheme() === 'dark');
  const label = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  const onClick = () => { const next = toggleTheme(); setDark(next === 'dark'); toast(next === 'dark' ? 'Đã chuyển sang giao diện tối' : 'Đã chuyển sang giao diện sáng'); };
  return <button className="ticon" onClick={onClick} title={label} aria-label={label}>{dark ? <Sun /> : <Moon />}</button>;
}
type WkStatus = ['ok' | 'cur' | 'fut', string];
function wkStatus(s: AppState, k: string): WkStatus {
  const w = WEEKS.find((x) => x.k === k)!;
  const vs = s.versions.filter((v) => v.wk === k);
  if (w.future) return ['fut', 'Chưa mở'];
  if (w.cur) return vs.length ? ['ok', 'Đã chốt v' + vs[0].v] : ['cur', 'Đang làm'];
  return ['ok', 'Đã chốt v' + (vs.length ? vs[0].v : 1)];
}

/** Chọn kỳ báo cáo: nút lùi/tới + bảng chọn tuần có trạng thái. Tuần đã chốt chỉ để xem. */
function WeekPicker() {
  const s = useAppState();
  const open = s.menu === 'week';
  const st = wkStatus(s, s.activeWeek);
  const prevK = neighbourWeek(s.activeWeek, -1), nextK = neighbourWeek(s.activeWeek, 1);
  const aw = WEEKS.find((x) => x.k === s.activeWeek)!;
  return (
    <div className="wkp">
      <button className="wkn" onClick={() => prevK && switchWeek(prevK)} disabled={!prevK} title="Tuần trước" aria-label="Tuần trước"><WeekChevron dir={-1} /></button>
      <span className="mwrap">
        <button className="wkb" onClick={() => setMenu('week')} aria-haspopup="true" aria-expanded={open} aria-label={`Kỳ báo cáo: ${aw.t} tháng 11, ${aw.r}`}>
          <Calendar /><span className="wkt"><b>{aw.t} · Th11</b><small>{aw.r}</small></span><span className={'wkdot ' + st[0]} title={st[1]} /><Chevron />
        </button>
        {open && (
          <div className="menu wkm" data-stop="1" role="dialog" aria-label="Chọn kỳ báo cáo">
            <div className="wkh"><b>Tháng 11 · 2026</b><span>Báo cáo tuần, chốt mỗi thứ Sáu</span></div>
            <div className="wkl">
              {WEEKS.map((w) => {
                const I = wkStatus(s, w.k);
                return (
                  <button key={w.k} className={'wkr' + (w.k === s.activeWeek ? ' on' : '')} onClick={() => switchWeek(w.k)} aria-current={w.k === s.activeWeek ? 'true' : undefined}>
                    <span className="wkno">{w.t.replace('Tuần ', 'T')}</span>
                    <span className="wkrt"><b>{w.t}</b><small>{w.r}</small></span>
                    <span className={'wks ' + I[0]}>{I[1]}</span>
                    <span className="wkck" aria-hidden="true">{w.k === s.activeWeek ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
            <div className="wkf"><span>Tuần đã chốt chỉ để xem</span><button className="alink" onClick={openVersions}>Lịch sử phiên bản</button></div>
          </div>
        )}
      </span>
      <button className="wkn" onClick={() => nextK && switchWeek(nextK)} disabled={!nextK} title="Tuần sau" aria-label="Tuần sau"><WeekChevron dir={1} /></button>
    </div>
  );
}
const Link = ({ done }: { done: boolean }) => <span className={'ln' + (done ? ' done' : '')} aria-hidden="true" />;

export function TopBar() {
  const s = useAppState();
  const rows = useRows();
  const L = s.loaded;
  const c2 = checkCount(s, rows);
  const c3 = fillCount(s, rows);
  const lc = lastCur(s);
  const chg = changedSinceLock(s);
  const d1 = L, d2 = L && c2 === 0, d3 = L && c3 === 0, d4 = !!(lc && lc.exported && chg && !chg.length);
  const now = !d1 ? 1 : !d2 ? 2 : !d3 ? 3 : 4;
  const cs = curStep(s);
  return (
    <header className="top gut">
      <div className="tbrand"><Logo /><span>PMO Reporting</span></div>
      <span className="tdiv" />
      <WeekPicker />
      <nav className="tsteps" aria-label="Các bước">
        <Step n={1} label="Nhập file" done={d1} now={now === 1} cur={cs === 1} cnt={0} />
        <Link done={d1} />
        <Step n={2} label="Kiểm tra dữ liệu" done={d2} now={now === 2} cur={cs === 2} cnt={L ? c2 : 0} />
        <Link done={d2} />
        <Step n={3} label="Điền & duyệt" done={d3} now={now === 3} cur={cs === 3} cnt={L ? c3 : 0} />
        <Link done={d3} />
        <Step n={4} label="Chốt & xuất" done={d4} now={now === 4} cur={cs === 4} cnt={0} />
      </nav>
      <div className="tact">
        <span className="mwrap">
          <button className={'ttest' + (s.test ? ' on' : '')} onClick={() => setMenu('test')} aria-haspopup="true" aria-expanded={s.menu === 'test'} title="Chế độ test với dữ liệu giả" aria-label="Chế độ test">
            ⚗<span className="ttl"> {s.test ? 'Đang test' : 'Chế độ test'}</span>
          </button>
          <TestMenu />
        </span>
        <ThemeButton />
        <button className="ticon" onClick={() => tourGo(0)} title="Hướng dẫn sử dụng" aria-label="Hướng dẫn sử dụng"><Help /></button>
        <button className={'btn' + (cs >= 3 ? ' pri' : '')} onClick={() => {
          if (!s.loaded) { toast('Chưa có dữ liệu — nhập file CSV ở bước 1 trước'); return; }
          setModal('export');
        }}>Xuất báo cáo</button>
      </div>
    </header>
  );
}
