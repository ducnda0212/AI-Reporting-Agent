import { cleanText } from './text';

export type PeKind = 'bul' | 'num' | 'sub' | 'risk' | 'prop' | 'clean';

const PREFIX: Record<Exclude<PeKind, 'clean'>, (k: number) => string> = {
  bul: () => '• ',
  num: (k) => `${k + 1}. `,
  sub: () => '   – ',
  risk: () => 'Rủi ro: ',
  prop: () => '→ Đề xuất: ',
};
const strip = (l: string) => l.replace(/^\s*(•|–|-|\*|\d{1,2}[.)]|→\s*đề xuất:|→|rủi ro:)\s*/i, '');

/** Áp dạng gạch đầu dòng / đánh số / nhãn lên các dòng đang chọn trong khung soạn ô (bật-tắt như Excel). */
export function formatLines(value: string, s: number, e: number, kind: PeKind): { value: string; start: number; end: number } {
  if (kind === 'clean') { const v = cleanText(value); return { value: v, start: v.length, end: v.length }; }
  const ls = value.lastIndexOf('\n', s - 1) + 1;
  let le = value.indexOf('\n', e);
  if (le < 0) le = value.length;
  const block = value.slice(ls, le).split('\n');
  const pre = PREFIX[kind];
  const all = block.every((l) => !l.trim() || l.indexOf(pre(0).trim()) === 0 || (kind === 'num' && /^\d{1,2}\.\s/.test(l)) || (kind === 'sub' && /^\s+–\s/.test(l)));
  let k = 0;
  let nb = block.map((l) => { if (!l.trim()) return l; const b = strip(l); return all ? b : pre(k++) + b; }).join('\n');
  if (kind === 'prop' && block.length === 1 && !block[0].trim()) nb = '→ Đề xuất: ';
  return { value: value.slice(0, ls) + nb + value.slice(le), start: ls, end: ls + nb.length };
}
