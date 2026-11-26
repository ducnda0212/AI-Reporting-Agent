/* Một ô của bảng 49 cột: prototype grid() L3854-3895 + chuỗi cellInner cuối cùng
   (cellInnerBase L6625 → malink L9150 → spill L10001 → mũi tên ▾ .cdd L11408 → chữ gợi ý .reqph L11646),
   ô Agent đang đề xuất .aipend L12262, ô vừa sửa .svflash L12501, ô "N ô cần sửa" .fxpulse L12470. */
import { memo, type CSSProperties, type ReactNode } from 'react';
import { cellValue, locked, optsFor, phName, spillCls, type CellCtx } from '@/lib/cell';
import { hitText } from '@/lib/grid';
import type { AgStageItem, AiFieldId, CellFormat, Field, Row } from '@/types';
import { LvlPill, RISK_F, RiskText, textHasRisk } from '@/components/common/RiskText';

const SPILL_F = ['tt', 'td', 'tt1'];
/* .cellsel trong CSS dựa vào mặc định của <select>: chữ căn trái, một dòng, cắt "…" — button phải tự đặt */
const SEL_LOOK: CSSProperties = { textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/** Định dạng ô (B/I/U/S, màu, căn lề) → style (prototype fmtStyle L3517 + căn lề L10246). */
export function fmtStyle(o: CellFormat | undefined): CSSProperties {
  const st: CSSProperties = {};
  if (!o) return st;
  if (o.b) st.fontWeight = 700;
  if (o.i) st.fontStyle = 'italic';
  const dec = ((o.u ? 'underline ' : '') + (o.s ? 'line-through' : '')).trim();
  if (dec) st.textDecoration = dec;
  if (o.fill) { st.backgroundColor = o.fill; if (!o.color) st.color = '#1A1A1A'; }
  if (o.color) st.color = o.color;
  if (o.ha) st.textAlign = o.ha;
  if (o.va) Object.assign(st, { display: 'flex', flexDirection: 'column', justifyContent: o.va === 'top' ? 'flex-start' : o.va === 'bottom' ? 'flex-end' : 'center' });
  return st;
}

/** Tô `<mark>` chỗ khớp từ khoá tìm (prototype markHtml). */
export function markParts(text: string, q: string, cs: boolean): ReactNode[] {
  const n = cs ? q.trim() : q.trim().toLowerCase(), h = cs ? text : text.toLowerCase(), out: ReactNode[] = [];
  if (!n) return [text];
  let from = 0, at: number;
  while ((at = h.indexOf(n, from)) >= 0) { out.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + n.length)}</mark>); from = at + n.length; }
  out.push(text.slice(from));
  return out;
}

const MA_IC = <svg className="maic" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;

export interface CellProps {
  r: Row;
  f: Field;
  w: number;
  /** Bảng quy đổi Phase → bước (`state.phaseBucket`, giữ nguyên tham chiếu để memo có tác dụng). */
  pb: CellCtx['phaseBucket'];
  /** `key` (Mã DA) / `key2` (Công việc khi ghim) / ''. */
  stick: string;
  sel: boolean;
  rng: boolean;
  /** Từ khoá tìm đang mở (để tô vàng), `null` khi không tìm. */
  findQ: string | null;
  findCs: boolean;
  findWhole: boolean;
  /** Cột nằm trong phạm vi tìm. */
  inScope: boolean;
  fmt: CellFormat | undefined;
  wrap: boolean;
  touched: boolean;
  /** Ô Agent đang đề xuất trong một bản xem trước còn mở. */
  pend: AgStageItem | undefined;
  flash: boolean;
  pulse: boolean;
}

