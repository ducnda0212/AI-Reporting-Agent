/* Màn "Trợ lý" toàn trang (kiểu SchoolAI): lời chào + ô nhập lớn + danh sách gợi ý ở giữa, lịch sử ở cột phải.
   Dùng chung dữ liệu chat với khung AI bên phải (state.askLog, state.chats). Agent không ghi thẳng vào bảng:
   lệnh sửa chỉ tạo bản xem trước, bảng chỉ đổi khi bấm "Áp dụng". Chỉ gắn khi state.view === 'ai'. */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ASKQ } from '@/data/constants';
import { agExamples, exTT } from '@/lib/ai';
import { activeWkOf } from '@/lib/cell';
import { rowsOf, useAppState } from '@/store';
import { askSend, chatNew, exGo, warmAgent } from '@/store/actions/ai';
import { wkName } from '@/store/actions/versions';
import { useMic } from '@/hooks/useMic';
import { looksLikeEdit } from '@/lib/agentEdit';
import { AgentRun } from '@/components/panels/AgentRun';
import { History, Stage } from '@/components/panels/AiAssistantPanel';
import '@/styles/ai-answer.css';
import '@/styles/agent-extra.css';

const SIDE_MIN = 240, SIDE_MAX = 520, SIDE_RAIL = 52, SIDE_KEY = 'pmo.asv.side';
const readSide = (): { open: boolean; w: number } => {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 1100;
  try { const v = JSON.parse(localStorage.getItem(SIDE_KEY) || 'null'); if (v && typeof v.w === 'number') return { open: narrow ? false : !!v.open, w: Math.min(SIDE_MAX, Math.max(SIDE_MIN, v.w)) }; } catch { /* bộ nhớ trình duyệt bị chặn: dùng mặc định */ }
  return { open: !narrow, w: 300 };
};
const SIDE_I = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16" /></svg>;
const NEW_I = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;

const MIC_I = <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;

