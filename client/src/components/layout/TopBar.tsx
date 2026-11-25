/* Thanh trên (prototype topBar L3702 + navBtns L10695 + weekPicker L7857 + testMenu L6943 + themeBtn L7797), bản gọn 3 bước. */
import { useMemo, useState } from 'react';
import { SCEN } from '@/data/constants';
import { diffSnap, snapshot } from '@/lib/versions';
import { currentTheme } from '@/lib/theme';
import { rowsOf, useAppState } from '@/store';
import { curStep, enterTest, exitTest, fillCount, goStep, navGo, setModal, themeToggle, type Step } from '@/store/actions/flow';
import { setMenu } from '@/store/actions/grid';
import { helpOpenPanel } from '@/store/actions/help';
import { wkHist, wkOpen } from '@/store/actions/versions';
import type { AppState, NavSnap, TestScenario, WeekKey } from '@/types';
import { IcCal, IcChevDown, IcFlask, IcHelp, IcNav, IcTheme, IcWkChev } from '@/components/common/Icons';

const NAV_NAME: Record<string, string> = { import: 'Nhập file', grid: 'Bảng', log: 'Nhật ký' };
function navName(sn: NavSnap): string {
  if (sn.view === 'ver') return sn.vlView === 'cmp' ? 'So sánh 2 bản' : sn.vlView === 'one' ? 'Xem một phiên bản' : 'Phiên bản';
  return NAV_NAME[sn.view] || 'màn trước';
}

function NavBtns({ nav }: { nav: AppState['nav'] }): JSX.Element {
  const b = nav.st[nav.ix - 1], f = nav.st[nav.ix + 1];
  return (
    <div className="tnav">
      <button onClick={() => navGo(-1)} disabled={!b} title={b ? 'Quay lại: ' + navName(b) + ' (Alt+←)' : 'Chưa có màn trước'} aria-label="Quay lại"><IcNav d={-1} /></button>
      <button onClick={() => navGo(1)} disabled={!f} title={f ? 'Tiến tới: ' + navName(f) + ' (Alt+→)' : 'Chưa có màn kế'} aria-label="Tiến tới"><IcNav d={1} /></button>
    </div>
  );
}

