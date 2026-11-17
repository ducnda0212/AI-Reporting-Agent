import { useState } from 'react';
import type { Row } from '@/types';
import type { AppState } from '@/store/types';
import { AI_IDS } from '@/data/constants';
import { cellValue, fieldOf } from '@/lib/cell';
import { ASKQ, exPct, exStatus, exWhy, aiText, type AskResult } from '@/lib/exec';
import { aiDoneCount, aiEmpty, blockers, pendingAI, warnings, type Issue } from '@/lib/selectors';
import { useAppState, useRows } from '@/hooks/useDerived';
import { addNote, aiStart, ask, dismissIssue, exGo, goStep, openBuckets, openProject, restoreIssue, setIssFlt, setPanel, setPop, startReview, toggle, toggleNote } from '@/store/actions/flow';

const issueKey = (x: Issue) => x.fix + '|' + x.t.replace(/\d+/g, '#').slice(0, 40);
const shortName = (n: string) => n.split(' (')[0].split(',')[0];

function Code({ r }: { r: Row }) { return <button className="cd" onClick={() => exGo(r.i)}>{r.code}</button>; }

/* ---------- Cảnh báo ---------- */
function IssuesTab({ s, rows }: { s: AppState; rows: Row[] }) {
  const b = blockers(s, rows).map((x) => ({ ...x, sev: 'e' as const }));
  const wAll = warnings(s, rows).map((x) => ({ ...x, sev: 'w' as const }));
  const flt = s.issFlt || 'all';
  const w = wAll.filter((x) => !s.issDis[issueKey(x)]);
  const skipped = wAll.filter((x) => s.issDis[issueKey(x)]);
  const ok = !b.length;
  const Act = ({ x }: { x: Issue }) => {
    const mr = x.fix === 'proj' ? rows.find((r) => r.stages.includes('miss')) : undefined;
    const has = ['map', 'ai', 'check', 'bucket', 'bucketTT', 'bucketTD', 'fix'].includes(x.fix) || mr || x.sev === 'w';
    if (!has) return null;
    return (
      <div className="issact">
        {x.fix === 'map' && <button className="btn sm pri" onClick={() => setPop(x.f!)}>Ánh xạ cột</button>}
        {x.fix === 'ai' && <button className="btn sm pri" onClick={aiStart}>✦ Nhờ AI soạn</button>}
        {x.fix === 'check' && <button className={'btn sm' + (x.sev === 'e' ? ' pri' : '')} onClick={() => goStep(2)}>Xử lý ở bước Kiểm tra</button>}
        {(x.fix === 'bucket' || x.fix === 'bucketTT' || x.fix === 'bucketTD') && <button className="btn sm" onClick={() => openBuckets(x.fix === 'bucketTT' ? 'status' : x.fix === 'bucketTD' ? 'progress' : 'lifecycleStep')}>Mở rổ gom</button>}
        {x.fix === 'fix' && <button className="btn sm" onClick={() => toggle('onlyFix')}>Lọc các dòng này</button>}
        {mr && <button className="btn sm" onClick={() => openProject(mr.i)}>Mở dự án {mr.code}</button>}
        {x.sev === 'w' && <button className="isskip" onClick={() => dismissIssue(issueKey(x), x.t)} title="Ẩn cảnh báo này trong tuần này">Bỏ qua</button>}
      </div>
    );
  };
  const Item = ({ x }: { x: Issue }) => {
    const m = /^(\d+)\s+(.*)$/.exec(x.t);
    return (
      <div className={'issi ' + x.sev}><span className="issic" aria-hidden="true">{x.sev === 'e' ? '!' : '▲'}</span>
        <div className="issb"><div className="isst">{m ? <><span className="issn">{m[1]}</span>{m[2]}</> : x.t}</div><div className="issd">{x.d}</div><Act x={x} /></div></div>
    );
  };
  const Tab = ({ id, t, n, cls }: { id: string; t: string; n: number; cls: string }) => <button className={'isstab ' + cls + (flt === id ? ' on' : '')} onClick={() => setIssFlt(id)}>{t}<span>{n}</span></button>;
  let any = false;
  const blocks: React.ReactNode[] = [];
  if (flt !== 'w' && b.length) { any = true; blocks.push(<div key="e"><div className="issgrp e">Chặn xuất · {b.length}</div>{b.map((x, k) => <Item key={k} x={x} />)}</div>); }
  if (flt !== 'e' && w.length) { any = true; blocks.push(<div key="w"><div className="issgrp w">Cần xem · {w.length}</div>{w.map((x, k) => <Item key={k} x={x} />)}</div>); }
  return (
    <>
      <div className={'issstat ' + (ok ? 'ok' : 'e')}><span className="issstic">{ok ? '✓' : '!'}</span>
        <div><b>{ok ? 'Xuất được báo cáo' : 'Chưa xuất được'}</b>
          <small>{ok ? (w.length ? `còn ${w.length} cảnh báo nên xem, không chặn xuất` : 'không còn cảnh báo nào') : `còn ${b.length} lỗi chặn xuất cần xử lý`}</small></div></div>
      <div className="isstabs"><Tab id="all" t="Tất cả" n={b.length + w.length} cls="" /><Tab id="e" t="Chặn xuất" n={b.length} cls="e" /><Tab id="w" t="Cần xem" n={w.length} cls="w" /></div>
      <div className="pbd issbd">
        {blocks}
        {!any && <div className="issempty"><span>✓</span><b>{flt === 'e' ? 'Không còn lỗi chặn xuất' : 'Không còn cảnh báo nào'}</b><small>Lỗi gắn vào từng ô vẫn được tô đỏ ngay trên bảng.</small></div>}
        {skipped.length > 0 && <>
          <button className="issskipbtn" onClick={() => toggle('issSkipOpen')}>Đã bỏ qua · {skipped.length} {s.issSkipOpen ? '▾' : '▸'}</button>
          {s.issSkipOpen && skipped.map((x, k) => <div key={k} className="issi sk"><span className="issic">–</span><div className="issb"><div className="isst">{x.t}</div><div className="issact"><button className="isskip" onClick={() => restoreIssue(issueKey(x))}>Hiện lại</button></div></div></div>)}
        </>}
      </div>
      <div className="issfoot">Ô lỗi gắn vào từng dòng đã tô đỏ trên bảng · <button className="link" onClick={() => toggle('onlyFix')}>{s.onlyFix ? 'Bỏ lọc' : 'Chỉ xem dòng cần sửa'}</button></div>
    </>
  );
}

