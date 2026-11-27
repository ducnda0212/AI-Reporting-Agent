/* Nối Trợ lý AI với backend (/api/agent/ask). Hàm thuần, không ghi state.
   Quy tắc: mọi câu chat đi qua V-LLM (backend) trước để đọc Ý ĐỊNH (hỏi gì, sửa bảng, soạn nháp, duyệt, đổi cách xem); sau đó giao diện gọi đúng chức năng
   (`intentCommand` đổi ý định thành lệnh chuẩn cho lib/ai.ts). Luật từ khóa (`keepLocal`, lib/ai.ts) chỉ còn là dự phòng khi V-LLM tắt hoặc lỗi. */
import type { AgentAnswer, AgentFacts, AgentRow, AgentTurn, FactAnalysis, FactBucket, FactPassage, FactProject } from './api';
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

function projChips(p: FactProject): string {
  return [
    p.tien_do ? chip(p.tien_do, progressTone(p.tien_do)) : '',
    p.rui_ro ? chip('Rủi ro: ' + p.rui_ro, riskTone(p.rui_ro)) : chip('Rủi ro: chưa đánh giá', '', true),
    p.trang_thai ? chip(p.trang_thai) : '',
    p.han ? chip('Hạn ' + p.han, '', true) : '',
  ].join('');
}

function projectCard(p: FactProject, byCode: Map<string, number>): string {
  const chips = projChips(p);
  return '<li class="pi"><div class="pt">' + codeLink(p.code, byCode) + (p.name ? '<span class="pn">' + esc(p.name) + '</span>' : '') + '</div><div class="pp">' + chips + '</div>' + (p.ly_do ? '<div class="px">' + esc(p.ly_do) + '</div>' : '') + '</li>';
}

/** Báo cáo chi tiết một dự án: tiêu đề + chip, rồi mỗi ô nội dung là một khối riêng (gộp đoạn, tách ý theo số thứ tự / ngày, phần dài có "Xem đầy đủ"). */
const RP_OPEN: [string, string, string][] = [   // [nhãn từ backend, tiêu đề hiển thị, tông màu]
  ['Vấn đề, rủi ro và đề xuất', 'Vấn đề, rủi ro và đề xuất', 'w'], ['Công việc đã hoàn thành trong tuần', 'Việc đã làm tuần này', 'o'],
  ['Kế hoạch tuần sau', 'Kế hoạch tuần sau', 'b'], ['Ghi chú', 'Ghi chú', 'n'],
];
const RP_FOLD: [string, string][] = [['Mục tiêu', 'Mục tiêu'], ['KPI', 'KPI'], ['Milestone', 'Mốc quan trọng'], ['Báo cáo các tuần trước', 'Các tuần trước'], ['Comment', 'Comment']];
const RP_SPLIT = /\s+(?=(?:\d{1,2}\.\s)|(?:\[\d{4}-\d{2}-\d{2}\]))/;
const rpInline = (s: string): string => esc(s).replace(/\[(\d{4})-(\d{2})-(\d{2})\]\s*-?\s*/g, (_m, _y, mo, d) => '<b class="rpt-dt">' + d + '/' + mo + '</b>');

