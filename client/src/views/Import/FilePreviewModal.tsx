/* Xem trước file toàn màn hình #pvfs (prototype pvOpen/pvFsDraw/pvFsGrid/pvFind… L8564-8770): lưới cuộn ảo, dòng 1 ghim,
   thanh công thức chỉ đọc #pvaddr / #pvval, tìm trong sheet #pvq, chuyển sheet. Vị trí chọn & tìm là trạng thái cục bộ của khung. */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKey } from 'react';
import { pvBytes, pvCol, pvNum } from '@/lib/xlsx';
import { useAppState } from '@/store';
import { pvSetFs, pvSetSheet } from '@/store/actions/flow';
import type { PreviewSheet } from '@/types';
import { FileIcon, IcClose } from '@/components/common/Icons';

const RH = 24, BUF = 20, CAP = 3000;
type Cell = [r: number, c: number];

function findAll(sh: PreviewSheet, q: string): { list: Cell[]; capped: boolean } {
  const list: Cell[] = [], lq = q.toLowerCase();
  if (!q) return { list, capped: false };
  for (let i = 0; i < sh.rows.length; i++) {
    const r = sh.rows[i];
    for (let j = 0; j < r.length; j++) {
      if (r[j] && String(r[j]).toLowerCase().includes(lq)) { list.push([i, j]); if (list.length >= CAP) return { list, capped: true }; }
    }
  }
  return { list, capped: false };
}

export function FilePreviewModal(): JSX.Element | null {
  const open = useAppState((s) => s.pvFs), f = useAppState((s) => s.pv), sheet = useAppState((s) => s.pvSheet);
  if (!open || !f || !f.sheets) return null;
  const k = Math.min(sheet, f.sheets.length - 1);
  return <PvFs name={f.name} kind={f.kind === 'csv' ? 'csv' : 'xls'} size={f.size} sheets={f.sheets} k={k} />;
}

