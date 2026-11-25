/* Bước 1 · Nhập file (prototype viewImport L4611 → impPreA L11205 / impLoadA L7898 + R16 / impPostA L7560 + R5, impStats L9228 + vòng 6,
   impRecent L11597, impSaved L9712, pvCard L8518, pvDropStaged R28 L11217). Ba trạng thái: trước khi nạp, đang đọc, đã nạp. */
import { useMemo, type ChangeEvent, type DragEvent } from 'react';
import demoData from '@/data/demo.json';
import { FIELDS, NO_JIRA } from '@/data/constants';
import { displayText, fieldById } from '@/lib/cell';
import { pvBytes, pvCol, pvNum } from '@/lib/xlsx';
import { now, rowsOf, useAppState } from '@/store';
import {
  baseRows, FILE_STATS, goStep, histToggle, impCancel, loadFile, GOLD_FILE, pvGo, pvSetFs, pvSetSheet, pvStage, setImpF, setReplaceFile
} from '@/store/actions/flow';
import { verOpen, wkName } from '@/store/actions/versions';
import type { AppState, Field, PreviewFile, PreviewSheet, Row } from '@/types';
import { FileIcon, IcExpand, IcStroke, IcUpload } from '@/components/common/Icons';
import { FilePreviewModal } from './FilePreviewModal';

const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,.xls';
const p2 = (n: number): string => String(n).padStart(2, '0');
const fileKind = (f: PreviewFile): 'csv' | 'xls' => (f.kind ? (f.kind === 'csv' ? 'csv' : 'xls') : /^(csv|tsv|txt)$/.test(f.ext) ? 'csv' : 'xls');
/** Số issue trong file: file thật lấy theo thống kê file, dữ liệu giả lập đếm dòng + 2 issue lẻ + 1 issue thiếu mã (prototype realSet). */
const issuesOf = (s: AppState): number => (s.realOnly ? FILE_STATS.issues : s.allRows.filter((r) => !r.isNew).length + 3);
const orphansOf = (s: AppState): number => (s.realOnly ? demoData.gold.orphans.length : 1);

function onPick(e: ChangeEvent<HTMLInputElement>): void {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (f) void pvStage(f);
}
const FileInput = (): JSX.Element => <input id="csv" type="file" accept={ACCEPT} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={onPick} />;

/* ô kéo thả: thả file vào thì xem trước */
const dz = {
  onDragOver: (e: DragEvent<HTMLDivElement>): void => { e.preventDefault(); e.currentTarget.classList.add('over'); },
  onDragLeave: (e: DragEvent<HTMLDivElement>): void => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.classList.remove('over'); },
  onDrop: (e: DragEvent<HTMLDivElement>): void => { e.preventDefault(); e.currentTarget.classList.remove('over'); void pvStage(e.dataTransfer?.files?.[0]); }
};

function Drop({ s }: { s: AppState }): JSX.Element {
  const f = s.pv;
  if (f && !f.done) {
    const bad = !!f.err, busy = f.loading;
    return (
      <div className="drop imdrop pvstaged" id="dropzone" {...dz}>
        <div className="pvfile"><FileIcon kind={fileKind(f)} /><div><b>{f.name}</b><small>{pvBytes(f.size)}</small></div></div>
        {bad && <p className="pvsub pverr">{f.err}</p>}
        <div className="imbtns">
          <button className="btn pri imbig" onClick={pvGo} disabled={bad || busy}>{busy ? 'Đang mở…' : 'Đọc file này'}</button>
          <label className="btn imbig2" htmlFor="csv">Chọn file khác</label><FileInput />
        </div>
      </div>
    );
  }
  return (
    <div className="drop imdrop" id="dropzone" {...dz}>
      <div className="imup2"><IcUpload /></div>
      <div className="imdt">Kéo file CSV hoặc Excel export từ Jira vào đây</div>
      <div className="imbtns">
        <label className="btn pri imbig" htmlFor="csv">Chọn file CSV / Excel</label><FileInput />
        <button className="btn imbig2" onClick={() => loadFile(GOLD_FILE)}>{s.loaded ? 'Nạp lại dữ liệu mẫu' : 'Dùng dữ liệu mẫu'}</button>
      </div>
    </div>
  );
}

