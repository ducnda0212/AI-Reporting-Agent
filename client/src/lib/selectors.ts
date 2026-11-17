import type { Row } from '@/types';
import type { AppState } from '@/store/types';
import { AI_IDS, ORPHANS, SYS_PEOPLE, UNASSIGNED } from '@/data/constants';
import { cellValue, countable, fieldOf, labelBad, labelGroup, selectRows } from './cell';
import { mapNorm, normKey } from './text';

/** Các số đếm / danh sách suy ra từ state (cảnh báo, lỗi chặn, số cần xử lý...). Hàm thuần. */

export const pendingAI = (rows: Row[]): number =>
  rows.reduce((n, r) => n + AI_IDS.filter((k) => r.ai[k] && !r.ai[k]!.ok).length, 0);

export const pendingIn = pendingAI;

export const aiDoneCount = (rows: Row[]): number =>
  rows.reduce((n, r) => n + AI_IDS.filter((k) => r.ai[k] && r.ai[k]!.ok).length, 0);

export function aiEmpty(s: AppState, rows: Row[]): { n: number; r: number } {
  let n = 0;
  let rr = 0;
  rows.forEach((r) => {
    const c = AI_IDS.filter((k) => !r.ai[k] && cellValue(s, r, fieldOf(s, k)) === null).length;
    n += c;
    if (c) rr++;
  });
  return { n, r: rr };
}

export function emptyCells(s: AppState, rows: Row[]): number {
  let n = 0;
  rows.forEach((r) => s.fields.forEach((f) => { if (f.required && cellValue(s, r, f) === null) n++; }));
  return n;
}

export function optEmpty(s: AppState, rows: Row[]): number {
  let n = 0;
  rows.forEach((r) => s.fields.forEach((f) => { if (!f.required && countable(f) && cellValue(s, r, f) === null) n++; }));
  return n;
}

export const orphansLeft = (s: AppState) => ORPHANS.filter((o) => !s.orphanDone[o.key]);

export function unsortedOf(s: AppState, rows: Row[], col: 'status' | 'progress'): string[] {
  const map = col === 'status' ? s.statusMap : s.progMap;
  const key = col === 'status' ? 'rawStatus' : 'rawProgress';
  const out: string[] = [];
  rows.forEach((r) => {
    const v = r[key] as string;
    if (col === 'progress' && normKey(r.rawStatus) === 'PENDING') return;
    if (!mapNorm(map, v) && !out.includes(v)) out.push(v);
  });
  return out;
}

/** dự án có trên Jira nhưng chưa có trong hệ thống (bản đã chạy) */
export function missingCat(s: AppState, rows: Row[]): Row[] {
  const seen: Record<string, number> = {};
  return rows.filter((r) => {
    if (s.catRun.projects[r.code] || seen[r.code]) return false;
    seen[r.code] = 1;
    return true;
  });
}

export function catPeople(s: AppState): string[] {
  const set = new Set<string>();
  Object.values(s.cat.projects).forEach((p) => SYS_PEOPLE.forEach((id) => { if (p[id]) set.add(p[id]); }));
  Object.values(s.cat.units).forEach((u) => { if (u.deptHead) set.add(u.deptHead); });
  return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
}

export interface Issue { id?: string; f?: string; t: string; d: string; fix: string; sev?: 'e' | 'w' }

export function blockers(s: AppState, rows: Row[]): Issue[] {
  const b: Issue[] = [];
  if (!s.loaded) return b;
  s.fields.forEach((f) => {
    if (f.required && f.src === UNASSIGNED) {
      b.push({ id: f.id, f: f.id, t: `Cột ${f.col} “${f.name}” chưa ánh xạ`, d: `Trường Jira cũ đã đổi tên · ảnh hưởng cả ${rows.length} dòng`, fix: 'map' });
    }
  });
  const left = orphansLeft(s).length;
  if (left) b.push({ id: 'orphan', t: `${left} issue không có mã ở đầu Summary`, d: 'Không tách được Mã DA nên chưa ghép được vào dòng nào của mẫu', fix: 'check' });
  const miss = rows.filter((r) => cellValue(s, r, fieldOf(s, 'w3Issues')) === null).length;
  if (miss > 0) b.push({ id: 'w3Issues', t: `${miss} ô “Vấn đề, rủi ro và Đề xuất giải pháp” còn trống`, d: 'Cột AT · bắt buộc của khối tuần này', fix: 'ai' });
  return b;
}

