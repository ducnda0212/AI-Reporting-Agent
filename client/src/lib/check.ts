import type { Field, Row } from '@/types';
import type { AppState } from '@/store/types';
import { BASE_PROG_MAP, BASE_STATUS_MAP, PROG_VALUES, STAGES, STATUS_VALUES, UNASSIGNED } from '@/data/constants';
import { fieldOf, labelBad, selectRows } from './cell';
import { missingCat, orphansLeft, unsortedOf } from './selectors';

/** Dữ liệu cho bước 2 (Kiểm tra): khớp cột, quy đổi giá trị, ghép dự án. */

export const SUG_STATUS: Record<string, string> = { MONITORING: 'Đang thực hiện' };
export const SUG_PROG: Record<string, string> = { 'Not tracking': 'Đúng tiến độ' };
export const SUG_ORPH: Record<string, string> = { 'PKD-201': 'I.C.1.1', 'PKD-202': 'Không đưa vào báo cáo' };
export const NO_STEP = 'Không thuộc bước nào — để trống, điền tay sau';

export function sugVal(c: string, v: string): string {
  if (c === 'status') return SUG_STATUS[v] || '';
  if (c === 'progress') return SUG_PROG[v] || '';
  const n = parseInt(v, 10);
  if (n >= 1 && n <= 12) return `${n}. ${STAGES[n - 1]}`;
  if (/^n\/?a$/i.test(v)) return NO_STEP;
  return '';
}

export const chkCols = (s: AppState): Field[] =>
  s.fields.filter((f) => ['jira', 'bucket', 'report'].includes(f.kind) && f.grp !== 'w1' && f.grp !== 'w2');

export interface ValGroup {
  c: 'status' | 'progress' | 'lifecycleStep'; col: string; name: string; src: string; opts: string[]; vals: string[];
  map?: Record<string, string>; base?: Record<string, string>; key: string; off?: boolean;
}

export function chkValGroups(s: AppState, rows: Row[]): ValGroup[] {
  const tdOn = fieldOf(s, 'progress').src !== UNASSIGNED;
  return [
    { c: 'status', col: 'I', name: 'Trạng thái', src: 'Status', opts: STATUS_VALUES, vals: unsortedOf(s, rows, 'status'), map: s.statusMap, base: BASE_STATUS_MAP, key: 'rawStatus' },
    { c: 'progress', col: 'J', name: 'Tiến độ', src: 'Custom field (Progress)', opts: PROG_VALUES, vals: tdOn ? unsortedOf(s, rows, 'progress') : [], map: s.progMap, base: BASE_PROG_MAP, key: 'rawProgress', off: !tdOn },
    { c: 'lifecycleStep', col: 'L · AJ', name: 'AI Lifecycle', src: 'Custom field (Phase)', opts: STAGES.map((x, k) => `${k + 1}. ${x}`).concat([NO_STEP]), vals: s.unsorted.slice(), key: 'rawPhase' },
  ];
}

export interface PrjItem { id: string; sev: 'e' | 'w'; t: string; d: string }

export function chkPrjItems(s: AppState, rows: Row[]): PrjItem[] {
  const it: PrjItem[] = [];
  const orph = orphansLeft(s);
  const miss = missingCat(s, rows).filter((r) => !s.reqs.some((q) => q.type === 'new' && q.code === r.code && q.status === 'pending'));
  if (orph.length) it.push({ id: 'orph', sev: 'e', t: `${orph.length} issue không có mã dự án`, d: orph.map((o) => o.key).join(', ') });
  if (!s.dupDone) it.push({ id: 'dup', sev: 'e', t: 'Mã II.D.2.1 bị trùng trong mẫu', d: 'Dòng 34 và 35 cùng mã' });
  if (s.newCodes === 'pending') it.push({ id: 'new', sev: 'w', t: '2 mã mới chưa có dòng', d: 'I.A.7.1, II.B.2.1' });
  if (miss.length) it.push({ id: 'sys', sev: 'w', t: `${miss.length} dự án chưa có trên hệ thống`, d: miss.map((r) => r.code).join(', ') });
  if (!s.labelOk && rows.some(labelBad)) it.push({ id: 'label', sev: 'w', t: `${rows.filter(labelBad).map((r) => r.code).join(', ')} lệch nhóm`, d: 'Labels ghi nhóm khác với mã' });
  return it;
}

export function chkCounts(s: AppState) {
  const rows = selectRows(s);
  const col = chkCols(s).filter((f) => f.src === UNASSIGNED).length;
  const val = chkValGroups(s, rows).reduce((n, g) => n + g.vals.length, 0);
  const prj = chkPrjItems(s, rows);
  return { col, val, prjE: prj.filter((x) => x.sev === 'e').length, prjW: prj.filter((x) => x.sev === 'w').length, prj };
}