function PvMini({ sh }: { sh: PreviewSheet }): JSX.Element {
  const R = Math.min(sh.rows.length, 60), C = Math.min(Math.max(sh.nCols, 1), 14), cs = Array.from({ length: C }, (_x, j) => j);
  return (
    <table style={{ width: 34 + C * 104 }}>
      <colgroup><col style={{ width: 34 }} />{cs.map((j) => <col key={j} style={{ width: 104 }} />)}</colgroup>
      <tbody>
        <tr><th className="rn" />{cs.map((j) => <th key={j}>{pvCol(j)}</th>)}</tr>
        {sh.rows.slice(0, R).map((row, i) => (
          <tr key={i} className={i === 0 ? 'hr' : undefined}><th className="rn">{i + 1}</th>{cs.map((j) => <td key={j}>{String(row[j] ?? '').slice(0, 40)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Khung xem trước file đang chọn (pvCard 'pre'); chưa chọn file thì không hiện gì. */
function PvCard({ s }: { s: AppState }): JSX.Element | null {
  const f = s.pv;
  if (!f) return null;
  const head = (fs: boolean): JSX.Element => (
    <div className="pvhd"><FileIcon kind={f.kind === 'csv' ? 'csv' : 'xls'} /><div className="pvfn"><b title={f.name}>{f.name}</b><small>{pvBytes(f.size)}</small></div>
      {fs && <button className="pvfsb" onClick={() => pvSetFs(true)} aria-label="Xem toàn màn hình" title="Xem toàn màn hình"><IcExpand /></button>}</div>
  );
  if (f.loading) return <section className="pvc" aria-label="Xem trước file">{head(false)}<div className="pvempty"><span className="spin" aria-hidden="true" /><p role="status">Đang đọc file để xem trước…</p></div></section>;
  if (f.err || !f.sheets) return <section className="pvc" aria-label="Xem trước file">{head(false)}<div className="pvempty err"><p role="alert">{f.err}</p></div></section>;
  const k = Math.min(s.pvSheet, f.sheets.length - 1), sh = f.sheets[k];
  return (
    <section className="pvc" aria-label="Xem trước file">
      {head(true)}
      <div className="pvscreen" style={{ height: Math.min(200, Math.max(116, Math.round((Math.min(sh.rows.length, 16) + 1) * 26 * 0.6) + 16)) }}>
        <div className="pvmini">{sh.rows.length ? <PvMini sh={sh} /> : null}</div>
        {!sh.rows.length && <div className="pvempty" style={{ position: 'absolute', inset: 0 }}><p>Sheet này đang trống.</p></div>}
        <button className="pvhit" onClick={() => pvSetFs(true)} aria-label="Mở xem trước toàn màn hình"><span className="pvopen"><IcExpand />Toàn màn hình</span></button>
      </div>
      <div className="pvft">
        <span><b>{pvNum(sh.nData)}</b> dòng · <b>{pvNum(sh.nCols)}</b> cột</span><span className="pvsp" />
        {f.sheets.length > 1 && (
          <select className="sel pvsel" aria-label="Chọn sheet" value={k} onChange={(e) => pvSetSheet(+e.target.value)}>
            {f.sheets.map((x, j) => <option key={j} value={j}>{x.name}</option>)}
          </select>
        )}
      </div>
    </section>
  );
}

function Recent({ s }: { s: AppState }): JSX.Element {
  const L = s.impHist[0], mine = s.versions.filter((v) => v.snap && v.mine).slice(0, 3);
  return (
    <>
      <h2 className="ah2">Lần nhập gần nhất</h2>
      <div className="alast"><FileIcon kind="csv" /><div><b title={L.name}>{L.name}</b></div></div>
      <button className="alink" onClick={() => loadFile(L.name)}>Nhập lại file này</button>
      {s.impHist.length > 1 && <button className="alink mut" onClick={histToggle} aria-expanded={s.histOpen}>{(s.histOpen ? 'Ẩn' : 'Xem') + ' ' + (s.impHist.length - 1) + ' file cũ hơn'}</button>}
      {s.histOpen && s.impHist.slice(1).map((x) => <button key={x.name} className="anx" onClick={() => loadFile(x.name)}><span>{x.name}</span><span className="an">{x.at.split(' ')[0]}</span></button>)}
      {mine.length > 0 && (
        <div className="imsaved"><span className="imsl">Bản đã lưu trên hệ thống</span>
          {mine.map((v) => (
            <button key={v.wk + v.v} className="imsv" onClick={() => verOpen(v.wk + '|' + v.v)}><b>{'v' + v.v}</b><span>{wkName(v.wk, true) + ' · chốt ' + v.at + ' · ' + v.by}</span><em>Mở →</em></button>
          ))}
        </div>
      )}
    </>
  );
}

function PreLoad({ s }: { s: AppState }): JSX.Element {
  return (
    <div className="gridwrap gut aimp"><div className="awrap"><div className="acols">
      <div className="aleft">
        <h1 className="ah1">{s.replaceFile ? 'Thay file Jira' : 'Nhập file Jira'}</h1>
        <Drop s={s} />
        {s.replaceFile && <button className="alink back" onClick={() => setReplaceFile(false)}>{'Giữ file đang dùng: ' + s.fileName}</button>}
        <PvCard s={s} />
      </div>
      <aside className="aright"><Recent s={s} /></aside>
    </div></div></div>
  );
}

/* màn Đang đọc: các bước dọc có kết quả, bên phải hiện dần những gì đã tìm thấy */
function Loading({ s, nPrj }: { s: AppState; nPrj: number }): JSX.Element {
  const st = s.importing!.step, name = s.importing!.name, t = now();
  const nIss = issuesOf(s), nCol = FILE_STATS.cols, nOrph = orphansOf(s), g = FILE_STATS.dupGroups;
  const S: [string, string][] = [
    ['Đọc file và nhận diện cột', nCol + ' cột, ' + nIss + ' issue'],
    ['Gộp các cột trùng tên', g + ' nhóm cột đã gộp'],
    ['Tách mã dự án, ghép vào mẫu 49 cột', nPrj + ' dự án ghép được' + (nOrph ? ', ' + nOrph + ' issue chưa có mã' : '')],
    ['So với tuần trước và cấu hình đã lưu', 'Không có mã mới']
  ];
  const pct = Math.round(((st + 0.5) / S.length) * 100);
  const found: [string, number, number, string?][] = [['Issue trong file', nIss, 0], ['Cột Jira', nCol, 0], ['Nhóm cột trùng đã gộp', g, 1], ['Dự án ghép vào mẫu', nPrj, 2], ['Issue chưa có Mã DA', nOrph, 2, 'e'], ['Mã mới so với tuần trước', 0, 3, 'w']];
  return (
    <div className="gridwrap gut aimp"><div className="awrap"><div className="acols">
      <div className="aleft">
        <div className="lfile"><FileIcon kind={/\.xlsx?$/i.test(name) ? 'xls' : 'csv'} /><div><b>{name}</b><small>{'Nhập lúc ' + p2(t.getHours()) + ':' + p2(t.getMinutes())}</small></div></div>
        <h1 className="ah1">Đang đọc file Jira</h1>
        <p className="asub">Chỉ mất vài giây. Xong sẽ tự chuyển sang phần tóm tắt.</p>
        <div className="lbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Tiến độ đọc file"><i style={{ width: pct + '%' }} /></div>
        <ol className="lsteps" aria-live="polite">
          {S.map((x, k) => (
            <li key={k} className={'lst ' + (k < st ? 'ok' : k === st ? 'now' : '')}>
              <span className="ldot">{k < st
                ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                : k === st ? <span className="spin sm" aria-hidden="true" /> : k + 1}</span>
              <div className="ltx"><b>{x[0]}</b><small>{k < st ? x[1] : k === st ? 'Đang xử lý…' : 'Chờ'}</small></div>
            </li>
          ))}
        </ol>
        <button className="btn" onClick={impCancel}>Huỷ, chọn file khác</button>
      </div>
      <aside className="aright">
        <h2 className="ah2">Đã tìm thấy</h2>
        <ul className="lfound">{found.map((f) => <li key={f[0]} className={'lf' + (st > f[2] ? ' in' : '')}><span>{f[0]}</span>{st > f[2] ? <b className={f[3] || ''}>{f[1]}</b> : <i className="skel" aria-hidden="true" />}</li>)}</ul>
        <p className="lnote">Phần tóm tắt và các việc cần xử lý sẽ hiện ngay sau khi đọc xong.</p>
      </aside>
    </div></div></div>
  );
}

/* ---------- đã nạp: tóm tắt file + bảng 42 cột có nguồn Jira (ẩn 7 cột NO_JIRA) ---------- */
const IS_SEM: Record<string, string> = { 'Đúng tiến độ': 'sg', 'Đã hoàn thành': 'sd', 'Đang thực hiện': 'sb', 'Chậm tiến độ': 'slt', 'Tạm dừng': 'sa', 'Chưa thực hiện': 'sn', 'Hủy': 'sx', 'Huỷ': 'sx', '(trống)': 'sx' };
const isc = (label: string, k: number): string => IS_SEM[label.normalize('NFC')] || 'c' + (k % 5);
const IS_KIND: Record<string, string> = { jira: 'Jira', bucket: 'Jira', report: 'Jira', cfg: 'Jira', ai: 'AI', manual: 'Nhập tay', calc: 'Tính', past: 'Đã chốt', future: 'Tuần sau', none: 'Trống', tpl: 'Mẫu' };
const isSrcTxt = (f: Field): string => String(f.src || '').replace(/^Hệ thống\s*(·\s*)?/, '').replace(/^\((.*)\)\s*/, '$1 ').replace(/^nhập tay\s*(·\s*)?/i, '').trim();
const COLS = FIELDS.filter((f) => !NO_JIRA.includes(f.id));
const FILE_COLS: readonly string[] = demoData.gold.cols;
/* số cột của file được dùng (Summary cho khoá ghép) */
const USED = FIELDS.map((f) => (f.key ? 'Summary' : f.src)).filter((c, i, A) => FILE_COLS.includes(c) && A.indexOf(c) === i).length;

function Source({ f }: { f: Field }): JSX.Element {
  if (f.key) return <span title="Summary">Summary</span>;
  if (f.kind === 'jira' || f.kind === 'bucket') return <><span className="isk jira">Jira</span><span title={f.src} className={/chưa có/.test(f.src) ? 'isn' : undefined}>{f.src}</span></>;
  return <><span className={'isk ' + (f.kind === 'cfg' ? 'jira' : f.kind)}>{IS_KIND[f.kind] || ''}</span><span title={f.src}>{isSrcTxt(f)}</span></>;
}

function Dist({ title, fid, rows, s }: { title: string; fid: 'tt' | 'td'; rows: Row[]; s: AppState }): JSX.Element {
  const m: Record<string, number> = {}, f = fieldById(fid)!;
  rows.forEach((r) => { const t = displayText(r, f, s) || '(trống)'; m[t] = (m[t] || 0) + 1; });
  const d = Object.entries(m).sort((a, b) => b[1] - a[1]);
  return (
    <div className="is3d"><span className="is3l">{title}</span>
      <div className="isbar">{d.map(([l, n], k) => <span key={l} className={'isg ' + isc(l, k)} style={{ flex: n }} title={l + ': ' + n} />)}</div>
      <div className="isleg">{d.map(([l, n], k) => <span key={l} title={l}><i className={isc(l, k)} />{l}<b>{n}</b></span>)}</div>
    </div>
  );
}

function ImpStats({ s }: { s: AppState }): JSX.Element {
  const rows = rowsOf(s), n = rows.length, F = s.impF;
  const info = COLS.map((f) => {
    const vals = rows.map((r) => displayText(r, f, s)).filter(Boolean);
    return { f, k: vals.length, smp: [...new Set(vals.map((v) => v.replace(/\s+/g, ' ')))].slice(0, 2) };
  });
  const full = info.filter((x) => x.k === n).length, low = info.length - full;
  const pic = rows.filter((r) => displayText(r, fieldById('pic')!, s)).length;
  const pills: [AppState['impF'], string, number][] = [['all', 'Tất cả', COLS.length], ['full', 'Đủ dữ liệu', full], ['low', 'Thiếu dữ liệu', low]];
  const list = info.filter((x) => F === 'all' || (F === 'full' ? x.k === n : x.k < n));
  return (
    <div className="isum">
      <div className="iscard is3">
        <div className="is3n"><span className="is3l">Issue</span><b>{issuesOf(s)}</b><small>{'Dùng ' + USED + ' trong ' + FILE_STATS.cols + ' cột của file'}</small></div>
        <div className="is3n"><span className="is3l">Dự án</span><b>{n}</b><small>{new Set(rows.map((r) => r.g)).size + ' nhóm · ' + pic + ' có PIC'}</small></div>
        <Dist title="Trạng thái" fid="tt" rows={rows} s={s} /><Dist title="Tiến độ" fid="td" rows={rows} s={s} />
      </div>
      <div className="iscard">
        <div className="ish"><div><b>Các cột trong mẫu báo cáo</b><span>{COLS.length + ' cột · lấy từ đâu, kèm giá trị mẫu'}</span></div>
          <div className="ispills">{pills.map(([k, l, c]) => <button key={k} className={'ispill' + (F === k ? ' on' : '')} onClick={() => setImpF(k)}>{l}<em>{c}</em></button>)}</div>
        </div>
        <div className="isr ishd"><span>Nguồn</span><span /><span>Cột trong báo cáo</span><span>Giá trị mẫu</span><span>Có giá trị</span></div>
        {list.length ? list.map(({ f, k, smp }) => {
          const pct = n ? Math.round((k / n) * 100) : 0;
          return (
            <div key={f.id} className={'isr' + (!k ? ' z' : '')}>
              <div className="isfrom"><span className="isjira"><IcStroke d="jira" size={14} /></span><Source f={f} /></div>
              <span className="isarr"><IcStroke d="arrow" size={14} /></span>
              <div className="isto"><span className="iscl">{f.col}</span><b>{f.name}</b></div>
              <div className="issmp">{smp.length ? smp.map((v) => <span key={v} title={v}>{v}</span>) : <span className="isn">Không có giá trị nào trong file</span>}</div>
              <div className="ispc"><span className="ispb"><i style={{ width: pct + '%' }} className={pct === 100 ? '' : pct ? 'lo' : ''} /></span><span>{k + '/' + n}</span></div>
            </div>
          );
        }) : <div className="isempty">Không có trường nào trong nhóm này</div>}
      </div>
    </div>
  );
}

function PostLoad({ s }: { s: AppState }): JSX.Element {
  const xl = /\.xlsx?$/i.test(s.fileName || GOLD_FILE);
  return (
    <div className="gridwrap gut aimp"><div className="awrap">
      <div className="ahead">
        <span className={'aico' + (xl ? ' xl' : '')} aria-hidden="true">{xl ? 'XLSX' : 'CSV'}</span>
        <div className="ahm"><h1 className="ah1">{s.fileName || GOLD_FILE}</h1></div>
        <button className="btn" onClick={() => setReplaceFile(true)}>Thay file khác</button>
        <button className="btn pri" onClick={() => goStep(3)}>Mở bảng báo cáo</button>
      </div>
      <ImpStats s={s} />
    </div></div>
  );
}

export function ImportView(): JSX.Element {
  const s = useAppState((x) => x);
  /* lần nhập đầu: số dự án sẽ ghép được lấy từ dữ liệu của file (bảng chưa có) */
  const first = !!s.importing && !s.loaded;
  const firstPrj = useMemo(() => (first ? rowsOf({ allRows: baseRows(), newCodes: 'added', dupMerged: true, realOnly: true }).length : 0), [first]);
  if (s.importing) return <Loading s={s} nPrj={first ? firstPrj : rowsOf(s).length} />;
  if (!s.loaded || s.replaceFile) return <><PreLoad s={s} /><FilePreviewModal /></>;
  return <PostLoad s={s} />;
}