/** Mục có tiêu đề IN HOA ("BÀI TOÁN & BỐI CẢNH Dự án…") và gạch đầu dòng "•" nằm chung một đoạn: tách thành tiêu đề nhỏ + danh sách, để đọc được. */
const RP_HEAD = /^([\p{Lu}\d][\p{Lu}\d &/,\-]{4,70}?)\s+(?=[•\u2022]|\p{Lu}\p{Ll})/u;
const sentenceCase = (s: string): string => { const t = s.trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
function rpBlock(item: string): { head: string; lead: string; bullets: string[] } {
  const m = RP_HEAD.exec(item), head = m ? sentenceCase(m[1]) : '', rest = m ? item.slice(m[0].length) : item;
  const [lead, ...bullets] = rest.split(/\s*[•\u2022]\s*/).map((x) => x.trim());
  return { head, lead: lead || '', bullets: bullets.filter(Boolean) };
}
const rpHeads = (raw: string): string[] => raw.replace(/\s+/g, ' ').trim().split(RP_SPLIT).map((x) => rpBlock(x.replace(/^\d{1,2}\.\s+/, '').trim()).head).filter(Boolean);

function rpBody(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  const items = text.split(RP_SPLIT).map((x) => x.replace(/^\d{1,2}\.\s+/, '').trim()).filter(Boolean);
  const li = (xs: string[]): string => '<ul class="rpt-l">' + xs.map((x) => '<li>' + rpInline(x) + '</li>').join('') + '</ul>';
  if (items.some((x) => rpBlock(x).head)) {   // báo cáo viết theo mục: mỗi mục một khối có tiêu đề nhỏ
    return items.map((x) => {
      const k = rpBlock(x);
      return '<div class="rpt-i">' + (k.head ? '<h5>' + esc(k.head) + '</h5>' : '') + (k.lead ? '<p>' + rpInline(k.lead) + '</p>' : '') + (k.bullets.length ? li(k.bullets) : '') + '</div>';
    }).join('');
  }
  if (items.length > 1) {
    return items.length > 4 ? li(items.slice(0, 3)) + '<details class="rpt-x"><summary>Xem thêm ' + (items.length - 3) + ' ý</summary>' + li(items.slice(3)) + '</details>' : li(items);
  }
  if (text.length <= 320) return '<p>' + rpInline(text) + '</p>';
  const cut = text.lastIndexOf(' ', 280);
  return '<p>' + rpInline(text.slice(0, cut > 120 ? cut : 280)) + '…</p><details class="rpt-x"><summary>Xem đầy đủ</summary><p>' + rpInline(text) + '</p></details>';
}

/** Dòng xem trước cho mục đang gấp: các tiêu đề nhỏ nếu có, không thì vài chữ đầu. */
function rpPeek(raw: string): string {
  const heads = rpHeads(raw);
  if (heads.length) return heads.join(' · ');
  const t = raw.replace(/\s+/g, ' ').trim().split(RP_SPLIT).map((x) => x.replace(/^\d{1,2}\.\s+/, '').replace(/^\[(\d{4})-(\d{2})-(\d{2})\]\s*-?\s*/, '$3/$2 ')).join(' · ');
  return t.length > 80 ? t.slice(0, t.lastIndexOf(' ', 80) > 30 ? t.lastIndexOf(' ', 80) : 80) + '…' : t;
}

/** Điều đáng chú ý của chính dự án, tính từ số liệu: mâu thuẫn giữa trạng thái và tiến độ, quá hạn / sắp hạn, chưa đánh giá rủi ro. */
function projNotes(p: FactProject): string {
  const out: [Tone, string][] = [];
  const done = /hoàn thành|done|xong|closed/i.test(p.trang_thai || ''), late = /chậm|trễ/i.test(p.tien_do || '') && !/nguy cơ/i.test(p.tien_do || '');
  if (done && late) out.push(['w', 'Trạng thái ghi "' + p.trang_thai + '" nhưng tiến độ vẫn là "' + p.tien_do + '". Nên đối chiếu lại.']);
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((p.han || '').trim());
  if (m && !done) {
    const days = Math.round((new Date(+m[3], +m[2] - 1, +m[1]).getTime() - new Date().setHours(0, 0, 0, 0)) / 864e5);
    if (days < 0) out.push(['e', 'Quá hạn ' + -days + ' ngày (hạn ' + p.han + ').']);
    else if (days <= 14) out.push(['w', 'Còn ' + days + ' ngày tới hạn (' + p.han + ').']);
  }
  if (!done && !(p.rui_ro || '').trim()) out.push(['w', 'Chưa đánh giá mức độ rủi ro.']);
  return out.length ? '<ul class="rpt-n">' + out.map(([t, s]) => '<li class="' + t + '">' + esc(s) + '</li>').join('') + '</ul>' : '';
}

function reportCard(p: FactProject, doan: FactPassage[], byCode: Map<string, number>): string {
  const by = new Map<string, string>();
  for (const x of doan) by.set(x.truong || '', ((by.get(x.truong || '') || '') + ' ' + (x.noi_dung || '')).trim());   // gộp các đoạn cắt nhỏ của cùng một ô
  let n = 0;
  const open = RP_OPEN.filter(([k]) => by.get(k)).map(([k, title, tone]) =>
    '<section class="rpt-s ' + tone + '" style="--d:' + n++ + '"><h4>' + esc(title) + '</h4>' + rpBody(by.get(k)!) + '</section>').join('');
  const fold = RP_FOLD.filter(([k]) => by.get(k)).map(([k, title]) =>
    '<details class="rpt-g"><summary><span class="rpt-tt">' + esc(title) + '</span><small class="rpt-pk">' + esc(rpPeek(by.get(k)!)) + '</small></summary><div class="rpt-gb">' + rpBody(by.get(k)!) + '</div></details>').join('');
  return '<div class="rpt"><div class="rpt-h">' + codeLink(p.code, byCode) + '<strong>' + esc(p.name || '') + '</strong><div class="pp">' + projChips(p) + '</div>' + projNotes(p) + '</div>'
    + open + (fold ? '<div class="rpt-f">' + fold + '</div>' : '') + '</div>';
}

/** "So với tuần trước": hai cột cạnh nhau (Tuần trước | Tuần này), mỗi cột chỉ là chữ trong bảng. Bảng không có số liệu tuần trước nên không tính phần trăm đổi. */
const CMP_NOW: [string, string][] = [['Công việc đã hoàn thành trong tuần', 'Đã làm'], ['Kế hoạch tuần sau', 'Kế hoạch'], ['Vấn đề, rủi ro và đề xuất', 'Vướng mắc']];
function compareCard(f: AgentFacts, byCode: Map<string, number>): string {
  const doan = f.doan || [];
  const by = new Map<string, string>();
  for (const x of doan) by.set(x.truong || '', ((by.get(x.truong || '') || '') + ' ' + (x.noi_dung || '')).trim());
  const code = f.ma_hoi || doan[0]?.code || '';
  const prev = by.get('Báo cáo các tuần trước');
  const now = CMP_NOW.filter(([k]) => by.get(k));
  const nowHtml = now.length
    ? now.map(([k, t]) => '<div class="cmp-i"><h5>' + t + '</h5>' + rpBody(by.get(k)!) + '</div>').join('')
    : '<p class="cmp-e">Tuần này chưa có nội dung.</p>';
  const prevHtml = prev ? rpBody(prev) : '<p class="cmp-e">Bảng chưa có nội dung tuần trước nên chưa so sánh được.</p>';
  return '<div class="cmp"><div class="cmp-h">' + (code ? codeLink(code, byCode) : '') + '<strong>' + esc(doan[0]?.ten || '') + '</strong></div>'
    + '<div class="cmp-g"><section><h4>Tuần trước</h4>' + prevHtml + '</section><section><h4>Tuần này</h4>' + nowHtml + '</section></div></div>';
}

/** Gợi ý ưu tiên khi cắt giảm: gọn như danh sách Linear/Asana. Một dòng mỗi dự án (mã · tên · hạn), mỗi nhóm hiện 3 dòng đầu, còn lại gấp lại. */
const PRI_SHOW = 3;
const priTone = (why = ''): Tone => /rủi ro cao|chậm tiến độ|quá hạn/.test(why) ? 'e' : /nguy cơ/.test(why) ? 'w' : 'o';
function priRow(p: FactProject, byCode: Map<string, number>, guard: boolean, k = 0): string {
  const parts = (p.ly_do || '').split(', '), when = parts[parts.length - 1] || '';
  return '<li class="pri-r ' + priTone(p.ly_do) + '" style="--i:' + k + '" title=""' + esc(p.ly_do || '') + '"><i aria-hidden="true"></i>' + codeLink(p.code, byCode)
    + '<span class="pri-n">' + esc(p.name || '') + '</span>' + (guard ? '<em class="pri-t">bảo vệ</em>' : '<span></span>') + '<span class="pri-w">' + esc(when) + '</span></li>';
}
function priGroup(title: string, tone: Tone, b: FactBucket | undefined, byCode: Map<string, number>, guard: Set<string>): string {
  if (!b || b.so <= 0 || !b.du_an.length) return '';
  const head = b.du_an.slice(0, PRI_SHOW), rest = b.du_an.slice(PRI_SHOW), more = b.so - b.du_an.length;
  const rows = (xs: FactProject[], o = 0): string => xs.map((p, k) => priRow(p, byCode, guard.has(p.code), o + k)).join('');
  return '<section class="pri-g ' + tone + '"><h4>' + esc(title) + ' <b>' + b.so + '</b></h4><ul>' + rows(head) + '</ul>'
    + (rest.length ? '<details><summary>Xem thêm ' + rest.length + ' dự án</summary><ul>' + rows(rest, PRI_SHOW) + '</ul></details>' : '')
    + (more > 0 ? '<p class="pri-m">Còn ' + more + ' dự án khác. Thêm điều kiện (nhóm, người phụ trách) để thu hẹp.</p>' : '') + '</section>';
}
function prioritize(f: AgentFacts, byCode: Map<string, number>): string {
  const sc = f.suc_chua, bv = f.bao_ve, guard = new Set((bv?.du_an || []).map((p) => p.code));
  const giu = sc ? sc.giu : f.nen_giu, hoan = sc ? sc.hoan : f.co_the_hoan;
  const giuAll = bv && bv.so > 0 && !sc ? { so: bv.so + (giu?.so || 0), du_an: [...bv.du_an, ...(giu?.du_an || [])] } : giu;   // nhóm bảo vệ gộp vào "Nên giữ", không lặp lại hai lần
  const html = priGroup(sc ? 'Nên giữ (tối đa ' + sc.giu_toi_da + ')' : 'Nên giữ', 'o', giuAll, byCode, guard)
    + (sc ? '' : priGroup('Cần xem lại', 'e', f.can_xem_lai, byCode, guard))
    + priGroup('Có thể hoãn', 'w', hoan, byCode, guard);
  const note = sc?.bao_ve_vuot_suc_chua ? '<p class="pri-m">Nhóm bảo vệ đã vượt sức chứa nên chưa giữ hết được.</p>' : '';
  const hint = [...(f.tieu_chi || []), ...(f.luu_y ? [f.luu_y] : [])];
  const crit = hint.length ? '<details class="pri-c"><summary>Cách xếp và lưu ý</summary><ul>' + hint.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul></details>' : '';
  const shown = (hoan?.du_an || []);
  const act = shown.length   // chỉ gửi câu lệnh sửa: Agent soạn bản xem trước, bảng chỉ đổi khi bấm "Áp dụng"
    ? '<div class="pri-act"><button type="button" data-act="askIdea" data-q="' + esc("Ghi chú 'Đề xuất tạm hoãn' cho " + shown.map((p) => p.code).join(', ')) + '">✦ Soạn ghi chú tạm hoãn cho ' + shown.length + ' dự án</button></div>' : '';
  const bar = segBar(sc
    ? [{ n: sc.giu.so, tone: 'o', label: 'Nên giữ' }, { n: sc.hoan.so, tone: 'w', label: 'Có thể hoãn' }]
    : [{ n: f.nen_giu?.so || 0, tone: 'o', label: 'Nên giữ' }, { n: f.can_xem_lai?.so || 0, tone: 'e', label: 'Cần xem lại' }, { n: f.co_the_hoan?.so || 0, tone: 'w', label: 'Có thể hoãn' }, { n: f.con_lai || 0, tone: '', label: 'Chưa xếp' }]);
  return '<div class="pri">' + bar + html + note + act + crit + '</div>';
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

/** Thanh chia đoạn theo tỷ lệ (kiểu Plane/ClickUp): độ dài mỗi đoạn tỷ lệ với số lượng, đoạn mọc dần từ trái. Chip ngay dưới đóng vai chú thích. */
function segBar(parts: { n: number; tone: Tone; label: string }[]): string {
  const ps = parts.filter((x) => x.n > 0);
  if (ps.length < 1) return '';
  return '<div class="fx-seg" role="img" aria-label="' + esc(ps.map((x) => x.label + ' ' + x.n).join(', ')) + '">'
    + ps.map((x, k) => '<i class="' + (x.tone || 'n') + '" style="flex:' + x.n + ';--i:' + k + '" title="' + esc(x.label + ': ' + x.n) + '"></i>').join('') + '</div>';
}

/** Thống kê dạng chip (tóm tắt tuần) và thanh ngang (đếm theo nhóm). */
function statRow(title: string, counts: Record<string, number>, tone: (v: string) => Tone): string {
  const keys = Object.keys(counts);
  if (!keys.length) return '';
  return '<div class="st"><div class="sh">' + esc(title) + '</div>' + segBar(keys.map((k) => ({ n: counts[k], tone: tone(k), label: k }))) + '<div class="pp">' + keys.map((k) => chip(k + ' · ' + counts[k], tone(k))).join('') + '</div></div>';
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
  const gt = DIM_TONE[g.truong];
  h += keys.map((k) => '<div class="br' + (g.theo[k] === max ? ' top' : '') + (gt ? ' t-' + toneOf(gt(k)) : '') + '" title="' + esc(k) + '"><span class="bn">' + groupName(k) + '</span><b>' + g.theo[k]
    + '</b><span class="bb"><i style="width:' + Math.max(4, Math.round((g.theo[k] / max) * 100)) + '%"></i></span></div>').join('');
  if (g.con_lai_nhom) h += '<div class="pm">Và ' + g.con_lai_nhom + ' nhóm khác.</div>';
  return h + '</div>';
}

/** Danh sách dự án của từng nhóm (mỗi nhóm một khối có tiêu đề và số dự án). */
function groupLists(list: NonNullable<AgentFacts['du_an_theo_nhom']>, byCode: Map<string, number>): string {
  return list.filter((g) => g.du_an.length).map((g) => '<div class="st"><div class="sh">' + groupName(g.nhom) + ' (' + g.so_luong + ')</div>'
    + projectList(g.du_an, g.so_luong, byCode) + '</div>').join('');
}

function passages(list: FactPassage[], open: boolean, byCode: Map<string, number>, max = SHOW_PASSAGES): string {
  if (!list.length) return '';
  const shown = list.slice(0, max);
  const items = shown.map((x) => {
    const t = (x.noi_dung || '').replace(/\s+/g, ' ').trim();
    return '<li class="pi"><div class="pt">' + codeLink(x.code, byCode) + (x.ten ? '<span class="pn">' + esc(x.ten) + '</span>' : '') + '</div>'
      + '<div class="px">' + (x.truong ? '<span class="pf">' + esc(x.truong) + '</span>' : '') + esc(t.length > SNIPPET ? t.slice(0, SNIPPET) + '…' : t) + '</div></li>';
  }).join('');
  return '<details class="srcs"' + (open ? ' open' : '') + '><summary>Nguồn trong bảng (' + shown.length + ' đoạn)</summary><ul class="pl">' + items + '</ul></details>';
}

/** Phân tích bằng hình: thẻ số, nhận xét, thanh phân bố, ma trận tiến độ × rủi ro. Mọi con số do backend tính; ở đây chỉ vẽ.
 *  `skip` = tên cột đang được đếm theo nhóm ở khối khác (không vẽ lại thanh phân bố của cột đó). */
const statusTone = (v?: string): Tone => (/hoàn thành|done|đóng|closed/i.test(v || '') ? 'o' : '');
const DIM_TONE: Record<string, (v?: string) => Tone> = { 'Tiến độ': progressTone, 'Mức độ rủi ro': riskTone, 'Trạng thái': statusTone };
const toneOf = (m?: string): string => (m === 'e' || m === 'w' || m === 'o' ? m : 'n');
const pct = (n: number, t: number): number => (t > 0 ? Math.round((100 * n) / t) : 0);

const ICON = (d: string): string => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const ICONS: Record<string, string> = {
  'Dự án': ICON('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  'Chậm tiến độ': ICON('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  'Có nguy cơ chậm': ICON('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>'),
  'Rủi ro cao': ICON('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  'Quá hạn': ICON('<path d="M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M10 14l4 4M14 14l-4 4"/>'),
  'Chưa đánh giá rủi ro': ICON('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>'),
};

/** Thẻ nổi bật đầu câu trả lời: vòng % đúng tiến độ, nhận định một dòng, số dự án. Màu theo mức khoẻ (>=80% xanh, >=50% vàng, còn lại đỏ). */
function hero(a: FactAnalysis): string {
  const v = a.ty_le_dung_tien_do;
  if (v === undefined) return '';
  const tone = v >= 80 ? 'o' : v >= 50 ? 'w' : 'e';
  const msg = tone === 'o' ? 'Đang đi đúng hướng' : tone === 'w' ? 'Cần theo dõi sát' : 'Cần can thiệp sớm';
  const on = Object.entries(a.phan_bo?.['Tiến độ'] || {}).filter(([k]) => progressTone(k) === 'o').reduce((n, [, c]) => n + c, 0);
  return '<div class="ax-hero ' + tone + '"><div class="ax-hr"><svg viewBox="0 0 42 42" role="img" aria-label="Đúng tiến độ ' + v + '%"><circle class="ax-rt" cx="21" cy="21" r="15.9155"/><circle class="ax-rv" cx="21" cy="21" r="15.9155" pathLength="100" stroke-dasharray="' + v + ' ' + (100 - v) + '"/></svg>'
    + '<b>' + v + '<small>%</small></b></div><div class="ax-ht"><span class="ax-eb">Đúng tiến độ</span><strong>' + msg + '</strong><em>' + (on ? on + '/' : '') + (a.so_du_an || 0) + ' dự án</em></div></div>';
}

function kpiTiles(a: FactAnalysis, total?: number, withFirst = false): string {
  const tiles = (a.the_so || []).slice(1);   // thẻ đầu (số dự án) đã nằm ở thẻ nổi bật
  const first = (a.the_so || [])[0];
  const n = a.so_du_an || 0;
  const list = (a.ty_le_dung_tien_do === undefined || withFirst) && first ? [first, ...tiles] : tiles;
  if (!list.length) return '';
  return '<div class="ax-kp">' + list.map((t, i) => {
    const main = t === first && total && total > t.so ? t.so + '<small>/' + total + '</small>' : String(t.so);
    const share = t === first ? '' : '<em>' + pct(t.so, n) + '%</em>';
    return '<div class="ax-k ' + toneOf(t.muc) + '" style="--d:' + (i * 70 + 120) + 'ms"><i class="ax-ic">' + (ICONS[t.nhan] || ICONS['Dự án']) + '</i><b>' + main + '</b><span>' + esc(t.nhan) + '</span>' + share
      + (t === first ? '' : '<span class="ax-kb"><i style="width:' + Math.max(4, pct(t.so, n)) + '%"></i></span>') + '</div>';
  }).join('') + '</div>';
}

function insights(list: NonNullable<FactAnalysis['nhan_xet']>): string {
  if (!list.length) return '';
  return '<div class="ax-in"><div class="ax-h">Điều cần chú ý</div><ul>' + list.map((x, i) => '<li class="' + toneOf(x.muc) + '" style="--d:' + (i * 80 + 200) + 'ms"><i class="ax-ic">' + (x.muc === 'e' ? ICON('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>') : x.muc === 'w' ? ICON('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>') : ICON('<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>')) + '</i><span>' + esc(x.noi_dung) + '</span></li>').join('') + '</ul></div>';
}

/** Biểu đồ vành khuyên: tổng ở giữa, chú thích bên cạnh. */
function donut(dim: string, counts: Record<string, number>, keys: string[], total: number, tone: (v?: string) => Tone): string {
  let off = 0;
  const arcs = keys.map((k, i) => {
    const p = (100 * counts[k]) / total, len = Math.max(0.5, p - (keys.length > 1 ? 0.8 : 0));
    const h = '<circle class="ax-ar ' + toneOf(tone(k)) + ' s' + (i % 4) + '" cx="21" cy="21" r="15.9155" pathLength="100" stroke-dasharray="' + len.toFixed(2) + ' ' + (100 - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"><title>' + esc(k) + ' · ' + counts[k] + ' (' + pct(counts[k], total) + '%)</title></circle>';
    off += p;
    return h;
  }).join('');
  const legend = keys.map((k, i) => '<span><i class="ax-dt ' + toneOf(tone(k)) + ' s' + (i % 4) + '"></i>' + esc(k) + ' <b>' + counts[k] + '</b><em>' + pct(counts[k], total) + '%</em></span>').join('');
  return '<div class="ax-ds"><div class="ax-h">' + esc(dim) + '</div><div class="ax-dn"><div class="ax-dw"><svg viewBox="0 0 42 42" role="img" aria-label="' + esc(dim) + '"><g transform="rotate(-90 21 21)">' + arcs + '</g></svg><b>' + total + '<small>dự án</small></b></div><div class="ax-lg col">' + legend + '</div></div></div>';
}

/** Cột theo hạn: số dự án đang chạy rơi vào từng khoảng thời gian tới hạn. */
function deadlines(list: NonNullable<FactAnalysis['lich_han']>): string {
  const max = Math.max(1, ...list.map((x) => x.so));
  if (!list.some((x) => x.so > 0)) return '';
  return '<div class="ax-ds"><div class="ax-h">Dự án đang chạy theo hạn</div><div class="ax-cols">' + list.map((x, i) => '<div class="ax-col ' + toneOf(x.muc) + '" style="--d:' + i * 50 + 'ms" title="' + esc(x.nhan) + ': ' + x.so + ' dự án"><b>' + x.so + '</b><span class="ax-cb"><i style="height:' + (x.so ? Math.max(6, Math.round((x.so / max) * 100)) : 2) + '%"></i></span><em>' + esc(x.nhan) + '</em></div>').join('') + '</div></div>';
}

/** Từng nhóm: thanh xếp chồng chậm / nguy cơ / còn lại, nhóm chậm nhiều nhất lên đầu. */
function byGroup(list: NonNullable<FactAnalysis['theo_nhom']>, rest?: number): string {
  if (list.length < 2) return '';
  const max = Math.max(1, ...list.map((g) => g.tong));
  const seg = (n: number, c: string, name: string, tong: number): string => (n ? '<i class="ax-sg ' + c + '" style="width:' + (100 * n / tong).toFixed(2) + '%" title="' + name + ': ' + n + '"></i>' : '');
  return '<div class="ax-ds"><div class="ax-h">Tình hình từng nhóm</div>' + list.map((g) => '<div class="ax-gr" title="' + esc(g.nhom) + '"><span class="ax-gn">' + groupName(g.nhom) + '</span>'
    + '<span class="ax-gb" style="width:' + Math.max(8, Math.round((g.tong / max) * 100)) + '%"><span class="ax-sb">' + seg(g.cham, 'e', 'Chậm tiến độ', g.tong) + seg(g.nguy_co, 'w', 'Có nguy cơ chậm', g.tong) + seg(g.dung, 'o', 'Còn lại', g.tong) + '</span></span><b>' + g.tong + '</b></div>').join('')
    + '<div class="ax-lg"><span><i class="ax-dt e"></i>Chậm</span><span><i class="ax-dt w"></i>Nguy cơ chậm</span><span><i class="ax-dt o"></i>Còn lại</span>' + (rest ? '<span class="pm">và ' + rest + ' nhóm khác</span>' : '') + '</div></div>';
}

function distribution(bo: NonNullable<FactAnalysis['phan_bo']>, skip: string, max = 9): string {
  const out: string[] = [];
  for (const dim of Object.keys(bo)) {
    if (dim === skip) continue;
    const counts = bo[dim] || {}, keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    const total = keys.reduce((s, k) => s + counts[k], 0);
    if (keys.length < 2 || !total || out.length >= max) continue;
    const tone = DIM_TONE[dim] || (() => '' as Tone);
    if (dim === 'Tiến độ') { out.push(donut(dim, counts, keys, total, tone)); continue; }
    out.push('<div class="ax-ds"><div class="ax-h">' + esc(dim) + '</div><div class="ax-sb" role="img" aria-label="' + esc(dim) + '">'
      + keys.map((k, i) => '<i class="ax-sg ' + toneOf(tone(k)) + ' s' + (i % 4) + '" style="width:' + (100 * counts[k] / total).toFixed(2) + '%" title="' + esc(k) + ' · ' + counts[k] + ' (' + pct(counts[k], total) + '%)"></i>').join('')
      + '</div><div class="ax-lg">' + keys.map((k, i) => '<span><i class="ax-dt ' + toneOf(tone(k)) + ' s' + (i % 4) + '"></i>' + esc(k) + ' <b>' + counts[k] + '</b><em>' + pct(counts[k], total) + '%</em></span>').join('') + '</div></div>');
  }
  return out.join('');
}

function matrix(m: NonNullable<FactAnalysis['ma_tran']>): string {
  if (m.tien_do.length < 2 || m.rui_ro.length < 2) return '';
  const max = Math.max(1, ...m.so.flat());
  const head = '<tr><th></th>' + m.rui_ro.map((c) => '<th class="' + toneOf(riskTone(c)) + '">' + esc(c) + '</th>').join('') + '</tr>';
  const body = m.tien_do.map((r, i) => '<tr><th class="' + toneOf(progressTone(r)) + '">' + esc(r) + '</th>' + m.rui_ro.map((_, j) => {
    const n = m.so[i]?.[j] ?? 0;
    return n ? '<td class="ax-c ' + toneOf(progressTone(r)) + '" style="--k:' + (0.18 + 0.82 * n / max).toFixed(2) + '" title="' + esc(r) + ' × ' + esc(m.rui_ro[j]) + ': ' + n + ' dự án">' + n + '</td>' : '<td class="ax-c z">·</td>';
  }).join('') + '</tr>').join('');
  return '<div class="ax-ds"><div class="ax-h">Tiến độ × mức độ rủi ro</div><div class="ax-mxw"><table class="ax-mx"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div>';
}

function analytics(f: AgentFacts): string {
  const a = f.phan_tich;
  if (!a || !a.so_du_an) return '';
  if (a.so_du_an < 3 && f.kieu !== 'summary') return '';
  const whole = f.kieu === 'summary' || f.kieu === 'analyze';
  if (!whole && (f.so_luong ?? a.so_du_an) <= 8) return '';   // hỏi "dự án nào…" ra vài dự án: câu trả lời + danh sách là đủ, không vẽ thêm thẻ số/nhận xét lặp lại câu hỏi
  const part = !whole && (f.so_luong ?? 0) < (f.tong ?? 0);   // chỉ một phần bảng: vòng "% đúng tiến độ" của cả bảng không áp dụng   // 1–2 dự án: danh sách bên dưới đã đủ, không vẽ vòng % và biểu đồ
  const lv = f.muc_chi_tiet || 'vua';   // V-LLM chọn theo ý người dùng: ngan / vua / day_du
  if (lv === 'ngan') { const k = kpiTiles(a, f.tong, true); return k ? '<div class="ax">' + k + '</div>' : ''; }
  const top = (part ? '' : hero(a)) + kpiTiles(a, f.tong);
  const dist = distribution(a.phan_bo || {}, f.phan_nhom?.truong || '', lv === 'day_du' ? 9 : 1);
  const inner = (top ? '<div class="ax-top">' + top + '</div>' : '') + insights(lv === 'day_du' ? a.nhan_xet || [] : (a.nhan_xet || []).slice(0, 2)) + (lv === 'day_du' ? deadlines(a.lich_han || []) : '') + dist
    + (lv === 'day_du' && f.phan_nhom?.truong !== 'Nhóm' ? byGroup(a.theo_nhom || [], a.con_lai_nhom) : '')
    + (lv === 'day_du' ? matrix(a.ma_tran || { tien_do: [], rui_ro: [], so: [] }) : '');
  return inner ? '<div class="ax">' + inner + '</div>' : '';
}

/** Phần "chi tiết" dưới câu dẫn, dựng từ số liệu backend: danh sách dự án, thống kê, đoạn nguồn. Rỗng khi không có gì để hiện. */
function details(f: AgentFacts, byCode: Map<string, number>, aiText: boolean): string {
  if (f.kieu === 'summary') {
    let h = f.phan_tich?.so_du_an ? analytics(f) : statRow('Tiến độ', f.theo_tien_do || {}, progressTone) + statRow('Mức độ rủi ro', f.theo_muc_do_rui_ro || {}, riskTone);
    const cham = f.du_an_cham || [];
    if (cham.length) h += '<div class="st"><div class="sh">Chậm tiến độ (' + (f.so_du_an_cham ?? cham.length) + ')</div><div class="pp">'
      + cham.slice(0, 8).map((c) => codeLink(c, byCode)).join(' ') + (cham.length > 8 ? '<span class="pm">và ' + (cham.length - 8) + ' dự án khác</span>' : '') + '</div></div>';
    if (f.so_du_an_co_o_nhap_ai_cho_duyet) h += '<div class="pm">' + f.so_du_an_co_o_nhap_ai_cho_duyet + ' dự án có ô nháp AI chờ duyệt.</div>';
    return h;
  }
  if (f.kieu === 'search' && f.so_sanh && f.doan?.length) return compareCard(f, byCode);
  if (f.kieu === 'search') return passages(f.doan || [], !aiText, byCode);
  if (f.kieu === 'prioritize') return prioritize(f, byCode);
  if (f.phan_nhom) {
    const tiny = Object.keys(f.phan_nhom.theo).length < 2 && (f.phan_tich?.so_du_an ?? 0) < 3;   // nhóm chỉ có 1–2 dự án: bỏ thanh đếm, chỉ liệt kê
    return analytics(f) + (tiny ? '' : groupBars(f.phan_nhom)) + groupLists(f.du_an_theo_nhom || [], byCode);
  }
  const d = f.du_an;
  if (Array.isArray(d)) return analytics(f) + projectList(d, f.so_luong, byCode);
  if (d && typeof d === 'object') return f.doan?.length ? reportCard(d, f.doan, byCode) : '<ul class="pl">' + projectCard(d, byCode) + '</ul>';   // báo cáo chi tiết: khối riêng cho từng ô nội dung
  return '';
}

/** Gợi ý hỏi tiếp theo đúng câu trả lời vừa rồi (tối đa 3): dựa trên loại số liệu và mã dự án thật trong câu trả lời, không phải danh sách cố định. */
export function nextQuestions(res: Pick<AgentAnswer, 'facts' | 'intent'>, codes: string[] = []): string[] {
  const f = res.facts;
  if (!f) return [];
  const q: string[] = [];
  const one = Array.isArray(f.du_an) ? undefined : f.du_an || undefined;
  const list = Array.isArray(f.du_an) ? f.du_an : [];
  const gcode = (g?: string): string => (g && GROUP.exec(g)?.[1]) || '';
  const sameGroup = (g?: string): string => { const c = gcode(g); return c && codes.filter((x) => x.toUpperCase().startsWith(c.toUpperCase() + '.')).length >= 2 ? c : ''; };   // chỉ gợi ý khi nhóm có từ 2 dự án
  switch (f.kieu) {
    case 'summary': {
      const cham = f.du_an_cham || [];
      if (cham[0]) q.push('Chi tiết dự án ' + cham[0]);
      if (cham.length) q.push('Trong số đó dự án nào có rủi ro cao?');
      q.push('Nếu bị cắt kinh phí thì nên ưu tiên dự án nào?');
      if (f.so_du_an_co_o_nhap_ai_cho_duyet) q.push('Những dự án nào đang có ô nháp AI chờ duyệt');
      break;
    }
    case 'project':
      if (one) {
        q.push('Kế hoạch tuần sau của ' + one.code + ' là gì');
        if (!f.doan?.length) q.push('Vướng mắc của ' + one.code + ' là gì');   // thẻ tóm tắt đã có: gợi ý câu khác, không lặp lại "Chi tiết"
        if (sameGroup(one.nhom)) q.push('Các dự án cùng nhóm ' + sameGroup(one.nhom));
        q.push('So với tuần trước ' + one.code + ' có gì đổi');
      }
      break;
    case 'prioritize': {
      const sc = f.suc_chua, xem = f.can_xem_lai?.du_an?.[0] || sc?.hoan.du_an?.[0];
      q.push(sc ? 'Nếu giữ thêm 2 dự án thì sao?' : 'Chỉ giữ được 5 dự án thì nên giữ dự án nào?');
      if (xem) q.push('Chi tiết dự án ' + xem.code);
      if (!f.bao_ve) q.push('Giữ nguyên nhóm ' + (gcode(f.nen_giu?.du_an?.[0]?.nhom || sc?.giu.du_an?.[0]?.nhom) || 'Food') + ' thì sao?');
      break;
    }
    case 'pending':
      q.push('Duyệt hết nháp AI');
      if (list[0]) q.push('Chi tiết dự án ' + list[0].code);
      break;
    case 'search':
      if (f.so_sanh && f.doan?.[0]) { q.push('Kế hoạch tuần sau của ' + f.doan[0].code + ' là gì'); q.push('Chi tiết dự án ' + f.doan[0].code); }
      else if (f.doan?.[0]) q.push('Chi tiết dự án ' + f.doan[0].code);
      break;
    default:
      if (list[0]) q.push('Chi tiết dự án ' + list[0].code);
      if (list.length > 1) { q.push('Trong số đó dự án nào hạn gần nhất?'); q.push('Trong số đó dự án nào chậm tiến độ?'); }
      if (f.phan_nhom && list.length === 0 && !Array.isArray(f.du_an) && (f.phan_tich?.so_du_an ?? 2) >= 2) q.push('Dự án nào chậm nhất?');
  }
  return [...new Set(q)].slice(0, 3);
}
const followHtml = (qs: string[]): string => qs.length
  ? '<div class="fx-fu" aria-label="Gợi ý hỏi tiếp">' + qs.map((t, k) => '<button type="button" data-act="askIdea" data-q="' + esc(t) + '" style="--i:' + k + '"><span aria-hidden="true">↳</span>' + esc(t) + '</button>').join('') + '</div>' : '';

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
  return '<div class="am">' + (lines ? '<div class="al">' + lines + '</div>' : '') + extra + '</div><div class="src"' + why + '>' + src + '</div>' + followHtml(nextQuestions(res, rows.map((r) => r.ma)));
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
