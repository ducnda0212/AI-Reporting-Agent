/* Bước 1 · Nhập file: dữ liệu thật từ máy chủ (upload, lịch sử, mở lại phiên) + cấu hình mapping (mpBar) và đổi nguồn cột (mapQuick).
   Ba trạng thái: trước khi nạp, đang đọc, đã nạp. */
import { type ChangeEvent, type DragEvent } from 'react';
import { FIELDS } from '@/data/constants';
import { displayText, fieldById } from '@/lib/cell';
import { importFound, importResults } from '@/lib/importSteps';
import { pvBytes, pvCol, pvNum } from '@/lib/xlsx';
import { inBrowser, now, rowsOf, useAppState } from '@/store';
import {
  goStep, histToggle, IMPORT_STEPS, impCancel, mpCloneProfile, mpCurrent, mpDeleteProfile, mpPick, mpQuickChange, mpSaveNew, mpSaveOpen,
  mpSetDefault, mpUpdateProfile, pvGo, pvSetFs, pvSetSheet, pvStage, reopenSession, setImpF, setReplaceFile, skipImportWait, srcBase
} from '@/store/actions/flow';
import { verOpen, wkName } from '@/store/actions/versions';
import type { AppState, Field, FieldId, PreviewFile, PreviewSheet, Row } from '@/types';
import { FileIcon, IcExpand, IcStroke, IcUpload } from '@/components/common/Icons';
import { FilePreviewModal } from './FilePreviewModal';

const SYSTEM_MAPPING_ID = 'map_default_pmo_49col';
const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xlsm,.xls';
const p2 = (n: number): string => String(n).padStart(2, '0');
const fileKind = (f: PreviewFile): 'csv' | 'xls' => (f.kind ? (f.kind === 'csv' ? 'csv' : 'xls') : /^(csv|tsv|txt)$/.test(f.ext) ? 'csv' : 'xls');

/** Ghi chú nhỏ cạnh ô chọn nguồn: cột có quy tắc tách / tính riêng chỉ chạy khi giữ nguồn mặc định. */
const FIELD_NOTE: Partial<Record<FieldId, string>> = {
  mang: 'Tự lấy theo mã DA trong danh mục mẫu',
  ma: 'Tách mã DA ở đầu cột, dùng ghép dòng',
  viec: 'Tên việc sau mã DA',
  muctieu: 'Phần trước mục MILESTONE',
  milestone: 'Phần sau mục MILESTONE',
  tt1: 'Tự tính từ Trạng thái, Tiến độ, Hạn',
  ...Object.fromEntries(['w1ht', 'w1kh', 'w1vd', 'w2ht', 'w2kh', 'w2vd', 'ht', 'kh', 'vd', 'w4ht', 'w4kh', 'w4vd'].map((f) => [f, 'Tách theo tuần từ Progress Report']))
};

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
        {s.importErr && <p className="pvsub pverr" role="alert">{s.importErr}</p>}
        <div className="imbtns">
          <button className="btn pri imbig" onClick={pvGo} disabled={bad || busy || s.busy}>{busy ? 'Đang mở…' : s.busy ? 'Đang đọc…' : 'Đọc file này'}</button>
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

