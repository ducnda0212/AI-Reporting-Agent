/* Trợ lý AI (prototype hubAI lớp cuối L12435 + chat mượt L12167 + bản xem trước stgHtml L11941 + khung nhập panelHub L4283).
   Màn chào ai9, hội thoại có "đang gõ…", MỘT hàng .aisug phía trên ô nhập. Agent không ghi thẳng vào bảng:
   lệnh sửa chỉ tạo bản xem trước (state.stages), bảng chỉ đổi khi bấm "Áp dụng". App chỉ gắn khi state.panel === 'ai'. */
import { Fragment, useEffect, useRef, useState } from 'react';
import { transcribeAudio } from '@/lib/api';
import { Recorder, voiceSupported } from '@/lib/voice';
import { ASKQ } from '@/data/constants';
import { agExamples } from '@/lib/ai';
import { activeWkOf, displayText, fieldById } from '@/lib/cell';
import { now, rowsOf, useAppState } from '@/store';
import { chatClear, chatDelete, chatHistory, chatNew, chatOpen, chatSearch, askSend, exGo, pendingList, stgApply, stgDrop, stgGo, stgMore, stgShow, stgToggle } from '@/store/actions/ai';
import { groupChats, previewOf, whenLabel } from '@/lib/chatHistory';
import { wkName } from '@/store/actions/versions';
import type { AgStage, AppState } from '@/types';
import '@/styles/ai-answer.css';
import { AgentRun } from './AgentRun';
import { PanelShell, PnClose, PnExpand } from './PanelShell';

const short = (name: string): string => name.split(' (')[0];