function CellImpl(p: CellProps): JSX.Element {
  const { r, f, w } = p, v = cellValue(r, f, { phaseBucket: p.pb }), a = f.kind === 'ai' ? r.ai[f.id as AiFieldId] : undefined;
  const hit = (t: string): boolean => p.findQ !== null && p.inScope && hitText(t, { q: p.findQ, cs: p.findCs, whole: p.findWhole });
  const tdCls = p.stick || undefined;

  /* cột nhập tay có danh sách: ô chọn (không dùng <select> của trình duyệt — bấm là mở #pkPop) */
  if (f.kind === 'manual' && f.opts && !locked(f)) {
    const cv = (r as unknown as Record<string, string | undefined>)[f.id] || '';
    const cls = 'cellsel' + (p.touched ? ' ovr' : '') + (cv && hit(cv) ? ' fhit' : '') + (!cv && f.required ? ' err' : !cv ? ' opt' : '') + (p.sel ? ' sel' : '') + (p.pulse ? ' fxpulse' : '');
    return (
      <td className={tdCls} style={{ padding: 0 }}>
        <button className={cls} data-act="cellPick" data-i={r.i} data-f={f.id} style={{ width: w, ...SEL_LOOK, ...fmtStyle(p.fmt) }} aria-label={f.name + ' · ' + r.ma} title={'Chọn ' + f.name}>
          {cv || 'Chọn ' + phName(f) + '…'}
        </button>
      </td>
    );
  }

  let cls = 'cell', txt: string;
  if (f.kind === 'future') { cls += ' fut'; txt = '—'; }
  else if (f.kind === 'none') { cls += ' opt'; txt = ''; }
  else if (v === null && f.kind === 'ai') { cls += ' aitodo'; txt = 'Chờ AI soạn'; }
  else if (v === null && f.required) { cls += ' err'; txt = 'trống — bắt buộc'; }
  else if (v === null) { cls += ' opt'; txt = ''; }
  else { txt = v; if (f.kind === 'past') cls += ' past'; else if (a && !a.ok) cls += ' ai'; }
  const isOvr = !!r.ovr[f.id] || p.touched;
  if (isOvr) cls += ' ovr';
  if (p.wrap) cls += ' wrap';
  if (p.sel) cls += ' sel'; else if (p.rng) cls += ' rng';
  if (v !== null && hit(txt)) cls += ' fhit';
  if (p.flash) cls += ' svflash';
  if (p.pulse) cls += ' fxpulse';
  let tip = f.kind === 'cfg' ? txt + ' — từ hệ thống · chỉ xem trên bảng'
    : txt + (a && !a.ok ? ' — nhấp đúp để duyệt' : '') + (locked(f) || (a && !a.ok) ? '' : ' — nhấp đúp để sửa') + (isOvr ? ' — đã sửa tay' : '');

  let inner: ReactNode;
  if (p.pend) {
    cls += ' aipend';
    tip = 'Agent đề xuất: ' + p.pend.to + ' — duyệt trong khung Trợ lý AI';
    inner = <span className="aighost"><span className="aiold">{p.pend.kind === 'approve' ? 'nháp' : p.pend.from || ''}</span><span className="ainew">{'✦ ' + p.pend.to}</span></span>;
  } else if (v === null && txt === 'trống — bắt buộc') {
    const pick = !!optsFor(f) && !locked(f);
    inner = (
      <span className={'reqph' + (pick ? ' pick' : '')} title={'Bắt buộc · ' + (pick ? 'bấm để chọn' : 'nhấp đúp để nhập')}>
        <i className="reqd" aria-hidden="true" />{(pick ? 'Chọn ' : locked(f) ? 'Thiếu ' : 'Nhập ') + phName(f)}{pick && <i className="reqv" aria-hidden="true">▾</i>}
      </span>
    );
  } else {
    if (p.findQ !== null && v !== null && hit(txt)) inner = markParts(txt.replace(/\n/g, ' · '), p.findQ, p.findCs);
    else if (f.id === 'rui' && v) inner = <LvlPill v={v} />;
    else if (RISK_F.includes(f.id) && v) inner = p.wrap ? <RiskText text={v} /> : <>{textHasRisk(v) && <i className="rdot" title="Có nội dung rủi ro" />}<RiskText text={v} oneLine /></>;
    else inner = txt;
    if (f.id === 'ma') inner = <span className="malink" data-poi={r.i} title={'Mở thông tin và báo cáo tuần của dự án ' + r.ma}>{inner}{MA_IC}</span>;
    if (SPILL_F.includes(f.id) && v && v.trim()) inner = <span className={'spill ' + spillCls(v)}>{inner}</span>;
    if (!locked(f) && f.kind !== 'ai' && optsFor(f)) inner = <>{inner}<i className="cdd" aria-hidden="true">▾</i></>;
  }

  return (
    <td className={tdCls}>
      <button className={cls} data-act="cell" data-i={r.i} data-f={f.id} style={{ width: w, maxWidth: w, ...fmtStyle(p.fmt) }} title={tip}>{inner}</button>
    </td>
  );
}

/** Ô bảng; chỉ vẽ lại khi dữ liệu dòng hoặc cờ của chính ô đổi. */
export const Cell = memo(CellImpl);
