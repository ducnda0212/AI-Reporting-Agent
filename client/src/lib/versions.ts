import type { Version } from '@/types';
import type { AppState } from '@/store/types';
import { cellValue, fieldOf, selectRows } from './cell';

export type Snap = Record<string, string | null>;

export function snapshot(s: AppState): Snap {
  const m: Snap = {};
  selectRows(s).forEach((r) => s.fields.forEach((f) => {
    if (f.kind === 'future' || f.kind === 'none') return;
    let v = cellValue(s, r, f);
    if (f.kind === 'ai') { const d = r.ai[f.id]; v = d && d.ok ? d.text : null; }
    m[`${r.code}|${f.id}`] = v === undefined ? null : v;
  }));
  return m;
}

export function diffSnap(s: AppState, a: Snap, b: Snap): Array<[string, string, string | null, string | null]> {
  const out: Array<[string, string, string | null, string | null]> = [];
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  keys.forEach((k) => {
    const x = a[k] === undefined ? null : a[k];
    const y = b[k] === undefined ? null : b[k];
    if (x !== y) {
      const p = k.split('|');
      const f = fieldOf(s, p[1]);
      out.push([p[0], `${f.col} ${f.name}`, x, y]);
    }
  });
  return out;
}

export const curVersions = (s: AppState): Version[] => s.versions.filter((v) => v.wk === 'w3');
export const lastCur = (s: AppState): Version | null => curVersions(s)[0] || null;
export const changedSinceLock = (s: AppState) => {
  const l = lastCur(s);
  return l && l.snap ? diffSnap(s, l.snap, snapshot(s)) : null;
};
