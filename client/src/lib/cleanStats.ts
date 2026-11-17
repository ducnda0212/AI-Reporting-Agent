import type { AppState } from '@/store/types';
import { CLEAN_RULES, ruleCounts } from './text';

/** Thống kê "làm sạch nội dung Jira": số chỗ đã chuẩn hoá theo từng quy tắc, và các ô mẫu để so trước-sau. */
export function cleanStats(s: AppState) {
  const tot: Record<string, number> = {};
  const samples: Array<{ i: number; k: string; n: number }> = [];
  CLEAN_RULES.forEach((x) => { tot[x.k] = 0; });
  let nStatus = 0;
  s.allRows.forEach((r) => {
    if (!r.raw) return;
    Object.keys(r.raw).forEach((k) => {
      if (k === 'rawStatus' || k === 'rawProgress') { nStatus++; return; }
      const c = ruleCounts(r.raw![k]);
      let sum = 0;
      CLEAN_RULES.forEach((x) => { tot[x.k] += c[x.k]; sum += c[x.k]; });
      if (sum) samples.push({ i: r.i, k, n: sum });
    });
  });
  const all = CLEAN_RULES.reduce((n, x) => n + tot[x.k], 0) + nStatus;
  return { tot, samples, nStatus, all };
}
