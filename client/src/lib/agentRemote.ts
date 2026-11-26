/* Nối Trợ lý AI với backend (/api/agent/ask). Hàm thuần, không ghi state.
   Quy tắc: mọi câu chat đi qua V-LLM (backend) trước để đọc Ý ĐỊNH (hỏi gì, sửa bảng, soạn nháp, duyệt, đổi cách xem); sau đó giao diện gọi đúng chức năng
   (`intentCommand` đổi ý định thành lệnh chuẩn cho lib/ai.ts). Luật từ khóa (`keepLocal`, lib/ai.ts) chỉ còn là dự phòng khi V-LLM tắt hoặc lỗi. */
import type { AgentAnswer, AgentFacts, AgentRow, AgentTurn, FactPassage, FactProject } from './api';
import type { AskMessage, Row } from '@/types';

/** Backend nhận tối đa 300 dòng và câu hỏi tối đa 500 ký tự. */
export const REMOTE_MAX_ROWS = 300;
export const REMOTE_MAX_QUESTION = 500;

const COMMAND = /^\s*(?:(?:hãy|nhờ|giúp|vui lòng|agent|bạn)\s+)*(?:đổi|điền|sửa|đặt|chuyển|ghi(?!\s*chú)|cập nhật|duyệt|áp dụng|thêm|xoá|xóa|ẩn|hiện|bỏ|lọc|chốt|gán|đánh dấu)(?![\p{L}\p{N}])/iu;
const SELECTION = /đang chọn|dự án này|dòng này|ô này/i;
const CODE = /\b([IVX]+\.[A-Z0-9]+\.\d+\.\d+)\b/g;

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** true = giữ ở giao diện (lệnh sửa bảng, hoặc câu cần biết ô đang chọn). */
export const keepLocal = (q: string): boolean => COMMAND.test(q) || SELECTION.test(q);

/** Mỗi ô chữ gửi lên tối đa ngần này ký tự (backend cũng cắt lại). */
export const REMOTE_MAX_TEXT = 1200;

const PREV_WEEKS: [string, string][] = [['Tuần 1', 'w1'], ['Tuần 2', 'w2']];

/** Các cột chữ của một dòng để Trợ lý tìm theo nội dung. `show` đọc giá trị đang hiển thị của một cột theo id; ô trống để chuỗi rỗng. */
export function textColumns(show: (id: string) => string, comment: string): Pick<AgentRow, 'goal' | 'kpi' | 'milestone' | 'note' | 'done' | 'plan' | 'issue' | 'prev' | 'comment'> {
  const cut = (s: string): string => (s || '').trim().slice(0, REMOTE_MAX_TEXT);
  const prev = PREV_WEEKS.map(([label, k]) => {
    const parts = [['đã làm', show(k + 'ht')], ['kế hoạch', show(k + 'kh')], ['vấn đề', show(k + 'vd')]].filter(([, v]) => (v || '').trim()).map(([n, v]) => n + ': ' + v.trim());
    return parts.length ? label + ' – ' + parts.join('; ') : '';
  }).filter(Boolean).join('\n');
  return {
    goal: cut(show('muctieu')), kpi: cut(show('kpi')), milestone: cut(show('milestone')), note: cut(show('note')),
    done: cut(show('ht')), plan: cut(show('kh')), issue: cut(show('vd')), prev: cut(prev), comment: cut(comment),
  };
}

/** Vài câu gần nhất kèm mã dự án đã nêu, để backend hiểu câu nối tiếp ("dự án đó là dự án gì"). Bỏ tin nhắn đang gõ. */
export const historyOf = (log: Pick<AskMessage, 'q' | 'busy' | 'scope'>[], n = 3): AgentTurn[] =>
  log.filter((m) => !m.busy).slice(-n).map((m) => ({ q: m.q.slice(0, 200), codes: m.scope ?? [] }));

const SHOW_ITEMS = 6;   // dự án hiện sẵn; phần còn lại nằm trong "Xem thêm"
const SHOW_PASSAGES = 4;
const SNIPPET = 170;

type Tone = 'e' | 'w' | 'o' | '';
const low = (s: string | undefined): string => (s || '').toLowerCase();
/** Màu theo ý nghĩa của giá trị: chậm/cao = đỏ, nguy cơ/trung bình = vàng, đúng/thấp/xong = xanh. */
const progressTone = (v?: string): Tone => { const t = low(v); return /nguy cơ/.test(t) ? 'w' : /chậm|trễ/.test(t) ? 'e' : /đúng|hoàn thành|xong/.test(t) ? 'o' : ''; };   // "nguy cơ chậm" kiểm tra trước "chậm"
const riskTone = (v?: string): Tone => { const t = low(v); return /cao/.test(t) ? 'e' : /trung/.test(t) ? 'w' : /thấp/.test(t) ? 'o' : ''; };
const chip = (text: string, tone: Tone = '', mute = false): string => '<span class="pc' + (tone ? ' ' + tone : '') + (mute ? ' mut' : '') + '">' + esc(text) + '</span>';

