/* Trợ lý AI (prototype hubAI lớp cuối L12435 + chat mượt L12167 + bản xem trước stgHtml L11941 + khung nhập panelHub L4283).
   Màn chào ai9, hội thoại có "đang gõ…", MỘT hàng .aisug phía trên ô nhập. Agent không ghi thẳng vào bảng:
   lệnh sửa chỉ tạo bản xem trước (state.stages), bảng chỉ đổi khi bấm "Áp dụng". App chỉ gắn khi state.panel === 'ai'. */
import { Fragment, useEffect, useRef, useState } from 'react';
import { ASKQ } from '@/data/constants';
import { agExamples } from '@/lib/ai';
import { displayText, fieldById } from '@/lib/cell';
import { rowsOf, useAppState } from '@/store';
import { askSend, exGo, pendingList, stgApply, stgDrop, stgGo, stgMore, stgShow, stgToggle } from '@/store/actions/ai';
import { wkName } from '@/store/actions/versions';
import type { AgStage, AppState } from '@/types';
import { PanelShell, PnClose, PnExpand } from './PanelShell';

const short = (name: string): string => name.split(' (')[0];

/** Bản xem trước các thay đổi Agent đề xuất: tick từng dòng, "Xem thêm", "Áp dụng N thay đổi", "Bỏ". */
function Stage({ id, S, s }: { id: string; S: AgStage; s: AppState }): JSX.Element {
  if (S.st !== 'open') {
    return (
      <div className="stg done"><div className="stgh"><b>{S.st === 'applied' ? '✓ Đã áp dụng ' + S.n + ' thay đổi lên bảng' : 'Đã bỏ bản xem trước'}</b>
        {S.st === 'applied' && <button className="alink" data-act="stgShow" data-s={id} onClick={() => stgShow(id)}>Xem trên bảng</button>}</div></div>
    );
  }
  const on = S.items.filter((x) => !x.off).length, shown = S.more ? S.items : S.items.slice(0, 8);
  const fields = S.items.map((x) => x.f).filter((v, i, A) => A.indexOf(v) === i).map((fid) => short(fieldById(fid)!.name)).join(', ');
  return (
    <div className="stg">
      <div className="stgh"><b>Xem trước</b><span>{S.items.length + ' ô · ' + fields}</span></div>
      <table className="stgt"><thead><tr><th /><th>Mã DA</th><th>Hiện tại</th><th>Đề xuất</th></tr></thead><tbody>
        {shown.map((x, k) => {
          const rr = s.allRows[x.i], f = fieldById(x.f)!;
          return (
            <tr key={k} className={x.off ? 'off' : ''}>
              <td><input type="checkbox" data-act="stgTog" data-s={id} data-k={k} checked={!x.off} onChange={() => stgToggle(id, k)} aria-label={'Chọn thay đổi ' + rr.ma} /></td>
              <td onClick={() => stgGo(x.i, x.f)}><span className="c2code">{rr.ma}</span><small>{f.col + ' · ' + short(f.name)}</small></td>
              <td className="stgf" title={x.from}>{x.kind === 'approve' ? <em>nháp AI</em> : x.from ? x.from : <i>trống</i>}</td>
              <td className="stgn" title={x.to}>{(x.kind === 'approve' ? 'Duyệt: ' : '') + x.to}</td>
            </tr>
          );
        })}
      </tbody></table>
      {S.items.length > 8 && !S.more && <button className="alink stgm" data-act="stgMore" data-s={id} onClick={() => stgMore(id)}>{'Xem thêm ' + (S.items.length - 8) + ' thay đổi'}</button>}
      <div className="stga">
        <button className="btn sm pri" data-act="stgApply" data-s={id} disabled={!on} onClick={() => stgApply(id)}>{'Áp dụng ' + on + ' thay đổi'}</button>
        <button className="btn sm" data-act="stgDrop" data-s={id} onClick={() => stgDrop(id)}>Bỏ</button>
      </div>
    </div>
  );
}

/** Dải chữ chạy ngang, nhân đôi để chạy vòng; dừng khi rê chuột (CSS). */
function Row({ L, ag, rev }: { L: string[]; ag: boolean; rev: boolean }): JSX.Element {
  const chip = (q: string, dup: boolean): JSX.Element => (
    <button key={q + (dup ? '#' : '')} className={'ai9c' + (ag ? ' ag9' : '')} data-act="askIdea" data-q={q} {...(dup ? { 'aria-hidden': true, tabIndex: -1 } : {})} onClick={() => askSend(q)}>
      {ag && <span aria-hidden="true">✦</span>}{q}
    </button>
  );
  return <div className={'ai9row' + (rev ? ' rev' : '')}><div className="ai9track">{L.map((q) => chip(q, false))}{L.map((q) => chip(q, true))}</div></div>;
}

