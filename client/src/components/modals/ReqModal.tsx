import { useState } from 'react';
import { SYS_ORDER, SYS_PEOPLE } from '@/data/constants';
import { fieldOf } from '@/lib/cell';
import { sysVal } from '@/lib/catalog';
import { catPeople } from '@/lib/selectors';
import { useAppState } from '@/hooks/useDerived';
import { setModal } from '@/store/actions/flow';
import * as C from '@/store/actions/catalog';
import { Modal } from './Modal';

/** Gửi yêu cầu sửa / tạo dự án lên hệ thống. */
export function ReqModal() {
  const s = useAppState();
  const f = s.reqForm!;
  const isNew = f.type === 'new';
  const [task, setTask] = useState(f.task || '');
  const [g, setG] = useState(f.g || '');
  const [pic, setPic] = useState('');
  const [to, setTo] = useState(f.to || '');
  const [why, setWhy] = useState(f.reason || '');
  const people = catPeople(s);
  const close = () => setModal(null);
  const field = f.field || 'pic';
  const cur = isNew ? '' : sysVal(s, f.code, field);
  const fields = SYS_ORDER.filter((id) => id !== 'code');
  const isPerson = SYS_PEOPLE.includes(field);
  return (
    <Modal onClose={close} width="min(520px,100%)" label="Gửi yêu cầu">
      <div style={{ padding: '18px 20px' }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>{isNew ? 'Yêu cầu tạo dự án trên hệ thống' : 'Yêu cầu sửa thông tin · ' + f.code}</div>
        {isNew ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <div className="kv"><span style={{ color: 'var(--mut)' }}>Mã DA</span><b className="mono">{f.code}</b></div>
            <label className="lbl" htmlFor="rqTask">Công việc</label><input className="inp" id="rqTask" value={task} onChange={(e) => setTask(e.target.value)} />
            <label className="lbl" htmlFor="rqG">Mảng việc</label>
            <select className="sel" id="rqG" value={g} onChange={(e) => setG(e.target.value)} style={{ height: 34 }}>
              <option value="">Chọn…</option>
              {Object.keys(s.cat.units).sort().concat(f.g && !s.cat.units[f.g] ? [f.g] : []).map((k) => <option key={k} value={k}>{s.cat.units[k] ? s.cat.units[k].name : k + ' (mảng mới)'}</option>)}
            </select>
            <label className="lbl" htmlFor="rqPic">PIC</label>
            <select className="sel" id="rqPic" value={pic} onChange={(e) => setPic(e.target.value)} style={{ height: 34 }}><option value="">Chọn…</option>{people.map((n) => <option key={n}>{n}</option>)}</select>
            <label className="lbl" htmlFor="rqWhy">Ghi chú cho hệ thống (PO, ngày… nếu đã biết)</label>
            <textarea className="inp" id="rqWhy" rows={3} style={{ height: 'auto', padding: 8 }} value={why} onChange={(e) => setWhy(e.target.value)} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <label className="lbl" htmlFor="rqF">Thông tin cần sửa</label>
            <select className="sel" id="rqF" value={field} onChange={(e) => { C.setReqField(e.target.value); setTo(''); }} style={{ height: 34 }}>
              {fields.map((id) => { const fd = fieldOf(s, id); return <option key={id} value={id}>{fd.col} · {fd.name}</option>; })}
            </select>
            <div className="kv"><span style={{ color: 'var(--mut)' }}>Đang lưu trên hệ thống</span><b>{cur || <span style={{ color: 'var(--mut2)', fontWeight: 400 }}>(trống)</span>}</b></div>
            <label className="lbl" htmlFor="rqTo">Giá trị đúng</label>
            <input className="inp" id="rqTo" list="rqPeople" value={to} onChange={(e) => setTo(e.target.value)}
              placeholder={isPerson ? 'Họ tên' : field === 'start' || field === 'end' ? 'dd/mm/yyyy' : 'Nội dung mới'} />
            {isPerson && <datalist id="rqPeople">{people.map((n) => <option key={n} value={n} />)}</datalist>}
            <label className="lbl" htmlFor="rqWhy">Lý do</label>
            <textarea className="inp" id="rqWhy" rows={2} style={{ height: 'auto', padding: 8 }} placeholder="VD: đổi PIC từ 01/12" value={why} onChange={(e) => setWhy(e.target.value)} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={close}>Huỷ</button>
          <button className="btn pri" onClick={() => C.sendRequest({ why, task, g, pic, field, to })}>Gửi yêu cầu</button>
        </div>
      </div>
    </Modal>
  );
}
