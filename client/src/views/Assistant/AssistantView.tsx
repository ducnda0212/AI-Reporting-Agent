/* Màn "Trợ lý" toàn trang (kiểu SchoolAI): lời chào + ô nhập lớn + danh sách gợi ý ở giữa, lịch sử ở cột phải.
   Dùng chung dữ liệu chat với khung AI bên phải (state.askLog, state.chats). Agent không ghi thẳng vào bảng:
   lệnh sửa chỉ tạo bản xem trước, bảng chỉ đổi khi bấm "Áp dụng". Chỉ gắn khi state.view === 'ai'. */
import { Fragment, useEffect, useRef, useState } from 'react';
import { ASKQ } from '@/data/constants';
import { agExamples } from '@/lib/ai';
import { activeWkOf } from '@/lib/cell';
import { rowsOf, useAppState } from '@/store';
import { askSend, exGo } from '@/store/actions/ai';
import { wkName } from '@/store/actions/versions';
import { useMic } from '@/hooks/useMic';
import { AgentRun } from '@/components/panels/AgentRun';
import { History, Stage } from '@/components/panels/AiAssistantPanel';
import '@/styles/ai-answer.css';

const MIC_I = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;

export function AssistantView(): JSX.Element {
  const s = useAppState((x) => x), [q, setQ] = useState('');
  const L = s.askLog, busy = !!L[L.length - 1]?.busy, r0 = s.sel ? s.allRows[s.sel.i] : null;
  const scroll = useRef<HTMLDivElement>(null), ta = useRef<HTMLTextAreaElement>(null);
  const { mic, micMsg, micOk, toggleMic } = useMic((t) => { if (!busy) askSend(t); else { setQ((p) => (p.trim() ? p.trim() + ' ' : '') + t); ta.current?.focus(); } });   // nói xong tự gửi; đang bận thì giữ chữ trong ô
  useEffect(() => { const el = scroll.current; if (el) el.scrollTop = el.scrollHeight; }, [L.length, busy]);
  const send = (t: string): void => { if (t.trim() && !busy) { askSend(t); setQ(''); } };
  const onAns = (e: React.MouseEvent): void => {
    const b = (e.target as Element).closest('[data-act]') as HTMLElement | null; if (!b) return;
    if (b.dataset.act === 'askIdea') askSend(b.dataset.q || ''); else if (b.dataset.act === 'exGo') exGo(+(b.dataset.i || 0));
  };
  const rows = rowsOf(s), wk = wkName(activeWkOf(s), true);
  const Q = [r0 ? 'Tóm tắt dự án đang chọn' : ASKQ[0], ASKQ[1], ASKQ[2], ASKQ[3]], D = agExamples(r0, rows).slice(0, 3);
  const composer = (
    <div className="asv-in">
      <textarea id="askIn" ref={ta} rows={L.length ? 1 : 2} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Hỏi Trợ lý AI"
        placeholder={r0 ? 'Hỏi về ' + r0.ma + ' hoặc cả tuần…' : 'Hỏi về dữ liệu ' + wk.toLowerCase() + ' hoặc nhờ Agent sửa bảng…'}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(q); } }} />
      <div className="r"><small className={mic === 'rec' ? 'rec' : ''} role="status">{micMsg || 'Trả lời từ bảng ' + wk.toLowerCase() + ', ghi rõ cột nguồn'}</small>
        {micOk && <button className={'aimic' + (mic === 'rec' ? ' on' : '')} data-act="askMic" aria-label={mic === 'rec' ? 'Dừng ghi âm' : 'Nói để hỏi (Alt+M)'} title="Nói để hỏi (Alt+M)" disabled={mic === 'busy'} onClick={() => { void toggleMic(); }}>{MIC_I}</button>}
        <button className="asv-send" data-act="askSend" aria-label="Gửi" disabled={busy || !q.trim()} onClick={() => send(q)}>↑</button></div>
    </div>
  );
  const sug = (t: string, ag: boolean, i: number): JSX.Element => (
    <li key={t} style={{ '--i': i } as React.CSSProperties}>
      <button className={'asv-cd' + (ag ? ' asv-agt' : '')} data-act="askIdea" data-q={t} onClick={() => askSend(t)}>
        <span className="asv-ci" aria-hidden="true">{ag ? '✦' : '?'}</span>
        <span className="asv-ct">{t}</span>
        <span className="asv-cg" aria-hidden="true">→</span>
      </button>
    </li>
  );
  /* gợi ý hỏi tiếp: bỏ những câu đã hỏi */
  const asked = L.map((x) => x.q), FQ = ASKQ.filter((x) => !asked.includes(x)).slice(0, 2), FD = agExamples(r0, rows).filter((x) => !asked.includes(x)).slice(0, 2);
  return (
    <section className="asv" aria-label="Trợ lý AI">
      <div className={'asv-col' + (L.length ? ' chat' : '')}>
        {L.length === 0 ? (
          <>
            <div className="asv-hero">
              <div className="asv-orb" aria-hidden="true"><i /><span>✦</span></div>
              <h2>Chào {s.lockBy || 'Khuê'},<br /><span>hôm nay bạn muốn xem gì ở {wk.toLowerCase()}?</span></h2>
              <p>Agent trả lời từ bảng hiện tại. Lệnh sửa chỉ hiện bản xem trước, bạn duyệt rồi mới áp dụng.</p>
            </div>
            {composer}
            <div className="asv-sec">
              <h3 className="asv-lb">Hỏi nhanh về số liệu</h3>
              <ul className="asv-grid">{Q.map((t, i) => sug(t, false, i))}</ul>
              <h3 className="asv-lb">Nhờ Agent soạn thay đổi</h3>
              <ul className="asv-grid">{D.map((t, i) => sug(t, true, Q.length + i))}</ul>
            </div>
          </>
        ) : (
          <>
            <div className="asv-scroll" id="askScroll" ref={scroll} onClick={onAns}>
              <div className="aiwrap asv-wrap">
                {r0 && <div className="ctxchip">◎ <span>Đang chọn <b>{r0.ma}</b> · {r0.viec}</span></div>}
                {L.map((x, k) => {
                  const nw = k === L.length - 1, S = x.stage ? s.stages[x.stage] : undefined;
                  return (
                    <Fragment key={k}>
                      <div className={'askme' + (nw && x.busy ? ' nw' : '')}>{x.q}</div>
                      {x.busy
                        ? <div className="askai nw agrun"><AgentRun q={x.q} /></div>
                        : <div className={'askai' + (nw ? ' nw' : '')}><div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: x.a.html }} />{S && x.stage && <Stage id={x.stage} S={S} s={s} />}</div>}
                    </Fragment>
                  );
                })}
              </div>
            </div>
            {!busy && (FQ.length > 0 || FD.length > 0) && (
              <div className="asv-fu" aria-label="Gợi ý hỏi tiếp">
                {FQ.map((t) => <button key={t} className="asv-fc" data-act="askIdea" data-q={t} onClick={() => askSend(t)}>{t}</button>)}
                {FD.map((t) => <button key={t} className="asv-fc asv-agt" data-act="askIdea" data-q={t} onClick={() => askSend(t)}><span aria-hidden="true">✦</span>{t}</button>)}
              </div>
            )}
            {composer}
          </>
        )}
      </div>
      <aside className="asv-side phai" aria-label="Lịch sử trò chuyện">
        <div className="asv-sideh"><b>Lịch sử</b></div>
        <History s={s} busy={busy} />
      </aside>
    </section>
  );
}
