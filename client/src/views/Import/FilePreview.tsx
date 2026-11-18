import { useEffect, useMemo, useRef, useState } from 'react';
import { FileTypeIcon } from '@/components/common/Icons';
import { pvBytes, pvCol, pvNum, type PvSheet } from '@/lib/filePreview';
import { clearFile, markDone, setFullscreen, setSheet, usePv, type PvFile } from '@/store/preview';
import { useAppState } from '@/hooks/useDerived';
import { loadFile } from '@/store/actions/flow';

const Expand = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
);
const kindOf = (f: PvFile) => (f.kind ? f.kind === 'csv' : /^(csv|tsv|txt)$/.test(f.ext)) ? 'csv' : 'xls';

export function pvMeta(f: PvFile) {
  const p = [f.kind === 'csv' ? 'CSV' : `Excel (.${f.ext === 'xls' ? 'xls' : 'xlsx'})`];
  if (f.kind === 'csv' && f.enc) p.push(f.enc);
  if (f.kind === 'csv' && f.delim) p.push(f.delim);
  p.push(pvBytes(f.size));
  return p.join(' · ');
}
export const useCurSheet = (): PvSheet | null => {
  const f = usePv((s) => s.file); const k = usePv((s) => s.sheet);
  return f?.sheets ? f.sheets[Math.min(k, f.sheets.length - 1)] : null;
};

