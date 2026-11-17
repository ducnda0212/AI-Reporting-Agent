import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { LEVELS } from '@/data/constants';
import { TOUR } from '@/data/tour';
import { useStore } from '@/store';
import { exitReview, reviewApprove, reviewDrop, reviewMove, tourEnd, tourGo } from '@/store/actions/flow';

interface Box { hole: CSSProperties | null; card: CSSProperties }

/** Đặt lỗ sáng quanh `target` và thẻ nội dung cạnh nó (hoặc giữa màn hình nếu không có target). */
function place(target: Element | null, card: HTMLElement): Box {
  const vw = window.innerWidth; const vh = window.innerHeight; const cw = card.offsetWidth; const ch = card.offsetHeight;
  if (!target) return { hole: null, card: { left: Math.max(16, (vw - cw) / 2), top: Math.max(16, (vh - ch) / 2), visibility: 'visible' } };
  const rc = target.getBoundingClientRect();
  const pad = 4;
  const t = Math.max(4, rc.top - pad); const l = Math.max(4, rc.left - pad);
  const w = Math.min(vw - 8, rc.right + pad) - l; const h = Math.min(vh - 8, rc.bottom + pad) - t;
  let top = rc.bottom + 12;
  if (top + ch > vh - 12) top = rc.top - ch - 12;
  if (top < 12) top = Math.max(12, Math.min(vh - ch - 12, rc.bottom - ch));
  let left = Math.min(Math.max(16, rc.left), vw - cw - 16);
  if (top < rc.bottom && top + ch > rc.top) left = rc.right + 12 + cw < vw ? rc.right + 12 : Math.max(16, rc.left - cw - 12);
  return { hole: { top: t, left: l, width: Math.max(10, w), height: Math.max(10, h) }, card: { top, left, visibility: 'visible' } };
}

