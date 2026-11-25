/* Khung "AI soạn nháp" (prototype panelTrace L9897 + trOpen L9950): 3 phần đánh số (AI đọc gì · Luật viết · Nháp AI trả về),
   rê chuột lên câu / trích dẫn thì sáng dòng nguồn (.trl.hl), 3 biến thể viết lại, JSON gửi V-LLM, nút Sửa / Duyệt / Bỏ / Ô nháp kế.
   Mở bằng trOpen(i, f) (state.panel = 'aitrace'). */
import { useState } from 'react';
import { AI_IDS, MAN3, TR_RULES } from '@/data/constants';
import { trDraft, trInputs, trText, type TrVariant } from '@/lib/ai';
import { ck, fieldById } from '@/lib/cell';
import { useAppState } from '@/store';
import { trClose, trDrop, trEdit, trEditNo, trEditOk, trLv, trNext, trOk, trReqToggle, trVar } from '@/store/actions/ai';
import type { AiFieldId, TraceTarget } from '@/types';
import { PanelShell, PnExpand } from './PanelShell';

const VARS: readonly (readonly [TrVariant, string])[] = [['short', 'Ngắn hơn'], ['normal', 'Mặc định'], ['detail', 'Chi tiết hơn']];

function EditBox({ init }: { init: string }): JSX.Element {
  const [v, setV] = useState(init);
  return (
    <>
      <textarea className="rvta" id="trText" rows={4} aria-label="Sửa nháp" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      <div className="tract"><button className="btn sm" data-act="trEditNo" onClick={trEditNo}>Huỷ</button><span className="v2sp" />
        <button className="btn sm pri" data-act="trEditOk" onClick={() => trEditOk(v.trim())}>Lưu và duyệt</button></div>
    </>
  );
}