export function warnings(s: AppState, rows: Row[]): Issue[] {
  const w: Issue[] = [];
  if (!s.loaded) return w;
  if (s.unsorted.length) w.push({ t: `${s.unsorted.length} giá trị chưa gom vào rổ`, d: 'Cột AJ AI Lifecycle và L · ô để trống cho tới khi gom', fix: 'bucket' });
  const noTT = unsortedOf(s, rows, 'status');
  if (noTT.length) w.push({ t: 'Status chưa có luật: ' + noTT.join(', '), d: 'Cột I Trạng thái và AA TRẠNG THÁI 1 để trống ở các dòng này', fix: 'bucketTT' });
  const noTD = fieldOf(s, 'progress').src === UNASSIGNED ? [] : unsortedOf(s, rows, 'progress');
  if (noTD.length) w.push({ t: 'Tiến độ chưa có luật: ' + noTD.join(', '), d: 'Cột J Tiến độ để trống ở các dòng này', fix: 'bucketTD' });
  const hand = rows.filter((r) => !r.projectType || !r.market).length;
  if (hand) w.push({ t: `${hand} dòng thiếu ô nhập tay bắt buộc`, d: 'Cột AF Loại dự án hoặc AI Market', fix: 'fix' });
  const noRep = rows.filter((r) => !r.w3Done && !r.ovr.w3Done).length;
  if (noRep) w.push({ t: `${noRep} dự án chưa có Progress report trong Tuần 3/11`, d: 'Cột AR để trống · nhắc PM cập nhật trên Jira rồi nhập lại file', fix: '' });
  const bad = s.labelOk ? [] : rows.filter(labelBad);
  if (bad.length) {
    w.push({ t: 'Labels không khớp nhóm: ' + bad.map((r) => r.code).join(', '), d: `Mã thuộc ${bad[0].g} nhưng Labels ghi ${labelGroup(bad[0])} · xử lý ở bước Kiểm tra`, fix: 'check' });
  }
  if (!s.dupDone) w.push({ t: 'Mã trùng trong mẫu: II.D.2.1', d: 'Dòng 34 và 35 của file mẫu cùng mã · xử lý ở bước Kiểm tra', fix: 'check' });
  if (s.newCodes === 'pending') w.push({ t: '2 mã có trên Jira nhưng chưa có dòng trong mẫu', d: 'I.A.7.1, II.B.2.1 · xử lý ở bước Kiểm tra dữ liệu', fix: 'check' });
  const miss = rows.reduce((n, r) => n + r.stages.filter((x) => x === 'miss').length, 0);
  if (miss) w.push({ t: `${miss} giai đoạn thiếu Subtask`, d: 'Mở dự án để xác nhận hoặc chỉnh tay kèm lý do', fix: 'proj' });
  return w;
}

export function needsFix(s: AppState, r: Row): boolean {
  return s.fields.some((f) => f.required && cellValue(s, r, f) === null)
    || r.stages.includes('miss')
    || AI_IDS.some((k) => r.ai[k] && !r.ai[k]!.ok);
}

/** số việc còn lại ở bước 2 (Kiểm tra) */
export function checkCount(s: AppState, rows: Row[]): number {
  if (!s.loaded) return 0;
  let n = s.fields.filter((f) => f.required && f.src === UNASSIGNED).length;
  n += s.unsorted.length + unsortedOf(s, rows, 'status').length + (fieldOf(s, 'progress').src === UNASSIGNED ? 0 : unsortedOf(s, rows, 'progress').length);
  n += (orphansLeft(s).length ? 1 : 0) + (s.newCodes === 'pending' ? 1 : 0) + (s.dupDone ? 0 : 1);
  n += !s.labelOk && rows.some(labelBad) ? 1 : 0;
  n += missingCat(s, rows).filter((r) => !s.reqs.some((q) => q.type === 'new' && q.code === r.code && q.status === 'pending')).length;
  return n;
}

/** số ô cần điền / duyệt ở bước 3 */
export function fillCount(s: AppState, rows: Row[]): number {
  if (!s.loaded) return 0;
  let n = 0;
  rows.forEach((r) => s.fields.forEach((f) => {
    if (f.kind === 'ai') {
      const d = r.ai[f.id];
      if ((f.required && !d) || (d && !d.ok)) n++;
    } else if (f.required && f.src !== UNASSIGNED && cellValue(s, r, f) === null) n++;
  }));
  return n;
}

export { selectRows };
