/* Lớp #spot: làm mờ xung quanh + khung sáng quanh một phần tử + thẻ nổi (prototype renderSpot L5894 / placeSpot L5939).
   Hai chế độ: "Duyệt nháp AI · k/n" (state.review, "Duyệt từng ô") và hướng dẫn từng bước (state.tour). Phím: ← → Enter Esc.
   App gắn một lần ở cuối; tự ẩn khi không có gì chạy. */
import { useEffect, useRef, useState } from 'react';
import { MAN3, TOURS } from '@/data/constants';
import { fieldById } from '@/lib/cell';
import { useAppState } from '@/store';
import { reviewApprove, reviewDrop, reviewExit, reviewMove, reviewTrace } from '@/store/actions/ai';
import { loadSampleForTour } from '@/store/actions/flow';
import { tourAutoStart, tourExit, tourGo } from '@/store/actions/help';
import type { AiFieldId } from '@/types';

interface Place { hole: { top: number; left: number; width: number; height: number } | null; card: { top: number; left: number } }

/** Vị trí khung sáng và thẻ quanh phần tử đích (placeSpot): thẻ ở dưới, không đủ chỗ thì lên trên, hay sang bên. */
function place(target: Element | null, card: HTMLElement): Place {
  const vw = window.innerWidth, vh = window.innerHeight, cw = card.offsetWidth, ch = card.offsetHeight;
  if (!target) return { hole: null, card: { left: Math.max(16, (vw - cw) / 2), top: Math.max(16, (vh - ch) / 2) } };
  const rc = target.getBoundingClientRect(), pad = 4, t = Math.max(4, rc.top - pad), l = Math.max(4, rc.left - pad);
  const w = Math.min(vw - 8, rc.right + pad) - l, h = Math.min(vh - 8, rc.bottom + pad) - t;
  let top = rc.bottom + 12;
  if (top + ch > vh - 12) top = rc.top - ch - 12;
  if (top < 12) top = Math.max(12, Math.min(vh - ch - 12, rc.bottom - ch));
  let left = Math.min(Math.max(16, rc.left), vw - cw - 16);
  if (top < rc.bottom && top + ch > rc.top) left = rc.right + 12 + cw < vw ? rc.right + 12 : Math.max(16, rc.left - cw - 12);
  return { hole: { top: t, left: l, width: Math.max(10, w), height: Math.max(10, h) }, card: { top, left } };
}

function ReviewCard(): JSX.Element | null {
  const rv = useAppState((s) => s.review), s = useAppState((x) => x);
  const it = rv ? rv.list[rv.pos] : null, a = it ? s.allRows[it.i]?.ai[it.f as AiFieldId] : undefined;
  const [txt, setTxt] = useState(a ? a.text : '');
  useEffect(() => { setTxt(a ? a.text : ''); }, [rv?.pos, a?.text]);
  /* phím: Enter duyệt & tiếp (Ctrl+Enter khi đang gõ), ← → đi lại, Esc thoát */
  useEffect(() => {
    if (!rv) return;
    const key = (ev: KeyboardEvent): void => {
      const typing = (ev.target as HTMLElement | null)?.id === 'rvText';
      if (ev.key === 'Escape') { ev.preventDefault(); reviewExit(); }
      else if (ev.key === 'Enter' && (!typing || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); reviewApprove(txt); }
      else if (!typing && ev.key === 'ArrowRight') { ev.preventDefault(); reviewMove(1); }
      else if (!typing && ev.key === 'ArrowLeft') { ev.preventDefault(); reviewMove(-1); }
      ev.stopImmediatePropagation();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [rv, txt]);
  if (!rv || !it) return null;
  const r = s.allRows[it.i], f = fieldById(it.f)!, isRui = it.f === 'rui';
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><h3 style={{ flex: '1 1 auto' }}>{'Duyệt nháp AI · ' + (rv.pos + 1) + '/' + rv.list.length}</h3>
        <button className="chip" data-act="rvExit" style={{ cursor: 'pointer' }} onClick={reviewExit}>Thoát · Esc</button></div>
      <div className="rvbar"><i style={{ width: Math.round((rv.pos / rv.list.length) * 100) + '%' }} /></div>
      <p style={{ marginTop: 10 }}><b>{r.ma}</b>{' · ' + r.viec}</p>
      <p style={{ marginTop: 2, color: 'var(--ai)', fontWeight: 600 }}>{f.col + ' · ' + f.name}</p>
      {!a ? <p style={{ color: 'var(--mut)' }}>Nháp đã bị bỏ.</p> : (
        <>
          {isRui ? <div className="seg" style={{ marginTop: 8 }}>{MAN3.map((o) => <button key={o} data-act="rvSeg" data-v={o} className={o === txt ? 'on' : ''} onClick={() => setTxt(o)}>{o}</button>)}</div>
            : <textarea className="rvta" id="rvText" rows={4} aria-label="Nội dung nháp" value={txt} onChange={(e) => setTxt(e.target.value)} autoFocus />}
          <div className="lbl" style={{ marginTop: 10 }}>{'Căn cứ AI dùng · ' + (a.why || '')}</div>
          <div className="spsrc">{a.src || ''}</div>
        </>
      )}
      <div className="spfoot"><button className="btn sm" data-act="rvDrop" onClick={reviewDrop}>Bỏ nháp</button><button className="btn sm" data-act="aiTraceRv" onClick={reviewTrace}>AI soạn ra sao?</button>
        <div style={{ flex: '1 1 10px' }} />
        <button className="btn sm" data-act="rvPrev" disabled={!rv.pos} onClick={() => reviewMove(-1)}>← Trước</button>
        <button className="btn sm pri" data-act="rvOk" onClick={() => reviewApprove(txt)}>{a && a.ok ? 'Tiếp →' : 'Duyệt & tiếp →'}</button></div>
    </>
  );
}

function TourCard(): JSX.Element | null {
  const n = useAppState((s) => s.tour), key = useAppState((s) => s.tourKey);
  const T = TOURS[key], st = n === null ? null : T[n];
  useEffect(() => {
    if (n === null) return;
    const k = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.preventDefault(); tourExit(); }
      else if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); tourGo(n + 1); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); tourGo(n - 1); }
      ev.stopImmediatePropagation();
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [n]);
  if (n === null || !st) return null;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="lbl" style={{ flex: '1 1 auto' }}>{'Hướng dẫn · ' + (n + 1) + '/' + T.length}</span>
        <button className="chip" data-act="tSkip" style={{ cursor: 'pointer' }} onClick={tourExit}>Bỏ qua</button></div>
      <h3 style={{ marginTop: 8 }}>{st.t}</h3><p>{st.b}</p>
      <div className="spfoot"><div className="spdots">{T.map((_, k) => <i key={k} className={k === n ? 'on' : undefined} />)}</div><div style={{ flex: '1 1 10px' }} />
        {n > 0 && <button className="btn sm" data-act="tPrev" onClick={() => tourGo(n - 1)}>← Trước</button>}
        <button className="btn sm pri" data-act="tNext" onClick={() => tourGo(n + 1)}>{n === T.length - 1 ? 'Xong' : n ? 'Tiếp →' : 'Bắt đầu →'}</button></div>
    </>
  );
}