export function AiTracePanel(): JSX.Element | null {
  const s = useAppState((x) => x), [hl, setHl] = useState<string[]>([]);
  const tg: TraceTarget | null = s.sel && (AI_IDS as readonly string[]).includes(s.sel.f) && s.allRows[s.sel.i] ? { i: s.sel.i, f: s.sel.f } : s.trace;
  const r = tg ? s.allRows[tg.i] : undefined, f = tg ? fieldById(tg.f) : undefined;
  if (!tg || !r || !f) return null;
  const fid = f.id as AiFieldId, key = ck(tg.i, tg.f), d = r.ai[fid], I = trInputs(r, s), v = s.trVar[key] || 'normal', D = trDraft(fid, v, I);
  const gen = trText(D), edited = !!d && d.text !== gen, busy = s.trBusy === key, editing = s.trEdit === key, used: Record<string, 1> = {};
  if (!edited) D.s.forEach((x) => x.refs.forEach((id) => { used[id] = 1; }));
  const st = !d ? <span className="trst no">Chưa có nháp</span> : d.ok ? <span className="trst ok">Đã duyệt</span> : <span className="trst dr">Nháp chờ duyệt</span>;
  const req = { model: 'v-llm-v1-medium', temperature: 0.2, response_format: { type: 'json_schema', schema: fid === 'rui' ? '{ level: "Thấp|Trung bình|Cao", reasons: [{ text, refs }] }' : '{ sentences: [{ text, refs, suggestion? }] }' }, extra_body: { chat_template_kwargs: { enable_thinking: false }, guardrail: 'low' },
    messages: [{ role: 'system', content: 'Bạn soạn cột ' + f.col + ' “' + f.name + '” của báo cáo PMO. Luật: ' + TR_RULES[fid].join('; ') + '. Mỗi câu phải trỏ về id dòng đầu vào.' },
      { role: 'user', content: I.all.map((x) => x.id + ': ' + (x.lab ? x.lab + ' — ' : '') + x.t).join('\n') }] };
  const res = fid === 'rui' ? { level: D.level, reasons: D.s.map((x) => ({ text: x.t, refs: x.refs })) }
    : { sentences: D.s.map((x) => (x.sug ? { text: x.t, refs: x.refs, suggestion: true } : { text: x.t, refs: x.refs })) };
  const canOk = !!d && !d.ok && !editing && !busy;
  const hover = (refs: string[]) => ({ onMouseEnter: () => setHl(refs), onMouseLeave: () => setHl([]) });
  return (
    <PanelShell k="trace" cls="trp" label="AI soạn nháp">
      <div className="trhd"><div><div className="trk">AI soạn nháp</div><b>{r.ma + ' · ' + f.col + ' ' + f.name}</b><span className="trsub">{r.viec}</span></div>
        <PnExpand k="trace" /><button className="iconbtn" data-act="trClose" aria-label="Đóng" onClick={trClose}>✕</button></div>
      <div className="trbody">
        <div className="trsec"><div className="trn"><i>1</i>AI đọc gì</div>
          {I.groups.map((g, k) => (
            <div key={k} className={'trg' + (g.code ? ' code' : '')}><div className="trgh"><b>{g.h}</b><span className={g.warn ? 'w' : ''}>{g.note}</span></div>
              {g.items.length ? g.items.map((x) => (
                <div key={x.id} className={'trl' + (used[x.id] ? ' use' : '') + (hl.includes(x.id) ? ' hl' : '')} data-trid={x.id}><span className="trid">{x.id}</span>
                  {x.lab && <span className="trlab">{x.lab}</span>}<span className="trt">{x.t}</span></div>
              )) : <div className="trl"><span className="trt" style={{ color: 'var(--mut)' }}>Không có dữ liệu</span></div>}
            </div>
          ))}
          <div className="trskip">{'Không gửi cho AI: ' + (I.skipped > 0 ? I.skipped + ' dòng report của các tuần khác, ' : '') + 'các cột còn lại của dự án. Chỉ gửi đúng phần cần cho ô này.'}</div>
        </div>
        <div className="trsec"><div className="trn"><i>2</i>{'Luật viết cho cột ' + f.col}</div><ul className="trrules">{TR_RULES[fid].map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div className="trsec"><div className="trn"><i>3</i>Nháp AI trả về{st}</div>
          {busy ? <div className="trbusy"><span /><span /><span />V-LLM đang viết lại…</div>
            : editing ? <EditBox init={d ? d.text : gen} />
              : (
                <>
                  {fid === 'rui' && (
                    <>
                      <div className="seg trseg">{MAN3.map((o) => <button key={o} data-act="trLv" data-v={o} className={o === (d ? d.text : D.level) ? 'on' : ''} onClick={() => trLv(o)}>{o}{o === D.level && <> <small>AI</small></>}</button>)}</div>
                      <div className="trwhy">Lý do</div>
                    </>
                  )}
                  {fid !== 'rui' && edited && d && (
                    <>
                      <div className="trout edited">{d.text.split('\n').map((l, k) => <span key={k}>{k > 0 && <br />}{l}</span>)}</div>
                      <div className="trnote">Đã sửa tay nên không còn trích dẫn. <button className="link" data-act="trVar" data-v={v} onClick={() => trVar(v)}>Soạn lại từ nguồn</button></div>
                    </>
                  )}
                  {(fid === 'rui' || !edited) && (
                    <>
                      <div className="trout">{D.s.map((x, k) => (
                        <div key={k} className={'trs' + (x.sug ? ' sug' : '') + (x.meta ? ' meta' : '')} data-refs={x.refs.join(' ')} {...hover(x.refs)}>{x.t}
                          {x.refs.length ? x.refs.map((id) => <span key={id} className="cite" data-ref={id} {...hover([id])}>{id}</span>) : x.sug ? <span className="cite sg">gợi ý</span> : <span className="cite nn">không trích</span>}</div>
                      ))}</div>
                      {fid !== 'rui' && <div className="trnote">Rê chuột lên một câu để thấy dòng nguồn ở bước 1.</div>}
                    </>
                  )}
                  {fid !== 'rui' && <div className="trvar"><span>Viết lại:</span>{VARS.map(([k, n]) => <button key={k} className={'chip' + (k === v && !edited ? ' on' : '')} data-act="trVar" data-v={k} onClick={() => trVar(k)}>{n}</button>)}</div>}
                </>
              )}
        </div>
        <details className="trreq" open={s.trReq}><summary data-act="trReq" onClick={(e) => { e.preventDefault(); trReqToggle(); }}>Xem yêu cầu gửi V-LLM và kết quả trả về</summary>
          <div className="trk2">Yêu cầu · POST /v1/chat/completions</div><pre>{JSON.stringify(req, null, 2)}</pre>
          <div className="trk2">Kết quả (JSON đúng khuôn)</div><pre>{JSON.stringify(res, null, 2)}</pre></details>
      </div>
      <div className="trfoot">{d ? <button className="btn sm" data-act="trDrop" onClick={trDrop}>Bỏ nháp</button> : <span />}<span className="v2sp" />
        {fid !== 'rui' && !editing && !busy && <button className="btn sm" data-act="trEdit" onClick={trEdit}>Sửa</button>}
        {!d && !busy && <button className="btn sm pri" data-act="trVar" data-v="normal" onClick={() => trVar('normal')}>Nhờ AI soạn</button>}
        {canOk && <button className="btn sm pri" data-act="trOk" onClick={trOk}>Duyệt</button>}
        {!!d && d.ok && !busy && !editing && <button className="btn sm pri" data-act="trNext" onClick={trNext}>Ô nháp kế ›</button>}</div>
    </PanelShell>
  );
}