/* ---------- AI ---------- */
function AskAnswer({ s, a }: { s: AppState; a: AskResult }) {
  const V = (r: Row, id: string) => cellValue(s, r, fieldOf(s, id)) || '—';
  switch (a.kind) {
    case 'row': { const r = a.r; return <><b>{r.code}</b> · {r.task}<ul><li>Tình trạng: {exStatus(s, r)}{exWhy(s, r) && ` (${exWhy(s, r)})`}</li><li>Hạn {V(r, 'end')} · {exPct(r)}% việc xong · PIC {V(r, 'pic')}</li><li>Mức độ rủi ro: {aiText(r, 'riskLevel') || 'chưa có'}</li></ul><div className="src">Nguồn: cột F, H, J, AC của dòng {r.code}</div></>; }
    case 'late': return <>Có <b>{a.list.length} dự án</b> chậm hoặc có nguy cơ chậm:<ul>{a.list.slice(0, 6).map((r) => <li key={r.i}><Code r={r} /> — {exStatus(s, r).toLowerCase()}, {exWhy(s, r)}</li>)}</ul>{a.list.length > 6 && <div>… và {a.list.length - 6} dự án khác.</div>}<div className="src">Theo quy tắc: còn ≤ 14 ngày tới hạn hoặc Mức độ rủi ro (AC) = Cao · nguồn cột H, J, AC</div></>;
    case 'due': return <>{a.list.length ? <><b>{a.list.length} dự án</b> đến hạn từ nay tới {a.until}:<ul>{a.list.slice(0, 6).map((r) => <li key={r.i}><Code r={r} /> — hạn {V(r, 'end')}, {exPct(r)}% việc xong</li>)}</ul></> : 'Không có dự án nào đến hạn trong 14 ngày tới.'}<div className="src">Nguồn: cột H (Ngày kết thúc) từ dữ liệu hệ thống</div></>;
    case 'sum': return <>Tuần 3/11 có <b>{a.total} dự án</b>: {a.ok} đúng tiến độ, {a.risk} có nguy cơ chậm, {a.late} chậm.<ul><li>Còn {blockers(s, s.allRows).length} lỗi chặn xuất, {warnings(s, s.allRows).length} cảnh báo.</li><li>{pendingAI(s.allRows)} ô nháp AI chờ duyệt.</li><li>So với tuần trước: 2 mã mới (I.A.7.1, II.B.2.1), trường Progress đổi tên.</li></ul><div className="src">Nguồn: bảng tuần 3/11 và bản chốt v2 tuần 02/11</div></>;
    case 'empty': return a.list.length ? <>Các dự án còn nhiều ô bắt buộc trống nhất:<ul>{a.list.slice(0, 5).map((x) => <li key={x.r.i}><Code r={x.r} /> — {x.n} ô trống</li>)}</ul><div className="src">Chỉ tính cột bắt buộc của khối tuần này</div></> : <>Không còn ô bắt buộc nào trống.</>;
    default: return <>Mình chưa trả lời được câu này. Thử hỏi về dự án trễ hạn, sắp đến hạn, ô còn trống, hoặc tóm tắt tuần.</>;
  }
}