function PvFs({ name, kind, size, sheets, k }: { name: string; kind: 'csv' | 'xls'; size: number; sheets: PreviewSheet[]; k: number }): JSX.Element {
  const sh = sheets[k], C = Math.max(sh.nCols, 1), many = sheets.length > 1;
  const [sel, setSel] = useState<Cell | null>(null);
  const [q, setQ] = useState('');
  const [mi, setMi] = useState(-1);
  const [top, setTop] = useState(0);
  const grid = useRef<HTMLDivElement>(null), root = useRef<HTMLDivElement>(null), qIn = useRef<HTMLInputElement>(null);
  const reveal = useRef<{ r: number; c: number; center: boolean } | null>(null), timer = useRef(0);
  const found = useMemo(() => findAll(sh, q), [sh, q]);
  const hit = useMemo(() => new Set(found.list.map(([r, c]) => r + ',' + c)), [found]);
  const widths = useMemo(() => Array.from({ length: C }, (_x, j) => {
    let len = 4;
    for (let i = 0; i < Math.min(sh.rows.length, 60); i++) { const v = sh.rows[i][j]; if (v !== undefined && String(v).length > len) len = Math.min(String(v).length, 44); }
    return Math.round(Math.min(300, Math.max(70, len * 6.8 + 22)));
  }), [sh, C]);

  const close = (): void => {
    pvSetFs(false);
    setTimeout(() => { const b = document.querySelector<HTMLElement>('.pvhit') || document.querySelector<HTMLElement>('.pvfsb'); b?.focus(); }, 0);
  };
  const goCell = (r: number, c: number, center: boolean): void => { setSel([r, c]); reveal.current = { r, c, center }; };
  const runFind = (v: string): void => {
    const res = findAll(sh, v);
    setQ(v); setMi(res.list.length ? 0 : -1);
    if (res.list.length) goCell(res.list[0][0], res.list[0][1], true);
  };
  const jump = (d: 1 | -1): void => {
    const L = found.list; if (!L.length) return;
    const n = (mi + d + L.length) % L.length;
    setMi(n); goCell(L[n][0], L[n][1], true);
  };
  const move = (dr: number, dc: number): void => {
    const [r0, c0] = sel || [0, 0];
    goCell(Math.max(0, Math.min(sh.rows.length - 1, r0 + dr)), Math.max(0, Math.min(C - 1, c0 + dc)), false);
  };

  /* mở: khoá cuộn trang, focus nút Đóng */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    root.current?.querySelector<HTMLElement>('.pvf-close')?.focus();
    return () => { document.body.style.overflow = ''; clearTimeout(timer.current); };
  }, []);
  /* đổi sheet: về đầu sheet, tìm lại theo chữ đang gõ */
  const shown = useRef(k);
  useEffect(() => {
    if (shown.current === k) return;
    shown.current = k;
    if (grid.current) { grid.current.scrollTop = 0; grid.current.scrollLeft = 0; }
    setTop(0); setSel(null); runFind(q);
  });
  /* đưa ô đang chọn vào vùng nhìn thấy */
  useEffect(() => {
    const R = reveal.current, g = grid.current;
    if (!R || !g) return;
    reveal.current = null;
    const t = R.r * RH, headH = 2 * RH;
    if (R.r > 0) {
      if (R.center) g.scrollTop = Math.max(0, t - g.clientHeight / 2);
      else if (t < g.scrollTop + headH) g.scrollTop = Math.max(0, t - headH);
      else if (t + RH > g.scrollTop + g.clientHeight) g.scrollTop = t + RH - g.clientHeight;
    }
    setTop(g.scrollTop);
    const td = g.querySelector<HTMLElement>('td[data-r="' + R.r + '"][data-c="' + R.c + '"]');
    if (td) {
      const left = td.offsetLeft;
      if (R.center || left < g.scrollLeft + 52) g.scrollLeft = Math.max(0, left - (R.center ? g.clientWidth / 3 : 52));
      else if (left + td.offsetWidth > g.scrollLeft + g.clientWidth) g.scrollLeft = left + td.offsetWidth - g.clientWidth;
    }
  });

  const onKey = (ev: RKey<HTMLDivElement>): void => {
    const key = ev.key, t = ev.target as HTMLElement, inp = t.id === 'pvq';
    if (key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); return close(); }
    if ((ev.ctrlKey || ev.metaKey) && key.toLowerCase() === 'f') { ev.preventDefault(); qIn.current?.focus(); qIn.current?.select(); return; }
    if (key === 'Tab') { /* giữ focus trong khung toàn màn hình */
      const fo = Array.from(root.current!.querySelectorAll<HTMLElement>('button,input,select')).filter((x) => !(x as HTMLButtonElement).disabled);
      const first = fo[0], last = fo[fo.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
      return;
    }
    if (inp) {
      if (key === 'Enter') { ev.preventDefault(); clearTimeout(timer.current); const v = (t as HTMLInputElement).value; if (v !== q) runFind(v); else jump(ev.shiftKey ? -1 : 1); }
      return;
    }
    if (t.tagName === 'BUTTON' || t.tagName === 'SELECT') return;
    const d = ({ ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, [number, number]>)[key];
    if (d) { ev.preventDefault(); move(d[0], d[1]); }
  };

  /* cửa sổ dòng đang dựng (dòng 0 luôn có) */
  const n = sh.rows.length, vh = grid.current?.clientHeight || 600;
  const a = Math.max(1, Math.floor(top / RH) - BUF), b = Math.min(n - 1, Math.ceil((top + vh) / RH) + BUF);
  const cur = found.list[mi];
  const row = (i: number): JSX.Element => (
    <tr key={i} className={i === 0 ? 'hr' : undefined}>
      <th className="rn">{i + 1}</th>
      {Array.from({ length: C }, (_x, j) => {
        let cls = hit.has(i + ',' + j) ? (cur && cur[0] === i && cur[1] === j ? 'cur' : 'm') : '';
        if (sel && sel[0] === i && sel[1] === j) cls += ' pcs';
        return <td key={j} data-r={i} data-c={j} className={cls.trim() || undefined} onClick={() => setSel([i, j])}>{sh.rows[i][j] ?? ''}</td>;
      })}
    </tr>
  );
  const sv = sel ? sh.rows[sel[0]]?.[sel[1]] ?? '' : null;
  const meta = pvBytes(size) + (many ? ' · ' + sheets.length + ' sheet' : '');
  return (
    <div id="pvfs" ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label={'Xem trước file ' + name} onKeyDown={onKey}>
      <div className="pvf-top">
        <FileIcon kind={kind} />
        <div className="pvf-name"><b title={name}>{name}</b><small>{meta}</small></div>
        <div className="pvf-find">
          <input id="pvq" ref={qIn} type="search" placeholder="Tìm trong sheet" aria-label="Tìm trong file" autoComplete="off" defaultValue={q}
            onChange={(e) => { const v = e.target.value; clearTimeout(timer.current); timer.current = window.setTimeout(() => runFind(v), 160); }} />
          <span className="pvf-cnt" id="pvcnt" aria-live="polite">{!q ? '' : found.list.length ? mi + 1 + '/' + pvNum(found.list.length) + (found.capped ? '+' : '') : 'Không có'}</span>
          <button className="pvf-ib" onClick={() => jump(-1)} aria-label="Kết quả trước" title="Kết quả trước (Shift+Enter)">↑ Trước</button>
          <button className="pvf-ib" onClick={() => jump(1)} aria-label="Kết quả sau" title="Kết quả sau (Enter)">Sau ↓</button>
        </div>
        <button className="btn pri pvf-close" onClick={close}><IcClose />Đóng <kbd>Esc</kbd></button>
      </div>
      <div className="pvf-bar">
        <div className="pvf-addr" id="pvaddr">{sel ? pvCol(sel[1]) + (sel[0] + 1) : '—'}</div>
        <div className={'pvf-val' + (sv ? '' : ' ph')} id="pvval">{sv === null ? 'Bấm vào một ô để xem đầy đủ nội dung' : sv === '' ? '(ô trống)' : sv}</div>
      </div>
      <div className="pvf-grid" id="pvgrid" ref={grid} onScroll={(e) => {
        const g = e.currentTarget, t0 = g.scrollTop / RH, t1 = (g.scrollTop + g.clientHeight) / RH;
        if ((t0 - a < 6 && a > 1) || (b - t1 < 6 && b < n - 1)) setTop(g.scrollTop);
      }}>
        {!n ? <div className="pvempty" style={{ height: '100%' }}><p>Sheet này đang trống.</p></div> : (
          <table style={{ width: 52 + widths.reduce((x, y) => x + y, 0) }}>
            <colgroup><col style={{ width: 52 }} />{widths.map((w, j) => <col key={j} style={{ width: w }} />)}</colgroup>
            <thead><tr><th className="cn" />{widths.map((_w, j) => <th key={j} className="cl">{pvCol(j)}</th>)}</tr></thead>
            <tbody>
              {row(0)}
              {a > 1 && <tr className="sp" style={{ height: (a - 1) * RH }}><td colSpan={C + 1} /></tr>}
              {Array.from({ length: Math.max(0, b - a + 1) }, (_x, j) => row(a + j))}
              {b < n - 1 && <tr className="sp" style={{ height: (n - 1 - b) * RH }}><td colSpan={C + 1} /></tr>}
            </tbody>
          </table>
        )}
      </div>
      <div className="pvf-foot" id="pvfoot">
        {many ? sheets.map((x, j) => <button key={j} className={'pvtab' + (j === k ? ' on' : '')} onClick={() => pvSetSheet(j)} aria-pressed={j === k}>{x.name}</button>)
          : <span className="pvtab on st">{sh.name}</span>}
        <span className="pvsp" /><span className="pvst">{pvNum(sh.nData) + ' dòng dữ liệu · ' + pvNum(sh.nCols) + ' cột · dòng 1 là tiêu đề'}</span>
      </div>
    </div>
  );
}
