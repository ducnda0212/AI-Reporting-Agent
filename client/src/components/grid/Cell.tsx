import type { CSSProperties } from 'react';
import type { Field, Row } from '@/types';
import type { AppState, CellFmt } from '@/store/types';
import { ck, cellValue, locked, orgInfo } from '@/lib/cell';
import { hitCell } from '@/lib/grid';
import { RISK_F, textHasRisk } from '@/lib/text';
import * as G from '@/store/actions/grid';
import { LvlPill, Mark, RiskText } from '../common/RiskText';
import { CellEditor } from './CellEditor';

export function fmtStyle(o?: CellFmt): CSSProperties {
  if (!o) return {};
  const st: CSSProperties = {};
  if (o.b) st.fontWeight = 700;
  if (o.i) st.fontStyle = 'italic';
  const dec = ((o.u ? 'underline ' : '') + (o.s ? 'line-through' : '')).trim();
  if (dec) st.textDecoration = dec;
  if (o.fill) { st.backgroundColor = o.fill; if (!o.color) st.color = '#1A1A1A'; }
  if (o.color) st.color = o.color;
  return st;
}

function valDot(f: Field, v: string | null) {
  if (!v || !['status', 'progress', 'statusAlt', 'riskLevel'].includes(f.id)) return null;
  let c = 'n';
  if (/Chậm|Hủy|^Cao$/.test(v)) c = 'e';
  else if (/Tạm dừng|Trung bình|Chưa thực hiện|Trong kế hoạch/.test(v)) c = 'w';
  else if (/Đúng tiến độ|Đã hoàn thành|^Thấp$/.test(v)) c = 'o';
  else if (/Đang thực hiện/.test(v)) c = 'b';
  return <i className={'vdot ' + c} />;
}

interface Props { s: AppState; r: Row; f: Field; stick: string; picked: Record<string, number> }

/** Một ô dữ liệu: nút xem, ô chọn danh sách (nhập tay có danh sách) hoặc ô sửa tại chỗ. */
export function Cell({ s, r, f, stick, picked }: Props) {
  const v = cellValue(s, r, f);
  const key = ck(r.i, f.id);
  const tdCls = stick || undefined;
  const isSel = !!s.sel && s.sel.i === r.i && s.sel.f === f.id;
  const finding = s.find.open && !!s.find.q.trim();
  const style = fmtStyle(s.fmt[key]);

  /* ô nhập tay có danh sách: chọn thẳng */
  if (f.kind === 'manual' && f.opts && !locked(f)) {
    const cv = (r[f.id] as string) || '';
    const cls = 'cellsel' + (finding && cv && hitCell(s, r, f) ? ' fhit' : '') + (!cv && f.required ? ' err' : !cv ? ' opt' : '') + (isSel ? ' sel' : '');
    return (
      <td className={tdCls} style={{ padding: 0 }}>
        <select className={cls} data-i={r.i} data-f={f.id} style={{ width: f.w, ...style }} aria-label={`${f.name} · ${r.code}`} title={'Chọn ' + f.name} value={cv}
          onChange={(e) => G.setCell(r.i, f.id, e.target.value)}>
          <option value="">{f.required ? 'Chọn — bắt buộc' : 'Chọn…'}</option>
          {f.opts.map((o) => <option key={o} value={o}>{o}</option>)}
          {cv && !f.opts.includes(cv) && <option value={cv}>{cv}</option>}
        </select>
      </td>
    );
  }
  if (s.edit && s.edit.i === r.i && s.edit.f === f.id) {
    return (
      <td className={tdCls} style={{ padding: 0 }}>
        <CellEditor s={s} r={r} f={f} className="ined" style={{ width: f.w }} autoFocus
          onCommit={(val) => G.commitEdit(r.i, f.id, val)} onCancel={() => G.cancelEdit()} onTab={(back) => G.tabFrom(r.i, f.id, back)} />
      </td>
    );
  }

  let cls = 'cell';
  let txt: string;
  if (f.kind === 'future') { cls += ' fut'; txt = '—'; }
  else if (f.kind === 'none') { cls += ' opt'; txt = ''; }
  else if (v === null && f.kind === 'ai') { cls += ' ai'; txt = '— chưa soạn —'; }
  else if (v === null && f.required) { cls += ' err'; txt = 'trống — bắt buộc'; }
  else if (v === null) { cls += ' opt'; txt = '—'; }
  else {
    txt = v;
    if (f.kind === 'past') cls += ' past';
    else if (f.kind === 'ai' && r.ai[f.id] && !r.ai[f.id]!.ok) cls += ' ai';
  }
  const oi = f.kind === 'cfg' ? orgInfo(s, r, f.id) : null;
  if (oi && v === null && oi.from === 'miss') { cls = 'cell hand'; txt = 'chưa có trên hệ thống'; }
  if (oi && oi.from === 'jira') cls += ' hand';
  if (oi && oi.jira) cls += ' jd';
  const isOvr = !!(r.ovr && r.ovr[f.id]);
  if (isOvr) cls += ' ovr';
  if (s.wrap[f.id]) cls += ' wrap';
  if (isSel) cls += ' sel'; else if (s.range && picked[key]) cls += ' rng';
  if (finding && v !== null && hitCell(s, r, f)) cls += ' fhit';

  let tip = txt + (f.kind === 'ai' && r.ai[f.id] && !r.ai[f.id]!.ok ? ' — nhấp đúp để duyệt' : '') + (locked(f) ? '' : ' — nhấp đúp để sửa') + (isOvr ? ' — đã sửa tay' : '');
  if (oi) tip = txt + (oi.jira ? ` — Jira đang ghi “${oi.jira}”, báo cáo theo hệ thống` : oi.from === 'jira' ? ' — tạm lấy Summary trên Jira, mã chưa có trên hệ thống' : ' — từ hệ thống') + ' · không sửa trên bảng, nhấp đúp để xem / gửi yêu cầu sửa';

  let inner: React.ReactNode = txt;
  if (finding && v !== null && hitCell(s, r, f)) inner = <Mark text={String(txt).replace(/\n/g, ' · ')} q={s.find.q} cs={s.find.cs} />;
  else if (f.id === 'riskLevel' && v) inner = <LvlPill value={v} />;
  else if (RISK_F.includes(f.id) && v) inner = s.wrap[f.id] ? <RiskText text={v} /> : <>{textHasRisk(v) && <i className="rdot" title="Có nội dung rủi ro" />}<RiskText text={v} oneLine /></>;

  return (
    <td className={tdCls}>
      <button className={cls} data-act="cell" data-i={r.i} data-f={f.id} style={{ width: f.w, maxWidth: f.w, ...style }} title={tip}
        onClick={(e) => G.onCellClick(r.i, f.id, e.detail, e.shiftKey)}
        onContextMenu={(e) => { e.preventDefault(); G.openContext(e.clientX, e.clientY, r.i, f.id); }}>
        {valDot(f, v)}{inner}
      </button>
    </td>
  );
}