function AiTab({ s, rows }: { s: AppState; rows: Row[] }) {
  const p = pendingAI(rows);
  const done = aiDoneCount(rows);
  const ae = aiEmpty(s, rows);
  const r0 = s.sel ? s.allRows[s.sel.i] : null;
  const withDraft = rows.filter((r) => AI_IDS.some((k) => r.ai[k] && !r.ai[k]!.ok));
  const askNode = (x: AppState['askLog'][number], k: number) => (
    <div key={k}><div className="askme">{x.q}</div><div className="askai"><AskAnswer s={s} a={x.a} /></div></div>
  );
  let card: React.ReactNode;
  if (p) {
    card = (
      <div className="aicard"><div className="t">✦ Nháp AI tuần 3/11</div><div className="n">{p} ô chờ duyệt</div><div className="d">{done} ô đã duyệt · {withDraft.length} dự án có nháp</div>
        <div className="bar"><i style={{ width: Math.round((done / (done + p)) * 100) + '%' }} /></div>
        <div className="acts"><button className="btn sm pri" onClick={() => startReview()}>Duyệt từng ô →</button>
          <button className="btn sm" onClick={() => toggle('aiList')}>{s.aiList ? 'Ẩn danh sách' : 'Xem theo dự án'}</button>
          {ae.n > 0 && <button className="btn sm" onClick={aiStart}>✦ Soạn thêm {ae.n} ô</button>}</div>
        {s.aiList && <div className="ailist">{withDraft.map((r) => (
          <button key={r.i} className="rvrow" onClick={() => exGo(r.i)}><span className="ma">{r.code}</span>
            <span className="tx"><b>{r.task}</b><span className="rvchips">{AI_IDS.filter((k) => r.ai[k] && !r.ai[k]!.ok).map((k) => <span key={k}>{shortName(fieldOf(s, k).name)}</span>)}</span></span><em>›</em></button>
        ))}</div>}
      </div>
    );
  } else if (ae.n) {
    card = <div className="aicard"><div className="t">✦ Soạn nháp</div><div className="n">{ae.n} ô trống AI soạn được</div><div className="d">Vấn đề & rủi ro, Kế hoạch tuần sau, Mức độ rủi ro cho {ae.r} dự án. Nháp chỉ vào báo cáo sau khi bạn duyệt.</div><div className="acts"><button className="btn aib" onClick={aiStart}>✦ Nhờ AI soạn {ae.n} ô</button></div></div>;
  } else card = <div className="aicard"><div className="t">✦ Nháp AI</div><div className="n">Đã xong</div><div className="d">{done ? `${done} ô đã duyệt, không còn ô nào chờ.` : 'Không có ô nào cần AI soạn.'}</div></div>;
  const IDEAS: Array<[string, string, string, string, string]> = [
    [r0 ? 'Dự án đang chọn' : 'Nguy cơ trễ', r0 ? `Tóm tắt tiến độ, hạn, rủi ro của ${r0.code}` : 'Dự án chậm hoặc sắp chậm, kèm lý do', r0 ? 'Tóm tắt dự án đang chọn' : ASKQ[0], '◎', 'var(--accentSoft)'],
    ['Sắp đến hạn', 'Dự án kết thúc trong 14 ngày tới', ASKQ[1], '⏱', 'var(--wrnBg)'],
    ['Tóm tắt tuần', 'Số dự án theo tình trạng, việc còn lại', ASKQ[2], '≡', 'var(--okBg)'],
    ['Ô còn trống', 'Dự án thiếu nhiều ô bắt buộc nhất', ASKQ[3], '□', 'var(--aiBg)'],
  ];
  return (
    <div className="aiwrap">{card}
      {r0 && <div className="ctxchip">◎ <span>Đang chọn <b>{r0.code}</b> · {r0.task}</span></div>}
      {!s.askLog.length ? <>
        <div className="aih">Hỏi về dữ liệu tuần này</div>
        <div className="ideas">{IDEAS.map((x) => <button key={x[0]} className="idea" onClick={() => ask(x[2])}><span className="ii" style={{ background: x[4] }}>{x[3]}</span><b>{x[0]}</b><small>{x[1]}</small></button>)}</div>
      </> : <>
        {s.askLog.map(askNode)}
        <div className="asksug">{r0 && <button onClick={() => ask('Tóm tắt dự án đang chọn')}>Tóm tắt {r0.code}</button>}{ASKQ.map((q) => <button key={q} onClick={() => ask(q)}>{q}</button>)}</div>
      </>}
    </div>
  );
}