export function AssistantView(): JSX.Element {
  const s = useAppState((x) => x), [q, setQ] = useState('');
  const [side, setSide] = useState(readSide), [drag, setDrag] = useState(false), secRef = useRef<HTMLElement>(null);
  const saveSide = useCallback((v: { open: boolean; w: number }) => { setSide(v); try { localStorage.setItem(SIDE_KEY, JSON.stringify(v)); } catch { /* không lưu được thì thôi */ } }, []);
  const maxW = (): number => Math.min(SIDE_MAX, Math.max(SIDE_MIN, (secRef.current?.clientWidth || 1000) * 0.5));
  const onSep = (e: React.PointerEvent<HTMLDivElement>): void => {   // kéo thanh chia để đổi độ rộng cột lịch sử
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); setDrag(true);
    const right = secRef.current?.getBoundingClientRect().right || window.innerWidth;
    const mv = (ev: PointerEvent): void => setSide((p) => ({ ...p, w: Math.round(Math.min(maxW(), Math.max(SIDE_MIN, right - ev.clientX))) }));
    const up = (): void => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setDrag(false); setSide((p) => { try { localStorage.setItem(SIDE_KEY, JSON.stringify(p)); } catch { /* bỏ qua */ } return p; }); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const onSepKey = (e: React.KeyboardEvent): void => {
    const d = e.key === 'ArrowLeft' ? 24 : e.key === 'ArrowRight' ? -24 : 0;
    if (d) { e.preventDefault(); saveSide({ ...side, w: Math.round(Math.min(maxW(), Math.max(SIDE_MIN, side.w + d))) }); }
  };
  const L = s.askLog, busy = !!L[L.length - 1]?.busy, r0 = s.sel ? s.allRows[s.sel.i] : null;
  const scroll = useRef<HTMLDivElement>(null), ta = useRef<HTMLTextAreaElement>(null);
  const { mic, micMsg, micOk, toggleMic } = useMic((t) => { if (!busy && !looksLikeEdit(t)) askSend(t); else { setQ((p) => (p.trim() ? p.trim() + ' ' : '') + t); ta.current?.focus(); } });   // nói xong tự gửi; đang bận thì giữ chữ trong ô
  useEffect(() => { void warmAgent(); }, []);   // nạp sẵn embeddings cho bảng: câu hỏi đầu tiên không phải chờ
  useEffect(() => { const el = scroll.current; if (el) el.scrollTop = el.scrollHeight; }, [L.length, busy]);
  const send = (t: string): void => { if (t.trim() && !busy) { askSend(t); setQ(''); } };
  const onAns = (e: React.MouseEvent): void => {
    const b = (e.target as Element).closest('[data-act]') as HTMLElement | null; if (!b) return;
    if (b.dataset.act === 'askIdea') askSend(b.dataset.q || ''); else if (b.dataset.act === 'exGo') exGo(+(b.dataset.i || 0));
  };
  const rows = rowsOf(s), wk = wkName(activeWkOf(s), true);
  /* Điều cần chú ý: tính ngay trên trình duyệt từ bảng (không gọi AI); bấm nút mới hỏi Agent */
  const late = rows.filter((r) => exTT(r, s) === 'Chậm tiến độ').length, risk = rows.filter((r) => exTT(r, s) === 'Có nguy cơ chậm').length;
  const drafts = rows.reduce((n, r) => n + (['rui', 'kh', 'vd'] as const).filter((k) => r.ai[k] && !r.ai[k]!.ok).length, 0);
  const att: [string, string][] = [];
  if (late) att.push([late + ' dự án chậm tiến độ', 'Liệt kê các dự án chậm tiến độ và nói ngắn lý do']);
  if (risk) att.push([risk + ' dự án có nguy cơ chậm', 'Liệt kê các dự án có nguy cơ chậm']);
  if (drafts) att.push([drafts + ' ô nháp AI chờ duyệt', 'Những dự án nào đang có ô nháp AI chờ duyệt']);
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
  const asked = L.map((x) => x.q), FQ = ASKQ.filter((x) => !asked.includes(x)).slice(0, 1), FD = agExamples(r0, rows).filter((x) => !asked.includes(x)).slice(0, 2);   // tối đa 3 gợi ý chung, một hàng
  return (
    <section className={'asv' + (side.open ? '' : ' sc')} aria-label="Trợ lý AI" ref={secRef}>
      <div className={'asv-col' + (L.length ? ' chat' : '')}>
        {L.length === 0 ? (
          <>
            <div className="asv-hero">
              <div className="asv-orb" aria-hidden="true"><i /><span>✦</span></div>
              <h2>Chào bạn,<br /><span>hôm nay bạn muốn xem gì ở {wk.toLowerCase()}?</span></h2>
              <p>Agent trả lời từ bảng hiện tại. Lệnh sửa chỉ hiện bản xem trước, bạn duyệt rồi mới áp dụng.</p>
            </div>
            {composer}
            {rows.length > 0 && (
              <div className="asv-att" aria-label={'Điều cần chú ý ở ' + wk.toLowerCase()}>
                <h3>Điều cần chú ý ở {wk.toLowerCase()}</h3>
                {att.length > 0
                  ? <ul>{att.map(([t, q]) => <li key={t}><button data-act="askIdea" data-q={q} onClick={() => askSend(q)}>{t}</button></li>)}</ul>
                  : <p>Chưa thấy dự án chậm, nguy cơ chậm hay nháp AI đang chờ duyệt.</p>}
                <button className="asv-att-go" data-act="askIdea" data-q="Soạn nhận xét PMO ngắn cho tuần này: tình hình chung, dự án chậm và rủi ro cần chú ý" onClick={() => askSend('Soạn nhận xét PMO ngắn cho tuần này: tình hình chung, dự án chậm và rủi ro cần chú ý')}>✦ Soạn nhận xét PMO tuần này</button>
              </div>
            )}
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
            {!busy && !(L[L.length - 1]?.a?.html || '').includes('fx-fu') && (FQ.length > 0 || FD.length > 0) && (   // câu trả lời đã có gợi ý theo ngữ cảnh thì không hiện thêm gợi ý chung
              <div className="asv-fu" aria-label="Gợi ý hỏi tiếp">
                {FQ.map((t) => <button key={t} className="asv-fc" data-act="askIdea" data-q={t} onClick={() => askSend(t)}>{t}</button>)}
                {FD.map((t) => <button key={t} className="asv-fc asv-agt" data-act="askIdea" data-q={t} onClick={() => askSend(t)}><span aria-hidden="true">✦</span>{t}</button>)}
              </div>
            )}
            {composer}
          </>
        )}
      </div>
      {side.open && <div className={'asv-sep' + (drag ? ' on' : '')} role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng cột lịch sử" aria-valuemin={SIDE_MIN} aria-valuemax={SIDE_MAX} aria-valuenow={side.w} tabIndex={0}
        onPointerDown={onSep} onKeyDown={onSepKey} onDoubleClick={() => saveSide({ ...side, w: 300 })} title="Kéo để đổi độ rộng, bấm đúp để về mặc định" />}
      <aside className={'asv-side phai' + (side.open ? ' open' : ' rail')} aria-label="Lịch sử trò chuyện" style={side.open ? { width: side.w } : { width: SIDE_RAIL }}>
        {side.open ? (
          <>
            <div className="asv-sideh"><b>Lịch sử</b>
              <button type="button" className="asv-sb" aria-label="Thu gọn lịch sử" aria-expanded="true" title="Thu gọn" onClick={() => saveSide({ ...side, open: false })}>{SIDE_I}</button></div>
            <History s={s} busy={busy} />
          </>
        ) : (
          <div className="asv-railb">
            <button type="button" className="asv-sb" aria-label="Mở lịch sử" aria-expanded="false" title="Mở lịch sử" onClick={() => saveSide({ ...side, open: true })}>{SIDE_I}</button>
            <button type="button" className="asv-sb" aria-label="Chat mới" title="Chat mới" disabled={busy || !L.length} onClick={() => chatNew()}>{NEW_I}</button>
          </div>
        )}
      </aside>
    </section>
  );
}
