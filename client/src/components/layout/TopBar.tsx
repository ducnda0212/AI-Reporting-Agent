import { WEEKS } from '@/data/constants';
import { checkCount, fillCount } from '@/lib/selectors';
import { changedSinceLock, lastCur } from '@/lib/versions';
import { useAppState, useRows } from '@/hooks/useDerived';
import { curStep, goStep, setMenu, setModal, switchWeek, toast, tourGo } from '@/store/actions/flow';
import { useState } from 'react';
import { currentTheme, toggleTheme } from '@/lib/theme';
import { Calendar, Chevron, Help, Logo, Moon, Sun } from '../common/Icons';
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
      <label className="wk">
        <Calendar />
        <select aria-label="Kỳ báo cáo" value="w3" onChange={(e) => switchWeek(e.target.value)}>
          {WEEKS.map((w) => {
            const vs = s.versions.filter((v) => v.wk === w.k);
            return <option key={w.k} value={w.k}>{w.name + (w.cur ? '' : ' · đã chốt v' + (vs.length ? vs[0].v : 1))}</option>;
          })}
        </select>
        <Chevron />
      </label>
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
          <button className={'ttest' + (s.test ? ' on' : '')} onClick={() => setMenu('test')} aria-haspopup="true" aria-expanded={s.menu === 'test'} title="Chế độ test với dữ liệu giả">
            ⚗ {s.test ? 'Đang test' : 'Chế độ test'}
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
