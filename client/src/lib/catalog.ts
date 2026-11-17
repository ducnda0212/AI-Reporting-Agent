import type { AppState } from '@/store/types';
import { SYS_UNIT } from '@/data/constants';
import { orgInfo } from './cell';
import type { Row } from '@/types';

/** Giá trị đang lưu trên hệ thống (bản chưa chạy báo cáo) theo mã dự án + cột. */
export function sysVal(s: AppState, code: string, id: string): string {
  const p = s.cat.projects[code];
  if (!p) return '';
  if (id === 'code') return code;
  if (id === 'workstream') return s.cat.units[p.g] ? s.cat.units[p.g].name : p.g;
  if (SYS_UNIT.includes(id)) return s.cat.units[p.g] ? (s.cat.units[p.g] as unknown as Record<string, string>)[id] || '' : '';
  return p[id] || '';
}

/** các ô Jira ghi khác với hệ thống (báo cáo vẫn theo hệ thống) */
export function jiraDiffs(s: AppState, rows: Row[]): Array<{ r: Row; id: string; j: string; c: string | null }> {
  const out: Array<{ r: Row; id: string; j: string; c: string | null }> = [];
  rows.forEach((r) => ['pic', 'po', 'divisionHead'].forEach((id) => { const o = orgInfo(s, r, id); if (o.jira) out.push({ r, id, j: o.jira, c: o.v }); }));
  return out;
}