/** Mã dự án: nút bấm tới dòng đó khi có trong bảng, không thì chữ thường. */
function codeLink(code: string, byCode: Map<string, number>): string {
  const i = byCode.get(code.toUpperCase());
  return i === undefined ? '<span class="cdn">' + esc(code) + '</span>' : '<button class="cd" data-act="exGo" data-i="' + i + '">' + esc(code) + '</button>';
}

/** Một đoạn văn: escape, mã dự án thành nút, bỏ ký hiệu markdown AI lỡ viết. */
function linkCodes(text: string, byCode: Map<string, number>): string {
  return esc(text.replace(/\*\*/g, '')).replace(CODE, (m) => {
    const i = byCode.get(m.toUpperCase());
    return i === undefined ? m : '<button class="cd" data-act="exGo" data-i="' + i + '">' + m + '</button>';
  });
}

/** Văn bản nhiều dòng: dòng bắt đầu bằng "- " thành gạch đầu dòng, còn lại là đoạn ngắn. */
function textBlock(text: string, byCode: Map<string, number>): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = (): void => { if (list.length) { out.push('<ul class="bl">' + list.join('') + '</ul>'); list = []; } };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^[-•*]\s+(.*)$/.exec(line);
    if (m) list.push('<li>' + linkCodes(m[1], byCode) + '</li>');
    else { flush(); out.push('<p>' + linkCodes(line, byCode) + '</p>'); }
  }
  flush();
  return out.join('');
}

function projectCard(p: FactProject, byCode: Map<string, number>): string {
  const chips = [
    p.tien_do ? chip(p.tien_do, progressTone(p.tien_do)) : '',
    p.rui_ro ? chip('Rủi ro: ' + p.rui_ro, riskTone(p.rui_ro)) : chip('Rủi ro: chưa đánh giá', '', true),
    p.trang_thai ? chip(p.trang_thai) : '',
    p.han ? chip('Hạn ' + p.han, '', true) : '',
  ].join('');
  return '<li class="pi"><div class="pt">' + codeLink(p.code, byCode) + (p.name ? '<span class="pn">' + esc(p.name) + '</span>' : '') + '</div><div class="pp">' + chips + '</div></li>';
}

function projectList(list: FactProject[], total: number | undefined, byCode: Map<string, number>): string {
  if (!list.length) return '';
  const head = list.slice(0, SHOW_ITEMS), rest = list.slice(SHOW_ITEMS);
  let h = '<ul class="pl">' + head.map((p) => projectCard(p, byCode)).join('') + '</ul>';
  if (rest.length) h += '<details class="more"><summary>Xem thêm ' + rest.length + ' dự án</summary><ul class="pl">' + rest.map((p) => projectCard(p, byCode)).join('') + '</ul></details>';
  const hidden = (total ?? list.length) - list.length;
  if (hidden > 0) h += '<div class="pm">Còn ' + hidden + ' dự án khác chưa hiện. Hỏi cụ thể hơn (thêm điều kiện hoặc nhóm) để thu hẹp.</div>';
  return h;
}

/** Thống kê dạng chip (tóm tắt tuần) và thanh ngang (đếm theo nhóm). */
function statRow(title: string, counts: Record<string, number>, tone: (v: string) => Tone): string {
  const keys = Object.keys(counts);
  if (!keys.length) return '';
  return '<div class="st"><div class="sh">' + esc(title) + '</div><div class="pp">' + keys.map((k) => chip(k + ' · ' + counts[k], tone(k))).join('') + '</div></div>';
}
/** Tên nhóm thường là "II.E.1Nền tảng MLOps…" hoặc "I.A.3.PAI - …": tách mã nhóm ra để dễ đọc. */
const GROUP = /^((?:[IVX]+)\.[A-Z]\.\d+)\.?\s*(.+)$/;
function groupName(k: string): string {
  const m = GROUP.exec(k.trim());
  return m ? '<span class="gc">' + esc(m[1]) + '</span>' + esc(m[2]) : esc(k);
}
function groupBars(g: NonNullable<AgentFacts['phan_nhom']>): string {
  const keys = Object.keys(g.theo), max = Math.max(1, ...keys.map((k) => g.theo[k]));
  let h = '<div class="st"><div class="sh">Theo ' + esc(g.truong.toLowerCase()) + '</div>';
  h += keys.map((k) => '<div class="br' + (g.theo[k] === max ? ' top' : '') + '" title="' + esc(k) + '"><span class="bn">' + groupName(k) + '</span><b>' + g.theo[k]
    + '</b><span class="bb"><i style="width:' + Math.max(4, Math.round((g.theo[k] / max) * 100)) + '%"></i></span></div>').join('');
  if (g.con_lai_nhom) h += '<div class="pm">Và ' + g.con_lai_nhom + ' nhóm khác.</div>';
  return h + '</div>';
}

