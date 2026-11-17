import { useRef, useState } from 'react';
import type { RiskFilter, RiskPriority } from '@/types';
import { RISK_CATEGORIES, RISK_CRITERIA, RISK_MATRIX, RISK_SIGNALS } from '@/data/risk';
import { COLOR_CLASS, riskList, type RiskItem } from '@/lib/risk';
import { useAppState, useRows } from '@/hooks/useDerived';
import { exGo, setView } from '@/store/actions/flow';
import {
  riskApprove, riskDrop, riskEditCancel, riskEditSave, riskEditStart, riskFilter, riskRerun, riskSelect, riskUndo,
} from '@/store/actions/risk';

const PRIORITIES: RiskPriority[] = ['P1', 'P2', 'P3', 'P4'];

function EditForm({ item }: { item: RiskItem }) {
  const [priority, setPriority] = useState<RiskPriority>(item.priority);
  const [category, setCategory] = useState(item.decision?.category || item.c.category);
  const [reason, setReason] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const save = () => { if (!riskEditSave(item.c.id, priority, category, reason)) reasonRef.current?.focus(); };
  return (
    <div className="redit">
      <h3>Sửa kết quả của AI</h3>
      <label>Mức ưu tiên
        <select value={priority} onChange={(e) => setPriority(e.target.value as RiskPriority)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select>
      </label>
      <label>Loại vấn đề
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {Object.keys(RISK_CATEGORIES).map((k) => <option key={k} value={k}>{k} {RISK_CATEGORIES[k]}</option>)}
        </select>
      </label>
      <label className="full">Lý do sửa (để AI học cho lần sau)
        <textarea ref={reasonRef} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ví dụ: dự án này khách hàng chiến lược, trễ UAT là P1" />
      </label>
      <div className="rbtns"><button className="btn" onClick={riskEditCancel}>Huỷ</button><button className="btn abtn" onClick={save}>Lưu</button></div>
    </div>
  );
}

function DecisionLine({ item }: { item: RiskItem }) {
  const d = item.decision!;
  const text = d.kind === 'ok' ? `Bạn đã đồng ý lúc ${d.at}.`
    : d.kind === 'drop' ? `Bạn đã bỏ lúc ${d.at}. Vấn đề không vào báo cáo.`
      : `Bạn đã sửa lúc ${d.at}: ${d.from} → ${d.priority}${d.category !== item.c.category ? `, ${item.c.category} → ${d.category}` : ''}. Lý do: ${d.reason}. Ca này sẽ thành ví dụ cho lần chấm sau.`;
  return <p className={'rstl ' + d.kind}>{text} <button className="alink" onClick={() => riskUndo(item.c.id)}>Hoàn tác</button></p>;
}

function Detail({ item, editing }: { item: RiskItem; editing: boolean }) {
  const { c: o, score: sc, decision: dec, row } = item;
  const cls = COLOR_CLASS[item.color];
  const category = dec?.category || o.category;
  const std = (RISK_MATRIX[category] || [])[Math.min(4, sc.impact) - 1];
  const dueText = sc.blocked ? 'đang chặn' : sc.daysToDue < 0 ? `quá hạn ${-sc.daysToDue} ngày` : `còn ${sc.daysToDue} ngày đến hạn`;
  return (
    <>
      <div className="rdh">
        <div><span className={'rp big ' + cls}>{item.priority}</span><span className={'rcol ' + cls}>{item.color}</span></div>
        <div className="rdt">
          <h2>{row.code} · {row.task}</h2>
          <small>{o.source} · <button className="alink" onClick={() => exGo(row.i)}>Mở dòng trên bảng</button></small>
        </div>
        {!dec && !editing && (
          <div className="rbtn">
            <button className="btn" onClick={() => riskDrop(o.id)}>Bỏ</button>
            <button className="btn" onClick={() => riskEditStart(o.id)}>Sửa</button>
            <button className="btn abtn" onClick={() => riskApprove(o.id)}>Đồng ý</button>
          </div>
        )}
      </div>
      <blockquote className="rq">{o.text}</blockquote>
      {o.confidence === 'low' && <div className="runs"><b>AI chưa chắc.</b> {o.uncertainty}</div>}
      {dec && <DecisionLine item={item} />}
      {editing && <EditForm item={item} />}

      <div className="rsec">
        <h3>Phân loại <span className="by ai">AI</span></h3>
        <p><b>{o.kind}{o.probability ? `, xác suất ${o.probability.toLowerCase()}` : ''}</b> · <b>{category} {RISK_CATEGORIES[category]}</b></p>
        <p className="rwhy">{o.why}</p>
      </div>

      <div className="rsec">
        <h3>Chấm điểm <span className="by sys">Hệ thống tính</span></h3>
        <div className="rgrid">
          <div>
            <div className="rlbl">Impact = cao nhất của 5 khía cạnh: <b>{sc.impact}</b></div>
            {sc.aspects.map((a) => (
              <div key={a.name} className={'ra' + (a.level === sc.impact ? ' top' : '')}>
                <span className="ran">{a.name}</span><span className="rab"><i style={{ width: a.level * 25 + '%' }} /></span><span className="rav">{a.level}</span><small>{a.note}</small>
              </div>
            ))}
          </div>
          <div>
            <div className="rlbl">Urgency: <b>{sc.urgency}</b></div>
            <p className="rurg">Cơ sở {sc.baseUrgency} ({dueText})</p>
            {sc.adjustments.length > 0 && <div className="radjs">{sc.adjustments.map((a, k) => <span key={k} className="radj">{a[0]} {a[1]}</span>)}</div>}
            <div className="rform"><span>Điểm</span><b>{sc.impact} × {sc.urgency} = {sc.score}</b><span>→ {sc.priority}, {sc.color.toLowerCase()} vì {sc.colorReason}</span></div>
          </div>
        </div>
      </div>

      {o.signals.length > 0 && (
        <div className="rsec">
          <h3>Dấu hiệu rủi ro</h3>
          <ul className="rsig">{o.signals.map((g) => <li key={g[0]}><code>{g[0]}</code><div><div>{RISK_SIGNALS[g[0]] || ''}</div><small>{g[1]}</small></div></li>)}</ul>
        </div>
      )}

      <div className="rsec">
        <h3>Action đề xuất <span className="by ai">AI</span></h3>
        {std && <p className="rstd">Action chuẩn theo ma trận ({category}, Impact {sc.impact}): {std}</p>}
        <ul className="ract">
          {o.actions.map((a, k) => (
            <li key={k}>
              <span className="rac">{a.ref ? <code>{a.ref}</code> : <code className="nw">mới</code>}</span>
              <div><div>{a.text}</div><small>{a.owner}, hạn {a.due}</small></div>
            </li>
          ))}
        </ul>
        <p className="rclose"><b>Đóng khi:</b> {o.closeWhen}</p>
      </div>

      {o.missingInfo.length > 0 && (
        <div className="rsec"><h3>Còn thiếu thông tin</h3><ul className="rmiss">{o.missingInfo.map((m) => <li key={m}>{m}</li>)}</ul></div>
      )}

      <div className="rsec">
        <h3>Ca mẫu tương tự</h3>
        <p className="rsim">{o.similarCases.map((v) => <code key={v}>{v} </code>)}<span>trong Bộ tiêu chí, dùng để chấm cho nhất quán</span></p>
      </div>
    </>
  );
}

export function RiskView() {
  const s = useAppState();
  const rows = useRows();
  if (!s.loaded) {
    return (
      <div className="gridwrap gut" style={{ paddingBlock: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Chưa có dữ liệu tuần này</div>
        <button className="btn pri" style={{ marginTop: 14 }} onClick={() => setView('import')}>Tới bước Nhập file</button>
      </div>
    );
  }
  const list = riskList(s);
  const { flt, sel, edit } = s.rid;
  const count = { e: 0, w: 0, o: 0, d: 0 };
  let unsure = 0, pending = 0;
  list.forEach((x) => { count[COLOR_CLASS[x.color]]++; if (x.c.confidence === 'low') unsure++; if (!x.decision) pending++; });
  const shown = list.filter((x) => flt === 'all' || (flt === 'un' ? x.c.confidence === 'low' : flt === 'pend' ? !x.decision : COLOR_CLASS[x.color] === flt));
  const cur = shown.find((x) => x.c.id === sel) || shown[0];
  const Chip = ({ k, label, n }: { k: RiskFilter; label: string; n: number }) => (
    <button className={'rf' + (flt === k ? ' on' : '')} onClick={() => riskFilter(k)} aria-pressed={flt === k}>{label} <b>{n}</b></button>
  );
  return (
    <div className="gridwrap gut ridw">
      <header className="rhd">
        <div>
          <h1>Đánh giá rủi ro và vấn đề</h1>
          <p>
            AI đã chấm <b>{list.length} vấn đề</b> từ {rows.length} dự án theo Bộ tiêu chí {RISK_CRITERIA.version}:{' '}
            <b className="hl e">{count.e} đỏ</b>, <b className="hl w">{count.w} vàng</b>, <b className="hl ok">{count.o} xanh</b>{count.d ? `, ${count.d} lưu ý dữ liệu` : ''}.
            {unsure > 0 && <> Có <b className="hl w">{unsure} ca AI chưa chắc</b>, nên xem trước.</>}
          </p>
        </div>
        <div className="rhr">
          <span className="rver">Bộ tiêu chí {RISK_CRITERIA.version}, cập nhật {RISK_CRITERIA.updatedAt}</span>
          <button className="btn" onClick={riskRerun}>Chấm lại</button>
        </div>
      </header>
      <div className="rfl">
        <Chip k="all" label="Tất cả" n={list.length} /><Chip k="pend" label="Chờ duyệt" n={pending} /><Chip k="un" label="AI chưa chắc" n={unsure} />
        <Chip k="e" label="Đỏ" n={count.e} /><Chip k="w" label="Vàng" n={count.w} /><Chip k="o" label="Xanh" n={count.o} />
      </div>
      <div className="rcols">
        <ol className="rlist" aria-label="Danh sách vấn đề">
          {shown.map((x) => {
            const on = x.c.id === cur?.c.id, d = x.decision, cls = COLOR_CLASS[x.color];
            return (
              <li key={x.c.id}>
                <button className={'rit ' + cls + (on ? ' on' : '') + (d?.kind === 'drop' ? ' dropped' : '')} onClick={() => riskSelect(x.c.id)} aria-current={on ? 'true' : undefined}>
                  <span className={'rp ' + cls}>{x.priority}</span>
                  <span className="rtx"><b>{x.row.code} · {RISK_CATEGORIES[d?.category || x.c.category]}</b><small>{x.c.text}</small></span>
                  <span className="rme">
                    {x.c.confidence === 'low' && <span className="run" title="AI chưa chắc">?</span>}
                    {d && <span className={'rst ' + (d.kind === 'ok' ? 'ok' : d.kind === 'drop' ? 'mut' : 'ed')}>{d.kind === 'ok' ? 'Đã đồng ý' : d.kind === 'drop' ? 'Đã bỏ' : 'Đã sửa'}</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="rempty">Không có vấn đề nào trong nhóm này.</li>}
        </ol>
        <section className="rdet" aria-live="polite">{cur && <Detail item={cur} editing={edit === cur.c.id} />}</section>
      </div>
    </div>
  );
}
