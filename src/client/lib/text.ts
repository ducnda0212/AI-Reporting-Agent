/** Xử lý văn bản thuần: chuẩn hoá khoá, làm sạch Jira wiki markup, nhận diện rủi ro. Không phụ thuộc React/store. */

export function parseVN(d: string | null | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '');
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const nowStr = () => {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
export const clockStr = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export function normKey(s: unknown): string {
  return String(s || '').trim().toUpperCase().replace(/[\s_-]+/g, ' ');
}

export function mapNorm(map: Record<string, string>, raw: string): string | undefined {
  if (raw in map) return map[raw];
  const n = normKey(raw);
  const k = Object.keys(map).find((x) => normKey(x) === n);
  return k === undefined ? undefined : map[k];
}

/** bỏ dấu tiếng Việt, hạ chữ thường — dùng để tìm/sắp xếp */
export function vnorm(s: unknown): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/* ---------- làm sạch văn bản Jira (wiki markup, gạch đầu dòng, khoảng trắng…) ---------- */
const BUL = '• ';
const SUBB = '   – ';

function shortUrl(u: string): string {
  const j = /\/browse\/([A-Z][A-Z0-9]+-\d+)/.exec(u);
  if (j) return j[1];
  const c = /\/pages\/\d+\/([^/?#]+)/.exec(u);
  if (c) {
    try { return 'Confluence: ' + decodeURIComponent(c[1].replace(/\+/g, ' ')); } catch { return 'Confluence'; }
  }
  return u;
}

function stripInline(s: string): string {
  return s
    .replace(/(^|[\s(“"'])\*(?!\s)([^*\n]+?)(?<!\s)\*(?=$|[\s.,:;!?)”"'])/g, '$1$2')
    .replace(/(^|[\s(])_(?!\s)([^_\n]+?)(?<!\s)_(?=$|[\s.,:;!?)])/g, '$1$2')
    .replace(/(^|[\s(])\+(?!\s)([^+\n]+?)(?<!\s)\+(?=$|[\s.,:;!?)])/g, '$1$2')
    .replace(/(^|\s)-(?=[^\s\d-])([^\n]*?\p{L}[^\n]*?)(?<!\s)-(?=$|[\s.,:;!?)])/gu, '$1$2')
    .replace(/\*{2,}/g, '').replace(/(^|\s)\*(?=\s|$)/g, '$1').trim();
}

export function cleanText(input: unknown): string {
  if (!input) return '';
  let s = String(input).replace(/\r\n?/g, '\n').replace(/[  ]/g, ' ').replace(/[​-‍﻿]/g, '').replace(/\\\\/g, '\n');
  s = s.replace(/\{(code|noformat|quote)(:[^}]*)?\}/gi, '').replace(/\{color(:[^}]*)?\}/gi, '').replace(/\{\{([^}]*)\}\}/g, '$1')
    .replace(/\[~accountid:[^\]]+\]/gi, '')
    .replace(/\[([^[\]|\n]*)\|([^[\]\n]*)\]/g, (_m, l: string, rest: string) => {
      const label = l.trim();
      const u = rest.split('|')[0].trim();
      return label && label !== u ? label : shortUrl(u);
    })
    .replace(/\[(https?:\/\/[^\]\s]+)\]/g, (_m, u: string) => shortUrl(u));
  const out: string[] = [];
  let num = 0;
  s.split('\n').forEach((raw) => {
    let line = raw.replace(/\t/g, ' ').trim();
    let prefix = '';
    let m: RegExpExecArray | null;
    if (!line) { num = 0; return; }
    if (/^\|[\s|]*\|?$/.test(line) || /^-{4,}$/.test(line)) return;
    line = line.replace(/^['’`]+(?=\S)/, '').replace(/^bq\.\s*/i, '');
    if ((m = /^h[1-6]\.\s*(.*)$/i.exec(line))) { line = stripInline(m[1]).replace(/:?\s*$/, ':'); num = 0; }
    else if ((m = /^(#{2,}|\*{2,}|-{2,}|\+{2,})\s+(.*)$/.exec(line))) { prefix = SUBB; line = m[2]; }
    else if ((m = /^#\s+(.*)$/.exec(line))) { prefix = ++num + '. '; line = m[1]; }
    else if ((m = /^[*\-•+·▪►●○◦]\s+(.*)$/.exec(line)) || (m = /^[•▪►●○◦](\S.*)$/.exec(line))) { prefix = BUL; line = m[1]; num = 0; }
    else if ((m = /^–\s+(.*)$/.exec(line)) && /^ {2,}/.test(raw)) { prefix = SUBB; line = m[1]; }
    else if ((m = /^(\d{1,2})[.)]\s+(.*)$/.exec(line))) { prefix = m[1] + '. '; line = m[2]; }
    else num = 0;
    line = stripInline(line)
      .replace(/\s*(->|=>|-->)\s*/g, ' → ').replace(/^→\s*/, '→ ')
      .replace(/(\S)\s+-\s+(?=\S)/g, '$1 – ')
      .replace(/\s+([,;:!?%])/g, '$1').replace(/\s+\.(?=\s|$)/g, '.')
      .replace(/([,;:])(?=[^\s\d/])/g, '$1 ')
      .replace(/\.{2,}$/, '.').replace(/\s{2,}/g, ' ').trim();
    if (!line || /^[•–\-*.]$/.test(line)) return;
    if (prefix && /^[a-zà-ỹđ]/.test(line) && !/^(https?:|[a-z]+[-_]\d)/i.test(line)) line = line.charAt(0).toUpperCase() + line.slice(1);
    const full = prefix + line;
    if (out[out.length - 1] !== full) out.push(full);
  });
  return out.join('\n');
}

/** KPI dạng bảng wiki → “1. …” */
export function cleanKpi(raw: string): string {
  if (!/^\s*\|\|/.test(raw || '')) return cleanText(raw);
  const items = String(raw).replace(/\r/g, '').split('\n').filter((l) => /^\|[^|]/.test(l))
    .map((l) => (l.split('|')[2] || '').trim()).filter(Boolean);
  return items.map((x, k) => k + 1 + '. ' + cleanText(x)).join('\n');
}

/** Comment “07/Nov/26 5:09 PM;accountId;nội dung” → nội dung */
export function cleanComment(raw: string): string {
  const m = /^([^;]{6,25});([^;]*);([\s\S]*)$/.exec(raw || '');
  return cleanText(m ? m[3] : raw).replace(/^\d{4}-\d{2}-\d{2}\n?/, '');
}

/** các quy tắc làm sạch – đếm số chỗ đã sửa để người dùng thấy và tin */
export const CLEAN_RULES = [
  { k: 'bullet', name: 'Gạch đầu dòng lộn xộn (*, -, +, •dính chữ)', to: 'thống nhất “• ”, ý con “– ”', re: /^[ \t]*([*\-+](?=\s)|•(?=\S))/gm },
  { k: 'wiki', name: 'Định dạng wiki: *đậm*, {{ngày}}, h3., #', to: 'bỏ ký hiệu, giữ chữ', re: /\*[^*\s\n][^*\n]*\*|\{\{[^}]*\}\}|^h\d\.|^#\s/gm },
  { k: 'link', name: 'Link wiki [chữ|https://…]', to: 'giữ chữ hoặc mã issue (LADP-465)', re: /\[[^\]|\n]*\|[^\]\n]*\]/g },
  { k: 'space', name: 'Khoảng trắng thừa, dòng trống, xuống dòng Windows', to: 'gọn một dòng một ý', re: / {2,}|[ \t]+(?=\r?\n|$)|\r|\n[ \t]*\n/g },
  { k: 'arrow', name: 'Mũi tên “->”, gạch nối “ - ”', to: '“→” và “ – ”', re: /->|=>|\s-\s/g },
  { k: 'junk', name: "Ký tự lạ đầu dòng (dấu ' do Excel), dòng bảng rỗng", to: 'bỏ', re: /^['’`]|^\|[\s|]*\|$/gm },
  { k: 'meta', name: 'Ngày giờ + account id đầu Comment', to: 'chỉ giữ nội dung', re: /^\d{2}\/[A-Za-z]{3}\/\d{2}[^;]*;[^;]*;/gm },
];

export function ruleCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  CLEAN_RULES.forEach((r) => { const m = String(raw || '').match(r.re); out[r.k] = m ? m.length : 0; });
  return out;
}

export const RAW_LABEL: Record<string, string> = {
  w3Done: 'AR · Hoàn thành tuần này', w1Done: 'AL · Hoàn thành T01', w1Plan: 'AM · Kế hoạch T01', w2Done: 'AO · Hoàn thành T02',
  w2Plan: 'AP · Kế hoạch T02', kpi: 'E · KPI', comment: 'Comment (nguồn cho AI)', rawStatus: 'I · Status', rawProgress: 'J · Progress',
};

/* ---------- nhận diện nội dung rủi ro ---------- */
const RISK_WORDS = ['rủi ro', 'risk', 'nguy cơ', 'chậm', 'trễ', 'delay', 'quá hạn', 'overdue', 'vướng', 'blocker', 'blocked', 'block', 'tắc', 'kẹt', 'thiếu', 'chưa có', 'chưa được', 'chờ', 'pending', 'phụ thuộc', 'lỗi', 'bug', 'sự cố', 'escalate', 'không kịp', 'không đạt', 'nghiêm trọng', 'critical', 'gấp', 'khẩn'];
const RISK_RE_SRC = '(' + RISK_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
const NO_RISK = /^(•\s*)?(không có|không phát sinh)(\s*(vấn đề|rủi ro|vướng mắc))?(\s*phát sinh)?(\s*trong tuần)?\.?$/i;
export const RISK_F = ['w3Issues', 'w1Issues', 'w2Issues', 'w4Issues'];

export type RiskKind = 'none' | 'risk' | 'prop' | 'plain';
export interface RiskSeg { text: string; hit: boolean }
export interface RiskLine { kind: RiskKind; segs: RiskSeg[] }

export function riskLine(line: string): RiskLine {
  const t = line.trim();
  if (NO_RISK.test(t)) return { kind: 'none', segs: [{ text: line, hit: false }] };
  let kind: RiskKind = /^(•\s*)?(risk|rủi ro|vướng|vấn đề|issue)\s*:/i.test(t) ? 'risk'
    : /^(•\s*)?(→|đề xuất|giải pháp|kiến nghị|xin ý kiến)/i.test(t) ? 'prop' : 'plain';
  const re = new RegExp(RISK_RE_SRC, 'giu');
  const segs: RiskSeg[] = [];
  let last = 0;
  let hit = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const before = line.slice(Math.max(0, m.index - 9), m.index);
    if (/không\s*(có\s*)?$/i.test(before)) continue;
    segs.push({ text: line.slice(last, m.index), hit: false }, { text: m[0], hit: true });
    last = m.index + m[0].length;
    hit = true;
  }
  segs.push({ text: line.slice(last), hit: false });
  if (kind === 'plain' && hit) kind = 'risk';
  return { kind, segs };
}

export const textHasRisk = (text: unknown) =>
  String(text || '').split('\n').some((l) => riskLine(l).kind === 'risk');

export function lvlClass(v: string): '' | 'h' | 'm' | 'l' {
  return v === 'Cao' ? 'h' : v === 'Trung bình' ? 'm' : v === 'Thấp' ? 'l' : '';
}

export function bullets(t: string, n = 2): string[] {
  return (t || '').split('\n').map((x) => x.replace(/^[•\-–\s]+/, '').trim())
    .filter((x) => x && !/^(Mục tiêu|Tiến độ|Mục tiêu và tiến độ|Blockers?)\s*:?$/i.test(x)).slice(0, n);
}

export function blockersOf(t: string): string[] {
  const m = /Blockers?:?\s*\n([\s\S]*)/i.exec(t || '');
  return m ? bullets(m[1], 2) : [];
}