export function Spotlight(): JSX.Element | null {
  const s = useAppState((x) => x), cardRef = useRef<HTMLDivElement>(null), [pos, setPos] = useState<Place | null>(null), seen = useRef<string | null>(null);
  const rv = s.review, item = rv ? rv.list[rv.pos] : null, st = s.tour !== null ? TOURS[s.tourKey][s.tour] : undefined;
  const key = rv ? 'rv' + rv.list[rv.pos].i + '|' + rv.list[rv.pos].f : s.tour !== null ? 'tour' + s.tourKey + s.tour : '';
  /* mở app lần đầu: tự chạy tour tổng quan */
  useEffect(() => { tourAutoStart(); }, []);
  /* bước cần bảng mà chưa nạp file: nạp dữ liệu mẫu như prototype (prep của bước Kiểm tra) */
  useEffect(() => { if (st && st.view === 'grid' && !s.loaded) loadSampleForTour(); }, [st, s.loaded]);
  /* tìm phần tử đích, cuộn tới nếu ngoài màn hình, rồi đặt khung sáng và thẻ */
  useEffect(() => {
    if (!key) { setPos(null); seen.current = null; return; }
    const sel = item ? '.cell[data-i="' + item.i + '"][data-f="' + item.f + '"]' : st?.sel;
    const target = sel ? document.querySelector(sel) : null, card = cardRef.current;
    if (target && key !== seen.current) {
      const rc = target.getBoundingClientRect();
      if (rc.top < 60 || rc.bottom > window.innerHeight - 40 || rc.left < 0 || rc.right > window.innerWidth) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    seen.current = key;
    const go = (): void => { if (card) setPos(place(target, card)); };
    go();
    window.addEventListener('resize', go);
    return () => window.removeEventListener('resize', go);
  }, [key, item, st, s.view, s.loaded, s.panel]);
  if (!key) return <div id="spot" />;
  return (
    <div id="spot" className="on">
      <div className={'spmask' + (pos && !pos.hole ? ' full' : '')} />
      {pos?.hole && <div className="sphole" style={pos.hole} />}
      <div className="spcard" ref={cardRef} role="dialog" aria-modal="true" aria-label={rv ? 'Duyệt nháp AI' : 'Hướng dẫn'} style={pos ? { ...pos.card, visibility: 'visible' } : undefined}>
        {rv ? <ReviewCard /> : <TourCard />}
      </div>
    </div>
  );
}