/** Bản xem trước các thay đổi Agent đề xuất: tick từng dòng, "Xem thêm", "Áp dụng N thay đổi", "Bỏ". */
export function Stage({ id, S, s }: { id: string; S: AgStage; s: AppState }): JSX.Element {
  if (S.st !== 'open') {
    return (
      <div className="stg done"><div className="stgh"><b>{S.st === 'applied' ? '✓ Đã áp dụng ' + S.n + ' thay đổi lên bảng' : 'Đã bỏ bản xem trước'}</b>
        {S.st === 'applied' && <button className="alink" data-act="stgShow" data-s={id} onClick={() => stgShow(id)}>Xem trên bảng</button>}</div></div>
    );
  }
  const on = S.items.filter((x) => !x.off).length, shown = S.more ? S.items : S.items.slice(0, 8);
  const fields = S.items.map((x) => x.f).filter((v, i, A) => A.indexOf(v) === i).map((fid) => short(fieldById(fid)!.name)).join(', ');
  return (
    <div className="stg agfill">
      <div className="stgh"><b><span className="agsp" aria-hidden="true">✦</span> Agent đã soạn · xem trước</b><span>{S.items.length + ' ô · ' + fields}</span></div>
      <table className="stgt"><thead><tr><th /><th>Mã DA</th><th>Hiện tại</th><th>Đề xuất</th></tr></thead><tbody>
        {shown.map((x, k) => {
          const rr = s.allRows[x.i], f = fieldById(x.f)!;
          return (
            <tr key={k} className={'agr' + (x.off ? ' off' : '')} style={{ animationDelay: Math.min(k, 9) * 80 + 150 + 'ms' }}>
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
        <h3>Chào {s.lockBy || 'Khuê'}, cần gì cho <em>{wkName(activeWkOf(s), true)}</em>?</h3>
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

const ico = (d: string): JSX.Element => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const PLUS_I = ico('M12 5v14M5 12h14'), CLOCK_I = ico('M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'), BACK_I = ico('M15 18l-6-6 6-6'),
  TRASH_I = ico('M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6'), SEARCH_I = ico('M21 21l-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z');

/** Màn "Lịch sử": ô tìm kiếm, nhóm theo ngày, mỗi dòng có tiêu đề, câu trả lời gần nhất, giờ. Xoá từng cuộc hoặc xoá tất cả đều hỏi lại một bước ngay trên dòng. */
export function History({ s, busy }: { s: AppState; busy: boolean }): JSX.Element {
  const [askDel, setAskDel] = useState(''), [askAll, setAskAll] = useState(false);
  const nowMs = now().getTime(), groups = groupChats(s.chats, nowMs, s.chatQ), n = s.chats.length;
  return (
    <div className="hbd chh">
      <div className="chhtop">
        <label className="chhs">{SEARCH_I}<input className="chhq" type="search" value={s.chatQ} placeholder="Tìm trong lịch sử" aria-label="Tìm trong lịch sử trò chuyện" onChange={(e: React.ChangeEvent<HTMLInputElement>) => chatSearch(e.target.value)} /></label>
        <button className="btn sm pri" disabled={busy} onClick={() => chatNew()}>{PLUS_I} Chat mới</button>
      </div>
      {n > 0 && (askAll
        ? <div className="chhcf" role="alertdialog" aria-label="Xoá toàn bộ lịch sử">
            <p>Xoá toàn bộ <b>{n}</b> cuộc trò chuyện? Việc này không hoàn tác được.</p>
            <div className="acts"><button className="btn sm" onClick={() => setAskAll(false)}>Hủy</button>
              <button className="btn sm dng" data-act="chatClear" disabled={busy} onClick={() => { chatClear(); setAskAll(false); setAskDel(''); }}>Xoá tất cả</button></div>
          </div>
        : <div className="chhmeta"><span>{n} cuộc trò chuyện</span>
            <button className="chhall" data-act="chatClearAsk" disabled={busy} title={busy ? 'Đợi Agent trả lời xong' : 'Xoá toàn bộ lịch sử'} onClick={() => { setAskAll(true); setAskDel(''); }}>Xoá tất cả</button></div>)}
      {!n ? <p className="chhe">Chưa có cuộc trò chuyện nào. Hỏi Agent một câu, cuộc trò chuyện sẽ được lưu ở đây.</p>
        : !groups.length ? <p className="chhe">Không có cuộc trò chuyện nào khớp “{s.chatQ}”.</p>
        : groups.map((g) => (
          <section key={g.label} className="chhg">
            <h4>{g.label}</h4>
            {g.items.map((c) => askDel === c.id
              ? <div key={c.id} className="chhrc" role="alertdialog" aria-label={'Xoá cuộc trò chuyện ' + c.title}>
                  <span>Xoá “{c.title}”?</span>
                  <button className="btn sm" onClick={() => setAskDel('')}>Hủy</button>
                  <button className="btn sm dng" data-act="chatDelete" disabled={busy} onClick={() => { chatDelete(c.id); setAskDel(''); }}>Xoá</button>
                </div>
              : <div key={c.id} className={'chhr' + (c.id === s.chatId ? ' cur' : '')}>
                  <button className="chho" disabled={busy} onClick={() => chatOpen(c.id)}>
                    <span className="chht">{c.title}{c.id === s.chatId && <em>đang mở</em>}</span>
                    <span className="chhp">{previewOf(c)}</span>
                  </button>
                  <time>{whenLabel(c.at, nowMs)}</time>
                  <button className="chhx" aria-label={'Xoá cuộc trò chuyện ' + c.title} title={busy ? 'Đợi Agent trả lời xong' : 'Xoá cuộc trò chuyện này'} disabled={busy} onClick={() => setAskDel(c.id)}>{TRASH_I}</button>
                </div>)}
          </section>
        ))}
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
  const busyRef = useRef(busy); busyRef.current = busy;
  /* giọng nói: Alt+M (hoặc Ctrl+M) bật/tắt thu âm; nói xong chữ nhận được tự gửi cho Agent */
  const [mic, setMic] = useState<'idle' | 'rec' | 'busy'>('idle'), [micMsg, setMicMsg] = useState(''), rec = useRef<Recorder | null>(null), taRef = useRef<HTMLTextAreaElement>(null);
  const micOk = voiceSupported();
  const finish = async (): Promise<void> => {
    const r = rec.current; rec.current = null; if (!r) return;
    const wav = r.stop();
    if (!wav) { setMic('idle'); setMicMsg('Không nghe thấy tiếng. Kiểm tra micro rồi thử lại.'); return; }
    setMic('busy'); setMicMsg('Đang chuyển giọng nói thành chữ…');
    try {
      const out = await transcribeAudio(wav);
      if (!out.text) { setMicMsg('Không nhận ra lời nói. Hãy nói rõ hơn.'); }
      else if (busyRef.current) { setQ((p) => (p.trim() ? p.trim() + ' ' : '') + out.text); setMicMsg('Agent đang trả lời, chữ đã điền vào ô chat.'); taRef.current?.focus(); }
      else { askSend(out.text); setMicMsg('Đã gửi cho Trợ lý.'); }
    } catch (e) { setMicMsg(e instanceof Error ? e.message : 'Không nhận dạng được giọng nói.'); }
    setMic('idle');
  };
  const toggleMic = async (): Promise<void> => {
    if (mic === 'busy') return;
    if (mic === 'rec') { await finish(); return; }
    try {
      const r = new Recorder(); await r.start(() => { void finish(); }); rec.current = r; setMic('rec'); setMicMsg('Đang nghe… bấm Alt+M để dừng, Esc để hủy.');
    } catch { setMicMsg('Chưa được dùng micro. Cho phép micro cho trang này trong trình duyệt.'); }
  };
  const micRef = useRef(toggleMic); micRef.current = toggleMic;
  useEffect(() => {
    if (!micOk) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if ((e.altKey || e.ctrlKey) && !e.shiftKey && !e.metaKey && e.key.toLowerCase() === 'm') { e.preventDefault(); void micRef.current(); }
      else if (e.key === 'Escape' && rec.current) { rec.current.cancel(); rec.current = null; setMic('idle'); setMicMsg('Đã hủy ghi âm.'); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); rec.current?.cancel(); rec.current = null; };
  }, [micOk]);
  /* nút trong câu trả lời (HTML của lib/ai): chip gợi ý và mã DA */
  const onAns = (e: React.MouseEvent): void => {
    const b = (e.target as Element).closest('[data-act]') as HTMLElement | null; if (!b) return;
    if (b.dataset.act === 'askIdea') askSend(b.dataset.q || ''); else if (b.dataset.act === 'exGo') exGo(+(b.dataset.i || 0));
  };
  const asked = L.map((x) => x.q);
  const Q = ASKQ.filter((x) => !asked.includes(x)).slice(0, 2), D = agExamples(r0, rowsOf(s)).filter((x) => !asked.includes(x)).slice(0, 2);
  return (
    <PanelShell k="hub" cls="phub phai" label="Trợ lý AI">
      <div className="ph2">
        {s.chatView === 'history'
          ? <><button className="chbtn" aria-label="Quay lại cuộc trò chuyện" title="Quay lại" onClick={() => chatHistory(false)}>{BACK_I}</button><b className="phtitle">Lịch sử</b></>
          : <b className="phtitle">Trợ lý AI</b>}
        {s.chatView !== 'history' && <>
          <button className="chbtn" data-act="chatNew" aria-label="Chat mới" title={busy ? 'Đợi Agent trả lời xong' : 'Chat mới'} disabled={busy || !L.length} onClick={() => chatNew()}>{PLUS_I}</button>
          <button className="chbtn" data-act="chatHist" aria-label="Lịch sử trò chuyện" title="Lịch sử trò chuyện" onClick={() => chatHistory(true)}>{CLOCK_I}{s.chats.length > 0 && <i>{s.chats.length}</i>}</button>
        </>}
        <PnExpand k="hub" /><PnClose />
      </div>
      {s.chatView === 'history' ? <History s={s} busy={busy} /> : <>
      <div className="hbd" id="askScroll" ref={scroll} onClick={onAns}>
        <div className="aiwrap">
          {r0 && <div className="ctxchip">◎ <span>Đang chọn <b>{r0.ma}</b> · {r0.viec}</span></div>}
          {!L.length ? <Welcome s={s} /> : L.map((x, k) => {
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
      {L.length > 0 && !busy && (
        <div className="aisug"><span className="aisugl">Gợi ý</span><div className="aisugs">
          {Q.map((x) => <button key={x} className="aisp" data-act="askIdea" data-q={x} onClick={() => askSend(x)}>{x}</button>)}
          {D.map((x) => <button key={x} className="aisp agp" data-act="askIdea" data-q={x} onClick={() => askSend(x)}><span aria-hidden="true">✦</span>{x}</button>)}
        </div></div>
      )}
      <div className="aiin">
        <textarea id="askIn" ref={taRef} rows={1} value={q} onChange={(e) => setQ(e.target.value)} placeholder={r0 ? 'Hỏi về ' + r0.ma + ' hoặc cả tuần…' : 'Hỏi về dữ liệu tuần này…'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(q); } }} />
        <div className="r"><small className={mic === 'rec' ? 'rec' : ''} role="status">{micMsg || 'Trả lời từ bảng ' + wkName(activeWkOf(s), true).toLowerCase() + ', ghi rõ cột nguồn'}</small>
          {micOk && <button className={'aimic' + (mic === 'rec' ? ' on' : '')} data-act="askMic" aria-label={mic === 'rec' ? 'Dừng ghi âm' : 'Nói để hỏi (Alt+M)'} title="Nói để hỏi (Alt+M)" disabled={mic === 'busy'} onClick={() => { void toggleMic(); }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></button>}
          <button data-act="askSend" aria-label="Gửi" onClick={() => send(q)}>↑</button></div>
      </div>
      </>}
    </PanelShell>
  );
}
