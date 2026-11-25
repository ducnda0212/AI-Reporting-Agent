/* Bảng 49 cột (prototype grid() L3783 + gridDecorate L10274 + UX pass 3 grpLate L10101 + "N ô cần sửa →" L3847 / fixCells L9599).
   Header 2 tầng màu nhóm, dòng nhóm (số chậm, fixGo), cột ghim (ô tick, Mã DA, Công việc), tay kéo cao dòng.
   Mọi thao tác chuột của ô đi qua một bộ xử lý chung trên .gridwrap (như data-act của prototype). */
import { useEffect, useRef, type MouseEvent } from 'react';
import { FIELDS, GROUPS, GRP } from '@/data/constants';
import { cellValue, ck, fieldById } from '@/lib/cell';
import { headerWidth, needsFix, scopeHas, selKeys, sortRows, tplColor, visibleFields } from '@/lib/grid';
import { rowsOf, useAppState } from '@/store';
import { setView } from '@/store/actions/flow';
import { poOpen } from '@/store/actions/popout';
import {
  ctxOpen, fixCells, fixGo, fltOpen, grpSel, gridRows, pkCanPick, pkOpen, rowSelAll, scrollDone, selectCell, startEdit, svflashClear,
  toggleCol, toggleGroup, toggleRowSel
} from '@/store/actions/grid';
import { measureText } from '@/hooks/useGridResize';
import type { AgStageItem, AppState, Field, FieldId, Row } from '@/types';
import { SrcIcon } from '@/components/common/Icons';
import { Cell } from './Cell';

const EYE_OFF = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5" /><path d="M6.3 6.3C4.3 7.6 2.8 9.6 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;
const FLT_IC = <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 4h18l-7 8.5V20l-4-2v-5.5z" /></svg>;

/* (6) Vòng góp ý 7: mở rộng cột vừa đủ đọc hết tên cột và chữ "Chọn …" — đo một lần bằng canvas, chỉ trong trình duyệt */
let FIT: Record<string, number> | null = null;
function baseWidth(f: Field): number {
  if (!FIT && typeof document !== 'undefined') { const m: Record<string, number> = {}; FIELDS.forEach((x) => { m[x.id] = headerWidth(x, measureText); }); FIT = m; }
  return FIT ? FIT[f.id] : f.w;
}
/** Độ rộng cột đang dùng: kéo tay / vừa nội dung (`gx.colW`) rồi mới tới mặc định. */
export const colWidth = (s: Pick<AppState, 'gx'>, f: Field): number => s.gx.colW[f.id] ?? baseWidth(f);

function grpLate(all: Row[], s: AppState): JSX.Element | null {
  const td = fieldById('td')!, n = all.filter((r) => /Chậm/.test(String(cellValue(r, td, s) || ''))).length;
  return n ? <span className="glate">{n + ' chậm tiến độ'}</span> : null;
}

/* cuộn bảng để ô nằm giữa vùng nhìn thấy (trừ cột ghim, đầu cột và khung tìm) — prototype scrollToHit L6765 */
function scrollerOf(el: HTMLElement, axis: 'x' | 'y'): Element {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n), ov = axis === 'y' ? cs.overflowY : cs.overflowX;
    if (/(auto|scroll)/.test(ov) && (axis === 'y' ? n.scrollHeight > n.clientHeight + 1 : n.scrollWidth > n.clientWidth + 1)) return n;
  }
  return document.scrollingElement || document.documentElement;
}
function scrollToHit(gw: HTMLElement, el: HTMLElement, quiet: boolean): void {
  const sx = scrollerOf(el, 'x'), sy = scrollerOf(el, 'y'), X = sx.getBoundingClientRect();
  const Y = sy === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : sy.getBoundingClientRect(), c = el.getBoundingClientRect();
  let left = X.left, right = X.right;
  gw.querySelectorAll('thead tr:last-child th.key, thead tr:last-child th.key2, thead tr:last-child th.ckc').forEach((p) => { left = Math.max(left, p.getBoundingClientRect().right); });
  const head = gw.querySelector('thead'), hb = head ? head.getBoundingClientRect().bottom : Y.top;
  const top = Math.max(Y.top, Math.min(hb, Y.top + 120)), bottom = Math.min(Y.bottom, window.innerHeight - 30);
  const fc = document.getElementById('findc');
  if (fc) { const f = fc.getBoundingClientRect(); if (f.left < right && f.left > left + 260) right = f.left - 8; }
  if (c.left < left || c.right > right) sx.scrollLeft += c.left + c.width / 2 - (left + right) / 2;
  if (c.top < top || c.bottom > bottom) sy.scrollTop += c.top + c.height / 2 - (top + bottom) / 2;
  if (!quiet) { el.classList.remove('fflash'); void el.offsetWidth; el.classList.add('fflash'); }
}

