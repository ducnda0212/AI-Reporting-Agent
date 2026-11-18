import { useState } from 'react';
import { blockers, optEmpty, pendingAI, warnings } from '@/lib/selectors';
import { exPending } from '@/lib/exec';
import { changedSinceLock, lastCur } from '@/lib/versions';
import { useAppState, useRows } from '@/hooks/useDerived';
import { doLock, goStep, setExFmt, setExOut, setModal, setPanel, setView, startReview } from '@/store/actions/flow';
import { doExport } from '@/store/actions/exportReport';
import { FileTag } from '@/components/common/Icons';
import { tvExportNote } from '@/store/tplVersions';
import { Modal } from './Modal';

const IC = { err: '✕', wrn: '!', ai: 'AI', ok: '✓' } as const;
type Kind = keyof typeof IC;

function CheckRow({ kind, title, desc, btn }: { kind: Kind; title: string; desc: string; btn?: React.ReactNode }) {
  return (
    <div className={'xckr' + (kind === 'err' ? ' err' : '')}><span className={'xic ' + kind}>{IC[kind]}</span>
      <div className="tx"><b>{title}</b><span title={desc}>{desc}</span></div>{btn}</div>
  );
}

/** Chốt bản → xuất file. Hai trạng thái: chưa chốt (kiểm tra + chốt) và đã chốt (chọn file xuất). */
export function ExportModal() {
  const s = useAppState();
  const rows = useRows();
  const [by, setBy] = useState(s.lockBy || '');
  const [note, setNote] = useState('');
  const [fn, setFn] = useState('20261121_DAN_Bao-cao-PMO.xlsx');
  const close = () => setModal(null);
  const lc = lastCur(s);
  const ch = changedSinceLock(s);

  if (s.exported) {
    return (
      <Modal onClose={close} width="min(520px,100%)">
        <div style={{ padding: '24px 22px 20px', textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--okBg)', border: '1px solid var(--okLine)', color: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: 19, fontWeight: 700 }}>✓</div>
          <div style={{ fontSize: 15, fontWeight: 650, marginTop: 12 }}>Đã tạo file từ bản v{lc?.v}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center', marginTop: 9 }}>
            {s.exported.split(' · ').map((f) => <span key={f} className="mono" style={{ fontSize: 11.5, color: 'var(--ink2)', padding: '5px 10px', background: 'var(--row)', border: '1px solid var(--line2)', borderRadius: 7, wordBreak: 'break-all' }}>{f}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 16 }}>
            <button className="btn" onClick={() => setView('ver')}>Xem lịch sử phiên bản</button>
            <button className="btn pri" onClick={close}>Xong</button>
          </div>
        </div>
      </Modal>
    );
  }

  const b = blockers(s, rows);
  const w = warnings(s, rows);
  const ai = pendingAI(rows);
  const locked = !!(lc && ch && !ch.length);
  const nextV = (lc ? lc.v : 0) + 1;
  const stage = locked ? 3 : b.length ? 1 : 2;
  const on = s.exOut;
  const nothing = locked && !on.f49 && !on.exec;
  const Sn = ({ n, t }: { n: number; t: string }) => <span className={'s ' + (n < stage ? 'done' : n === stage ? 'cur' : '')}><span className="n">{n < stage ? '✓' : n}</span>{t}</span>;

  return (
    <Modal onClose={close} width="min(600px,100%)" label="Chốt và xuất">
      <div className="xhd">
        <div style={{ flex: '1 1 auto', minWidth: 0 }}><h2>{locked ? 'Xuất báo cáo Tuần 3/11' : 'Chốt & xuất · Tuần 3/11'}</h2><p>Chỉ xuất từ bản đã chốt · đích 20261111_DAN_Mau-bao-cao-PMO.xlsx</p></div>
        <button className="pclose" onClick={close} aria-label="Đóng">✕</button>
      </div>
      <div className="xstp">
        <Sn n={1} t="Kiểm tra" /><span className={'ln' + (stage > 1 ? ' done' : '')} /><Sn n={2} t={`Chốt bản v${locked ? lc!.v : nextV}`} /><span className={'ln' + (stage > 2 ? ' done' : '')} /><Sn n={3} t="Xuất file" />
      </div>
      <div className="xbody">
        {locked ? (
          <>
            <div className="xok"><span className="xic ok">✓</span><span style={{ flex: '1 1 auto' }}><b>Bản v{lc!.v}</b> chốt lúc {lc!.at} bởi {lc!.by}. Chưa có ô nào đổi sau khi chốt.</span></div>
            <div className="xs2"><div className="xt">Xuất những file nào</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label className={'xopt' + (on.f49 ? ' on' : '')}><input type="checkbox" checked={on.f49} onChange={(e) => setExOut('f49', e.target.checked)} />
                  <span style={{ flex: '1 1 auto' }}><b style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileTag kind="xlsx" />Mẫu 49 cột</b> <span className="mono" style={{ fontSize: 10.5, color: 'var(--mut2)' }}>.xlsx</span><span className="d">{tvExportNote(s.hidden)} · ghi vào 20261111_DAN_Mau-bao-cao-PMO.xlsx</span></span></label>
                <label className={'xopt' + (on.exec ? ' on' : '')} style={{ flexWrap: 'wrap' }}><input type="checkbox" checked={on.exec} onChange={(e) => setExOut('exec', e.target.checked)} />
                  <span style={{ flex: '1 1 200px' }}><b>Báo cáo điều hành</b>
                    <span className="d">Bản cô đọng cho BGĐ{exPending(s) > 0 && <> · <span style={{ color: 'var(--ai)' }}>còn {exPending(s)} ô nháp AI chưa duyệt, sẽ để trống</span></>}</span>
                    {on.exec && <span className="xfmt">{([['pdf', 'PDF', 'PDF'], ['docx', 'Word', 'DOC'], ['xlsx', 'Excel theo mẫu', 'XLS']] as const).map((o) => (
                      <label key={o[0]} className={s.exFmt === o[0] ? 'on' : ''}><input type="radio" name="exFmt" value={o[0]} checked={s.exFmt === o[0]} onChange={() => setExFmt(o[0])} /><FileTag kind={o[0]} />{o[1]}</label>
                    ))}</span>}
                  </span></label>
              </div></div>
            <div className="xs2"><label className="xt" htmlFor="fn">Tên file mẫu 49 cột</label>
              <input className="inp" id="fn" value={fn} onChange={(e) => setFn(e.target.value)} style={{ width: '100%', height: 34, fontFamily: 'var(--mono)', fontSize: 12 }} /></div>
            <details className="xmore"><summary>Tuỳ chọn ghi file</summary>
              <label><input type="checkbox" defaultChecked /><span>Chỉ ghi khối Tuần 3/11 (cột AR–AT), giữ nguyên các khối tuần khác</span></label>
              <label><input type="checkbox" defaultChecked /><span>Ghi ô đã sửa tay vào cột Note</span></label></details>
          </>
        ) : (
          <>
            <div className="xs2"><div className="xt">Kiểm tra trước khi chốt<span>{b.length ? b.length + ' việc phải xử lý' : 'sẵn sàng chốt'}</span></div>
              <div className="xck">
                {b.length ? <CheckRow kind="err" title={`${b.length} lỗi chặn — phải xử lý trước`} desc={b.map((x) => x.t).join(' · ')} btn={<button className="btn sm pri" onClick={() => setPanel('issues')}>Xử lý</button>} />
                  : <CheckRow kind="ok" title="Không còn lỗi chặn" desc="Mọi trường bắt buộc đã có giá trị" />}
                <CheckRow kind={w.length ? 'wrn' : 'ok'} title={w.length ? `${w.length} cảnh báo — vẫn chốt được` : 'Không có cảnh báo'} desc={`${optEmpty(s, rows)} ô không bắt buộc sẽ để trống`} btn={w.length ? <button className="btn sm" onClick={() => setPanel('issues')}>Xem</button> : undefined} />
                {ai ? <CheckRow kind="ai" title={`${ai} ô AI chưa duyệt`} desc="Ô chưa duyệt sẽ để trống trong bản chốt" btn={<button className="btn sm" onClick={() => startReview()}>Duyệt từng ô</button>} />
                  : <CheckRow kind="ok" title="Nội dung AI đã duyệt hết" desc="Không còn nháp nào chờ" />}
                {lc && ch && ch.length > 0 && <CheckRow kind="wrn" title={`${ch.length} ô đổi so với v${lc.v}`} desc={ch.slice(0, 3).map((c) => `${c[0]} · ${c[1].split(' ')[0]}`).join(', ') + (ch.length > 3 ? '…' : '')} btn={<button className="btn sm" onClick={() => setView('ver')}>So sánh</button>} />}
              </div></div>
            <div className="xs2" style={b.length ? { opacity: 0.55 } : undefined}><div className="xt">Chốt thành phiên bản v{nextV}</div>
              <div className="xform">
                <label><span>Người chốt</span><input className="inp" value={by} onChange={(e) => setBy(e.target.value)} placeholder="Gõ tên" /></label>
                <label><span>Ghi chú phiên bản <span style={{ color: 'var(--mut2)' }}>(không bắt buộc)</span></span><input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vd: bản gửi trước họp khối" /></label>
              </div>
              {s.lockMsg && <div style={{ fontSize: 11.5, color: 'var(--err)', marginTop: 6 }}>{s.lockMsg}</div>}
              <div className="xhint" style={{ marginTop: 9 }}>Bản v{nextV} được giữ nguyên sau khi chốt. Sửa bảng sau đó không làm đổi bản này; muốn xuất nội dung mới thì chốt bản tiếp theo.</div></div>
          </>
        )}
      </div>
      <div className="xfoot">
        <button className="btn" onClick={() => goStep(3)}>← Quay lại bảng</button><div style={{ flex: '1 1 10px' }} />
        {!locked && b.length > 0 && <span className="why">Còn {b.length} lỗi chặn</span>}
        {nothing && <span className="why">Chọn ít nhất một file</span>}
        {locked
          ? <button className="btn pri" onClick={() => doExport(fn)} disabled={nothing}>Xuất file từ v{lc!.v}</button>
          : <button className="btn pri" onClick={() => doLock(by, note)} disabled={b.length > 0}>Chốt bản v{nextV}</button>}
      </div>
    </Modal>
  );
}
