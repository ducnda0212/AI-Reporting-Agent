import { useState } from 'react';
import { STAGES } from '@/data/constants';
import { cellValue, fieldOf, labelBad, orgInfo } from '@/lib/cell';
import { useAppState } from '@/hooks/useDerived';
import { saveStage, setPanel, setStage } from '@/store/actions/flow';
import { openEditRequest } from '@/store/actions/catalog';
import type { StageState } from '@/types';

const Q: Record<StageState, string> = { done: 'q-done', doing: 'q-doing', todo: 'q-todo', risk: 'q-risk', miss: 'q-miss' };
const SYM: Record<StageState, string> = { done: '✓', doing: '●', todo: '·', risk: '!', miss: '?' };
const LABEL: Record<StageState, string> = { done: 'Xong', doing: 'Đang làm', todo: 'Chưa làm', risk: 'Rủi ro lớn', miss: 'Thiếu Subtask' };
const card = { padding: '13px 14px' } as const;

/** Panel chi tiết một dự án: 12 giai đoạn AI Lifecycle, dữ liệu từ Jira / hệ thống, Progress Report. */
export function ProjectPanel() {
  const s = useAppState();
  const r = s.panelRow !== null ? s.allRows[s.panelRow] : undefined;
  const [next, setNext] = useState<StageState | ''>('');
  const [why, setWhy] = useState('');
  if (!r) return null;
  const st = r.stages[s.stage];
  const pct = Math.round((r.done / r.total) * 100);
  const prs = (r.pr || []).slice(-3).reverse();
  return (
    <aside className="panel">
      <div className="phd"><div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{r.code}</div>
        <div style={{ fontSize: 11.5, color: 'var(--mut)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.task}</div></div>
        <button className="chip" onClick={() => setPanel(null)} style={{ cursor: 'pointer' }}>Đóng</button></div>
      <div className="pbd">
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ flex: '1 1 auto', height: 6, borderRadius: 999, background: 'var(--line2)', overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: 'var(--accent)' }} /></div>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{pct} %</span></div>
        <div><div className="lbl" style={{ marginBottom: 7 }}>12 giai đoạn AI Lifecycle</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6 }}>
            {r.stages.map((x, k) => (
              <button key={k} className={'stg' + (k === s.stage ? ' on' : '')} onClick={() => setStage(k)}>
                <span className={'sq ' + Q[x]}>{SYM[x]}</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k + 1} · {STAGES[k]}</span></button>
            ))}</div></div>

        <div className="card" style={card}>
          <div className="lbl">Giai đoạn {s.stage + 1} · {STAGES[s.stage]}</div>
          <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 5 }}>Hiện tại: <b>{LABEL[st]}</b></div>
          {st === 'miss' && <div style={{ marginTop: 9, padding: '9px 10px', borderRadius: 7, background: 'var(--row)', border: '1px solid var(--line2)', fontSize: 11.5, color: 'var(--mut)' }}>Giá trị gốc từ Jira: không Subtask nào mang Phase = {s.stage + 1}. Giá trị gốc vẫn được giữ và ghi vào cột Note khi xuất.</div>}
          {r.reasons[s.stage] && <div style={{ marginTop: 9, fontSize: 11.5, color: 'var(--ok)' }}>Đã chỉnh tay · lý do: {r.reasons[s.stage]}</div>}
          <label className="lbl" htmlFor="st-new" style={{ display: 'block', marginTop: 11 }}>Đặt trạng thái</label>
          <select className="sel" id="st-new" style={{ width: '100%', marginTop: 4 }} value={next || st} onChange={(e) => setNext(e.target.value as StageState)}>
            {(['todo', 'doing', 'done', 'risk', 'miss'] as StageState[]).map((k) => <option key={k} value={k}>{LABEL[k]}</option>)}</select>
          <label className="lbl" htmlFor="st-why" style={{ display: 'block', marginTop: 10 }}>Lý do chỉnh <span style={{ color: 'var(--err)' }}>· bắt buộc</span></label>
          <textarea id="st-why" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Ví dụ: đội DevOps xác nhận việc này làm ngoài Jira."
            style={{ width: '100%', marginTop: 4, padding: '8px 9px', border: '1px solid var(--line)', borderRadius: 6, font: '400 12px var(--font)', background: 'var(--bg)', color: 'var(--ink)', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
            <button className="btn sm pri" onClick={() => { saveStage(next || st, why); if (why.trim()) { setWhy(''); setNext(''); } }}>Lưu</button>
            <button className="btn sm" onClick={() => setPanel(null)}>Huỷ</button></div>
        </div>

        <div className="card" style={card}><div className="lbl" style={{ marginBottom: 6 }}>Từ Jira</div>
          <div className="kv"><span style={{ color: 'var(--mut)' }}>Issue</span><b>{r.key}</b></div>
          <div className="kv"><span style={{ color: 'var(--mut)' }}>Assignee</span><b style={{ textAlign: 'right', ...(r.idOnly ? { color: 'var(--wrn)' } : {}) }}>{r.idOnly ? 'chỉ có Assignee Id, không có tên' : [r.pic, r.po, r.tl].filter(Boolean).join(', ')}</b></div>
          {r.poField && <div className="kv"><span style={{ color: 'var(--mut)' }}>Custom field (PO)</span><b style={{ textAlign: 'right' }}>{r.poField}</b></div>}
          <div style={{ fontSize: 11, color: 'var(--mut2)', margin: '4px 0 6px' }}>Tên 1 → PIC (F) · tên 2 → PO (S) · tên 3 → Tech Lead</div>
          <div className="kv"><span style={{ color: 'var(--mut)' }}>Labels</span><b style={{ textAlign: 'right', wordBreak: 'break-all', ...(labelBad(r) ? { color: 'var(--wrn)' } : {}) }}>{r.labels}{labelBad(r) ? ' · lệch nhóm' : ''}</b></div>
          <div className="kv" style={{ borderBottom: 0 }}><span style={{ color: 'var(--mut)' }}>Multi Tags</span><span style={{ color: 'var(--mut2)', fontSize: 12 }}>không có trường này trong file</span></div></div>

        <div className="card" style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><div className="lbl" style={{ flex: 1 }}>Từ hệ thống · chỉ xem</div><button className="btn sm" onClick={() => openEditRequest(r.code)}>Gửi yêu cầu sửa</button></div>
          {!s.catRun.projects[r.code] && <div style={{ fontSize: 11.5, color: 'var(--wrn)', marginBottom: 4 }}>Mã chưa có trên hệ thống</div>}
          {['pic', 'divisionHead', 'department', 'deptHead', 'businessOwner', 'po', 'aiEngineer', 'aiResearcher', 'mlopsEngineer', 'softwareEngineer'].map((id) => {
            const o = orgInfo(s, r, id); const f = fieldOf(s, id);
            return <div className="kv" key={id}><span style={{ color: 'var(--mut)' }}>{f.col} · {f.name}</span>
              <b style={{ textAlign: 'right' }}>{o.v || <span style={{ color: 'var(--mut2)', fontWeight: 400 }}>—</span>}{o.jira && <><br /><span style={{ fontWeight: 400, fontSize: 11, color: '#3f7fe0' }}>Jira ghi “{o.jira}”</span></>}</b></div>;
          })}
        </div>

        <div className="card" style={card}><div className="lbl" style={{ marginBottom: 6 }}>Progress Report · 3 lần cập nhật gần nhất</div>
          {prs.length ? prs.map((e, k) => (
            <div key={k} style={{ padding: '7px 0', borderTop: '1px solid var(--line2)' }}>
              <div style={{ font: '600 11px var(--mono)', color: 'var(--mut)' }}>{e.date}</div>
              <div style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 3 }}>{e.done}</div>
              {e.plan && <div style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 4, color: 'var(--mut)' }}>{e.plan}</div>}
            </div>
          )) : <div style={{ fontSize: 12, color: 'var(--mut2)' }}>Chưa có cập nhật nào.</div>}
          {r.comment && <><div className="lbl" style={{ margin: '9px 0 4px' }}>Comment</div><div style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.comment}</div></>}
        </div>

        <div className="card" style={card}><div className="lbl">Các trường của dòng này</div>
          {['workstream', 'status', 'progress', 'statusAlt', 'businessValue', 'riskLevel', 'lifecycleStep', 'w3Done', 'note'].map((id) => {
            const f = fieldOf(s, id); const v = cellValue(s, r, f);
            return <div className="kv" key={id}><span style={{ color: 'var(--mut)' }}>{f.col} · {f.name}</span><b style={v === null ? { color: 'var(--err)' } : undefined}>{v === null ? 'trống' : v}</b></div>;
          })}
        </div>
      </div>
    </aside>
  );
}
