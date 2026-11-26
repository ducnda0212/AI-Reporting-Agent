/* Làm sạch markup Jira (wiki, gạch đầu dòng, khoảng trắng…). Port từ prototype v4. */

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

export function cleanText(input: string | null | undefined): string {
  if (!input) return '';
  let s = String(input).replace(/\r\n?/g, '\n').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\\/g, '\n');
  s = s.replace(/\{(code|noformat|quote)(:[^}]*)?\}/gi, '').replace(/\{color(:[^}]*)?\}/gi, '').replace(/\{\{([^}]*)\}\}/g, '$1')
    .replace(/\[~accountid:[^\]]+\]/gi, '')
    .replace(/\[([^[\]|\n]*)\|([^[\]\n]*)\]/g, (_m, l: string, rest: string) => { l = l.trim(); const u = rest.split('|')[0].trim(); return l && l !== u ? l : shortUrl(u); })
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

/** KPI dạng bảng wiki `||STT||KPI||` → “1. …”. */
export function cleanKpi(raw: string | null | undefined): string {
  if (!/^\s*\|\|/.test(raw || '')) return cleanText(raw);
  return String(raw).replace(/\r/g, '').split('\n').filter((l) => /^\|[^|]/.test(l))
    .map((l) => (l.split('|')[2] || '').trim()).filter(Boolean)
    .map((x, k) => k + 1 + '. ' + cleanText(x)).join('\n');
}

/** Comment “07/Nov/26 5:09 PM;accountId;nội dung” → nội dung. */
export function cleanComment(raw: string | null | undefined): string {
  const m = /^([^;]{6,25});([^;]*);([\s\S]*)$/.exec(raw || '');
  return cleanText(m ? m[3] : raw).replace(/^\d{4}-\d{2}-\d{2}\n?/, '');
}

/* Các quy tắc làm sạch: đếm số chỗ đã sửa để người dùng thấy và tin. */
export const CLEAN_RULES = [
  { k: 'bullet', name: 'Gạch đầu dòng lộn xộn (*, -, +, •dính chữ)', to: 'thống nhất “• ”, ý con “– ”', re: /^[ \t]*([*\-+](?=\s)|•(?=\S))/gm },
  { k: 'wiki', name: 'Định dạng wiki: *đậm*, {{ngày}}, h3., #', to: 'bỏ ký hiệu, giữ chữ', re: /\*[^*\s\n][^*\n]*\*|\{\{[^}]*\}\}|^h\d\.|^#\s/gm },
  { k: 'link', name: 'Link wiki [chữ|https://…]', to: 'giữ chữ hoặc mã issue (LADP-465)', re: /\[[^\]|\n]*\|[^\]\n]*\]/g },
  { k: 'space', name: 'Khoảng trắng thừa, dòng trống, xuống dòng Windows', to: 'gọn một dòng một ý', re: / {2,}|[ \t]+(?=\r?\n|$)|\r|\n[ \t]*\n/g },
  { k: 'arrow', name: 'Mũi tên “->”, gạch nối “ - ”', to: '“→” và “ – ”', re: /->|=>|\s-\s/g },
  { k: 'junk', name: 'Ký tự lạ đầu dòng (dấu \' do Excel), dòng bảng rỗng', to: 'bỏ', re: /^['’`]|^\|[\s|]*\|$/gm },
  { k: 'meta', name: 'Ngày giờ + account id đầu Comment', to: 'chỉ giữ nội dung', re: /^\d{2}\/[A-Za-z]{3}\/\d{2}[^;]*;[^;]*;/gm }
] as const;

export function ruleCounts(raw: string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  CLEAN_RULES.forEach((r) => { out[r.k] = String(raw || '').match(r.re)?.length ?? 0; });
  return out;
}
