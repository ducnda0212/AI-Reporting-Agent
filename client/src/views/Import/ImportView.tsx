import { useState, type DragEvent, type ReactNode } from 'react';
import { DEMO, ORPHANS } from '@/data/constants';
import { chkCounts } from '@/lib/check';
import { cleanStats } from '@/lib/cleanStats';
import { checkCount, orphansLeft, unsortedOf } from '@/lib/selectors';
import { fieldOf } from '@/lib/cell';
import { loadSavedCfg } from '@/store';
import { useAppState, useRows } from '@/hooks/useDerived';
import { FileTypeIcon } from '@/components/common/Icons';
import { IMPORT_STEPS, GUIDE_KEY, goStep, loadFile, replaceFile, setChk, setView, toggle, toggleGuide } from '@/store/actions/flow';

/** Các lần nhập file trước đây (mock). */
export const IMPORTS = [
  { name: 'Jira_PMO_bao-cao-tuan_14-11.csv', wk: 'Tuần 02/11 · 07–14/11', at: '14/11 16:02', by: 'Khuê', issues: 39, cols: 277, prj: 38, ver: 'v2 đã chốt' },
  { name: 'Jira_PMO_bao-cao-tuan_07-11.csv', wk: 'Tuần 01/11 · 31/10–06/11', at: '07/11 09:12', by: 'Tuấn', issues: 38, cols: 276, prj: 37, ver: 'v1 đã chốt' },
];

const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === '1'; } catch { return false; } };
const Code = ({ children }: { children: ReactNode }) => <code>{children}</code>;
const ARow = ({ glyph, cls, title, sub, label, onClick }: { glyph: string; cls: string; title: ReactNode; sub?: ReactNode; label?: string; onClick?: () => void }) => (
  <div className="arow"><span className={'ag ' + cls}>{glyph}</span><div className="at"><div>{title}</div>{sub && <small>{sub}</small>}</div>
    {label ? <button className="alink" onClick={onClick}>{label}</button> : <span />}</div>
);
const ANext = ({ t, n, cls = '', sub, tab }: { t: string; n: string | number; cls?: string; sub?: string; tab: string }) => {
  const done = n === 'xong';
  return <button className="anx" onClick={() => setChk('chkTab', tab)}><span>{t}</span><span className={'an ' + (cls || (done ? 'ok' : ''))}>{done ? '✓ xong' : n}</span>{sub && <small>{sub}</small>}</button>;
};
/** Một dòng trong danh sách "Đã sẵn sàng": bấm được nếu có `onClick`. */
function ResRow({ kind, title, meta, onClick }: { kind: 'xls' | 'csv' | 'ver' | 'db' | 'cfg'; title: string; meta: string; onClick?: () => void }) {
  const body = <><FileTypeIcon kind={kind} /><span className="arm"><b>{title}</b><small>{meta}</small></span>{onClick && <span className="achev" aria-hidden="true">›</span>}</>;
  return onClick ? <button className="ares" onClick={onClick}>{body}</button> : <div className="ares">{body}</div>;
}
const FileIcon = () => <span className="aico" aria-hidden="true">CSV</span>;

function DropZone({ loaded }: { loaded: boolean }) {
  const [over, setOver] = useState(false);
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; loadFile(f ? f.name : 'file.csv'); };
  return (
    <div className={'drop imdrop' + (over ? ' over' : '')} id="dropzone"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <div className="imup2">
        <svg width="54" height="54" viewBox="0 0 54 54" fill="none" aria-hidden="true"><rect x="10" y="5" width="30" height="40" rx="5" fill="var(--bg)" stroke="var(--accentLine)" strokeWidth="2" /><path d="M17 16h16M17 23h16M17 30h9" stroke="var(--accentLine)" strokeWidth="2" strokeLinecap="round" /><circle cx="38" cy="38" r="11" fill="var(--accent)" /><path d="M38 43v-9m0 0l-4 4m4-4l4 4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <div className="imdt">Kéo file CSV export từ Jira vào đây</div>
      <div className="imbtns">
        <label className="btn pri imbig" htmlFor="csv">Chọn file CSV</label>
        <input id="csv" type="file" accept=".csv" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => loadFile(e.target.files?.[0]?.name || 'file.csv')} />
        <button className="btn imbig2" onClick={() => loadFile('Jira sample.xlsx')}>{loaded ? 'Nạp lại dữ liệu mẫu' : 'Dùng dữ liệu mẫu'}</button>
      </div>
    </div>
  );
}

function Guide() {
  const s = useAppState();
  const open = s.guideOpen === undefined ? !guideSeen() : s.guideOpen;
  return (
    <div className={'imguide' + (open ? ' open' : '')}>
      <button className="imgl" onClick={() => toggleGuide(guideSeen())} aria-expanded={open}><span>{open ? '▾' : '▸'}</span>Chưa biết cách xuất file từ Jira? <b>Xem hướng dẫn</b></button>
      {open && <>
        <ol className="imsteps">
          <li><span>1</span>Trên Jira, mở bộ lọc issue mà nhóm dùng cho báo cáo tuần</li>
          <li><span>2</span>Chọn <b>Export → Export Excel CSV (all fields)</b></li>
          <li><span>3</span>Kéo file vừa tải vào ô phía trên. Không cần sửa gì trong file — tên cột khác thì bước 2 sẽ hỏi</li>
        </ol>
        <p className="imgnote">Quản trị có thể gắn sẵn tên bộ lọc của nhóm vào đây ở <b>Cấu hình</b>.</p>
      </>}
    </div>
  );
}

