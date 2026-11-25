/* Banner chế độ dữ liệu thử (prototype testBanner L6935). */
import { SCEN } from '@/data/constants';
import { useAppState } from '@/store';
import { enterTest, exitTest, testReseed } from '@/store/actions/flow';

export function TestBanner(): JSX.Element | null {
  const test = useAppState((s) => s.test);
  if (!test) return null;
  const s = SCEN[test];
  return (
    <div className="testbar gut" role="status">
      <b>CHẾ ĐỘ TEST</b><span>{s.name + ' · ' + s.d}</span><span className="sp" />
      {(Object.keys(SCEN) as (keyof typeof SCEN)[]).map((k) => (
        <button key={k} className={'tbb' + (test === k ? ' on' : '')} onClick={() => enterTest(k)}>{SCEN[k].name}</button>
      ))}
      <button className="tbb" onClick={testReseed} title="Sinh lại dữ liệu ngẫu nhiên">↻ Sinh lại</button>
      <button className="tbb x" onClick={exitTest}>Thoát</button>
    </div>
  );
}
