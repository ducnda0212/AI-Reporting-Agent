/* Ô sửa nhanh trong thanh công thức .fxval (prototype editorHtml L3947 với data-act="fxEdit"):
   ô chữ là <input class="inp"> (lưu khi Enter / rời ô, Esc huỷ); cột có danh sách là <select class="sel"> như prototype
   — riêng ô trên bảng thì luôn mở dropdown 1 chạm #pkPop, không dùng <select>. */
import { cellValue, ck, isSrc, optsFor, sourceValue, type CellCtx } from '@/lib/cell';
import { applyEdit } from '@/store/actions/grid';
import type { AiFieldId, Field, Row } from '@/types';

export function CellEditor({ r, f, ctx }: { r: Row; f: Field; ctx: CellCtx }): JSX.Element {
  const opts = optsFor(f), cur = f.kind === 'ai' ? r.ai[f.id as AiFieldId]?.text || '' : cellValue(r, f, ctx) || '';
  const label = 'Sửa ô ' + f.name;
  if (opts) {
    const src = isSrc(f) ? sourceValue(r, f, ctx) : null, extra = !!cur && !opts.includes(cur);
    const val = extra ? cur : isSrc(f) && !r.ovr[f.id] ? '' : cur;
    return (
      <select className="sel" data-act="fxEdit" data-i={r.i} data-f={f.id} aria-label={label} value={val} onChange={(e) => applyEdit(r.i, f.id, e.target.value)}>
        <option value="">{isSrc(f) ? 'Theo nguồn' + (src ? ' → ' + src : ' (đang trống)') : '— trống —'}</option>
        {extra && <option>{cur}</option>}
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }
  return (
    <input key={ck(r.i, f.id) + '|' + cur} className="inp" data-act="fxEdit" data-i={r.i} data-f={f.id} aria-label={label} defaultValue={cur} placeholder="(trống)"
      style={{ flex: '1 1 auto', minWidth: 80 }}
      onBlur={(e) => { if (e.target.value !== cur) applyEdit(r.i, f.id, e.target.value); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') { e.currentTarget.value = cur; e.currentTarget.blur(); }
      }} />
  );
}