/* tuần báo cáo (WKX) và trạng thái chốt của từng tuần */
const WKX: { k: WeekKey | 'w4'; t: string; r: string; cur?: boolean; future?: boolean }[] = [
  { k: 'w1', t: 'Tuần 1', r: '31/10–06/11' }, { k: 'w2', t: 'Tuần 2', r: '07–14/11' }, { k: 'w3', t: 'Tuần 3', r: '15–22/11', cur: true }, { k: 'w4', t: 'Tuần 4', r: '23–30/11', future: true }
];
function wkSt(s: AppState, w: (typeof WKX)[number]): [string, string] {
  const vs = s.versions.filter((v) => v.wk === w.k);
  return w.future ? ['fut', 'Chưa mở'] : w.cur ? (vs.length ? ['ok', 'Đã chốt Bản ' + vs[0].v] : ['cur', 'Đang làm']) : ['ok', 'Đã chốt Bản ' + (vs.length ? vs[0].v : 1)];
}
function WeekPicker({ s }: { s: AppState }): JSX.Element {
  const open = s.menu === 'week', st = wkSt(s, WKX[2]);
  return (
    <div className="wkp">
      <button className="wkn" onClick={() => wkOpen('w2')} title="Tuần trước (Tuần 2, đã chốt)" aria-label="Tuần trước"><IcWkChev d={-1} /></button>
      <span className="mwrap">
        <button className="wkb" onClick={() => setMenu('week')} aria-haspopup="true" aria-expanded={open} aria-label="Kỳ báo cáo: Tuần 3 tháng 11, 15 đến 22/11">
          <IcCal /><span className="wkt"><b>Tuần 3 · Th11</b><small>15–22/11</small></span><span className={'wkst ' + st[0]}>{st[1]}</span><IcChevDown />
        </button>
        {open && (
          <div className="menu wkm" data-stop="1" role="dialog" aria-label="Chọn kỳ báo cáo">
            <div className="wkh"><b>Tháng 11 · 2026</b><span>Báo cáo tuần, chốt mỗi thứ Sáu</span></div>
            <div className="wkl">
              {WKX.map((w) => {
                const I = wkSt(s, w), on = !!w.cur;
                return (
                  <button key={w.k} className={'wkr' + (on ? ' on' : '')} onClick={() => w.k !== 'w4' && wkOpen(w.k)} disabled={w.future} aria-current={on ? 'true' : undefined}>
                    <span className="wkno">{w.t.replace('Tuần ', 'T')}</span>
                    <span className="wkrt"><b>{w.t}</b><small>{w.r}</small></span>
                    <span className={'wks ' + I[0]}>{I[1]}</span>
                    <span className="wkck" aria-hidden="true">{on ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
            <div className="wkf"><span>Tuần đã chốt chỉ để xem</span><button className="alink" onClick={wkHist}>Lịch sử phiên bản</button></div>
          </div>
        )}
      </span>
      <button className="wkn" disabled title="Tuần 4 chưa mở" aria-label="Tuần sau"><IcWkChev d={1} /></button>
    </div>
  );
}

function TestMenu({ test }: { test: TestScenario }): JSX.Element {
  return (
    <div className="menu r" data-stop="1" style={{ width: 330, top: 'calc(100% + 6px)' }}>
      <div className="lbl">Chế độ test · dữ liệu giả</div>
      <p style={{ fontSize: 11.5, color: 'var(--mut)', margin: '4px 0 8px' }}>Nạp bộ dữ liệu giả để thử luồng. Dữ liệu thật và cấu hình không bị đổi; thoát là trả về như cũ.</p>
      {(Object.keys(SCEN) as (keyof typeof SCEN)[]).map((k) => (
        <button key={k} className={'tsc' + (test === k ? ' on' : '')} onClick={() => enterTest(k)}><b>{SCEN[k].name}</b><small>{SCEN[k].d}</small></button>
      ))}
      {test && <button className="btn sm" onClick={exitTest} style={{ marginTop: 8, width: '100%' }}>Thoát chế độ test</button>}
    </div>
  );
}

function ThemeBtn(): JSX.Element {
  const [dark, setDark] = useState(() => currentTheme() === 'dark');
  const t = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  return <button className="ticon" onClick={() => setDark(themeToggle() === 'dark')} title={t} aria-label={t}><IcTheme dark={dark} /></button>;
}

export function TopBar(): JSX.Element {
  const s = useAppState((x) => x);
  const L = s.loaded, lc = s.versions.find((v) => v.wk === 'w3');
  /* quét toàn bảng: chỉ tính lại khi dữ liệu đổi, không phải mỗi lần chọn ô / ghi nhật ký */
  const { allRows, newCodes, dupMerged, realOnly, phaseBucket, versions } = s;
  const [c3, chg] = useMemo(() => [fillCount(s), lc && lc.snap ? diffSnap(lc.snap, snapshot(rowsOf(s), s)) : null] as const,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [L, allRows, newCodes, dupMerged, realOnly, phaseBucket, versions]);
  const d1 = L, d3 = L && c3 === 0, d4 = !!(lc && lc.exported && chg && !chg.length);
  const now: Step = !d1 ? 1 : !d3 ? 3 : 4, cs = curStep(s);
  const onImp = !L || s.view === 'import' || !!s.importing;
  const stp = (n: Step, label: string, done: boolean, cnt: number): JSX.Element => (
    <button className={'stp' + (done ? ' done' : now === n ? ' now' : '') + (cs === n ? ' cur' : '')} onClick={() => goStep(n)} aria-current={cs === n ? 'step' : undefined}>
      <i>{done ? '✓' : n > 2 ? n - 1 : n}</i><span className="lb">{label}</span>{cnt ? <b>{cnt}</b> : null}
    </button>
  );
  const lnk = (done: boolean): JSX.Element => <span className={'ln' + (done ? ' done' : '')} aria-hidden="true" />;
  return (
    <header className="top gut">
      <div className="tbrand"><img src="/logo.png" alt="" width="28" height="28" /><span>PMO Reporting</span></div>
      <NavBtns nav={s.nav} /><span className="tdiv" />
      {!onImp && <WeekPicker s={s} />}
      <nav className="tsteps" aria-label="Các bước">
        {stp(1, 'Nhập file', d1, 0)}{lnk(d1)}
        {stp(3, 'Bảng · điền & duyệt', d3, L ? c3 : 0)}{lnk(d3)}
        {stp(4, 'Chốt & xuất', d4, 0)}
      </nav>
      <div className="tact">
        <span className="mwrap">
          <button className={'ttest' + (s.test ? ' on' : '')} onClick={() => setMenu('test')} aria-haspopup="true" aria-expanded={s.menu === 'test'} title="Chế độ test với dữ liệu giả" aria-label="Dữ liệu thử">
            <IcFlask /><span className="ttl2">{s.test ? 'Đang dùng dữ liệu thử' : 'Dữ liệu thử'}</span>
          </button>
          {s.menu === 'test' && <TestMenu test={s.test} />}
        </span>
        <ThemeBtn />
        <button className="ticon" onClick={helpOpenPanel} title="Hướng dẫn sử dụng" aria-label="Hướng dẫn sử dụng"><IcHelp /></button>
        {L && <button className={'btn' + (cs >= 3 ? ' pri' : '')} data-act="modal" data-m="export" onClick={() => setModal('export')}>Xuất báo cáo</button>}
      </div>
    </header>
  );
}