/* bộ xử lý chuột chung (data-act của prototype) */
function onGridClick(e: MouseEvent<HTMLDivElement>): void {
  const t = e.target as HTMLElement, lk = t.closest<HTMLElement>('.malink');
  if (lk) { e.preventDefault(); poOpen(+lk.dataset.poi!); return; }
  const el = t.closest<HTMLElement>('[data-act]'); if (!el) return;
  const { act, i, f, g } = el.dataset, fid = f as FieldId;
  if (act === 'cell' || act === 'cellPick') {
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && pkOpen(+i!, fid)) return;
    selectCell(+i!, fid, e.shiftKey);
  } else if (act === 'fixGo') { e.preventDefault(); e.stopPropagation(); fixGo(g!); }
  else if (act === 'grp') toggleGroup(g!);
  else if (act === 'fltOpen') fltOpen(fid);
  else if (act === 'hideCol') toggleCol(fid, true);
}
function onGridDblClick(e: MouseEvent<HTMLDivElement>): void {
  const c = (e.target as HTMLElement).closest<HTMLElement>('[data-act="cell"]');
  if (c && !pkCanPick(c.dataset.f as FieldId)) startEdit(+c.dataset.i!, c.dataset.f as FieldId);
}
function onGridContext(e: MouseEvent<HTMLDivElement>): void {
  const c = (e.target as HTMLElement).closest<HTMLElement>('[data-i][data-f]'); if (!c) return;
  e.preventDefault();
  ctxOpen(e.clientX, e.clientY, +c.dataset.i!, c.dataset.f as FieldId);
}

/** Ô tick một phần: `.indeterminate` chỉ đặt được bằng DOM (prototype L5694). */
const ind = (on: boolean) => (el: HTMLInputElement | null): void => { if (el) el.indeterminate = on; };

