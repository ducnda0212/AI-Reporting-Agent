import { Fragment } from 'react';
import { lvlClass, riskLine } from '@/lib/text';
import { markParts } from '@/lib/grid';

/** Văn bản có tô đỏ từ khoá rủi ro. `oneLine`: dùng trong ô bảng (gộp một dòng). */
export function RiskText({ text, oneLine = false }: { text: string; oneLine?: boolean }) {
  const lines = String(text || '').split('\n').map(riskLine);
  const segs = (l: ReturnType<typeof riskLine>) => l.segs.map((s, k) => (s.hit ? <b key={k} className="rk">{s.text}</b> : <Fragment key={k}>{s.text}</Fragment>));
  if (oneLine) {
    return (
      <>
        {lines.map((l, i) => (
          <Fragment key={i}>
            {i > 0 && <> <span className="lsep">·</span> </>}
            {l.kind === 'risk' ? <span className="rl1">{segs(l)}</span> : segs(l)}
          </Fragment>
        ))}
      </>
    );
  }
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} className={'pl ' + l.kind}>{l.segs.every((s) => !s.text) ? ' ' : segs(l)}</div>
      ))}
    </>
  );
}

/** Nhãn mức rủi ro Thấp / Trung bình / Cao. */
export function LvlPill({ value }: { value: string }) {
  const c = lvlClass(value);
  return c ? <span className={'lvl ' + c}>{value}</span> : <>{value}</>;
}

/** Tô vàng từ khoá tìm kiếm. */
export function Mark({ text, q, cs }: { text: string; q: string; cs: boolean }) {
  return (
    <>
      {markParts(text, q, cs).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}
