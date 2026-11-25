/* Thanh "Đã chọn N dự án" khi tick dòng (prototype selBar L3670; R9 L12427 bỏ hẳn thanh "N ô nháp AI chờ duyệt" / "AI soạn nháp được"). */
import { AI_IDS } from '@/data/constants';
import { ck } from '@/lib/cell';
import { rowsOf, useAppState } from '@/store';
import { aiStart, startReview } from '@/store/actions/ai';
import { approveRows, clearRowSel } from '@/store/actions/grid';

export function SelBar(): JSX.Element | null {
  const s = useAppState((x) => x);
  if (!Object.keys(s.rowSel).length) return null;
  const rows = rowsOf(s), sr = rows.filter((r) => s.rowSel[r.i]);
  if (!sr.length) return null;
  let pend = 0;
  sr.forEach((r) => AI_IDS.forEach((k) => { const a = r.ai[k]; if (a && !a.ok) pend++; }));
  const noDraft = sr.filter((r) => AI_IDS.some((k) => !r.ai[k])).length, all = sr.length === rows.length;
  const review = (): void => { const keys = sr.flatMap((r) => AI_IDS.map((k) => ck(r.i, k))); clearRowSel(); startReview(keys); };
  return (
    <div className="selbar pick gut" role="region" aria-label="Dự án đang chọn">
      <b>{'Đã chọn ' + (all ? 'tất cả ' : '') + sr.length + ' dự án'}</b>
      <span style={{ color: 'var(--ink2)' }}>{pend ? pend + ' ô AI chờ duyệt (AC, AS, AT)' : 'không còn ô AI nào chờ duyệt'}</span>
      <div style={{ flex: '1 1 10px' }} />
      {noDraft > 0 && <button className="btn sm" data-act="aiSel" onClick={aiStart}>{'Nhờ AI soạn cho ' + noDraft + ' dự án chưa có nháp'}</button>}
      {pend > 0 && <>
        <button className="btn sm" data-act="reviewSel" onClick={review}>{'Duyệt từng ô trong ' + sr.length + ' dự án →'}</button>
        <button className="btn sm pri" data-act="approveSel" onClick={approveRows}>{'✓ Duyệt ' + (all ? 'tất cả ' : '') + pend + ' ô của ' + sr.length + ' dự án'}</button>
      </>}
      <button className="btn sm" data-act="clearSel" onClick={clearRowSel}>Bỏ chọn</button>
    </div>
  );
}
