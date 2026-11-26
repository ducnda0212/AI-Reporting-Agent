/* Chi tiết dự án (bấm Mã DA) — prototype poHtml L9020 + "Phương án A" L12301-12424: hộp 2 cột kiểu Linear (.pa-box), trái = thuộc tính gập được,
   phải = Tổng quan (Mục tiêu / KPI rút 3 dòng, Milestone dạng dòng thời gian) và Báo cáo tuần dạng thẻ. Vách kéo .pa-split, cỡ chữ A / A, tìm #poQ. */
import { Fragment, useEffect, useRef } from 'react';
import { FIELDS, PA_LONG } from '@/data/constants';
import { activeWkOf, cellValue, displayText, effectiveKind, fieldById, spillCls } from '@/lib/cell';
import { PO_SECS, parseMilestones, poNm, poWeeks } from '@/lib/popout';
import { rowsOf, useAppState } from '@/store';
import { poClose, poNavMatch, poNavProject, poSetFontSize, poSetQuery, poSetSideW, poToggleExp, poToggleGroup, poToggleWeek, poToggleWkSort } from '@/store/actions/popout';
import type { AppState, FieldId, Row } from '@/types';
import { LvlPill } from '@/components/common/RiskText';

const WCOLS: readonly string[] = ['Công việc đã hoàn thành', 'Kế hoạch tuần sau', 'Vấn đề, rủi ro & đề xuất'];
const ic = (d: string, s = 14): JSX.Element => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={d} /></svg>;

/** Tô sáng chỗ khớp từ khoá (không phân biệt dấu); `cur` = kết quả đang đứng. */
function Mark({ text, q, cur }: { text: string; q: string; cur: boolean }): JSX.Element {
  const n = poNm(q.trim());
  if (!n || !text) return <>{text}</>;
  const h = poNm(text), out: (string | JSX.Element)[] = [];
  let from = 0, at: number;
  while ((at = h.indexOf(n, from)) >= 0) { out.push(text.slice(from, at), <mark key={at} className={cur ? 'cur' : undefined}>{text.slice(at, at + n.length)}</mark>); from = at + n.length; }
  out.push(text.slice(from));
  return <>{out}</>;
}

