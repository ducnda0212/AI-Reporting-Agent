import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Field, Row } from '@/types';
import type { AppState } from '@/store/types';
import { GRP, GROUPS } from '@/data/constants';
import { kindShort, tplColor, visibleFields } from '@/lib/cell';
import { needsFix } from '@/lib/selectors';
import { selKeys, sortRows, visibleList } from '@/lib/grid';
import { useAppState, useRows } from '@/hooks/useDerived';
import { useColResize } from '@/hooks/useColResize';
import { setPop, setView } from '@/store/actions/flow';
import { scrollToCell } from '@/lib/scroll';
import * as G from '@/store/actions/grid';
import { EyeOff, FilterIcon } from '../common/Icons';
import { Cell } from './Cell';

const stickOf = (s: AppState, f: Field) => (f.key ? 'key' : f.id === 'task' && s.pinTask ? 'key2' : '');

/** Checkbox có trạng thái "một phần". */
function Check({ checked, indeterminate, onChange, label, title }: { checked: boolean; indeterminate: boolean; onChange: () => void; label: string; title: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <label title={title}><input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} /></label>;
}

function Head({ s, vf, visRows }: { s: AppState; vf: Field[]; visRows: Row[] }) {
  const startResize = useColResize();
  const bands: Array<{ g: Field['grp']; n: number; w: number }> = [];
  vf.forEach((f) => {
    const last = bands[bands.length - 1];
    if (last && last.g === f.grp) { last.n++; last.w += f.w; } else bands.push({ g: f.grp, n: 1, w: f.w });
  });
  const nSel = visRows.filter((r) => s.rowSel[r.i]).length;
  return (
    <thead>
      <tr>
        <th className="gh ckc" />
        {bands.map((b, k) => {
          const wk = /^w\d$/.test(b.g);
          const st: React.CSSProperties = {
            ...(b.g === 'pin' ? { width: b.w, minWidth: b.w, maxWidth: 'none' } : {}),
            ...(wk ? { background: 'var(--tW)', color: 'var(--ink)' } : {}),
            ...(b.g === 'w3' ? { boxShadow: 'inset 0 3px 0 var(--accent)' } : {}),
          };
          return (
            <th key={k} colSpan={b.n} className={'gh' + (b.g === 'pin' ? ' key' : '')} style={st}>
              {b.g === 'pin' ? GRP[b.g] : <span style={{ position: 'sticky', left: 40 + 92 + (s.pinTask ? 215 : 0) + 10 }}>{GRP[b.g]}</span>}
            </th>
          );
        })}
      </tr>
      <tr>
        <th className="ckc"><Check checked={visRows.length > 0 && nSel === visRows.length} indeterminate={nSel > 0 && nSel < visRows.length} onChange={G.selAllRows} label="Chọn tất cả dự án" title="Chọn tất cả dự án đang hiện" /></th>
        {vf.map((f) => {
          const un = f.src === '— chưa gán —';
          const sc = stickOf(s, f);
          const sorted = s.sort && s.sort.f === f.id;
          return (
            <th key={f.id} className={sc || undefined} style={{ width: f.w, minWidth: f.w, maxWidth: f.w, background: un ? 'var(--errBg)' : tplColor(f) }}>
              <div className="thw">
                <button className="hd" onClick={() => setPop(f.id)} title={`${f.name} · nguồn: ${f.src}`}>
                  <span className="fname">
                    <span style={{ color: 'var(--mut2)', font: '500 10px var(--mono)' }}>{f.col}</span>{f.name}
                    {sorted && <span style={{ color: 'var(--accentDk)' }}> {s.sort!.dir > 0 ? '↑' : '↓'}</span>}
                  </span>
                  <span className="fsrc" style={un ? { color: 'var(--err)' } : undefined}>{un ? 'chưa khớp' : kindShort(f)}</span>
                </button>
                <button className={'fltb' + (s.colFilter[f.id] || sorted ? ' on' : '')} data-flt={f.id} onClick={() => G.openFilter(f.id)} title={`Lọc / sắp xếp cột ${f.name}`} aria-label={`Lọc cột ${f.name}`}><FilterIcon /></button>
                {!f.key && <button className="hide" onClick={() => G.hideCol(f.id)} title="Ẩn cột" aria-label={`Ẩn cột ${f.name}`}><EyeOff /></button>}
                {!sc && <span className="colrz" onMouseDown={(e) => startResize(e, f.id)} onDoubleClick={() => G.autofitCol(f.id)} title="Kéo để đổi độ rộng · nhấp đúp để vừa nội dung" />}
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function Grid() {
  const s = useAppState();
  const rows = useRows();
  const wrapRef = useRef<HTMLDivElement>(null);
  /* chiều cao hàng nhóm cột — hàng tiêu đề thứ hai dính ngay bên dưới */
  useLayoutEffect(() => {
    const band = wrapRef.current?.querySelector('thead tr:first-child');
    if (band) wrapRef.current!.style.setProperty('--bandH', band.getBoundingClientRect().height + 'px');
  });
  /* cuộn tới ô theo yêu cầu của action (di chuyển bằng phím, tìm kiếm, nhảy tới địa chỉ) */
  const req = s.scrollReq;
  useEffect(() => {
    if (!req) return;
    const id = requestAnimationFrame(() => { scrollToCell(req.i, req.f, !req.flash); G.clearScrollReq(); });
    return () => cancelAnimationFrame(id);
  }, [req]);
  if (!s.loaded) {
    return (
      <div className="gridwrap gut" style={{ paddingBlock: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Chưa có dữ liệu cho Tuần 3/11</div>
        <div style={{ fontSize: 12.5, color: 'var(--mut)', margin: '6px 0 14px' }}>Nhập file CSV export từ Jira để dựng bảng 49 cột theo mẫu.</div>
        <button className="btn pri" onClick={() => setView('import')}>Tới bước Nhập file</button>
      </div>
    );
  }
  const vf = visibleFields(s);
  const list = visibleList(s, rows);
  const visRows = list.filter((r) => !s.collapsed[r.g]);
  const picked: Record<string, number> = {};
  selKeys(s).forEach((x) => { picked[x] = 1; });
  const nHidden = s.fields.length - vf.length;

  const body: React.ReactNode[] = [];
  GROUPS.forEach((g) => {
    const gr = sortRows(s, list.filter((r) => r.g === g.k));
    if (!gr.length) return;
    const all = rows.filter((r) => r.g === g.k);
    const pct = Math.round((all.reduce((n, r) => n + r.done / r.total, 0) / all.length) * 100);
    const fix = all.filter((r) => needsFix(s, r)).length;
    const open = !s.collapsed[g.k];
    const gSel = gr.filter((r) => s.rowSel[r.i]).length;
    body.push(
      <tr className="grp" key={'g' + g.k}>
        <td className="ckc"><Check checked={gSel === gr.length} indeterminate={gSel > 0 && gSel < gr.length} onChange={() => G.selGroup(g.k)} label={`Chọn cả nhóm ${g.k}`} title="Chọn cả nhóm" /></td>
        <td colSpan={vf.length}>
          <button className="grpbtn" onClick={() => G.toggleGroup(g.k)} aria-expanded={open}>
            <span>{open ? '▾' : '▸'}</span><span>{g.name}</span>
            <span style={{ fontWeight: 400, color: 'var(--mut)' }}>{all.length} dự án</span>
            <span className="gbar" title="Tiến độ trung bình theo 12 bước AI Lifecycle"><i style={{ width: pct + '%' }} /></span>
            <span style={{ fontWeight: 400, color: 'var(--mut)' }}>{pct} %{fix ? <> · <span style={{ color: 'var(--wrn)' }}>{fix} dòng cần sửa</span></> : null}</span>
          </button>
        </td>
      </tr>,
    );
    if (!open) return;
    gr.forEach((r) => {
      const rs = !!s.rowSel[r.i];
      body.push(
        <tr key={r.i} className={rs ? 'rsel' : undefined}>
          <td className="ckc"><Check checked={rs} indeterminate={false} onChange={() => G.toggleRowSel(r.i)} label={`Chọn dự án ${r.code}`} title={`Chọn dự án ${r.code}`} /></td>
          {vf.map((f) => <Cell key={f.id} s={s} r={r} f={f} stick={stickOf(s, f)} picked={picked} />)}
        </tr>,
      );
    });
  });
  if (!body.length) body.push(<tr key="none"><td colSpan={vf.length + 1} style={{ padding: 26, textAlign: 'center', color: 'var(--mut)' }}>Không có dòng nào khớp bộ lọc.</td></tr>);

  return (
    <div className="gridwrap" ref={wrapRef}>
      <table>
        <Head s={s} vf={vf} visRows={visRows} />
        <tbody>{body}</tbody>
      </table>
      <div style={{ padding: '12px 16px', fontSize: 11.5, color: 'var(--mut2)' }}>
        Đang hiện {vf.length}/49 cột của mẫu 20261111_DAN_Mau-bao-cao-PMO.xlsx{nHidden ? ` (${nHidden} cột đang ẩn)` : ''} · {rows.length} dự án
      </div>
    </div>
  );
}
