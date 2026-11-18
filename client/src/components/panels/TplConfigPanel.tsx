import { useState } from 'react';
import { GRP, FIELDS } from '@/data/constants';
import { useAppState } from '@/hooks/useDerived';
import { fieldOf } from '@/lib/cell';
import { setPanel } from '@/store/actions/flow';
import { tvApply, tvCount, tvDelete, tvGrpIds, tvHiddenNow, tvMatch, tvName, tvNorm, tvReset, tvSave, tvSetGrp, tvSetHidden, tvSetWeeks, tvWeeksOf, useTv } from '@/store/tplVersions';
import type { GroupId } from '@/types';

const GROUPS: GroupId[] = ['pin', 'info', 'prog', 'org', 'eval', 'w1', 'w2', 'w3', 'w4'];
const label = (g: GroupId) => (g.startsWith('w') ? GRP[g].split(' · ')[0] : GRP[g]);

/** Panel phải: số tuần, cột hiển thị, phiên bản mẫu. Bảng dữ liệu đổi theo ngay. */
export function TplConfigPanel() {
  const s = useAppState();
  const { base, list, grp } = useTv((t) => t);
  const [form, setForm] = useState(false); const [name, setName] = useState(''); const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null); const [del, setDel] = useState<string | null>(null);
  const hid = tvHiddenNow(s.hidden); const m = tvMatch(s.hidden); const b = list.find((v) => v.id === base) || list[0];
  const dirty = !m; const weeks = tvWeeksOf(hid);
  const w4on = FIELDS.some((f) => f.grp === 'w4' && !hid.includes(f.id));
  const cnt = (g: GroupId) => { const ids = tvGrpIds(g); return { on: ids.filter((i) => !hid.includes(i)).length, n: ids.length }; };
  const ids0 = tvGrpIds(grp); const c0 = cnt(grp); const lockedAll = ids0.every((i) => fieldOf(s, i).key);
  const nextN = Math.max(...list.map((v) => v.n)) + 1;
  const save = () => { const e = tvSave(name, note); setErr(e); if (!e) { setForm(false); setName(''); setNote(''); } };
  return (
    <aside className="panel" aria-label="Cấu hình mẫu">
      <div className="phd"><div style={{ flex: '1 1 auto', minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>Cấu hình mẫu</div><div style={{ fontSize: 11.5, color: 'var(--mut)' }}>Báo cáo tuần chi tiết · bảng đổi theo ngay</div></div>
        <button className="chip" onClick={() => setPanel(null)} style={{ cursor: 'pointer' }}>Đóng</button></div>
      <div className="tvpb">
        <div className="tvstat">{dirty ? <><span className="tvst warn">Đã chỉnh so với {tvName(b)}</span><button className="alink" onClick={tvReset}>Hoàn tác</button></> : <span className="tvst ok">Đang dùng {tvName(m!)}</span>}</div>
        <h3 className="tvh">Số tuần trong báo cáo</h3>
        <div className="tvsegs" role="group" aria-label="Số tuần">
          {[1, 2, 3].map((n) => <button key={n} className={'tvseg' + (weeks === n ? ' on' : '')} onClick={() => { tvSetWeeks(n); setDel(null); }} aria-pressed={weeks === n}><b>{n} tuần</b><small>{n === 1 ? 'T3/11' : n === 2 ? 'T02 và T3/11' : 'T01, T02, T3/11'}</small></button>)}
        </div>
        <label className="tvck"><input type="checkbox" checked={w4on} onChange={(e) => tvSetHidden(tvGrpIds('w4'), !e.target.checked)} /><span>Thêm khối tuần sau<small>Tuần 4/11, chưa tới</small></span></label>
        <h3 className="tvh">Cột hiển thị <span>{tvCount(hid)}/{FIELDS.length}</span></h3>
        <div className="tvpls">{GROUPS.map((g) => { const c = cnt(g); return (
          <button key={g} className={'tvpl' + (grp === g ? ' on' : '')} onClick={() => tvSetGrp(g)} aria-pressed={grp === g}>{label(g)}<em className={c.on === c.n ? 'all' : c.on ? 'part' : 'none'}>{c.on}/{c.n}</em></button>); })}</div>
        <div className="tvgh"><b>{label(grp)}</b><span>{c0.on}/{c0.n}</span><span className="tvsp" />
          {!lockedAll && <><button className="alink" onClick={() => tvSetHidden(ids0, false)}>Hiện hết</button><button className="alink mut" onClick={() => tvSetHidden(ids0, true)}>Ẩn hết</button></>}</div>
        <div className="tvrs">{ids0.map((i) => { const f = fieldOf(s, i); const vis = f.key || !hid.includes(i); return (
          <button key={i} className={'tvr' + (vis ? ' on' : '')} onClick={() => { if (!f.key) tvSetHidden([i], !s.hidden[i]); setDel(null); }} role="checkbox" aria-checked={!!vis} disabled={!!f.key}
            title={f.key ? 'Cột khoá, luôn hiện' : f.required ? 'Cột bắt buộc: ẩn thì báo cáo sẽ thiếu cột này' : undefined}>
            <i aria-hidden="true">{vis ? '✓' : ''}</i><span className="tvl">{f.col}</span><span className="tvn">{f.name}</span>{f.key ? <small>khoá</small> : f.required ? <small>bắt buộc</small> : null}</button>); })}</div>
        <h3 className="tvh">Phiên bản đã lưu <span>{list.length}</span></h3>
        <div className="tvvs">{list.slice().sort((a, c) => c.n - a.n).map((v) => { const h = tvNorm(v.hidden); const cur = m?.id === v.id; return (
          <div key={v.id} className={'tvv' + (cur ? ' cur' : '')}><div className="tvvt"><b>v{v.n} · {v.name}</b>{cur && <span className="tvst ok">Đang dùng</span>}</div>
            {v.note && <p>{v.note}</p>}
            <div className="tvvm"><span>{tvWeeksOf(h)} tuần · {tvCount(h)}/{FIELDS.length} cột · {v.by}, {v.at}</span><span className="tvsp" />
              {!cur && <button className="btn sm" onClick={() => { tvApply(v.id); setDel(null); }}>Dùng bản này</button>}
              {v.id !== 'v1' && (del === v.id ? <button className="btn sm tvdel" onClick={() => { tvDelete(v.id); setDel(null); }}>Bấm lại để xoá</button> : <button className="ticon sm" onClick={() => setDel(v.id)} aria-label={`Xoá phiên bản v${v.n}`} title="Xoá">✕</button>)}</div></div>); })}</div>
      </div>
      <div className="tvfoot">
        {form ? (
          <div className="tvform">
            <label className="tvf"><span>Tên phiên bản</span><input className="inp" autoFocus maxLength={60} placeholder="Ví dụ: Báo cáo 2 tuần cho giám đốc" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setForm(false); }} /></label>
            <label className="tvf"><span>Ghi chú (không bắt buộc)</span><input className="inp" maxLength={120} placeholder="Dùng cho họp nào, ai nhận" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setForm(false); }} /></label>
            {err && <p className="tverr" role="alert">{err}</p>}
            <div className="tvfb"><button className="btn pri" onClick={save}>Lưu v{nextN}</button><button className="btn" onClick={() => { setForm(false); setErr(null); }}>Huỷ</button><small>{weeks} tuần · {tvCount(hid)}/{FIELDS.length} cột</small></div>
          </div>
        ) : <button className="btn pri tvsave" onClick={() => { setForm(true); setErr(null); }} disabled={!dirty} title={dirty ? undefined : 'Chưa có thay đổi nào so với phiên bản đang dùng'}>Lưu thành phiên bản mới</button>}
      </div>
    </aside>
  );
}
