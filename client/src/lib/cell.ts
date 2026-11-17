import type { Field, Row } from '@/types';
import type { AppState } from '@/store/types';
import {
  AI_IDS, DEMO, LEVELS, ORG_JIRA, OVR_RAW, PROG_VALUES, STAGES, STATUS_VALUES, SYS_UNIT, TODAY, UNASSIGNED,
} from '@/data/constants';
import { mapNorm, normKey, parseVN } from './text';

/** Hàm thuần đọc giá trị ô từ `AppState`. Không có tác dụng phụ. */

export const fieldOf = (s: AppState, id: string): Field => s.fields.find((f) => f.id === id) as Field;
export const visibleFields = (s: AppState): Field[] => s.fields.filter((f) => f.key || !s.hidden[f.id]);
export const colNum = (c: string): number => [...c].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
export const ck = (i: number, f: string) => `${i}|${f}`;

export const selectRows = (s: AppState): Row[] =>
  s.allRows.filter((r) => (!r.isNew || s.newCodes === 'added') && (!r.dup || !s.dupMerged));

export const locked = (f: Field): boolean =>
  !!f.key || f.kind === 'cfg' || ['future', 'none', 'past'].includes(f.kind) || f.grp === 'w1' || f.grp === 'w2';
export const noEdit = (f: Field): boolean => locked(f) || ['calc', 'none', 'future', 'past'].includes(f.kind);
export const isSrc = (f: Field): boolean => ['jira', 'bucket', 'calc', 'report', 'tpl'].includes(f.kind);
export const countable = (f: Field): boolean => !['none', 'future', 'past'].includes(f.kind);

export function optsFor(f: Field): string[] | null {
  if (f.opts) return f.opts;
  if (f.id === 'status') return STATUS_VALUES;
  if (f.id === 'progress') return PROG_VALUES;
  if (f.id === 'riskLevel') return LEVELS;
  if (f.id === 'lifecycleStep') return STAGES.map((x, k) => `${k + 1}. ${x}`);
  if (f.id === 'lifecycleStepNo') return STAGES.map((_x, k) => `Bước ${k + 1}`);
  return null;
}

export const statusOf = (s: AppState, r: Row): string | null =>
  (r.ovr && r.ovr.status) || mapNorm(s.statusMap, r.rawStatus) || null;

export const labelBad = (r: Row): boolean => !!r.labels && r.labels.indexOf(r.g + '.') !== 0;
export const labelGroup = (r: Row): string => (r.labels || '').split('.').slice(0, 3).join('.');

export interface OrgInfo { v: string | null; from: 'jira' | 'unit' | 'miss' | 'sys'; jira?: string }

/** báo cáo đọc từ bản đã chạy (catRun); hệ thống sửa xong phải chạy lại báo cáo mới thấy */
export function orgInfo(s: AppState, r: Row, id: string): OrgInfo {
  const C = s.catRun;
  const p = C.projects[r.code];
  const g = p ? p.g : r.g;
  const u = C.units[g];
  const jiraVal = ORG_JIRA[id] && r.jira ? (r.jira as Record<string, string>)[id] : '';
  if (!p) {
    if (id === 'task') return { v: r.task || null, from: 'jira' };
    if (id === 'workstream' && u) return { v: u.name, from: 'unit' };
    if (SYS_UNIT.includes(id) && u) return { v: (u as unknown as Record<string, string>)[id] || null, from: 'unit' };
    return { v: null, from: 'miss' };
  }
  const v = id === 'workstream' ? (u ? u.name : g)
    : SYS_UNIT.includes(id) ? u && (u as unknown as Record<string, string>)[id] : p[id];
  return { v: v || null, from: 'sys', jira: jiraVal && v && jiraVal !== v ? jiraVal : '' };
}