function Welcome({ s }: { s: AppState }): JSX.Element {
  const rows = rowsOf(s), r0 = s.sel ? s.allRows[s.sel.i] : null, td = fieldById('td')!;
  const late = rows.filter((r) => displayText(r, td, s) === 'Chậm tiến độ').length, pend = pendingList(s).length;
  const Q = [r0 ? 'Tóm tắt dự án đang chọn' : ASKQ[0], ASKQ[1], ASKQ[2], ASKQ[3]], D = agExamples(r0, rows);
  const stat = (n: number, t: string, cls: string, q: string): JSX.Element => <button className={'ai9st ' + cls} data-act="askIdea" data-q={q} onClick={() => askSend(q)}><b>{n}</b>{t}</button>;
  return (
    <div className="ai9">
      <div className="ai9hero"><div className="ai9orb" aria-hidden="true"><i /><span>✦</span></div>
        <h3>Chào {s.lockBy || 'Khuê'}, cần gì cho <em>{wkName('w3', true)}</em>?</h3>
        <p>Hỏi về số liệu, hoặc nhờ Agent sửa bảng. Agent gửi bản xem trước, bạn duyệt mới áp dụng.</p>
        <div className="ai9sts">
          {stat(rows.length, 'dự án', '', 'Tóm tắt tuần này')}
          {stat(late, 'chậm tiến độ', late ? 'bad' : '', 'Dự án nào có nguy cơ trễ?')}
          {stat(pend, 'nháp chờ duyệt', pend ? 'ai' : '', 'Duyệt hết nháp của ' + (rows[0] ? rows[0].ma : ''))}
        </div>
      </div>
      <div className="ai9lbl">Hỏi nhanh</div><Row L={Q} ag={false} rev={false} />
      <div className="ai9lbl">Nhờ Agent làm</div><Row L={D} ag rev />
    </div>
  );
}

export function AiAssistantPanel(): JSX.Element {
  const s = useAppState((x) => x), [q, setQ] = useState('');
  const scroll = useRef<HTMLDivElement>(null), L = s.askLog, busy = !!L[L.length - 1]?.busy;
  const r0 = s.sel ? s.allRows[s.sel.i] : null;
  /* tin mới: cuộn xuống cuối */
  useEffect(() => { const el = scroll.current; if (el) el.scrollTop = el.scrollHeight; }, [L.length, busy]);
  const send = (t: string): void => { if (t.trim()) { askSend(t); setQ(''); } };
  /* nút trong câu trả lời (HTML của lib/ai): chip gợi ý và mã DA */
  const onAns = (e: React.MouseEvent): void => {
    const b = (e.target as Element).closest('[data-act]') as HTMLElement | null; if (!b) return;
    if (b.dataset.act === 'askIdea') askSend(b.dataset.q || ''); else if (b.dataset.act === 'exGo') exGo(+(b.dataset.i || 0));
  };
  const asked = L.map((x) => x.q);
  const Q = ASKQ.filter((x) => !asked.includes(x)).slice(0, 2), D = agExamples(r0, rowsOf(s)).filter((x) => !asked.includes(x)).slice(0, 2);
  return (
    <PanelShell k="hub" cls="phub" label="Trợ lý AI">
      <div className="ph2"><b className="phtitle">Trợ lý AI</b><PnExpand k="hub" /><PnClose /></div>
      <div className="hbd" id="askScroll" ref={scroll} onClick={onAns}>
        <div className="aiwrap">
          {r0 && <div className="ctxchip">◎ <span>Đang chọn <b>{r0.ma}</b> · {r0.viec}</span></div>}
          {!L.length ? <Welcome s={s} /> : L.map((x, k) => {
            const nw = k === L.length - 1, S = x.stage ? s.stages[x.stage] : undefined;
            return (
              <Fragment key={k}>
                <div className={'askme' + (nw && x.busy ? ' nw' : '')}>{x.q}</div>
                {x.busy
                  ? <div className="askai nw"><span className="aityping" aria-label="Đang trả lời"><i /><i /><i /></span></div>
                  : <div className={'askai' + (nw ? ' nw' : '')}><div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: x.a.html }} />{S && x.stage && <Stage id={x.stage} S={S} s={s} />}</div>}
              </Fragment>
            );
          })}
        </div>
      </div>
      {L.length > 0 && !busy && (
        <div className="aisug"><span className="aisugl">Gợi ý</span><div className="aisugs">
          {Q.map((x) => <button key={x} className="aisp" data-act="askIdea" data-q={x} onClick={() => askSend(x)}>{x}</button>)}
          {D.map((x) => <button key={x} className="aisp agp" data-act="askIdea" data-q={x} onClick={() => askSend(x)}><span aria-hidden="true">✦</span>{x}</button>)}
        </div></div>
      )}
      <div className="aiin">
        <textarea id="askIn" rows={1} value={q} onChange={(e) => setQ(e.target.value)} placeholder={r0 ? 'Hỏi về ' + r0.ma + ' hoặc cả tuần…' : 'Hỏi về dữ liệu tuần này…'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(q); } }} />
        <div className="r"><small>Trả lời từ bảng tuần 3/11, ghi rõ cột nguồn</small><button data-act="askSend" aria-label="Gửi" onClick={() => send(q)}>↑</button></div>
      </div>
    </PanelShell>
  );
}
