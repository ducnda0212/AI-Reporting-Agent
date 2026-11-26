/* Chốt & xuất (prototype modalExport L4440 + exColsBlock L9159, bản gọn): 3 bước trong một cửa sổ — 1 Kiểm tra → 2 Chốt bản vN → 3 Xuất file.
   Không có lỗi chặn (blockers() trống), chỉ xuất Excel 49 cột. Chốt bằng doLock, xuất từ ĐÚNG bản đã chốt bằng doExport (tải file khi chạy trên trình duyệt).
   Chỉ vẽ khi state.modal === 'export'. */
import { useState } from 'react';
import { FIELDS, WK_TXT } from '@/data/constants';
import { activeWkOf, cellValue, effectiveKind } from '@/lib/cell';
import { diffSnap, snapshot } from '@/lib/versions';
import { exFields } from '@/lib/xlsx';
import { rowsOf, useAppState } from '@/store';
import { startReview, pendingList } from '@/store/actions/ai';
import { goStep, setModal, setView } from '@/store/actions/flow';
import { fixGo } from '@/store/actions/grid';
import { doExport, doLock, setExCols, wkName } from '@/store/actions/versions';
import type { AppState, FieldId } from '@/types';

const fileDefault = (s: AppState): string => (s.activeToday || '2026-11-21').replace(/-/g, '') + '_DAN_Bao-cao-PMO.xlsx';
/** Ba cột của khối tuần trong file mẫu. */
const KIND_IC = { err: '✕', wrn: '!', ai: 'AI', ok: '✓' } as const;

function Row({ kind, title, desc, children }: { kind: keyof typeof KIND_IC; title: string; desc: string; children?: React.ReactNode }): JSX.Element {
  return <div className={'xckr' + (kind === 'err' ? ' err' : '')}><span className={'xic ' + kind}>{KIND_IC[kind]}</span><div className="tx"><b>{title}</b><span title={desc}>{desc}</span></div>{children}</div>;
}