/** Lớp mờ + khung sáng + thẻ: dùng cho "Duyệt từng ô AI" và "Hướng dẫn sử dụng". */
export function Spotlight() {
  const review = useStore((s) => s.review);
  const tour = useStore((s) => s.tour);
  const allRows = useStore((s) => s.allRows);
  const fields = useStore((s) => s.fields);
  const cardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [text, setText] = useState('');
  const [seg, setSeg] = useState('');
  const active = review !== null || tour !== null;

  /* mục đang duyệt */
  let item: { code: string; task: string; col: string; name: string; d?: { text: string; why?: string; src?: string; ok: boolean }; id: string; i: number } | null = null;
  if (review) {
    const [i, fid] = review.list[review.pos].split('|');
    const r = allRows[+i]; const f = fields.find((x) => x.id === fid)!;
    item = { code: r.code, task: r.task, col: f.col, name: f.name, d: r.ai[fid], id: fid, i: +i };
  }
  const key = review ? 'rv' + review.list[review.pos] : tour !== null ? 'tour' + tour : '';
  useEffect(() => { if (item?.d) { setText(item.d.text); setSeg(item.d.text); } }, [key]);

  const targetSel = review && item ? `.cell[data-i="${item.i}"][data-f="${item.id}"]` : tour !== null ? TOUR[tour].sel : undefined;
  const measure = () => {
    if (!cardRef.current) return;
    const target = targetSel ? document.querySelector(targetSel) : null;
    setBox(place(target, cardRef.current));
  };
  useLayoutEffect(() => {
    if (!active) { setBox(null); return; }
    const target = targetSel ? document.querySelector(targetSel) : null;
    if (target) (target as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' });
    measure();
    const again = requestAnimationFrame(measure); // sau khi bảng cuộn / bố cục ổn định
    return () => cancelAnimationFrame(again);
  }, [key, active]);
  useEffect(() => {
    if (!active) return;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, key]);

  /* phím tắt: duyệt (Enter, ←, →, Esc) và hướng dẫn */
  useEffect(() => {
    if (!active) return;
    const onKey = (ev: KeyboardEvent) => {
      if (review) {
        const typing = (ev.target as HTMLElement)?.id === 'rvText';
        if (ev.key === 'Escape') { ev.preventDefault(); exitReview(); }
        else if (ev.key === 'Enter' && (!typing || ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); reviewApprove(item?.id === 'riskLevel' ? seg : text); }
        else if (!typing && ev.key === 'ArrowRight') { ev.preventDefault(); reviewMove(1); }
        else if (!typing && ev.key === 'ArrowLeft') { ev.preventDefault(); reviewMove(-1); }
      } else if (tour !== null) {
        if (ev.key === 'Escape') { ev.preventDefault(); tourEnd(); }
        else if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); tourGo(tour + 1); }
        else if (ev.key === 'ArrowLeft') { ev.preventDefault(); tourGo(tour - 1); }
      } else return;
      ev.stopImmediatePropagation();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  });

  if (!active) return null;
  const hasTarget = !!box?.hole;
  return (
    <div id="spot" className="on">
      <div className={'spmask' + (hasTarget ? '' : ' full')} />
      {box?.hole && <div className="sphole" style={box.hole} />}
      <div className="spcard" ref={cardRef} role="dialog" aria-modal="true" aria-label={review ? 'Duyệt nháp AI' : 'Hướng dẫn'} style={box ? box.card : { visibility: 'hidden' }}>
        {review && item ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ flex: '1 1 auto' }}>Duyệt nháp AI · {review.pos + 1}/{review.list.length}</h3>
              <button className="chip" onClick={exitReview} style={{ cursor: 'pointer' }}>Thoát · Esc</button></div>
            <div className="rvbar"><i style={{ width: Math.round((review.pos / review.list.length) * 100) + '%' }} /></div>
            <p style={{ marginTop: 10 }}><b>{item.code}</b> · {item.task}</p>
            <p style={{ marginTop: 2, color: 'var(--ai)', fontWeight: 600 }}>{item.col} · {item.name}</p>
            {!item.d ? <p style={{ color: 'var(--mut)' }}>Nháp đã bị bỏ.</p> : (
              <>
                {item.id === 'riskLevel'
                  ? <div className="seg" style={{ marginTop: 8 }}>{LEVELS.map((o) => <button key={o} className={o === seg ? 'on' : ''} onClick={() => setSeg(o)}>{o}</button>)}</div>
                  : <textarea className="rvta" id="rvText" rows={4} aria-label="Nội dung nháp" value={text} autoFocus onChange={(e) => setText(e.target.value)} />}
                <div className="lbl" style={{ marginTop: 10 }}>Căn cứ AI dùng · {item.d.why || ''}</div>
                <div className="spsrc">{item.d.src || ''}</div>
              </>
            )}
            <div className="spfoot">
              <button className="btn sm" onClick={reviewDrop}>Bỏ nháp</button><div style={{ flex: '1 1 10px' }} />
              <button className="btn sm" disabled={!review.pos} onClick={() => reviewMove(-1)}>← Trước</button>
              <button className="btn sm pri" onClick={() => reviewApprove(item!.id === 'riskLevel' ? seg : text)}>{item.d && item.d.ok ? 'Tiếp →' : 'Duyệt & tiếp →'}</button></div>
            <div style={{ fontSize: 10.5, color: 'var(--mut2)', marginTop: 7 }}>Enter: duyệt · đang gõ thì Ctrl+Enter · ← → chuyển ô · sửa chữ xong bấm duyệt là lưu luôn</div>
          </>
        ) : tour !== null ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="lbl" style={{ flex: '1 1 auto' }}>Hướng dẫn · {tour + 1}/{TOUR.length}</span>
              <button className="chip" onClick={tourEnd} style={{ cursor: 'pointer' }}>Bỏ qua</button></div>
            <h3 style={{ marginTop: 8 }}>{TOUR[tour].t}</h3><p>{TOUR[tour].b}</p>
            <div className="spfoot"><div className="spdots">{TOUR.map((_, k) => <i key={k} className={k === tour ? 'on' : undefined} />)}</div><div style={{ flex: '1 1 10px' }} />
              {tour > 0 && <button className="btn sm" onClick={() => tourGo(tour - 1)}>← Trước</button>}
              <button className="btn sm pri" onClick={() => tourGo(tour + 1)}>{tour === TOUR.length - 1 ? 'Xong' : tour ? 'Tiếp →' : 'Bắt đầu →'}</button></div>
          </>
        ) : null}
      </div>
    </div>
  );
}