function Popout({ s }: { s: AppState }): JSX.Element | null {
  const P = s.po, r: Row | undefined = P.i === null ? undefined : s.allRows[P.i], root = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null);
  const q = P.q.trim(), curF = P.cur >= 0 && P.hits[P.cur] ? P.hits[P.cur].f : null;
  /* khoá cuộn nền, phím tắt trong cửa sổ (Esc, Ctrl+F, F3), cuộn tới kết quả đang đứng */
  useEffect(() => {
    document.body.classList.add('po-lock');
    const key = (ev: KeyboardEvent): void => {
      const k = ev.key, inQ = (ev.target as HTMLElement | null)?.id === 'poQ', st = (): void => { ev.preventDefault(); ev.stopPropagation(); };
      if (k === 'Escape') { st(); if (inQ && getQ()) poSetQuery(''); else poClose(); return; }
      if ((ev.ctrlKey || ev.metaKey) && (k === 'f' || k === 'F')) { st(); const el = root.current?.querySelector<HTMLInputElement>('#poQ'); el?.focus(); el?.select(); return; }
      if ((inQ && k === 'Enter') || k === 'F3') { st(); poNavMatch(ev.shiftKey ? -1 : 1); return; }
      if (!inQ && k !== 'Tab') ev.stopPropagation();
    };
    const getQ = (): string => root.current?.querySelector<HTMLInputElement>('#poQ')?.value || '';
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); document.body.classList.remove('po-lock'); };
  }, []);
  useEffect(() => { if (curF) root.current?.querySelector(`[data-pf="${curF}"]`)?.scrollIntoView?.({ block: 'center' }); }, [curF, P.cur]);
  if (!r) return null;

  const rows = rowsOf(s), idx = rows.findIndex((x) => x.i === r.i), txt = (fid: string): string => { const f = fieldById(fid); return f ? displayText(r, f, s) : ''; };
  const pill = (id: string): JSX.Element => { const t = txt(id); return !t ? <span className="nil">—</span> : id === 'rui' ? <LvlPill v={t} /> : <span className={'spill ' + spillCls(t)}>{t}</span>; };
  const Val = ({ fid }: { fid: string }): JSX.Element => {
    const f = fieldById(fid)!, t = txt(fid), cur = curF === fid, pend = f.kind === 'ai' && cellValue(r, f, s) === null && !!t, hit = !!q && !!t && poNm(t).includes(poNm(q));
    if (t && !cur && !hit && ['tt', 'td', 'tt1'].includes(fid)) return <div className="pv" data-pf={fid}><span className={'spill ' + spillCls(t)}>{t}</span></div>;
    if (t && !cur && !hit && fid === 'rui' && !pend) return <div className="pv" data-pf={fid}><LvlPill v={t} /></div>;
    return (
      <div className={'pv' + (pend ? ' pend' : '') + (cur ? ' cur' : hit ? ' hit' : '')} data-pf={fid}>
        {t ? <Mark text={t} q={P.q} cur={cur} /> : <span className="nil">{effectiveKind(f, s) === 'future' ? 'chưa tới tuần' : '—'}</span>}{pend && <em>nháp AI chưa duyệt</em>}
      </div>
    );
  };
  const clamp = (fid: string, lines: number): JSX.Element => {
    const t = txt(fid); if (!t) return <div className="pv" data-pf={fid}><span className="nil">—</span></div>;
    const long = t.length > 110 || t.split('\n').length > lines, open = !!P.exp[fid] || !!q;
    return (
      <>
        <div className={'pa-clw' + (long && !open ? ' cl' : '')} style={{ '--cl': lines } as React.CSSProperties}><Val fid={fid} /></div>
        {long && !q && <button className="pa-more" data-pa="exp" data-f={fid} onClick={() => poToggleExp(fid)}>{open ? 'Thu gọn' : 'Xem thêm'}</button>}
      </>
    );
  };
  const milestone = (): JSX.Element => {
    const t = txt('milestone'); if (!t) return <span className="nil">—</span>;
    if (q) return <Val fid="milestone" />;
    return <ol className="pa-ms" data-pf="milestone">{parseMilestones(t, s.activeToday || undefined).map((m, k) => <li key={k} className={m.status}><i /><b>{m.date || ''}</b><span>{m.text}</span></li>)}</ol>;
  };

  const pic = txt('pic'), ini = pic ? pic.split(/\s+/).slice(-1)[0].charAt(0) : '?', endD = txt('end');
  let left: JSX.Element | null = null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(endD)) { const pe = endD.split('/'), rt = (s.activeToday || '2026-11-22').split('-').map(Number), dd = Math.round((+new Date(+pe[2], +pe[1] - 1, +pe[0]) - +new Date(rt[0], rt[1] - 1, rt[2])) / 864e5); left = dd < 0 ? <em className="po-late">{'quá hạn ' + -dd + ' ngày'}</em> : <em>{'còn ' + dd + ' ngày'}</em>; }
  const nHit = P.hits.length, cnt = !q ? '' : nHit ? (P.cur >= 0 ? P.cur + 1 : 0) + '/' + nHit : 'Không có';

  const split = (e: React.MouseEvent): void => {
    const el = wrap.current; if (!el) return;
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX, w0 = P.sideW, maxW = Math.max(260, el.clientWidth - 380); let w = w0;
    document.body.classList.add('pa-dragging');
    const mv = (ev: MouseEvent): void => { w = Math.max(200, Math.min(maxW, w0 + ev.clientX - x0)); el.style.setProperty('--paside', w + 'px'); };
    const up = (): void => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); document.body.classList.remove('pa-dragging'); poSetSideW(w, maxW); };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  };

  return (
    <div className="po" ref={root} role="dialog" aria-modal="true" aria-label={'Dự án ' + r.ma} style={{ '--pofz': P.fz + 'px' } as React.CSSProperties} onClick={(e) => { if (e.target === e.currentTarget) poClose(); }}>
      <div className="po-box pa-box" data-stop="1">
        <div className="po-hd"><div className="pa-top">
          <div className="pa-row1">
            <div className="po-nav"><button data-po="pprev" title="Dự án trước" aria-label="Dự án trước" disabled={idx <= 0} onClick={() => poNavProject(-1)}>{ic('m15 6-6 6 6 6')}</button>
              <span>{idx + 1 + ' / ' + rows.length}</span>
              <button data-po="pnext" title="Dự án kế" aria-label="Dự án kế" disabled={idx >= rows.length - 1} onClick={() => poNavProject(1)}>{ic('m9 6 6 6-6 6')}</button></div>
            <span className="c2code">{r.ma}</span><span className="pa-grp">{txt('mang')}</span><span className="v2sp" />
            <div className="po-find">{ic('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-3.5-3.5')}
              <input id="poQ" type="search" placeholder="Tìm trong dự án này…" value={P.q} autoComplete="off" onChange={(e) => poSetQuery(e.target.value)} />
              <span className="po-cnt" id="poCnt">{cnt}</span>
              <button data-po="prev" title="Kết quả trước" aria-label="Kết quả trước" onClick={() => poNavMatch(-1)}>↑</button>
              <button data-po="next" title="Kết quả kế tiếp" aria-label="Kết quả kế tiếp" onClick={() => poNavMatch(1)}>↓</button></div>
            <span className="po-grp pa-fz" title="Cỡ chữ"><button data-po="fz" data-d="-1" aria-label="Chữ nhỏ lại" style={{ fontSize: 11 }} onClick={() => poSetFontSize(-1)}>A</button><b id="poFz">{P.fz}</b>
              <button data-po="fz" data-d="1" aria-label="Chữ to lên" style={{ fontSize: 16 }} onClick={() => poSetFontSize(1)}>A</button></span>
            <button className="po-x" data-po="close" title="Đóng (Esc)" aria-label="Đóng" onClick={poClose}>{ic('M6 6l12 12M18 6 6 18', 16)}</button>
          </div>
          <h2 className="pa-title">{r.viec || ''}</h2>
          <div className="pa-chips"><span className="pa-c"><span className="po-av">{ini}</span>{pic || '—'}</span>{pill('tt')}{pill('td')}
            <span className="pa-c"><i>Rủi ro</i>{pill('rui')}</span><span className="pa-c"><i>Thời gian</i>{(txt('start') || '—') + ' → ' + (endD || '—')}{left}</span></div>
        </div></div>
        <div className="po-wrap pa-wrap" ref={wrap} style={{ '--paside': P.sideW + 'px' } as React.CSSProperties}>
          <aside className="pa-side">{PO_SECS.map(([sec, title]) => {
            const fs = FIELDS.filter((f) => f.grp === sec && f.kind !== 'none' && !(sec === 'info' && f.id === 'viec')), c = !!P.col[sec];
            return (
              <section key={sec} className="pa-sec"><button className="pa-sh" data-po="grp" data-g={sec} aria-expanded={!c} onClick={() => poToggleGroup(sec)}><span className="pa-cv">{c ? '▸' : '▾'}</span>{title}<small>{fs.length}</small></button>
                {!c && <div className="pa-kv">{fs.filter((f) => !(PA_LONG as readonly FieldId[]).includes(f.id)).map((f) => <Fragment key={f.id}><div className="pa-k" title={'Cột ' + f.col}>{f.name.split(' (')[0]}</div><Val fid={f.id} /></Fragment>)}</div>}</section>
            );
          })}</aside>
          <div className="pa-split" role="separator" aria-orientation="vertical" aria-label="Kéo để đổi độ rộng hai bên" title="Kéo để đổi độ rộng · nhấp đúp để về mặc định" onMouseDown={split} onDoubleClick={() => poSetSideW(null)}><i /></div>
          <main className="pa-main">
            <section className="pa-ov">
              <div className="pa-ovc"><div className="pa-wl">Mục tiêu</div>{clamp('muctieu', 3)}</div>
              <div className="pa-ovc"><div className="pa-wl">KPI</div>{clamp('kpi', 3)}</div>
              <div className="pa-ovc wide"><div className="pa-wl">Milestone</div>{milestone()}</div>
            </section>
            <div className="pa-mh"><h3>Báo cáo tuần</h3><button className="po-chip" data-po="wksort" onClick={poToggleWkSort}>{(P.wkDesc ? 'Mới nhất trước' : 'Cũ nhất trước') + ' ⇅'}</button></div>
            {poWeeks(P.wkDesc, s.weeks).filter((w) => effectiveKind(fieldById(w[3][0])!, s) !== 'future').map((w) => {
              const now = w[0] === activeWkOf(s), hit = !!q && w[3].some((fid) => poNm(txt(fid)).includes(poNm(q))), open = !!P.wkOpen[w[0]] || hit, range = w[2].replace(' · tuần này', '');
              if (!open) {
                const sum = (txt(w[3][0]) || txt(w[3][2]) || 'Chưa có báo cáo').replace(/\s+/g, ' ');
                return <button key={w[0]} className="pa-wk pa-wkc" data-pa="wk" data-w={w[0]} onClick={() => poToggleWeek(w[0])}><span className="pa-wcv">▸</span><b>{w[1]}</b><span className="pa-wd">{range}</span><span className="pa-ws">{sum}</span></button>;
              }
              const secs = WCOLS.map((n, k) => ({ n, fid: w[3][k] })).filter((x) => txt(x.fid));
              return (
                <article key={w[0]} className={'pa-wk' + (now ? ' now' : '')}>
                  <div className="pa-wh" data-pa="wk" data-w={w[0]} role="button" title="Thu gọn" onClick={() => poToggleWeek(w[0])}><span className="pa-wcv">▾</span><b>{w[1]}</b><span>{range}</span>{now && <em className="pa-tag now">tuần này</em>}</div>
                  {secs.length ? secs.map((x) => <div key={x.fid} className="pa-wsec"><div className="pa-wl">{x.n}</div><Val fid={x.fid} /></div>) : <div className="pa-wsec"><span className="nil">Chưa có báo cáo tuần này</span></div>}
                </article>
              );
            })}
          </main>
        </div>
      </div>
    </div>
  );
}

/** Gắn một lần ở App; tự ẩn khi state.po.open = false. */
export function ProjectPopout(): JSX.Element | null {
  const s = useAppState((x) => x);
  return s.po.open ? <Popout s={s} /> : null;
}