function Body({ s }: { s: AppState }): JSX.Element {
  const [by, setBy] = useState(s.lockBy || ''), [note, setNote] = useState(''), [fn, setFn] = useState(fileDefault(s)), [onlyWk, setOnlyWk] = useState(true), [noteRaw, setNoteRaw] = useState(true);
  const rows = rowsOf(s), cur = activeWkOf(s), wk = s.editWk && s.editWk !== cur ? s.editWk : cur, lc = s.versions.find((v) => v.wk === wk);
  const ch = lc && lc.snap ? diffSnap(lc.snap, snapshot(rows, s)) : null, locked = !!lc && !!ch && !ch.length, nextV = (lc ? lc.v : 0) + 1;
  const stage = locked ? 3 : 2, wn = wkName(wk, true);
  const empty = rows.reduce((n, r) => n + FIELDS.filter((f) => f.required && cellValue(r, f, s) === null).length, 0);
  const opt = rows.reduce((n, r) => n + FIELDS.filter((f) => !f.required && !['none', 'future', 'past'].includes(effectiveKind(f, s)) && cellValue(r, f, s) === null).length, 0);
  const noRep = rows.filter((r) => !(r as Partial<Record<FieldId, string>>)[WK_TXT[wk][0] as FieldId] && !r.ovr[WK_TXT[wk][0] as FieldId]).length, ai = pendingList(s).length;
  const nVis = exFields('vis', s.hidden).length, hidG: Record<string, number> = {};
  FIELDS.forEach((f) => { if (!f.key && s.hidden[f.id]) { const g = f.grp.charAt(0) === 'w' ? 'Tuần ' + f.grp.slice(1) : f.grp; hidG[g] = (hidG[g] || 0) + 1; } });
  const hg = Object.keys(hidG).map((k) => k + ' (' + hidG[k] + ')').join(', ');
  const sn = (n: number, t: string): JSX.Element => <span className={'s ' + (n < stage ? 'done' : n === stage ? 'cur' : '')}><span className="n">{n < stage ? '✓' : n}</span>{t}</span>;
  const fixFirst = (): void => {
    const r0 = rows.find((r) => FIELDS.some((f) => f.required && cellValue(r, f, s) === null));
    setModal(null); setView('grid'); if (r0) fixGo(r0.g);
  };

  if (s.exported) {
    return (
      <div className="modal" style={{ width: 'min(520px,100%)' }} data-stop="1" role="dialog" aria-modal="true" aria-label="Đã xuất file">
        <div style={{ padding: '24px 22px 20px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--okBg)', border: '1px solid var(--okLine)', color: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 19, fontWeight: 700 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 650, marginTop: 12 }}>{'Đã tạo file từ bản v' + (lc ? lc.v : '')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', marginTop: 9 }}>
            {s.exported.split(' · ').map((f) => <span key={f} className="mono" style={{ fontSize: 11.5, color: 'var(--ink2)', padding: '5px 10px', background: 'var(--row)', border: '1px solid var(--line2)', borderRadius: 7, wordBreak: 'break-all' }}>{f}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 16 }}>
            <button className="btn" data-act="view" data-v="ver" onClick={() => setView('ver')}>Xem lịch sử phiên bản</button>
            <button className="btn pri" data-act="closeModal" onClick={() => setModal(null)}>Xong</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="modal" style={{ width: 'min(600px,100%)' }} data-stop="1" role="dialog" aria-modal="true" aria-label="Chốt và xuất">
      <div className="xhd"><div style={{ flex: '1 1 auto', minWidth: 0 }}><h2>{locked ? 'Xuất báo cáo ' + wn : 'Chốt & xuất · ' + wn}</h2><p>Chỉ xuất từ bản đã chốt · đích 20261111_DAN_Mau-bao-cao-PMO.xlsx</p></div>
        <button className="pclose" data-act="closeModal" aria-label="Đóng" onClick={() => setModal(null)}>✕</button></div>
      <div className="xstp">{sn(1, 'Kiểm tra')}<span className={'ln' + (stage > 1 ? ' done' : '')} />{sn(2, 'Chốt bản v' + (locked && lc ? lc.v : nextV))}<span className={'ln' + (stage > 2 ? ' done' : '')} />{sn(3, 'Xuất file')}</div>
      <div className="xbody">
        {locked && lc ? (
          <>
            <div className="xok"><span className="xic ok">✓</span><span style={{ flex: '1 1 auto' }}><b>{'Bản v' + lc.v}</b>{' chốt lúc ' + lc.at + ' bởi ' + lc.by + '. Chưa có ô nào đổi sau khi chốt.'}</span></div>
            <div className="xs2"><div className="xt">Xuất những file nào</div>
              <label className="xopt on"><input type="checkbox" data-act="exOut" data-k="f49" checked readOnly /><span style={{ flex: '1 1 auto' }}><b style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Báo cáo tuần chi tiết</b>{' '}
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--mut2)' }}>.xlsx</span><span className="d">{(s.exCols === 'all' ? FIELDS.length : nVis) + '/' + FIELDS.length + ' cột · ghi vào 20261111_DAN_Mau-bao-cao-PMO.xlsx'}</span></span></label></div>
            <div className="xs2" data-stop="1"><div className="xt">Cột đưa vào file<span>{(s.exCols === 'all' ? FIELDS.length : nVis) + '/' + FIELDS.length + ' cột'}</span></div>
              <div className="exseg" role="group" aria-label="Cột xuất">
                <button className={s.exCols !== 'all' ? 'on' : ''} data-act="exColsSet" data-v="vis" onClick={() => setExCols('vis')}><b>Cột đang hiển thị</b><span>{nVis + ' cột, đúng như trên bảng'}</span></button>
                <button className={s.exCols === 'all' ? 'on' : ''} data-act="exColsSet" data-v="all" onClick={() => setExCols('all')}><b>{'Đủ ' + FIELDS.length + ' cột theo mẫu'}</b><span>Gồm cả cột đang ẩn</span></button></div>
              {s.exCols !== 'all' && hg && <div className="xhint" style={{ marginTop: 7 }}>{'Không xuất các cột đang ẩn: ' + hg}</div>}</div>
            <div className="xs2"><label className="xt" htmlFor="fn">Tên file báo cáo</label><input className="inp" id="fn" value={fn} onChange={(e) => setFn(e.target.value)} style={{ width: '100%', height: 34, fontFamily: 'var(--mono)', fontSize: 12 }} /></div>
            <details className="xmore"><summary>Tuỳ chọn ghi file</summary>
              <label><input type="checkbox" checked={onlyWk} onChange={(e) => setOnlyWk(e.target.checked)} /><span>{'Chỉ ghi nhận thay đổi tuần hiện tại'}</span></label>
              <label><input type="checkbox" checked={noteRaw} onChange={(e) => setNoteRaw(e.target.checked)} /><span>Ghi thay đổi vào Note</span></label></details>
          </>
        ) : (
          <>
            <div className="xs2"><div className="xt">Kiểm tra trước khi chốt<span>sẵn sàng chốt</span></div><div className="xck">
              {empty ? <Row kind="wrn" title={empty + ' ô bắt buộc còn trống'} desc="Không chặn chốt, nhưng các ô này sẽ để trống trong báo cáo"><button className="btn sm" data-act="exFixGo" onClick={fixFirst}>Tới ô</button></Row>
                : <Row kind="ok" title="Không còn lỗi chặn" desc="Mọi trường bắt buộc đã có giá trị" />}
              {noRep ? <Row kind="wrn" title={noRep + ' cảnh báo — vẫn chốt được'} desc={noRep + ' dự án chưa có Progress report trong ' + wn + ' · ' + opt + ' ô không bắt buộc sẽ để trống'} />
                : <Row kind="ok" title="Không có cảnh báo" desc={opt + ' ô không bắt buộc sẽ để trống'} />}
              {ai ? <Row kind="ai" title={ai + ' ô AI chưa duyệt'} desc="Ô chưa duyệt sẽ để trống trong bản chốt"><button className="btn sm" data-act="review" onClick={() => startReview()}>Duyệt từng ô</button></Row>
                : <Row kind="ok" title="Nội dung AI đã duyệt hết" desc="Không còn nháp nào chờ" />}
              {lc && ch && ch.length > 0 && <Row kind="wrn" title={ch.length + ' ô đổi so với v' + lc.v} desc={ch.slice(0, 3).map((c) => c[0] + ' · ' + c[1].split(' ')[0]).join(', ') + (ch.length > 3 ? '…' : '')}><button className="btn sm" data-act="view" data-v="ver" onClick={() => setView('ver')}>So sánh</button></Row>}
            </div></div>
            <div className="xs2"><div className="xt">{'Chốt thành phiên bản v' + nextV}</div>
              <div className="xform"><label><span>Người chốt</span><input className="inp" id="lockBy" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Gõ tên" /></label>
                <label><span>Ghi chú phiên bản <span style={{ color: 'var(--mut2)' }}>(không bắt buộc)</span></span><input className="inp" id="lockNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vd: bản gửi trước họp khối" /></label></div>
              {s.lockMsg && <div style={{ fontSize: 11.5, color: 'var(--err)', marginTop: 6 }}>{s.lockMsg}</div>}
              <div className="xhint" style={{ marginTop: 9 }}>{'Bản v' + nextV + ' được giữ nguyên sau khi chốt. Sửa bảng sau đó không làm đổi bản này; muốn xuất nội dung mới thì chốt bản tiếp theo.'}</div></div>
          </>
        )}
      </div>
      <div className="xfoot">
        <button className="btn" data-act="stepGo" data-n="3" onClick={() => goStep(3)}>← Quay lại bảng</button><div style={{ flex: '1 1 10px' }} />
        {locked && lc ? <button className="btn pri" data-act="doExport" onClick={() => void doExport(fn, { onlyCurrentWeek: onlyWk, appendOverrideNote: noteRaw })}>{'Xuất file từ v' + lc.v}</button>
          : <button className="btn pri" data-act="doLock" onClick={() => void doLock(by, note)}>{'Chốt bản v' + nextV}</button>}
      </div>
    </div>
  );
}

export function ExportModal(): JSX.Element | null {
  const s = useAppState((x) => x);
  if (s.modal !== 'export') return null;
  return <div className="ov" data-act="closeModal" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}><Body s={s} /></div>;
}