/* ---------- Ghi chú ---------- */
function NotesTab({ s, rows }: { s: AppState; rows: Row[] }) {
  const codes = [...new Set(rows.map((r) => r.code))];
  const [code, setMa] = useState(codes[0] || '');
  const [tx, setTx] = useState('');
  return (
    <>
      <div className="ntform"><div className="r">
        <select aria-label="Dự án" value={code} onChange={(e) => setMa(e.target.value)}>{codes.map((m) => <option key={m}>{m}</option>)}</select>
        <span style={{ flex: 1 }} /><button className="btn sm pri" onClick={() => { addNote(code, tx); if (tx.trim()) setTx(''); }}>Thêm ghi chú</button></div>
        <textarea value={tx} onChange={(e) => setTx(e.target.value)} placeholder="Câu hỏi cho người lập báo cáo, việc cần nhớ trước khi chốt…" /></div>
      {s.notes.length ? s.notes.map((n, k) => {
        const r = rows.find((x) => x.code === n.code);
        return (
          <div key={k} className={'nti' + (n.done ? ' done' : '')}>
            <div className="h">{r ? <button onClick={() => exGo(r.i)}>{r.code}</button> : n.code}<span>{n.by} · {n.at}</span>
              <button className="dn" onClick={() => toggleNote(k)} style={{ fontFamily: 'var(--font)', color: n.done ? 'var(--mut)' : 'var(--ok)' }}>{n.done ? 'Mở lại' : '✓ Xong'}</button></div>
            <p>{n.text}</p></div>
        );
      }) : <div className="hempty">Chưa có ghi chú nào.</div>}
    </>
  );
}

/** Khung phải nhiều thẻ: Cảnh báo / AI / Ghi chú. */
export function HubPanel() {
  const s = useAppState();
  const rows = useRows();
  const [q, setQ] = useState('');
  const t = s.panel === 'rev' || s.panel === 'ask' ? 'ai' : s.panel;
  const b = blockers(s, rows).length;
  const w = warnings(s, rows).length;
  const p = pendingAI(rows);
  const open = s.notes.filter((n) => !n.done).length;
  const tab = (id: 'issues' | 'ai' | 'note', label: string, badge: number, cls = '', extra = '') => (
    <button className={(t === id ? 'on' : '') + (extra ? ' ' + extra : '')} onClick={() => setPanel(id)}>{label}{badge ? <i className={cls}>{badge}</i> : null}</button>
  );
  const send = () => { if (q.trim()) { ask(q.trim()); setQ(''); } };
  return (
    <aside className="panel phub">
      <div className="ph2">
        <div className="seg3" role="tablist">{tab('issues', 'Cảnh báo', b + w, b ? 'e' : '')}{tab('ai', '✦ AI', p, 'a', 'ai')}{tab('note', 'Ghi chú', open)}</div>
        <button className="pclose" onClick={() => setPanel(null)} aria-label="Đóng panel">✕</button>
      </div>
      {t === 'issues' && <IssuesTab s={s} rows={rows} />}
      {t === 'ai' && <>
        <div className="hbd" id="askScroll"><AiTab s={s} rows={rows} /></div>
        <div className="aiin">
          <textarea id="askIn" rows={1} value={q} onChange={(e) => setQ(e.target.value)} placeholder={s.sel ? `Hỏi về ${s.allRows[s.sel.i].code} hoặc cả tuần…` : 'Hỏi về dữ liệu tuần này…'}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <div className="r"><small>Trả lời từ bảng tuần 3/11, ghi rõ cột nguồn</small><button onClick={send} aria-label="Gửi">↑</button></div>
        </div></>}
      {t === 'note' && <div className="hbd"><NotesTab s={s} rows={rows} /></div>}
    </aside>
  );
}