/** Giá trị ô; `null` = trống. Khi `ignoreOvr`, bỏ giá trị sửa tay để lấy giá trị theo nguồn. */
export function cellValue(s: AppState, r: Row, f: Field, ignoreOvr = false): string | null {
  if (!ignoreOvr && r.ovr && r.ovr[f.id]) return r.ovr[f.id] as string;
  if ((f.kind === 'jira' || f.kind === 'bucket') && f.src === UNASSIGNED) return null;
  if (f.kind === 'cfg') return orgInfo(s, r, f.id).v;
  const row = ignoreOvr ? { ...r, ovr: { ...r.ovr, [f.id]: undefined } } : r;
  switch (f.id) {
    case 'code': return r.code;
    case 'task': return r.task;
    case 'pic': return r.pic || null;
    case 'workstream': return r.isNew ? null : DEMO.workstream[r.g] || null;
    case 'status': return statusOf(s, row);
    case 'progress': return normKey(r.rawStatus) === 'PENDING' ? 'Tạm dừng' : mapNorm(s.progMap, r.rawProgress) || null;
    case 'statusAlt': {
      /* đề xuất, chờ chốt: kết hợp thời gian (Start/Due so với ngày báo cáo) và Tiến độ */
      const t = statusOf(s, row);
      if (!t) return null;
      if (t === 'Hủy' || t === 'Tạm dừng') return t;
      const due = parseVN(r.end);
      let late = row.ovr && row.ovr.progress ? row.ovr.progress === 'Chậm tiến độ' : mapNorm(s.progMap, r.rawProgress) === 'Chậm tiến độ';
      if (t === 'Chưa thực hiện') return due && due < TODAY ? 'Chưa thực hiện Chậm tiến độ' : 'Trong kế hoạch';
      if (t === 'Đã hoàn thành') return 'Đã hoàn thành ' + (late ? 'Chậm tiến độ' : 'Đúng tiến độ');
      if (due && due < TODAY) late = true;
      if (!late && !mapNorm(s.progMap, r.rawProgress) && !(row.ovr && row.ovr.progress)) return null;
      return 'Đang thực hiện ' + (late ? 'Chậm tiến độ' : 'Đúng tiến độ');
    }
    case 'lifecycleStep': { const n = s.phaseBucket[r.rawPhase]; return n ? `${n}. ${STAGES[n - 1]}` : null; }
    case 'lifecycleStepNo': { const n = s.phaseBucket[r.rawPhase]; return n ? `Bước ${n}` : null; }
    case 'note': {
      const auto = Object.keys(r.reasons).map((k) => `GĐ ${+k + 1}: ${r.reasons[+k]}`)
        .concat(Object.keys(r.ovr || {}).filter((k) => k !== 'note' && r.ovr[k]).map((k) =>
          `${fieldOf(s, k).col} sửa tay` + (OVR_RAW[k] ? ` (Jira: ${r[OVR_RAW[k]]})` : ''))).join(' · ');
      return [r.note, auto].filter(Boolean).join(' · ') || null;
    }
    case 'riskLevel': case 'w3Plan': case 'w3Issues': { const d = r.ai[f.id]; return d ? d.text : null; }
  }
  if (f.kind === 'none' || f.kind === 'future') return null;
  return (r[f.id] as string) || null;
}

/** nội dung dùng cho tìm kiếm / lọc / sắp xếp */
export function displayText(s: AppState, r: Row, f: Field): string {
  if (f.kind === 'future' || f.kind === 'none') return '';
  let v = cellValue(s, r, f);
  if (v === null && f.kind === 'ai' && r.ai[f.id]) v = (r.ai[f.id] as { text: string }).text;
  return v === null || v === undefined ? '' : String(v);
}

export const fkey = (s: AppState, r: Row, f: Field): string => {
  const t = displayText(s, r, f).split('\n')[0].trim();
  return t ? t.slice(0, 80) : '(Trống)';
};

export const groupName = (groups: { k: string; name: string }[], k: string) => {
  const g = groups.find((x) => x.k === k);
  return g ? g.name.split(' — ')[1] : k;
};

export const aiIds = AI_IDS as readonly string[];

export function tplColor(f: Field): string {
  const n = colNum(f.col);
  return n >= 38 ? 'var(--tW)' : n >= 25 ? 'var(--tY)' : n >= 15 ? 'var(--tO)' : n >= 11 && n <= 13 ? 'var(--tK)' : 'var(--bg)';
}

export function kindShort(f: Field): string {
  if (f.key) return 'khoá ghép';
  const m: Record<string, string> = {
    cfg: 'hệ thống', jira: 'Jira', bucket: 'Jira · gom nhóm', calc: 'tự tính', ai: 'AI soạn', report: 'Progress Report',
    tpl: 'theo mẫu', past: 'tuần đã chốt', future: 'tuần chưa tới', none: '',
  };
  return m[f.kind] || (f.opts ? 'chọn danh sách' : 'nhập tay');
}

export const KIND_NAME: Record<string, string> = {
  jira: 'Jira', bucket: 'rổ gom', calc: 'tính toán', manual: 'nhập tay', cfg: 'hệ thống', ai: 'AI',
  report: 'progress report', tpl: 'có sẵn trong mẫu', past: 'đã chốt', future: 'chưa tới', none: 'không dùng',
};
