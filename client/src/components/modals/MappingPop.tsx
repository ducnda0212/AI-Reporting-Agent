import { useState } from 'react';
import { JIRA_COLS, OVR_OPTS } from '@/data/constants';
import { cellValue, fieldOf } from '@/lib/cell';
import { unsortedOf } from '@/lib/selectors';
import { useAppState, useRows } from '@/hooks/useDerived';
import { applyMap, openBuckets, setPop, toggleRequired } from '@/store/actions/flow';
import { Modal } from './Modal';

/** Cửa sổ nhỏ ánh xạ cột ngay tại đầu cột: đổi tên, chọn trường Jira, bắt buộc, xem luật quy đổi. */
export function MappingPop() {
  const s = useAppState();
  const rows = useRows();
  const id = s.pop!;
  const f = fieldOf(s, id);
  const [name, setName] = useState(f?.name || '');
  const [src, setSrc] = useState(f?.src || '');
  if (!f) return null;
  const close = () => setPop(null);
  const vals = rows.map((r) => cellValue(s, r, f)).filter((v): v is string => v !== null).slice(0, 3);
  const showMap = !!OVR_OPTS[f.id];
  const map = f.id === 'status' ? s.statusMap : s.progMap;
  const un = showMap ? unsortedOf(s, rows, f.id as 'status' | 'progress') : [];
  return (
    <Modal onClose={close} width="min(340px,100%)" style={{ alignItems: 'center' }}>
      <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--line2)', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>Cột “{f.name}”</div></div>
        <button className="chip" onClick={close} style={{ cursor: 'pointer' }}>Đóng</button>
      </div>
      <div style={{ padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div><label className="lbl" htmlFor="m-name">Tên hiển thị trong báo cáo</label>
          <input className="inp" id="m-name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', height: 32, marginTop: 4 }} /></div>
        {f.kind === 'jira' || f.kind === 'bucket' ? (
          <div><label className="lbl" htmlFor="m-src">Lấy từ cột Jira</label>
            <select className="sel" id="m-src" value={src} onChange={(e) => setSrc(e.target.value)} style={{ width: '100%', height: 32, marginTop: 4 }}>
              {JIRA_COLS.map((c) => <option key={c}>{c}</option>)}</select></div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--mut)' }}>Nguồn: <b>{f.src}</b></div>
        )}
        <div className="rw"><span style={{ fontSize: 12 }}>Bắt buộc có giá trị</span>
          <button className={'sw' + (f.required ? ' on' : '')} onClick={() => toggleRequired(f.id)} aria-label="Bắt buộc có giá trị"><i /></button></div>
        {showMap && (
          <div style={{ padding: '9px 10px', borderRadius: 7, border: '1px solid var(--line2)' }}>
            <div className="lbl">Giá trị trên Jira → giá trị trong mẫu</div>
            <div style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.9 }}>
              {Object.keys(map).map((k) => <div key={k}><span className="mono">{k}</span> → {map[k]}</div>)}
              {f.id === 'progress' && <div style={{ color: 'var(--mut)' }}>Status = Pending → Tạm dừng</div>}
              {un.map((k) => <div key={k}><span className="mono">{k}</span> → <span style={{ color: 'var(--wrn)' }}>chưa gom</span></div>)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--mut2)', marginTop: 6 }}>Đổi luật quy đổi trong <button className="link" onClick={() => openBuckets(f.id)}>rổ gom</button>. Sửa riêng một ô: chọn ô trên bảng, đổi ở thanh phía trên bảng.</div>
          </div>
        )}
        <div style={{ padding: '9px 10px', borderRadius: 7, background: 'var(--row)', border: '1px solid var(--line2)' }}>
          <div className="lbl">Xem trước</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 5, lineHeight: 1.7 }}>
            {vals.length ? vals.map((v, k) => <div key={k}>{v}</div>) : <span style={{ color: 'var(--err)' }}>chưa có giá trị nào</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn sm pri" style={{ flex: 1 }} onClick={() => applyMap(f.id, name, f.kind === 'jira' || f.kind === 'bucket' ? src : undefined)}>Áp dụng cho {rows.length} dòng</button>
          <button className="btn sm" onClick={close}>Huỷ</button>
        </div>
      </div>
    </Modal>
  );
}
