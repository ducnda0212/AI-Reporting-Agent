/* Màn Phiên bản bản cuối (prototype vbBlock L11993 + vlTable3 L12118): so sánh 2 bản (4 thẻ số + biểu đồ cột ghép SVG + dự án đổi tình trạng)
   ở trên, danh sách bản đã chốt theo tuần ở dưới; bấm một dòng xổ 5 chỉ số, "Mở trên bảng" mở lại bản đó trên bảng tính. */
import type { KeyboardEvent, MouseEvent } from 'react';
import { WEEKS } from '@/data/constants';
import { activeWkOf } from '@/lib/cell';
import { vCompare2, vhList, vKey, vSide, type Compare, type CmpOverview } from '@/lib/versions';
import { rowsOf, useAppState } from '@/store';
import { vbSetA, vbSetB, vbToggleMore, vFind, vlEdit, vlTogExpand, wkName } from '@/store/actions/versions';
import type { AppState } from '@/types';
import { IcDoc } from '@/components/common/Icons';

const side = (s: AppState, k: string) => vSide(vFind(s, k) || null, rowsOf(s), s);
function compare(s: AppState, ka: string, kb: string): Compare | null {
  const A = side(s, ka), B = side(s, kb);
  return A && B ? vCompare2(A, B, rowsOf(s)) : null;
}
/** Tổng quan một bản (prototype vOv): so bản với chính nó cho ra đúng 5 chỉ số của bản đó. */
function overview(s: AppState, k: string): CmpOverview | null {
  const S = side(s, k);
  return S ? vCompare2(S, S, rowsOf(s)).A : null;
}
const vhFull = (s: AppState, k: string): string => {
  const v = vFind(s, k);
  return wkName(v ? v.wk : activeWkOf(s), true) + ' · ' + (v ? 'Bản ' + v.v : 'Bảng đang làm');
};

const M: [k: 'ok' | 'risk' | 'late' | 'high', label: string, upGood: boolean][] = [['ok', 'Đúng tiến độ', true], ['risk', 'Nguy cơ chậm', false], ['late', 'Chậm tiến độ', false], ['high', 'Rủi ro cao', false]];
const W = 560, H = 190, PAD = 28, BW = 30;

function VbBlock({ s }: { s: AppState }): JSX.Element | null {
  const K = vhList(s.versions).map((x) => x.k);
  if (K.length < 2) return null;
  const b = s.vbB && K.includes(s.vbB) ? s.vbB : K[0];
  const a = s.vbA != null && K.includes(s.vbA) && s.vbA !== b ? s.vbA : K[K.indexOf(b) + 1] || '';
  const C = a ? compare(s, a, b) : null;
  if (!C) return null;
  const opt = (other: string): JSX.Element[] => K.filter((k) => k !== other).map((k) => <option key={k} value={k}>{vhFull(s, k)}</option>);
  const gw = (W - PAD * 2) / M.length, mx = Math.max(...M.map(([k]) => Math.max(C.A[k], C.B[k])), 1);
  const y = (v: number): number => H - 30 - (v / mx) * (H - 60);
  const keep = (x: { k: string }): boolean => x.k === 'tt' || x.k === 'rui', nb = C.bad.filter(keep), ng = C.good.filter(keep);
  const ch = [...nb.map((x) => [x, 'bad'] as const), ...ng.map((x) => [x, 'good'] as const)], show = s.vbMore ? ch : ch.slice(0, 5);
  return (
    <section className="vb">
      <div className="vbh"><b>So sánh</b>
        <select className="sel sm" aria-label="Bản này" value={b} onChange={(e) => vbSetB(e.target.value)}>{opt(a)}</select>
        <span className="vbvs">so với</span>
        <select className="sel sm" aria-label="Bản trước" value={a} onChange={(e) => vbSetA(e.target.value)}>{opt(b)}</select>
      </div>
      <div className="vbks">{M.map(([k, label, up]) => {
        const vb = C.B[k], va = C.A[k], d = vb - va, good = d === 0 ? '' : d > 0 === up ? 'up' : 'dn';
        return <div key={k} className="vbk"><span>{label}</span><b>{vb}{d ? <em className={good}>{(d > 0 ? '↑' : '↓') + Math.abs(d)}</em> : <em className="eq">=</em>}</b><i>{'Bản trước: ' + va}</i></div>;
      })}</div>
      <div className="vbbody">
        <div className="vbchart">
          <div className="vblg"><span><i className="vbA" />{vhFull(s, a)}</span><span><i className="vbB" />{vhFull(s, b)}</span></div>
          <svg className="vbsvg" viewBox={'0 0 ' + W + ' ' + H} role="img" aria-label="Biểu đồ so sánh số dự án theo tình trạng giữa hai bản">
            <line x1={PAD} y1={H - 30} x2={W - PAD} y2={H - 30} className="vbax" />
            {M.map(([k, label], j) => {
              const cx = PAD + gw * j + gw / 2, va = C.A[k], vb = C.B[k];
              return (
                <g key={k}>
                  <rect x={cx - BW - 2} y={y(va)} width={BW} height={H - 30 - y(va)} rx="3" className="vbA"><title>{vhFull(s, a) + ': ' + va}</title></rect>
                  <rect x={cx + 2} y={y(vb)} width={BW} height={H - 30 - y(vb)} rx="3" className="vbB"><title>{vhFull(s, b) + ': ' + vb}</title></rect>
                  <text x={cx - BW / 2 - 2} y={y(va) - 5} className="vbv">{va}</text><text x={cx + BW / 2 + 2} y={y(vb) - 5} className="vbv b">{vb}</text>
                  <text x={cx} y={H - 10} className="vbl">{label}</text>
                </g>
              );
            })}
          </svg>
        </div>
        {ch.length ? (
          <div className="vbch">
            <div className="vbcht">Dự án đổi tình trạng <span>{nb.length + ' xấu đi · ' + ng.length + ' tốt lên'}</span></div>
            {show.map(([x, c]) => (
              <div key={x.ma + x.k} className="vbr"><i className={'vhst ' + c} /><span className="c2code">{x.ma}</span><span className="vbrn" title={x.viec}>{x.viec}</span><span className={'vbrw ' + c}>{x.what}</span></div>
            ))}
            {ch.length > 5 && <button className="alink" onClick={vbToggleMore}>{s.vbMore ? 'Thu gọn' : 'Xem thêm ' + (ch.length - 5) + ' dự án'}</button>}
          </div>
        ) : <div className="vbch"><div className="vbcht">Không dự án nào đổi tình trạng hay mức rủi ro</div></div>}
      </div>
    </section>
  );
}

