import type { Row } from '@/types';
import type { AppState } from '@/store/types';
import { cellValue, fieldOf } from '../cell';
import { aiText, exOf, exRunning, exSorted, exStatus, hasIssues } from '../exec';

/** Dữ liệu dựng báo cáo điều hành, dùng chung cho PDF / Word. */
export function reportData(s: AppState) {
  const run = exSorted(s, exRunning(s));
  const cnt: Record<string, number> = { 'Chậm tiến độ': 0, 'Có nguy cơ chậm': 0, 'Đúng tiến độ': 0 };
  run.forEach((r) => { cnt[exStatus(s, r)]++; });
  const V = (r: Row, id: string) => cellValue(s, r, fieldOf(s, id)) || '';
  const ok = (d?: { ok: boolean; text: string } | null) => (d && d.ok ? d.text : '');
  return {
    run, N: run.length, cnt, V, ok,
    hl: run.filter((r) => V(r, 'kpi') && exOf(s, r).hl),
    iss: run.filter(hasIssues),
    nx: run.filter((r) => aiText(r, 'w3Plan')),
    directives: run.filter((r) => { const e = exOf(s, r); return e.directive && e.directive.ok && e.directive.text; }),
    rate: run.length ? Math.round((cnt['Đúng tiến độ'] / run.length) * 100) + ' %' : '',
  };
}
export type ReportData = ReturnType<typeof reportData>;