function passages(list: FactPassage[], open: boolean, byCode: Map<string, number>): string {
  if (!list.length) return '';
  const shown = list.slice(0, SHOW_PASSAGES);
  const items = shown.map((x) => {
    const t = (x.noi_dung || '').replace(/\s+/g, ' ').trim();
    return '<li class="pi"><div class="pt">' + codeLink(x.code, byCode) + (x.ten ? '<span class="pn">' + esc(x.ten) + '</span>' : '') + '</div>'
      + '<div class="px">' + (x.truong ? '<span class="pf">' + esc(x.truong) + '</span>' : '') + esc(t.length > SNIPPET ? t.slice(0, SNIPPET) + '…' : t) + '</div></li>';
  }).join('');
  return '<details class="srcs"' + (open ? ' open' : '') + '><summary>Nguồn trong bảng (' + shown.length + ' đoạn)</summary><ul class="pl">' + items + '</ul></details>';
}

/** Phần "chi tiết" dưới câu dẫn, dựng từ số liệu backend: danh sách dự án, thống kê, đoạn nguồn. Rỗng khi không có gì để hiện. */
function details(f: AgentFacts, byCode: Map<string, number>, aiText: boolean): string {
  if (f.kieu === 'summary') {
    let h = statRow('Tiến độ', f.theo_tien_do || {}, progressTone) + statRow('Mức độ rủi ro', f.theo_muc_do_rui_ro || {}, riskTone);
    const cham = f.du_an_cham || [];
    if (cham.length) h += '<div class="st"><div class="sh">Chậm tiến độ (' + (f.so_du_an_cham ?? cham.length) + ')</div><div class="pp">'
      + cham.slice(0, 8).map((c) => codeLink(c, byCode)).join(' ') + (cham.length > 8 ? '<span class="pm">và ' + (cham.length - 8) + ' dự án khác</span>' : '') + '</div></div>';
    if (f.so_du_an_co_o_nhap_ai_cho_duyet) h += '<div class="pm">' + f.so_du_an_co_o_nhap_ai_cho_duyet + ' dự án có ô nháp AI chờ duyệt.</div>';
    return h;
  }
  if (f.kieu === 'search') return passages(f.doan || [], !aiText, byCode);
  if (f.phan_nhom) return groupBars(f.phan_nhom);
  const d = f.du_an;
  if (Array.isArray(d)) return projectList(d, f.so_luong, byCode);
  if (d && typeof d === 'object') return '<ul class="pl">' + projectCard(d, byCode) + '</ul>';
  return '';
}

/** Đổi câu trả lời của Agent thành HTML: câu dẫn ngắn, rồi danh sách dự án/thống kê/nguồn dựng từ số liệu (mã dự án là nút bấm tới dòng đó),
 *  cuối cùng là dòng nguồn nói rõ ai viết câu trả lời. Không có `facts` (backend cũ) thì chỉ hiện câu trả lời. */
export function agentHtml(res: AgentAnswer, rows: Pick<Row, 'i' | 'ma'>[]): string {
  const byCode = new Map(rows.map((r) => [r.ma.toUpperCase(), r.i]));
  const ai = !!res.by && res.by !== 'rule' && res.by !== 'mock';
  const lead = ai ? res.answer : (res.lead ?? res.answer);
  const lines = textBlock((lead || '').trim(), byCode);
  const extra = res.facts ? details(res.facts, byCode, ai) : '';
  const why = res.warnings.length ? ' title="' + esc(res.warnings.slice(0, 3).join('; ')) + '"' : '';
  const src = ai
    ? 'Số liệu tính từ bảng hiện tại · lời văn do ' + esc(res.by) + ', đã kiểm tra mã dự án và con số'
    : res.grounded
      ? 'Số liệu tính từ bảng hiện tại'
      : 'Số liệu tính từ bảng hiện tại · AI trả lời lệch số liệu nên dùng câu mẫu';
  return '<div class="am">' + (lines ? '<div class="al">' + lines + '</div>' : '') + extra + '</div><div class="src"' + why + '>' + src + '</div>';
}

/** Lệnh chuẩn cho chức năng có sẵn của giao diện, theo ý định V-LLM đọc được. `null` = thiếu thông tin (vd ẩn cột nào?). */
export function intentCommand(res: Pick<AgentAnswer, 'intent' | 'view' | 'target'>): string | string[] | null {
  const v = res.view || {};
  if (res.intent === 'draft') return 'Soạn nháp các ô còn trống';
  if (res.intent === 'approve') return res.target?.length ? res.target.map((c) => 'Duyệt nháp của ' + c) : 'Duyệt tất cả nháp AI';
  if (res.intent !== 'view') return null;
  if (v.action === 'only_fix') return 'Chỉ hiện dòng cần sửa';
  if (v.action === 'show_all') return 'Bỏ lọc, hiện lại tất cả';
  if ((v.action === 'hide' || v.action === 'show') && v.column) return (v.action === 'hide' ? 'Ẩn cột ' : 'Hiện cột ') + v.column;
  return null;
}