export function Grid(): JSX.Element {
  const s = useAppState((x) => x), wrapRef = useRef<HTMLDivElement>(null);

  /* ô vừa sửa nháy xanh rồi xoá dấu; cuộn tới ô sau khi tìm / di chuyển / "N ô cần sửa"; chiều cao hàng nhóm cột cho đầu cột dính */
  useEffect(() => { if (!s.svflash.length) return; const t = setTimeout(svflashClear, 1200); return () => clearTimeout(t); }, [s.svflash]);
  useEffect(() => {
    if (!s.findScroll && !s.navScroll && !s.scrollSel) return;
    const gw = wrapRef.current, el = s.sel && gw ? gw.querySelector<HTMLElement>('[data-i="' + s.sel.i + '"][data-f="' + s.sel.f + '"]') : null;
    if (gw && el) {
      if (s.scrollSel) el.scrollIntoView({ block: 'nearest', inline: 'center' });
      else scrollToHit(gw, el, !s.findScroll);
    }
    scrollDone();
  }, [s.sel, s.findScroll, s.navScroll, s.scrollSel]);
  useEffect(() => {
    const gw = wrapRef.current, band = gw && gw.querySelector('thead tr:first-child');
    if (gw && band) gw.style.setProperty('--bandH', band.getBoundingClientRect().height + 'px');
  }, [s.loaded, s.gx.zoom]);

  if (!s.loaded) {
    return (
      <div className="gridwrap gut" style={{ paddingBlock: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Chưa có dữ liệu cho Tuần 3/11</div>
        <div style={{ fontSize: 12.5, color: 'var(--mut)', margin: '6px 0 14px' }}>Nhập file CSV export từ Jira để dựng bảng 49 cột theo mẫu.</div>
        <button className="btn pri" data-act="view" data-v="import" onClick={() => setView('import')}>Tới bước Nhập file</button>
      </div>
    );
  }

  const rows = rowsOf(s), list = gridRows(s), vf = visibleFields(s.hidden), F = s.find;
  const stick = (f: Field): string => (f.key ? 'key' : f.id === 'viec' && s.pinViec ? 'key2' : '');
  const findQ = F.open && F.q.trim() ? F.q : null;

  /* hàng nhóm cột, giống dòng 1 của file mẫu (khối tuần gộp ô) */
  const bands: { g: Field['grp']; n: number; w: number }[] = [];
  vf.forEach((f) => { const last = bands[bands.length - 1]; if (last && last.g === f.grp) { last.n++; last.w += colWidth(s, f); } else bands.push({ g: f.grp, n: 1, w: colWidth(s, f) }); });
  const bandLeft = 40 + 92 + (s.pinViec ? 215 : 0) + 10;

  /* thứ tự dòng (theo nhóm, đã sắp xếp), vùng chọn, ô Agent đang đề xuất */
  const groups = GROUPS.map((g) => ({ g, gr: sortRows(list.filter((r) => r.g === g.k), s.sort, s) })).filter((x) => x.gr.length);
  const order: number[] = [];
  groups.forEach((x) => { if (!s.collapsed[x.g.k]) x.gr.forEach((r) => order.push(r.i)); });
  const picked = new Set(s.range ? selKeys(s.sel, s.range, order, vf.map((f) => f.id)) : []);
  const pend: Record<string, AgStageItem> = {};
  Object.values(s.stages).forEach((S) => { if (S.st === 'open') S.items.forEach((x) => { if (!x.off) pend[ck(x.i, x.f)] = x; }); });
  const pulse = s.fxTip ? ck(s.fxTip.i, s.fxTip.f) : '';

  const visRows = list.filter((r) => !s.collapsed[r.g]), nSel = visRows.filter((r) => s.rowSel[r.i]).length;
  const nHidden = FIELDS.length - vf.length;

  return (
    <div className="gridwrap" ref={wrapRef} onClick={onGridClick} onDoubleClick={onGridDblClick} onContextMenu={onGridContext}>
      <table style={s.gx.zoom === 100 ? undefined : { zoom: s.gx.zoom / 100 }}>
        <thead>
          <tr>
            <th className="gh ckc" />
            {bands.map((b, k) => {
              const wk = /^w\d$/.test(b.g);
              return (
                <th key={k} colSpan={b.n} className={'gh' + (b.g === 'pin' ? ' key' : '')}
                  style={{ ...(b.g === 'pin' ? { width: b.w, minWidth: b.w, maxWidth: 'none' } : {}), ...(wk ? { background: 'var(--tW)', color: 'var(--ink)' } : {}), ...(b.g === 'w3' ? { boxShadow: 'inset 0 3px 0 var(--accent)' } : {}) }}>
                  {b.g === 'pin' ? GRP[b.g] : <span style={{ position: 'sticky', left: bandLeft }}>{GRP[b.g]}</span>}
                </th>
              );
            })}
          </tr>
          <tr>
            <th className="ckc">
              <label title="Chọn tất cả dự án đang hiện">
                <input type="checkbox" data-act="rowSelAll" aria-label="Chọn tất cả dự án" checked={!!visRows.length && nSel === visRows.length} data-ind={nSel && nSel < visRows.length ? '1' : undefined} ref={ind(!!nSel && nSel < visRows.length)} onChange={rowSelAll} />
              </label>
            </th>
            {vf.map((f) => {
              const w = colWidth(s, f), sorted = s.sort && s.sort.f === f.id;
              return (
                <th key={f.id} style={{ width: w, minWidth: w, maxWidth: w, background: tplColor(f) }} className={stick(f) || undefined}>
                  <div className="thw">
                    <button className="hd" data-f={f.id} title={f.name + ' · nguồn: ' + f.src}>
                      <span className="fname"><span style={{ color: 'var(--mut2)', font: '500 10px var(--mono)' }}>{f.col}</span>{f.name}{sorted && <> <span style={{ color: 'var(--accentDk)' }}>{s.sort!.dir === 'asc' ? '↑' : '↓'}</span></>}</span>
                      <span className="fsrc"><SrcIcon f={f} /></span>
                    </button>
                    <button className={'fltb' + (s.colFilter[f.id] || sorted ? ' on' : '')} data-act="fltOpen" data-f={f.id} title={'Lọc / sắp xếp cột ' + f.name} aria-label={'Lọc cột ' + f.name}>{FLT_IC}</button>
                    {!f.key && <button className="hide" data-act="hideCol" data-f={f.id} title="Ẩn cột" aria-label={'Ẩn cột ' + f.name}>{EYE_OFF}</button>}
                    {!stick(f) && <span className="colrz" data-rz={f.id} title="Kéo để đổi độ rộng · nhấp đúp để vừa nội dung" />}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.length ? groups.map(({ g, gr }) => {
            const all = rows.filter((r) => r.g === g.k), fix = all.filter((r) => needsFix(r, s)).length, open = !s.collapsed[g.k];
            const gSel = gr.filter((r) => s.rowSel[r.i]).length;
            return [
              <tr key={g.k} className="grp">
                <td className="ckc">
                  <label title="Chọn cả nhóm"><input type="checkbox" data-act="grpSel" data-g={g.k} aria-label={'Chọn cả nhóm ' + g.k} checked={gSel === gr.length} data-ind={gSel && gSel < gr.length ? '1' : undefined} ref={ind(!!gSel && gSel < gr.length)} onChange={() => grpSel(g.k)} /></label>
                </td>
                <td colSpan={vf.length}>
                  <button className="grpbtn" data-act="grp" data-g={g.k} aria-expanded={open}>
                    <span>{open ? '▾' : '▸'}</span><span>{g.name}</span>
                    <span style={{ fontWeight: 400, color: 'var(--mut)' }}>{all.length + ' dự án'}</span>{grpLate(all, s)}
                    <span style={{ fontWeight: 400, color: 'var(--mut)' }}>
                      {fix > 0 && <> · <span className="fixgo" role="link" tabIndex={0} data-act="fixGo" data-g={g.k} title="Tới ô cần sửa đầu tiên · bấm tiếp để sang ô kế">
                        {(fixCells(s, g.k).length || fix) + ' ô cần sửa' + (fix > 1 ? ' · ' + fix + ' dòng' : '') + ' →'}
                      </span></>}
                    </span>
                  </button>
                </td>
              </tr>,
              ...(open ? gr.map((r) => {
                const rs = !!s.rowSel[r.i], hh = s.gx.rowH[r.i];
                return (
                  <tr key={r.i} className={[rs && 'rsel', hh && 'rhset'].filter(Boolean).join(' ') || undefined} style={hh ? { height: hh } : undefined}>
                    <td className="ckc">
                      <label title={'Chọn dự án ' + r.ma}><input type="checkbox" data-act="rowSel" data-i={r.i} aria-label={'Chọn dự án ' + r.ma} checked={rs} onChange={() => toggleRowSel(r.i)} /></label>
                      <span className="rowrz" data-rowi={r.i} title="Kéo để đổi chiều cao dòng · nhấp đúp để về mặc định" />
                    </td>
                    {vf.map((f) => {
                      const key = ck(r.i, f.id), isSel = !!s.sel && s.sel.i === r.i && s.sel.f === f.id;
                      return (
                        <Cell key={f.id} r={r} f={f} w={colWidth(s, f)} pb={s.phaseBucket} stick={stick(f)} sel={isSel} rng={!isSel && picked.has(key)}
                          findQ={findQ} findCs={F.cs} findWhole={F.whole} inScope={!!findQ && scopeHas(f, F, s.sel?.f)}
                          fmt={s.fmt[key]} wrap={!!s.wrap[key]} touched={!!s.touched[key]} pend={pend[key]} flash={s.svflash.includes(key)} pulse={pulse === key} />
                      );
                    })}
                  </tr>
                );
              }) : [])
            ];
          }) : (
            <tr><td colSpan={vf.length + 1} style={{ padding: 26, textAlign: 'center', color: 'var(--mut)' }}>Không có dòng nào khớp bộ lọc.</td></tr>
          )}
        </tbody>
      </table>
      <div style={{ padding: '12px 16px', fontSize: 11.5, color: 'var(--mut2)' }}>
        {'Đang hiện ' + vf.length + '/49 cột của mẫu 20261111_DAN_Mau-bao-cao-PMO.xlsx' + (nHidden ? ' (' + nHidden + ' cột đang ẩn)' : '') + ' · ' + rows.length + ' dự án'}
      </div>
    </div>
  );
}