function versionRows(s: AppState): JSX.Element[] {
  const out: JSX.Element[] = [];
  WEEKS.forEach((w) => {
    const L = s.versions.filter((v) => v.wk === w.k).sort((x, y) => y.v - x.v);
    if (!L.length) return;
    out.push(<tr key={w.k} className="vlg"><td colSpan={6}>{wkName(w.k, true)}<span>{w.name.split(' · ')[1] || ''}</span></td></tr>);
    L.forEach((v, i) => {
      const k = vKey(v), on = s.vlOpen === k, o = on ? overview(s, k) : null;
      const edit = (e: MouseEvent): void => { e.stopPropagation(); vlEdit(k); };
      const key = (e: KeyboardEvent): void => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); vlTogExpand(k); } };
      out.push(
        <tr key={k} className={'vlrow' + (on ? ' on' : '')} onClick={() => vlTogExpand(k)} onKeyDown={key} role="button" tabIndex={0} aria-expanded={on}>
          <td>
            <span className="vlchev" aria-hidden="true">{on ? '▾' : '▸'}</span><b className="vlb">{'Bản ' + v.v}</b>{i === 0 && <em className="vhtag">mới nhất</em>}
            <div className="vlfile">{v.exported ? <><IcDoc />{v.exported}</> : 'Chưa xuất file'}</div>
          </td>
          <td className="vlnum">{v.at}</td><td>{v.by}</td>
          <td>{v.exported ? <span className="vlst ok">Đã xuất</span> : <span className="vlst">Đã chốt</span>}</td>
          <td className="vlnote" title={v.note || ''}>{v.note || <span className="vhe">–</span>}</td>
          <td className="vlact"><button className="btn sm" onClick={edit}>Mở trên bảng</button></td>
        </tr>
      );
      if (on) out.push(
        <tr key={k + '+'} className="vlexp"><td colSpan={6}>{o ? <>
          <div className="vloks">{([['Đang chạy', o.run], ['Đúng tiến độ', o.ok], ['Nguy cơ chậm', o.risk], ['Chậm tiến độ', o.late], ['Rủi ro cao', o.high]] as const).map(([lb, n]) => <div key={lb} className="vlok"><span>{lb}</span><b>{n}</b></div>)}</div>
          <div className="vlexa"><span>{'Chốt ' + v.at + ' · ' + v.by + (v.stats ? ' · ' + v.stats.rows + ' dự án' : '')}</span><button className="btn sm pri" onClick={edit}>Mở trên bảng tính →</button></div>
        </> : <div className="vhnone">Bản này không có dữ liệu để xem.</div>}</td></tr>
      );
    });
  });
  return out;
}

export function VersionsView(): JSX.Element {
  const s = useAppState((x) => x);
  if (!s.loaded) return <div className="gridwrap gut vlwrap"><div className="v2msg">Nhập file Jira trước để có phiên bản.</div></div>;
  const body = versionRows(s);
  return (
    <div className="gridwrap gut vlwrap7"><div className="vlm">
      <div className="vlh"><div><h2>Phiên bản đã chốt</h2><span>Bấm một bản để xem nhanh tổng quan · “Mở trên bảng” để mở lại bản đó trên bảng tính.</span></div></div>
      <VbBlock s={s} />
      <div className="vltb"><table className="vlt">
        <thead><tr><th>Phiên bản · file</th><th>Chốt lúc</th><th>Người chốt</th><th>Trạng thái</th><th>Ghi chú</th><th /></tr></thead>
        <tbody>{body.length ? body : <tr><td colSpan={6} className="vhnone">Chưa có bản nào được chốt.</td></tr>}</tbody>
      </table></div>
    </div></div>
  );
}
