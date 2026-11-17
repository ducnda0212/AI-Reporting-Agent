import type { Version } from '@/types';
import { WEEKS } from '@/data/constants';
import { changedSinceLock, diffSnap, lastCur } from '@/lib/versions';
import { useAppState } from '@/hooks/useDerived';
import { pickVersion, reExport, setModal } from '@/store/actions/flow';

type Change = [string, string, string | null, string | null];

const Empty = ({ style }: { style?: React.CSSProperties }) => <span className="dold" style={{ textDecoration: 'none', background: 'var(--row)', color: 'var(--mut2)', ...style }}>(trống)</span>;

function ChangeTable({ list, title, note }: { list: Change[]; title: string; note?: string }) {
  return (
    <div className="dsec" style={{ borderTop: '1px solid var(--line2)' }}>
      <div className="dsh">{title}<span>{list.length} ô{note ? ' · ' + note : ''}</span></div>
      {list.length ? (
        <div className="dtb">
          <div className="drow h"><span>Dự án</span><span>Cột</span><span>Thay đổi</span></div>
          {list.slice(0, 40).map((c, k) => (
            <div className="drow" key={k}>
              <span className="ma">{c[0]}</span><span>{c[1]}</span>
              <span className="dchg">
                {c[2] === null || c[2] === '' ? <Empty /> : <span className="dold">{c[2]}</span>}
                <span className="dar">→</span>
                {c[3] === null || c[3] === '' ? <span className="dnew" style={{ background: 'var(--row)', color: 'var(--mut2)' }}>(trống)</span> : <span className="dnew">{c[3]}</span>}
              </span>
            </div>
          ))}
          {list.length > 40 && <div className="drow" style={{ color: 'var(--mut)' }}>… và {list.length - 40} ô khác</div>}
        </div>
      ) : <div style={{ fontSize: 12, color: 'var(--mut2)' }}>Không có thay đổi.</div>}
    </div>
  );
}

/** Các phiên bản đã chốt theo tuần, so sánh thay đổi giữa các bản. */
export function VersionsView() {
  const s = useAppState();
  const all = s.versions;
  const selKey = s.verSel || (all.length ? `${all[0].wk}|${all[0].v}` : null);
  const sel = all.find((v) => `${v.wk}|${v.v}` === selKey);
  const ch = changedSinceLock(s);
  const lc = lastCur(s);
  const canExport = !!(lc && ch && !ch.length);
  const openExport = () => setModal('export');

  let detail: React.ReactNode;
  if (!sel) detail = <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--mut)', fontSize: 12.5 }}>Chọn một phiên bản bên trái để xem chi tiết.</div>;
  else {
    const wk = WEEKS.find((w) => w.k === sel.wk)!;
    const prev = all.find((v) => v.wk === sel.wk && v.v === sel.v - 1);
    const changes: Change[] = sel.snap && prev && prev.snap ? diffSnap(s, prev.snap, sel.snap) : sel.changes || [];
    const after = sel === lc && ch ? ch : null;
    const st = sel.exported ? <span className="stpill ok">Đã xuất file</span>
      : wk.cur && sel === lc && ch && ch.length ? <span className="stpill w">Có thay đổi sau chốt</span> : <span className="stpill">Chưa xuất</span>;
    detail = (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="vhd">
          <span className="vbig">v{sel.v}</span>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{wk.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 1 }}>Bản chốt {sel === lc ? 'mới nhất' : 'số ' + sel.v} của tuần</div>
          </div>
          {st}
          {sel.exported && <button className="btn sm" onClick={() => reExport(`${sel.wk}|${sel.v}`)}>Tải lại file</button>}
          {wk.cur && sel === lc && ch && !ch.length && !sel.exported && <button className="btn sm pri" onClick={openExport}>Xuất từ bản này</button>}
        </div>
        <div className="mgrid">
          <div><div className="k">Người chốt</div><div className="v">{sel.by}</div></div>
          <div><div className="k">Thời điểm</div><div className="v">{sel.at}</div></div>
          <div><div className="k">Nội dung</div><div className="v">{sel.stats.rows} dự án</div><div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 1 }}>{sel.stats.ai} ô AI · {sel.stats.hand} ô sửa tay</div></div>
          <div><div className="k">File đã xuất</div><div className={'v' + (sel.exported ? ' mono' : '')} style={{ fontSize: sel.exported ? '11.5px' : '12.5px', ...(sel.exported ? {} : { color: 'var(--mut2)', fontWeight: 500 }) }}>{sel.exported || 'Chưa xuất'}</div></div>
        </div>
        {sel.note && <><div className="vnote">{sel.note}</div><div style={{ height: 12 }} /></>}
        {sel.v > 1 ? <ChangeTable list={changes} title={`Thay đổi so với v${sel.v - 1}`} />
          : <div className="dsec" style={{ borderTop: '1px solid var(--line2)', fontSize: 12, color: 'var(--mut)' }}>Bản đầu tiên của tuần — không có bản trước để so sánh.</div>}
        {after && after.length > 0 && <ChangeTable list={after} title="Đã đổi sau khi chốt" note="chưa vào bản nào" />}
      </div>
    );
  }

  return (
    <div className="gridwrap gut" style={{ paddingBlock: 18 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 3px' }}>Phiên bản đã chốt</h1>
          </div>
          <button className="btn pri" onClick={openExport}>{canExport ? `Xuất từ v${lc!.v}` : 'Chốt bản mới'}</button>
        </div>
        {lc && ch && ch.length > 0 && (
          <div className="card" style={{ padding: '10px 14px', marginBottom: 12, borderColor: 'var(--wrnLine)', background: 'var(--wrnBg)', fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 260px' }}><b>{ch.length} ô đã đổi sau khi chốt v{lc.v}.</b> Bản v{lc.v} vẫn giữ nguyên.</span>
            <button className="btn sm" onClick={openExport}>Chốt thành v{lc.v + 1}</button>
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <div className="card" style={{ flex: '1 1 270px', minWidth: 0, maxWidth: 340, padding: 4 }}>
            <div className="vtl">
              {WEEKS.filter((w) => !w.future).reverse().map((w) => {
                const vs: Version[] = all.filter((v) => v.wk === w.k);
                return (
                  <div key={w.k}>
                    <div className="vwk">{w.name}{w.cur && <span className="now">đang làm</span>}</div>
                    {!vs.length && <div className="vempty">Chưa chốt bản nào.{w.cur && <button className="btn sm" onClick={openExport}>Chốt bản đầu tiên</button>}</div>}
                    {vs.map((v, i) => {
                      const k = `${v.wk}|${v.v}`;
                      const dirty = w.cur && v === lc && ch && ch.length;
                      return (
                        <button key={k} className={'vnode' + (k === selKey ? ' on' : '') + (i === 0 ? ' first' : '') + (i === vs.length - 1 ? ' last' : '')} onClick={() => pickVersion(k)}>
                          <span className="vrail"><span className={'vdot' + (dirty ? ' dirty' : v.exported ? ' exp' : '')} /></span>
                          <span className="vnb">
                            <span className="vnt"><b>v{v.v}</b><span>{v.at}</span><span style={{ color: 'var(--mut)' }}>· {v.by}</span></span>
                            <span className="vnn">{v.note || 'Không có ghi chú'}</span>
                            {dirty ? <span className="vtag dirty" style={{ marginTop: 5 }}>{ch!.length} ô đổi sau chốt</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ flex: '2 1 440px', minWidth: 0 }}>{detail}</div>
        </div>
      </div>
    </div>
  );
}