/** "Lần nhập gần nhất": lịch sử thật từ máy chủ; mở lại một phiên không cần tải file lên lần nữa. */
function Recent({ s }: { s: AppState }): JSX.Element {
  const L = s.impHist[0], mine = s.versions.filter((v) => v.snap && v.mine).slice(0, 3);
  return (
    <>
      <h2 className="ah2">Lần nhập gần nhất</h2>
      {L ? (
        <>
          <div className="alast"><FileIcon kind="csv" /><div><b title={L.name}>{L.name}</b></div></div>
          <button className="alink" disabled={s.busy} onClick={() => void reopenSession(L.session_id)}>Nhập lại file này</button>
        </>
      ) : <p className="asub">Chưa có lần nhập nào.</p>}
      {s.impHist.length > 1 && <button className="alink mut" onClick={histToggle} aria-expanded={s.histOpen}>{(s.histOpen ? 'Ẩn' : 'Xem') + ' ' + (s.impHist.length - 1) + ' file cũ hơn'}</button>}
      {s.histOpen && s.impHist.slice(1).map((x) => <button key={x.session_id} className="anx" disabled={s.busy} onClick={() => void reopenSession(x.session_id)}><span title={x.name}>{x.name}</span><span className="an">{x.at.split(' ')[0]}</span></button>)}
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

/* màn Đang đọc: các bước dọc chạy trong lúc máy chủ xử lý, bước cuối giữ tới khi có kết quả */
function Loading({ s }: { s: AppState }): JSX.Element {
  const st = s.importing!.step, name = s.importing!.name, found = s.importing!.found, t = now();
  const pct = Math.min(100, Math.round(((st + 0.5) / IMPORT_STEPS.length) * 100));
  const res = found ? importResults(found) : null;
  return (
    <div className="gridwrap gut aimp"><div className="awrap"><div className="acols">
      <div className="aleft">
        <div className="lfile"><FileIcon kind={/\.xls[xm]?$/i.test(name) ? 'xls' : 'csv'} /><div><b>{name}</b><small>{'Nhập lúc ' + p2(t.getHours()) + ':' + p2(t.getMinutes())}</small></div></div>
        <h1 className="ah1">Đang đọc file Jira</h1>
        <p className="asub">Chỉ mất vài giây. Xong sẽ tự chuyển sang phần tóm tắt.</p>
        <div className="lbar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Tiến độ đọc file"><i style={{ width: pct + '%' }} /></div>
        <ol className="lsteps" aria-live="polite">
          {IMPORT_STEPS.map((x, k) => (
            <li key={k} className={'lst ' + (k < st ? 'ok' : k === st ? 'now' : '')}>
              <span className="ldot">{k < st
                ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                : k === st ? <span className="spin sm" aria-hidden="true" /> : k + 1}</span>
              <div className="ltx"><b>{x}</b><small>{k < st ? (res ? res[k] : '') : k === st ? 'Đang xử lý…' : 'Chờ'}</small></div>
            </li>
          ))}
        </ol>
        {found && <button className="btn pri" onClick={skipImportWait}>Xem tóm tắt ngay</button>}
        <button className="btn" onClick={impCancel}>Huỷ, chọn file khác</button>
      </div>
      <aside className="aright">
        <h2 className="ah2">Đã tìm thấy</h2>
        <ul className="lfound">{(found ? importFound(found) : []).map((r) => {
          const ok = st > r.step;
          return <li key={r.label} className={'lf' + (ok ? ' in' : '')}><span>{r.label}</span>{ok ? <b className={r.cls}>{r.value}</b> : <i className="skel" aria-hidden="true" />}</li>;
        })}{!found && ['Issue trong file', 'Cột Jira', 'Nhóm cột trùng đã gộp', 'Dự án ghép vào mẫu', 'Issue chưa có Mã DA', 'Mã mới so với tuần trước'].map((l) => <li key={l} className="lf"><span>{l}</span><i className="skel" aria-hidden="true" /></li>)}</ul>
        <p className="lnote">Phần tóm tắt và các việc cần xử lý sẽ hiện ngay sau khi đọc xong.</p>
      </aside>
    </div></div></div>
  );
}

/* ---------- đã nạp: tóm tắt file + bảng 49 cột (nguồn Jira đổi được ở các cột mappable) ---------- */
const IS_SEM: Record<string, string> = { 'Đúng tiến độ': 'sg', 'Đã hoàn thành': 'sd', 'Đang thực hiện': 'sb', 'Chậm tiến độ': 'slt', 'Có rủi ro': 'slt', 'Tạm dừng': 'sa', 'Chưa thực hiện': 'sn', 'Hủy': 'sx', 'Huỷ': 'sx', '(trống)': 'sx' };
const isc = (label: string, k: number): string => IS_SEM[label.normalize('NFC')] || 'c' + (k % 5);
/** mapQuick: chọn cột Jira làm nguồn cho một cột báo cáo; chọn xong máy chủ tính lại ngay từ file gốc. */
function SrcPick({ f, s }: { f: Field; s: AppState }): JSX.Element {
  const value = s.mpSrc[f.id] ?? srcBase(s, f.id), note = FIELD_NOTE[f.id];
  return (
    <>
      <span className="isk jira">Jira</span>
      <select className="sel issel" value={value} disabled={s.busy} aria-label={'Chọn trường Jira cho cột ' + f.name} title={note} onChange={(e) => void mpQuickChange(f.id, e.target.value)}>
        <option value="">Không lấy từ Jira</option>
        {s.fileCols.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {note && <small className="isnote">{note}</small>}
    </>
  );
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

/** Thanh cấu hình mapping: chọn / cập nhật / lưu mới / nhân bản / đặt mặc định / xoá (API /mappings). */
function MpBar({ s }: { s: AppState }): JSX.Element {
  const cur = mpCurrent(s), a = s.applied, L = s.mappings;
  const save = (): void => { if (inBrowser()) void mpSaveNew((document.getElementById('mpName') as HTMLInputElement | null)?.value || ''); };
  return (
    <div className="mpbar" data-stop="1"><span className="mpl">Cấu hình mapping</span>
      <select className="sel mpsel" aria-label="Chọn cấu hình mapping" value={s.mpUsed || L.find((m) => m.is_default)?.id || ''} disabled={s.busy} onChange={(e) => void mpPick(e.target.value)}>
        {!L.length && <option value="">Chưa có cấu hình đã lưu</option>}
        {L.map((m) => <option key={m.id} value={m.id}>{m.name + (m.is_default ? ' · mặc định' : '')}</option>)}
      </select>
      {a && <span className={'mpst ' + (a.matched_cols === a.total_cols && !s.mpDirty ? 'ok' : 'w')}>{(a.matched_cols === a.total_cols && !s.mpDirty ? '✓ khớp ' : 'khớp ') + a.matched_cols + '/' + a.total_cols + ' cột' + (s.mpDirty ? ' · đã sửa, chưa lưu' : '')}</span>}
      {s.mpSave ? (
        <>
          <input className="inp mpname" id="mpName" placeholder="Tên cấu hình, vd: Jira PMO chuẩn" defaultValue="" />
          <button className="btn sm pri" disabled={s.busy} onClick={save}>Lưu</button>
          <button className="btn sm" onClick={() => mpSaveOpen(false)}>Huỷ</button>
        </>
      ) : (
        <>
          <span className="v2sp" />
          {cur && s.mpDirty && <button className="btn sm" disabled={s.busy} onClick={() => void mpUpdateProfile()}>{'Cập nhật “' + cur.name + '”'}</button>}
          <button className="btn sm" disabled={s.busy} onClick={() => mpSaveOpen(true)}>{cur ? 'Lưu thành cấu hình mới' : 'Lưu thành cấu hình'}</button>
          {cur && <button className="btn sm" disabled={s.busy} onClick={() => void mpCloneProfile()}>Nhân bản</button>}
          {cur && !cur.is_default && <button className="btn sm" disabled={s.busy} onClick={() => void mpSetDefault()}>Đặt mặc định</button>}
          {cur && <button className="btn sm" disabled={s.busy || cur.is_default || cur.id === SYSTEM_MAPPING_ID} title={cur.is_default || cur.id === SYSTEM_MAPPING_ID ? 'Không xoá được cấu hình mặc định hoặc cấu hình hệ thống' : undefined} onClick={() => void mpDeleteProfile()}>Xoá</button>}
        </>
      )}
    </div>
  );
}

function ImpStats({ s }: { s: AppState }): JSX.Element {
  const rows = rowsOf(s), n = rows.length, F = s.impF, st = s.fileStats;
  const info = FIELDS.map((f) => {
    const vals = rows.map((r) => displayText(r, f, s)).filter(Boolean);
    return { f, k: vals.length, smp: [...new Set(vals.map((v) => v.replace(/\s+/g, ' ')))].slice(0, 2) };
  });
  const full = info.filter((x) => x.k === n).length, low = info.length - full;
  const pic = rows.filter((r) => displayText(r, fieldById('pic')!, s)).length;
  const pills: [AppState['impF'], string, number][] = [['all', 'Tất cả', FIELDS.length], ['full', 'Đủ dữ liệu', full], ['low', 'Thiếu dữ liệu', low]];
  const list = info.filter((x) => F === 'all' || (F === 'full' ? x.k === n : x.k < n));
  return (
    <div className="isum">
      <div className="iscard is3">
        <div className="is3n"><span className="is3l">Issue</span><b>{st?.total_rows ?? 0}</b><small>{'Dùng ' + (st?.used_cols ?? 0) + ' trong ' + (st?.total_cols ?? 0) + ' cột của file' + (s.orphans.length ? ' · ' + s.orphans.length + ' issue chưa ghép' : '')}</small></div>
        <div className="is3n"><span className="is3l">Dự án</span><b>{n}</b><small>{new Set(rows.map((r) => r.g)).size + ' nhóm · ' + pic + ' có PIC'}</small></div>
        <Dist title="Trạng thái" fid="tt" rows={rows} s={s} /><Dist title="Tiến độ" fid="td" rows={rows} s={s} />
      </div>
      <div className="iscard">
        <div className="ish"><div><b>Các cột trong mẫu báo cáo</b><span>{FIELDS.length + ' cột · lấy từ đâu, kèm giá trị mẫu'}</span></div>
          <div className="ispills">{pills.map(([k, l, c]) => <button key={k} className={'ispill' + (F === k ? ' on' : '')} onClick={() => setImpF(k)}>{l}<em>{c}</em></button>)}</div>
        </div>
        <MpBar s={s} />
        <div className="isr ishd"><span>Nguồn</span><span /><span>Cột trong báo cáo</span><span>Giá trị mẫu</span><span>Có giá trị</span></div>
        {list.length ? list.map(({ f, k, smp }) => {
          const pct = n ? Math.round((k / n) * 100) : 0;
          return (
            <div key={f.id} className={'isr' + (!k ? ' z' : '')}>
              <div className="isfrom"><span className="isjira"><IcStroke d="jira" size={14} /></span><SrcPick f={f} s={s} /></div>
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
  const xl = /\.xls[xm]?$/i.test(s.fileName);
  return (
    <div className="gridwrap gut aimp"><div className="awrap">
      <div className="ahead">
        <span className={'aico' + (xl ? ' xl' : '')} aria-hidden="true">{xl ? 'XLSX' : 'CSV'}</span>
        <div className="ahm"><h1 className="ah1">{s.fileName}</h1></div>
        <button className="btn" onClick={() => setReplaceFile(true)}>Thay file khác</button>
        <button className="btn pri" onClick={() => goStep(3)}>Mở bảng báo cáo</button>
      </div>
      <ImpStats s={s} />
    </div></div>
  );
}

export function ImportView(): JSX.Element {
  const s = useAppState((x) => x);
  if (s.importing) return <Loading s={s} />;
  if (!s.loaded || s.replaceFile) return <><PreLoad s={s} /><FilePreviewModal /></>;
  return <PostLoad s={s} />;
}
