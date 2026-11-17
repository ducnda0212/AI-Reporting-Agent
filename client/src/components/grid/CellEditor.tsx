import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import type { Field, Row } from '@/types';
import type { AppState } from '@/store/types';
import { cellValue, isSrc, optsFor } from '@/lib/cell';

interface Props {
  s: AppState;
  r: Row;
  f: Field;
  className: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  onCommit: (value: string) => void;
  onCancel?: () => void;
  onTab?: (back: boolean) => void;
}

/** Ô sửa dùng chung cho sửa-tại-ô và thanh công thức: danh sách chọn hoặc ô nhập. */
export function CellEditor({ s, r, f, className, style, autoFocus, onCommit, onCancel, onTab }: Props) {
  const opts = optsFor(f);
  const cur = f.kind === 'ai' ? (r.ai[f.id] ? r.ai[f.id]!.text : '') : cellValue(s, r, f) || '';
  const ref = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const done = useRef(false);
  useEffect(() => { done.current = false; if (autoFocus && ref.current) { ref.current.focus(); (ref.current as HTMLInputElement).select?.(); } }, [autoFocus, r.i, f.id]);

  const commit = (v: string) => { if (done.current) return; done.current = true; onCommit(v); };
  const aria = 'Sửa ô ' + f.name;

  if (opts) {
    const src = isSrc(f);
    const srcVal = cellValue(s, r, f, true);
    return (
      <select ref={ref} className={className} style={style} aria-label={aria} value={cur && (!src || r.ovr[f.id]) ? cur : ''}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => { if (onCancel && !done.current) onCancel(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') { done.current = true; onCancel?.(); } }}>
        <option value="">{src ? 'Theo nguồn' + (srcVal ? ' → ' + srcVal : ' (đang trống)') : '— trống —'}</option>
        {cur && !opts.includes(cur) && <option value={cur}>{cur}</option>}
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    if (e.key === 'Enter') { e.preventDefault(); commit(v); }
    else if (e.key === 'Escape') { done.current = true; onCancel?.(); }
    else if (e.key === 'Tab' && onTab) { e.preventDefault(); commit(v); onTab(e.shiftKey); }
  };
  return (
    <input ref={ref} className={className} style={style} aria-label={aria} defaultValue={cur} placeholder="(trống)" key={r.i + f.id + cur}
      onKeyDown={onKey} onBlur={(e) => commit(e.target.value)} />
  );
}