function Importing() {
  const s = useAppState();
  const imp = s.importing!;
  const st = imp.step;
  return (
    <div className="gridwrap gut imwrap"><div className="imgrid one">
      <div className="imcard improc">
        <div className="improchd"><span className="spin" aria-hidden="true" /><div><div className="imfn">Đang đọc {imp.name}</div><div className="imsub">Giữ nguyên trang này, chỉ mất vài giây</div></div></div>
        <div className="xbar improcbar"><i style={{ width: Math.round(((st + 0.5) / IMPORT_STEPS.length) * 100) + '%' }} /></div>
        <ol className="improcl">
          {IMPORT_STEPS.map((t, k) => (
            <li key={t} className={k < st ? 'ok' : k === st ? 'now' : ''}><span className="pst">{k < st ? '✓' : k === st ? <span className="spin sm" /> : k + 1}</span>{t}</li>
          ))}
        </ol>
      </div>
    </div></div>
  );
}

/** Trước khi nạp file (hoặc đang thay file). */
function PreLoad() {
  const s = useAppState();
  const L = IMPORTS[0];
  const prev = s.versions.find((v) => v.wk === 'w2');
  const cfg = loadSavedCfg();
  return (
    <div className="gridwrap gut aimp"><div className="awrap"><div className="acols">
      <div className="aleft">
        <h1 className="ah1">{s.replaceFile ? 'Thay file Jira cho tuần 3/11' : 'Nhập file Jira cho tuần 3/11'}</h1>
        <p className="asub">Kéo file CSV hoặc Excel vừa xuất từ Jira.</p>
        <DropZone loaded={s.loaded} />
        {s.replaceFile && <button className="alink back" onClick={() => replaceFile(false)}>Giữ file đang dùng: {s.fileName || 'Jira sample.xlsx'}</button>}
        <Guide />
      </div>
      <aside className="aright">
        <h2 className="ah2">Lần nhập gần nhất</h2>
        <div className="alast"><FileTypeIcon kind="csv" /><div><b title={L.name}>{L.name}</b><small>{L.wk.split(' · ')[0]}, {L.by} nhập lúc {L.at}</small><small>{L.issues} issue, {L.prj} dự án, {L.ver}</small></div></div>
        <button className="alink" onClick={() => loadFile(L.name)}>Nhập lại file này</button>
        {IMPORTS.length > 1 && <button className="alink mut" onClick={() => toggle('histOpen')} aria-expanded={s.histOpen}>{s.histOpen ? 'Ẩn' : 'Xem'} {IMPORTS.length - 1} file cũ hơn</button>}
        {s.histOpen && IMPORTS.slice(1).map((x) => <button key={x.name} className="anx" onClick={() => loadFile(x.name)}><span>{x.name}</span><span className="an">{x.at.split(' ')[0]}</span></button>)}
        <h2 className="ah2" style={{ marginTop: 26 }}>Đã sẵn sàng</h2>
        <div className="areslist">
          <ResRow kind="ver" title="Bản chốt tuần trước" meta={prev ? `v${prev.v}, chốt ngày ${prev.at.split(' ')[0]}` : 'Chưa có bản chốt'} onClick={() => setView('ver')} />
          <ResRow kind="xls" title="Mẫu báo cáo 49 cột" meta="Tháng 11, khối tuần đến AR–AT" onClick={() => setView('tpl')} />
          <ResRow kind="db" title="Dữ liệu hệ thống" meta={`${Object.keys(s.cat.projects).length} dự án, cột A–H và O–W`} onClick={() => setView('cat')} />
          <ResRow kind="cfg" title="Cấu hình quy đổi" meta={cfg ? 'Đã lưu, dùng lại khi nhập file' : 'Đang dùng mặc định'} />
        </div>
      </aside>
    </div></div></div>
  );
}