function Mini({ s }: { s: PvSheet }) {
  const R = Math.min(s.rows.length, 16); const C = Math.min(Math.max(s.nCols, 1), 9);
  return (
    <table style={{ width: 34 + C * 104 }}>
      <colgroup><col style={{ width: 34 }} />{Array.from({ length: C }, (_, j) => <col key={j} style={{ width: 104 }} />)}</colgroup>
      <tbody>
        <tr><th className="rn" />{Array.from({ length: C }, (_, j) => <th key={j}>{pvCol(j)}</th>)}</tr>
        {Array.from({ length: R }, (_, i) => (
          <tr key={i} className={i === 0 ? 'hr' : ''}><th className="rn">{i + 1}</th>
            {Array.from({ length: C }, (_, j) => <td key={j}>{String(s.rows[i][j] ?? '').slice(0, 40)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Thẻ xem trước ở cột phải. `post`: chỉ hiện khi file đã nạp xong. */
export function PreviewCard({ mode }: { mode: 'pre' | 'post' }) {
  const f = usePv((s) => s.file); const sheetIdx = usePv((s) => s.sheet); const s = useCurSheet();
  const loadedName = useAppState().fileName;
  if (mode === 'post' && !(f?.sheets && f.done && loadedName === f.name)) return null;
  if (!f) {
    return (
      <section className="pvc" aria-label="Xem trước file">
        <div className="pvhd"><span className="pvt">Xem trước file</span></div>
        <div className="pvempty"><div className="pvskel" aria-hidden="true">{Array.from({ length: 32 }, (_, k) => <i key={k} />)}</div>
          <p>Chọn hoặc kéo file vào ô bên trái, bảng dữ liệu sẽ hiện ở đây để bạn kiểm tra trước khi đọc.</p></div>
      </section>
    );
  }
  const head = <div className="pvhd"><FileTypeIcon kind={kindOf(f)} /><div className="pvfn"><b title={f.name}>{f.name}</b><small>{f.sheets ? pvMeta(f) : pvBytes(f.size)}</small></div>
    {s && <button className="pvfsb" onClick={() => setFullscreen(true)} aria-label="Xem toàn màn hình" title="Xem toàn màn hình"><Expand /></button>}</div>;
  if (f.loading) return <section className="pvc" aria-label="Xem trước file">{head}<div className="pvempty"><span className="spin" aria-hidden="true" /><p role="status">Đang đọc file để xem trước…</p></div></section>;
  if (f.err || !s) return <section className="pvc" aria-label="Xem trước file">{head}<div className="pvempty err"><p role="alert">{f.err}</p></div></section>;
  const many = f.sheets!.length > 1;
  return (
    <section className="pvc" aria-label="Xem trước file">
      {head}
      <div className="pvscreen" style={{ height: Math.min(200, Math.max(116, Math.round((Math.min(s.rows.length, 16) + 1) * 26 * 0.6) + 16)) }}>
        <div className="pvmini">{s.rows.length > 0 && <Mini s={s} />}</div>
        {!s.rows.length && <div className="pvempty" style={{ position: 'absolute', inset: 0 }}><p>Sheet này đang trống.</p></div>}
        <button className="pvhit" onClick={() => setFullscreen(true)} aria-label="Mở xem trước toàn màn hình"><span className="pvopen"><Expand />Toàn màn hình</span></button>
      </div>
      <div className="pvft"><span><b>{pvNum(s.nData)}</b> dòng · <b>{pvNum(s.nCols)}</b> cột</span><span className="pvsp" />
        {many && <select className="sel pvsel" value={sheetIdx} onChange={(e) => setSheet(+e.target.value)} aria-label="Chọn sheet">{f.sheets!.map((x, k) => <option key={k} value={k}>{x.name}</option>)}</select>}</div>
    </section>
  );
}

/** Khung kéo thả sau khi đã chọn file. */
export function StagedDrop({ onPick }: { onPick: (f: File) => void }) {
  const f = usePv((s) => s.file)!; const s = useCurSheet();
  const bad = !!f.err; const busy = f.loading;
  const stats = bad || busy || !s ? pvBytes(f.size) : `${pvBytes(f.size)} · ${pvNum(s.nData)} dòng · ${pvNum(s.nCols)} cột${f.sheets!.length > 1 ? ` · ${f.sheets!.length} sheet` : ''}`;
  return (
    <div className="drop imdrop pvstaged" id="dropzone">
      <div className="pvfile"><FileTypeIcon kind={kindOf(f)} /><div><b>{f.name}</b><small>{stats}</small></div></div>
      <div className={'imdt' + (bad ? ' pverr' : '')}>{bad ? 'Không đọc được file này' : busy ? 'Đang đọc…' : 'File đã sẵn sàng'}</div>
      <p className={'pvsub' + (bad ? ' pverr' : '')}>{busy ? 'Đang đọc file để xem trước…' : bad ? f.err : 'Xem nhanh bảng ở khung bên phải. Đúng file rồi thì bấm Đọc file này.'}</p>
      <div className="imbtns">
        <button className="btn pri imbig" disabled={bad || busy} onClick={() => { markDone(true); loadFile(f.name); }}>Đọc file này</button>
        <label className="btn imbig2" htmlFor="csv">Chọn file khác</label>
        <input id="csv" type="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
      </div>
      <button className="alink mut" onClick={clearFile}>Bỏ file này</button>
    </div>
  );
}

const RH = 24; const BUF = 20;

/** Toàn màn hình: lưới cuộn ảo (chỉ dựng dòng đang thấy), dòng 1 ghim, tìm trong sheet, phím mũi tên. */
export function PreviewFullscreen() {
  const f = usePv((s) => s.file)!; const sheetIdx = usePv((s) => s.sheet); const s = useCurSheet()!;
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [q, setQ] = useState(''); const [mi, setMi] = useState(0);
  const [top, setTop] = useState(0); const [vh, setVh] = useState(600);
  const grid = useRef<HTMLDivElement>(null); const root = useRef<HTMLDivElement>(null); const qRef = useRef<HTMLInputElement>(null);
  const C = Math.max(s.nCols, 1); const n = s.rows.length;

  const widths = useMemo(() => Array.from({ length: C }, (_, j) => {
    let len = 4;
    for (let i = 0; i < Math.min(n, 60); i++) { const v = s.rows[i][j]; if (v && v.length > len) len = Math.min(v.length, 44); }
    return Math.round(Math.min(300, Math.max(70, len * 6.8 + 22)));
  }), [s, C, n]);
  const total = 52 + widths.reduce((a, b) => a + b, 0);

  const matches = useMemo(() => {
    const out: Array<[number, number]> = []; const lq = q.toLowerCase();
    if (!lq) return out;
    for (let i = 0; i < n && out.length < 3000; i++) { const r = s.rows[i]; for (let j = 0; j < r.length; j++) if (r[j] && r[j].toLowerCase().includes(lq)) out.push([i, j]); }
    return out;
  }, [s, q, n]);
  const mset = useMemo(() => new Set(matches.map((m) => m[0] + ',' + m[1])), [matches]);
  const cur = matches[mi];

  const reveal = (r: number, c: number, center: boolean) => {
    const g = grid.current; if (!g) return; const t = r * RH;
    if (r > 0) {
      if (center) g.scrollTop = Math.max(0, t - g.clientHeight / 2);
      else if (t < g.scrollTop + 2 * RH) g.scrollTop = Math.max(0, t - 2 * RH);
      else if (t + RH > g.scrollTop + g.clientHeight) g.scrollTop = t + RH - g.clientHeight;
    }
    const x = 52 + widths.slice(0, c).reduce((a, b) => a + b, 0);
    if (center || x < g.scrollLeft + 52) g.scrollLeft = Math.max(0, x - (center ? g.clientWidth / 3 : 52));
    else if (x + widths[c] > g.scrollLeft + g.clientWidth) g.scrollLeft = x + widths[c] - g.clientWidth;
  };
  const jump = (k: number) => { if (!matches.length) return; const m = (k + matches.length) % matches.length; setMi(m); setSel(matches[m]); reveal(matches[m][0], matches[m][1], true); };
  useEffect(() => { setMi(0); if (matches[0]) { setSel(matches[0]); setTimeout(() => reveal(matches[0][0], matches[0][1], true)); } }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const g = grid.current; if (g) { g.scrollTop = 0; g.scrollLeft = 0; setTop(0); setSel(null); } }, [sheetIdx]);
  useEffect(() => { const g = grid.current; if (g) setVh(g.clientHeight); root.current?.querySelector<HTMLElement>('[data-close]')?.focus(); return () => { document.body.style.overflow = ''; }; }, []);
  useEffect(() => { document.body.style.overflow = 'hidden'; }, []);

  const move = (dr: number, dc: number) => {
    const [r0, c0] = sel || [0, 0]; const r = Math.max(0, Math.min(n - 1, r0 + dr)); const c = Math.max(0, Math.min(C - 1, c0 + dc));
    setSel([r, c]); reveal(r, c, false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setFullscreen(false); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); qRef.current?.focus(); qRef.current?.select(); return; }
    if (e.key === 'Tab') { // giữ focus trong khung
      const fo = Array.from(root.current!.querySelectorAll<HTMLElement>('button,input,select')).filter((x) => !(x as HTMLButtonElement).disabled);
      const first = fo[0], last = fo[fo.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    const t = e.target as HTMLElement;
    if (t === qRef.current) { if (e.key === 'Enter') { e.preventDefault(); jump(mi + (e.shiftKey ? -1 : 1)); } return; }
    if (t.tagName === 'BUTTON' || t.tagName === 'SELECT') return;
    const d = ({ ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, number[]>)[e.key];
    if (d) { e.preventDefault(); move(d[0], d[1]); }
  };

  const a = Math.max(1, Math.floor(top / RH) - BUF); const b = Math.min(n - 1, Math.ceil((top + vh) / RH) + BUF);
  const cell = (i: number) => (
    <tr key={i} className={i === 0 ? 'hr' : ''}><th className="rn">{i + 1}</th>
      {Array.from({ length: C }, (_, j) => {
        const k = i + ',' + j; let cls = '';
        if (mset.has(k)) cls = cur && cur[0] === i && cur[1] === j ? 'cur' : 'm';
        if (sel && sel[0] === i && sel[1] === j) cls += ' pcs';
        return <td key={j} className={cls.trim() || undefined} onClick={() => setSel([i, j])}>{s.rows[i][j] ?? ''}</td>;
      })}</tr>
  );
  const sv = sel ? s.rows[sel[0]]?.[sel[1]] ?? '' : null;
  const idx: number[] = []; for (let i = a; i <= b; i++) idx.push(i);

  return (
    <div id="pvfs" ref={root} role="dialog" aria-modal="true" aria-label={'Xem trước file ' + f.name} onKeyDown={onKey}>
      <div className="pvf-top"><FileTypeIcon kind={kindOf(f)} />
        <div className="pvf-name"><b title={f.name}>{f.name}</b><small>{pvMeta(f) + (f.sheets!.length > 1 ? ` · ${f.sheets!.length} sheet` : '')}</small></div>
        <div className="pvf-find"><input ref={qRef} type="search" placeholder="Tìm trong sheet" aria-label="Tìm trong file" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          <span className="pvf-cnt" aria-live="polite">{!q ? '' : matches.length ? `${mi + 1}/${pvNum(matches.length)}` : 'Không có'}</span>
          <button className="pvf-ib" onClick={() => jump(mi - 1)} aria-label="Kết quả trước" title="Trước (Shift+Enter)">↑</button>
          <button className="pvf-ib" onClick={() => jump(mi + 1)} aria-label="Kết quả sau" title="Sau (Enter)">↓</button></div>
        <button className="btn" data-close onClick={() => setFullscreen(false)}>Đóng <kbd>Esc</kbd></button></div>
      <div className="pvf-bar"><div className="pvf-addr">{sel ? pvCol(sel[1]) + (sel[0] + 1) : '—'}</div>
        <div className={'pvf-val' + (!sv ? ' ph' : '')}>{sv === null ? 'Bấm vào một ô để xem đầy đủ nội dung' : sv === '' ? '(ô trống)' : sv}</div></div>
      <div className="pvf-grid" ref={grid} onScroll={(e) => { setTop(e.currentTarget.scrollTop); setVh(e.currentTarget.clientHeight); }}>
        {!n ? <div className="pvempty" style={{ height: '100%' }}><p>Sheet này đang trống.</p></div> : (
          <table style={{ width: total }}>
            <colgroup><col style={{ width: 52 }} />{widths.map((w, j) => <col key={j} style={{ width: w }} />)}</colgroup>
            <thead><tr><th className="cn" />{widths.map((_, j) => <th key={j} className="cl">{pvCol(j)}</th>)}</tr></thead>
            <tbody>
              {cell(0)}
              {a > 1 && <tr className="sp" style={{ height: (a - 1) * RH }}><td colSpan={C + 1} /></tr>}
              {idx.map(cell)}
              {b < n - 1 && <tr className="sp" style={{ height: (n - 1 - b) * RH }}><td colSpan={C + 1} /></tr>}
            </tbody>
          </table>)}
      </div>
      <div className="pvf-foot">
        {f.sheets!.length > 1 ? f.sheets!.map((x, k) => <button key={k} className={'pvtab' + (k === sheetIdx ? ' on' : '')} aria-pressed={k === sheetIdx} onClick={() => setSheet(k)}>{x.name}</button>) : <span className="pvtab on st">{s.name}</span>}
        <span className="pvsp" /><span className="pvst">{pvNum(s.nData)} dòng dữ liệu · {pvNum(s.nCols)} cột · dòng 1 là tiêu đề</span></div>
    </div>
  );
}
