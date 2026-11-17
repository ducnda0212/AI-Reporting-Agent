import { SCEN } from '@/lib/testMode';
import { useStore } from '@/store';
import { enterTest, exitTest, reseedTest } from '@/store/actions/flow';

export function TestBanner() {
  const test = useStore((s) => s.test);
  if (!test) return null;
  const sc = SCEN[test];
  return (
    <div className="testbar gut" role="status">
      <b>CHẾ ĐỘ TEST</b><span>{sc.name} · {sc.d}</span><span className="sp" />
      {Object.keys(SCEN).map((k) => (
        <button key={k} className={'tbb' + (test === k ? ' on' : '')} onClick={() => enterTest(k)}>{SCEN[k].name}</button>
      ))}
      <button className="tbb" onClick={reseedTest} title="Sinh lại dữ liệu ngẫu nhiên">↻ Sinh lại</button>
      <button className="tbb x" onClick={exitTest}>Thoát</button>
    </div>
  );
}

export function TestMenu() {
  const menu = useStore((s) => s.menu);
  const test = useStore((s) => s.test);
  if (menu !== 'test') return null;
  return (
    <div className="menu r" data-stop="1" style={{ width: 330, top: 'calc(100% + 6px)' }}>
      <div className="lbl">Chế độ test · dữ liệu giả</div>
      <p style={{ fontSize: 11.5, color: 'var(--mut)', margin: '4px 0 8px' }}>
        Nạp bộ dữ liệu giả để thử luồng. Dữ liệu thật và cấu hình không bị đổi; thoát là trả về như cũ.
      </p>
      {Object.keys(SCEN).map((k) => (
        <button key={k} className={'tsc' + (test === k ? ' on' : '')} onClick={() => enterTest(k)}>
          <b>{SCEN[k].name}</b><small>{SCEN[k].d}</small>
        </button>
      ))}
      {test && <button className="btn sm" onClick={exitTest} style={{ marginTop: 8, width: '100%' }}>Thoát chế độ test</button>}
    </div>
  );
}