/** Sau khi nạp file: tóm tắt thay đổi so với lần nhập trước + việc còn lại. */
function PostLoad() {
  const s = useAppState();
  const rows = useRows();
  const P = s.fileName === IMPORTS[0].name ? IMPORTS[1] : IMPORTS[0];
  const nIss = rows.length + 2 + ORPHANS.length;
  const dIss = nIss - P.issues;
  const vals = unsortedOf(s, rows, 'status').concat(fieldOf(s, 'progress').src === '— chưa gán —' ? [] : unsortedOf(s, rows, 'progress')).concat(s.unsorted);
  const newC = s.newCodes === 'pending' ? DEMO.newRows.map((r) => r.code) : [];
  const CC = chkCounts(s);
  const S = cleanStats(s);
  const orph = orphansLeft(s).length;
  const left = checkCount(s, rows);
  const wk = P.wk.split(' · ')[0].toLowerCase();
  const parts: ReactNode[] = [];
  if (newC.length) parts.push(<b key="n" className="hl w">{newC.length} mã mới</b>);
  parts.push(<b key="m" className="hl e">1 mã biến mất</b>);
  if (vals.length) parts.push(<span key="v"><b className="hl w">{vals.length} giá trị Jira</b> chưa có luật quy đổi</span>);
  return (
    <div className="gridwrap gut aimp"><div className="awrap">
      <div className="ahead"><FileIcon />
        <div className="ahm"><h1 className="ah1">{s.fileName || 'Jira sample.xlsx'}</h1><p className="asub">{nIss} issue, {DEMO.fileStats.cols} cột, nhập lúc {s.loadedAt}</p></div>
        <button className="btn" onClick={() => replaceFile(true)}>Thay file khác</button></div>
      <p className="asum">Ghép được <b className="hl ok">{rows.length} dự án</b> vào mẫu 49 cột. So với {wk} có{' '}
        {parts.map((p, k) => <span key={k}>{k > 0 && (k === parts.length - 1 ? ' và ' : ', ')}{p}</span>)}.
        {orph > 0 && <> <b className="hl e">{orph} issue</b> chưa có Mã DA cần ghép trước khi xuất.</>}</p>
      <div className="acols">
        <div className="aleft">
          <h2 className="ah2">Thay đổi so với {wk}</h2>
          <div className="arows">
            <ARow glyph={dIss >= 0 ? '+' : '−'} cls={dIss >= 0 ? 'add' : 'del'} title={`${Math.abs(dIss)} issue ${dIss >= 0 ? 'mới' : 'ít hơn'} trong file`} sub={`${P.issues} issue tuần trước, ${nIss} issue tuần này`} label="Xem" onClick={() => setChk('chkTab', 'prj')} />
            {newC.length > 0 && <ARow glyph="+" cls="add" title={`${newC.length} mã chưa có dòng trong mẫu`} sub={newC.join(' và ')} label="Thêm dòng" onClick={() => setChk('chkTab', 'prj')} />}
            <ARow glyph="−" cls="del" title="II.D.1.3 không còn trong file" sub="Tuần trước đang thực hiện. Dự án đã đóng hay bị lọc mất?" label="Kiểm tra" onClick={() => setChk('chkTab', 'prj')} />
            <ARow glyph="~" cls="chg" title="Cột Jira đổi tên" sub={<><Code>Custom field (Progress %)</Code> thành <Code>Custom field (Progress)</Code>, đã tự khớp</>} label="Xem" onClick={() => setChk('chkTab', 'col')} />
            {vals.length > 0 && <ARow glyph="?" cls="chg" title={`${vals.length} giá trị chưa có luật`} sub={vals.slice(0, 3).map((v, k) => <span key={v}>{k > 0 && ', '}<Code>{v}</Code></span>)} label="Chọn" onClick={() => setChk('chkTab', 'val')} />}
            {s.cfgUsed && <ARow glyph="✓" cls="add" title="Dùng lại cấu hình quy đổi" sub={`lưu lúc ${s.cfgUsed.at}`} />}
          </div>
        </div>
        <aside className="aright">
          <h2 className="ah2">Còn lại ở bước Kiểm tra</h2>
          <div className="arows">
            <ANext t="Khớp cột" n={CC.col ? CC.col + ' chặn xuất' : 'xong'} cls={CC.col ? 'e' : ''} sub={CC.col ? 'Cột chưa có nguồn sẽ để trống khi xuất' : ''} tab="col" />
            <ANext t="Quy đổi giá trị" n={CC.val || 'xong'} cls={CC.val ? 'w' : ''} sub={CC.val ? 'Không chặn xuất, nên chọn trước khi AI soạn' : ''} tab="val" />
            <ANext t="Làm sạch nội dung" n={S.all ? S.all.toLocaleString('vi-VN') + ' chỗ' : 'tự động'} tab="fmt" />
            <ANext t="Ghép dự án" n={CC.prjE ? CC.prjE + ' chặn xuất' : CC.prj.length || 'xong'} cls={CC.prjE ? 'e' : CC.prj.length ? 'w' : ''} sub={CC.prj.length ? `${CC.prjE} chặn, ${CC.prjW} nên xử lý` : ''} tab="prj" />
          </div>
          <h2 className="ah2" style={{ marginTop: 24 }}>Lần nhập trước</h2>
          <div className="arows">
            {IMPORTS.filter((x) => x.name !== s.fileName).slice(0, 2).map((x) => <div key={x.name} className="anx static"><span>{x.name}</span><span className="an">{x.at.split(' ')[0]}</span></div>)}
          </div>
        </aside>
      </div>
      <div className="afoot"><button className="btn abtn" onClick={() => goStep(left ? 2 : 3)}>{left ? 'Tiếp tục kiểm tra dữ liệu' : 'Tiếp tục điền và duyệt'}</button></div>
    </div></div>
  );
}

export function ImportView() {
  const s = useAppState();
  if (s.importing) return <Importing />;
  if (!s.loaded || s.replaceFile) return <PreLoad />;
  return <PostLoad />;
}

