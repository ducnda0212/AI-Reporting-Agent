/* AI: nháp cột AC/AS/AT, khung "AI soạn ra sao", Trợ lý AI + Agent kiểu Rovo. Port từ prototype v4 (lớp cuối cùng).
   Hàm thuần: không ghi lên dòng/state — lệnh sửa bảng chỉ trả về `stagedItems` để store dựng bản xem trước. */
import { FIELDS, PROG_MAP, TODAY, TR_WEEK } from '@/data/constants';
import type { AgStageItem, AiCell, AiFieldId, AskAnswer, CellRef, Field, FieldId, Row, WeekReport } from '@/types';
import { cellValue, displayText, fieldById, locked, mapNorm, optsFor, parseVN, type CellCtx } from './cell';
import { needsFix } from './grid';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const cv = (r: Row, id: string, ctx: CellCtx): string | null => cellValue(r, fieldById(id)!, ctx);

/* ---------- đầu vào AI đọc (panel "AI soạn ra sao") ---------- */

export interface TrItem { id: string; t: string; kind: 'prog' | 'blk' | 'plan' | 'risk' | 'code'; lab?: string; date?: string; late?: boolean }
export interface TrGroup { h: string; note: string; warn?: boolean; code?: boolean; items: TrItem[] }
export interface TrInputs { groups: TrGroup[]; cw: WeekReport | undefined; src: WeekReport | null; late: boolean; skipped: number; all: TrItem[] }
export type TrVariant = 'short' | 'normal' | 'detail';
export interface TrSentence { t: string; refs: string[]; sug?: boolean; meta?: boolean }
export interface TrDraft { level?: string; sep?: string; s: TrSentence[] }

function trSplit(done: string): { prog: string; blk: string } {
  const m = /Blockers?:?\s*\n/i.exec(done || '');
  return m ? { prog: done.slice(0, m.index), blk: done.slice(m.index + m[0].length) } : { prog: done || '', blk: '' };
}
const trLines = (t: string | undefined): string[] => (t || '').split('\n').map((x) => x.replace(/^[•\-–\s]+/, '').trim())
  .filter((x) => x && !/^(Mục tiêu|Tiến độ|Mục tiêu và tiến độ|Blockers?)\s*:?$/i.test(x));
const trDate = (d: string): string => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '');
export const isLate = (r: Row, ctx: CellCtx): boolean =>
  mapNorm(PROG_MAP, r.rawProgress) === 'Chậm tiến độ' || cv(r, 'tt1', ctx) === 'Đang thực hiện Chậm tiến độ';
const commentDate = (r: Row): string => { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(r.comment || ''); return m ? m[3] + '/' + m[2] : ''; };

export function trInputs(r: Row, ctx: CellCtx): TrInputs {
  const cw = r.prw?.w3, last = r.pr?.length ? r.pr[r.pr.length - 1] : null, src = cw || last, g: TrGroup[] = [];
  let n = 0;
  const mk = (lines: string[], kind: TrItem['kind'], lab: string): TrItem[] => lines.map((t) => ({ id: 'P' + ++n, t, kind, lab }));
  if (src) {
    const sp = trSplit(src.done);
    const prog = mk(trLines(sp.prog), 'prog', 'Tiến độ'), blk = mk(trLines(sp.blk), 'blk', 'Blocker'), plan = mk(trLines(src.plan), 'plan', 'Công việc sẽ làm');
    g.push({ h: 'Progress Report · dòng {{' + src.date + '}}', note: cw ? 'thuộc tuần ' + TR_WEEK : 'không có dòng nào trong tuần ' + TR_WEEK + ', dùng lần cập nhật gần nhất', warn: !cw, items: [...prog, ...blk, ...plan] });
  } else g.push({ h: 'Progress Report', note: 'trống', warn: true, items: [] });
  const risk = /risk/i.test(r.comment || '') ? trLines((r.comment || '').replace(/^[\s\S]*?Risk:\s*/i, '')).slice(0, 1) : [];
  const cmDate = commentDate(r);
  if (risk.length) g.push({ h: 'Comment' + (cmDate ? ' ngày ' + cmDate : ''), note: 'dòng bắt đầu bằng “Risk:”' + (cmDate ? ' · không thuộc tuần này' : ''), warn: !!cmDate, items: [{ id: 'C1', t: risk[0], kind: 'risk', lab: 'Risk', date: cmDate }] });
  const tdv = mapNorm(PROG_MAP, r.rawProgress) || '—', late = tdv === 'Chậm tiến độ' || cv(r, 'tt1', ctx) === 'Đang thực hiện Chậm tiến độ';
  g.push({ h: 'Do code tính sẵn', note: 'AI không tự tính hay đếm', code: true, items: [
    { id: 'K1', t: 'Tiến độ (J) = ' + (late ? 'Chậm tiến độ' : tdv), kind: 'code', late },
    { id: 'K2', t: 'Ngày kết thúc (H) = ' + (r.end || '—'), kind: 'code' },
    { id: 'K3', t: 'Trạng thái Jira = ' + (r.rawStatus || '—'), kind: 'code' }] });
  return { groups: g, cw, src, late, skipped: (r.pr || []).length - (src ? 1 : 0), all: g.flatMap((x) => x.items) };
}

/** Nháp có trích dẫn cho một cột AI; mỗi câu có `refs` trỏ về id đầu vào (P…, C1, K1). */
export function trDraft(fid: AiFieldId, v: TrVariant = 'normal', I: TrInputs): TrDraft {
  const by = (k: TrItem['kind']): TrItem[] => I.all.filter((x) => x.kind === k);
  const plan = by('plan'), blk = by('blk'), risk = by('risk'), prog = by('prog'), S: TrSentence[] = [];
  if (fid === 'kh') {
    const pl = I.cw ? plan.slice(0, v === 'short' ? 1 : v === 'detail' ? 9 : 2) : [];
    if (pl.length) pl.forEach((x) => S.push({ t: x.t, refs: [x.id] }));
    else if (I.src) S.push({ t: 'Chưa có cập nhật tuần này. Theo report ' + trDate(I.src.date) + ': ' + (plan.slice(0, 2).map((x) => x.t).join('; ') || prog[0]?.t || ''), refs: plan.slice(0, 2).map((x) => x.id) });
    else S.push({ t: 'Chưa có Progress Report.', refs: [] });
    if (v === 'detail' && I.cw && prog.length) S.push({ t: 'Nối tiếp việc tuần này: ' + prog[0].t, refs: [prog[0].id] });
    return { sep: '; ', s: S };
  }
  if (fid === 'vd') {
    if (I.cw && blk.length) { const b = blk.slice(0, v === 'short' ? 1 : 2); S.push({ t: 'Vướng: ' + b.map((x) => x.t).join('; ') + '.', refs: b.map((x) => x.id) }); }
    if (risk.length && v !== 'short') S.push({ t: 'Rủi ro' + (risk[0].date ? ' (Comment ' + risk[0].date + ')' : '') + ': ' + risk[0].t + '.', refs: ['C1'] });
    if (I.late) { S.push({ t: 'Chậm so với kế hoạch.', refs: ['K1'] }); S.push({ t: '→ Đề xuất chốt lại mốc và bổ sung nguồn lực.', refs: [], sug: true }); }
    if (v === 'detail' && I.cw && blk.length && !I.late) S.push({ t: '→ Đề xuất nêu vướng mắc tại họp tuần để có người phụ trách xử lý.', refs: [], sug: true });
    if (!I.cw) S.push({ t: 'Chưa có Progress Report tuần này — đề nghị PM cập nhật trước họp.', refs: [], meta: true });
    if (!S.length) S.push({ t: 'Không có vấn đề phát sinh trong tuần.', refs: [], meta: true });
    return { sep: '\n', s: S };
  }
  const level = I.late ? 'Cao' : (I.cw && blk.length) || risk.length || !I.cw ? 'Trung bình' : 'Thấp';
  S.push(I.late ? { t: 'Chậm tiến độ hoặc quá hạn', refs: ['K1'] } : { t: 'Đúng tiến độ', refs: ['K1'] });
  if (I.cw && blk.length) S.push({ t: 'Report có blocker', refs: blk.map((x) => x.id) });
  if (risk.length) S.push({ t: 'Comment có ghi risk', refs: ['C1'] });
  if (!I.cw) S.push({ t: 'Không có cập nhật tuần này', refs: [] });
  return { level, s: S };
}

export const trText = (D: TrDraft): string => D.level || D.s.map((x) => x.t).join(D.sep ?? '').replace(/\.;\s/g, '; ');

/* ---------- "Nhờ AI soạn": nháp cho các ô AI còn trống ---------- */

const bullets = (t: string | undefined, n = 2): string[] => trLines(t).slice(0, n);
function blockersOf(t: string | undefined): string[] { const m = /Blockers?:?\s*\n([\s\S]*)/i.exec(t || ''); return m ? bullets(m[1], 2) : []; }

export interface AiDraftCell { i: number; f: AiFieldId; d: AiCell }

/** Nháp (chưa duyệt) cho các ô AC/AS/AT chưa có nháp; store ghi `allRows[i].ai[f] = d` và mở modal nếu có nháp. */
export function aiDrafts(rows: Row[], ctx: CellCtx): AiDraftCell[] {
  const out: AiDraftCell[] = [];
  rows.forEach((r) => {
    const cw = r.prw?.w3, last = r.pr?.length ? r.pr[r.pr.length - 1] : null, late = isLate(r, ctx);
    const blk = cw ? blockersOf(cw.done) : [], risk = /risk/i.test(r.comment || '') ? r.comment : '';
    let srcTxt = cw ? 'Progress Report ' + cw.date + '\n' + cw.done + (cw.plan ? '\n—\n' + cw.plan : '')
      : last ? 'Không có dòng nào trong tuần 15–22/11.\nLần cập nhật gần nhất ' + last.date + ':\n' + last.done + (last.plan ? '\n—\n' + last.plan : '') : 'Progress Report trống.';
    if (risk) srcTxt += '\n\nComment:\n' + risk;
    if (!r.ai.rui) {
      const lv = late ? 'Cao' : blk.length || risk || !cw ? 'Trung bình' : 'Thấp';
      const why = [late ? 'chậm tiến độ hoặc quá Due date' : 'đúng tiến độ', blk.length ? 'có blocker trong report' : '', risk ? 'Comment có ghi risk' : '', !cw ? 'không có cập nhật tuần này' : ''].filter(Boolean).join(' · ');
      out.push({ i: r.i, f: 'rui', d: { text: lv, why, src: srcTxt, ok: false } });
    }
    if (!r.ai.kh) {
      const pl = cw ? bullets(cw.plan, 2) : [];
      const txt = pl.length ? pl.join('; ') : last ? 'Chưa có cập nhật tuần này. Theo report ' + trDate(last.date) + ': ' + (bullets(last.plan, 2).join('; ') || bullets(last.done, 1).join('')) : 'Chưa có Progress Report — cần PM cập nhật.';
      out.push({ i: r.i, f: 'kh', d: { text: txt.replace(/\.;\s/g, '; '), why: 'Progress Report · cột Công việc sẽ làm' + (cw ? ' · ' + cw.date : ''), src: srcTxt, ok: false } });
    }
    if (!r.ai.vd) {
      const parts: string[] = [], dt = commentDate(r);
      if (blk.length) parts.push('Vướng: ' + blk.join('; ') + '.');
      if (risk) parts.push('Rủi ro: ' + bullets(risk.replace(/^[\s\S]*?Risk:\s*/i, ''), 1).join('') + '.');
      if (late) parts.push('Chậm so với kế hoạch.\n→ Đề xuất chốt lại mốc và bổ sung nguồn lực.');
      if (!cw) parts.push('Chưa có Progress Report tuần này — đề nghị PM cập nhật trước họp.');
      let text = parts.join('\n') || 'Không có vấn đề phát sinh trong tuần.';
      if (dt && text.indexOf('Rủi ro: ') === 0) text = text.replace('Rủi ro: ', 'Rủi ro (Comment ' + dt + '): ');
      out.push({ i: r.i, f: 'vd', d: { text, why: 'Progress Report' + (risk ? ' + Comment' : ''), src: srcTxt, ok: false } });
    }
  });
  return out;
}

/* ---------- Agent: hiểu lệnh sửa bảng ---------- */

const KIND_NAME: Record<string, string> = { jira: 'Jira', bucket: 'rổ gom', calc: 'tính toán', manual: 'nhập tay', cfg: 'hệ thống', ai: 'AI', report: 'progress report', tpl: 'có sẵn trong mẫu', past: 'đã chốt', future: 'chưa tới', none: 'không dùng' };
const CODE3 = /\b([IVX]+\.[A-Z0-9]+\.\d+\.\d+)\b/i;
const VERB = /^(đổi|điền|sửa|đặt|chuyển|ghi|cập nhật)\s+/i;
const EDITISH = /^\s*(?:đổi|điền|sửa|đặt|chuyển|ghi|cập nhật|đánh dấu|duyệt|chốt|gán|xóa|xoá|thêm)\s+/i;
const CODEISH = /\b(?:[IVX]+\.[A-Z0-9]+(?:\.\d+)+|[A-Za-z]{2,4}\d{1,4})\b/g;

export const aiNorm = (s: unknown): string =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
export const aiRow = (rows: Row[], code: string): Row | undefined => rows.find((x) => x.ma.toUpperCase() === String(code).toUpperCase());
/** Cột theo tên hoặc ký hiệu (không dấu, không phân biệt hoa thường); từ 3 ký tự trở lên thì khớp đầu tên. */
export function aiField(s: string): Field | undefined {
  const k = aiNorm(s);
  return FIELDS.find((x) => aiNorm(x.name) === k || aiNorm(x.col) === k) || FIELDS.find((x) => k.length > 2 && aiNorm(x.name).indexOf(k) === 0);
}
function aiSplit(s: string): { f: Field; v: string } | null {
  const w = s.trim().split(/\s+/);
  for (let k = w.length - 1; k >= 1; k--) { const f = aiField(w.slice(0, k).join(' ')); if (f) return { f, v: w.slice(k).join(' ').replace(/^["“'](.*)["”']$/, '$1') }; }
  return null;
}
/** Giá trị hợp lệ của cột có danh sách chọn (khớp đúng hoặc khớp đầu); `null` nếu không có trong danh sách. */
export function aiOpt(f: Field, v: string): string | null {
  const o = optsFor(f);
  if (!o) return v;
  const k = aiNorm(v);
  return o.find((x) => aiNorm(x) === k) || o.find((x) => aiNorm(x).indexOf(k) === 0) || null;
}
export const aiCanFill = (f: Field): boolean => !(locked(f) || ['cfg', 'calc', 'jira', 'future', 'past', 'none', 'report'].includes(f.kind));

export function agExamples(r0: Row | null | undefined, rows: Row[]): string[] {
  const ma = r0 ? r0.ma : rows[0] ? rows[0].ma : 'I.A.3.1';
  return ['Đổi Tiến độ của ' + ma + ' thành Chậm tiến độ', 'Điền Note "Chờ họp khối" cho các dự án đang trống', 'Duyệt hết nháp của ' + ma];
}
const agChips = (L: string[]): string => '<div class="agq">' + L.map((q) => '<button class="agqb" data-act="askIdea" data-q="' + esc(q) + '">✦ ' + esc(q) + '</button>').join('') + '</div>';

/* ---------- Trợ lý AI ---------- */

export interface AskCtx extends CellCtx { rows: Row[]; allRows: Row[]; sel: CellRef | null }
export interface AskResult extends AskAnswer {
  /** Bản xem trước: store lưu vào `state.stages`, chỉ áp dụng lên bảng khi người dùng bấm Áp dụng. */
  stagedItems: AgStageItem[];
  /** Ẩn (`on`) / hiện một cột. */
  hide?: { f: FieldId; on: boolean };
  /** Bật/tắt lọc "chỉ dòng cần sửa". */
  onlyFix?: boolean;
  /** Dòng Nhật ký cần ghi [hành động, đối tượng, chi tiết]. */
  log?: [string, string, string];
}
type Ans = Omit<AskResult, 'stagedItems'>;
type Stage = (r: Row, f: Field, to: string, kind?: AgStageItem['kind']) => void;

const codeBtn = (r: Row): string => '<button class="cd" data-act="exGo" data-i="' + r.i + '">' + esc(r.ma) + '</button>';
const aiText = (r: Row, k: AiFieldId): string => r.ai[k]?.text || '';
const exPct = (r: Row): number => Math.round((r.done / r.total) * 100);
/* Có nguy cơ chậm: còn ≤ 14 ngày tới hạn mà chưa xong, hoặc Mức độ rủi ro (AC) = Cao */
export function exTT(r: Row, ctx: CellCtx): string {
  const due = parseVN(cv(r, 'end', ctx));
  if (cv(r, 'td', ctx) === 'Chậm tiến độ' || (due && due < TODAY)) return 'Chậm tiến độ';
  if ((due && (due.getTime() - TODAY.getTime()) / 864e5 <= 14) || aiText(r, 'rui') === 'Cao') return 'Có nguy cơ chậm';
  return 'Đúng tiến độ';
}
function exWhy(r: Row, ctx: CellCtx): string {
  const due = parseVN(cv(r, 'end', ctx)), t = exTT(r, ctx);
  if (t === 'Chậm tiến độ') return due && due < TODAY ? 'đã quá hạn ' + cv(r, 'end', ctx) : 'Tiến độ (J) = Chậm tiến độ';
  if (t === 'Có nguy cơ chậm') return aiText(r, 'rui') === 'Cao' ? 'Mức độ rủi ro (AC) = Cao' : 'còn ≤ 14 ngày tới hạn ' + cv(r, 'end', ctx);
  return '';
}
const uniq = (arr: Row[]): Row[] => arr.filter((r, k) => arr.findIndex((x) => x.ma === r.ma) === k);
const emptyReq = (r: Row, ctx: CellCtx): number => FIELDS.filter((f) => f.required && cellValue(r, f, ctx) === null).length;
const pendingAI = (rows: Row[]): number => rows.reduce((n, r) => n + (['rui', 'kh', 'vd'] as const).filter((k) => r.ai[k] && !r.ai[k]!.ok).length, 0);
const noUpdate = (r: Row): boolean => !r.prw?.w3;
const onlyOpts = (f: Field): string => 'Cột <b>' + esc(f.name) + '</b> chỉ nhận: ' + optsFor(f)!.map(esc).join(', ') + '.';
const noCol = (s: string): Ans => ({ html: 'Mình không tìm thấy cột “' + esc(s) + '”.', act: [] });
const CHAT = 'theo yêu cầu trong khung chat';

/** Điền một ô: không ghi thẳng, chỉ đưa vào bản xem trước. Trả về lỗi (HTML) hoặc null. */
function aiFill(r: Row, f: Field, v: string, stage: Stage): string | null {
  if (!aiCanFill(f)) return 'Cột <b>' + f.col + ' · ' + esc(f.name) + '</b> lấy từ ' + esc(KIND_NAME[f.kind] || 'nguồn khác') + ' nên không điền tay được.';
  const vv = aiOpt(f, v);
  if (vv === null) return onlyOpts(f);
  stage(r, f, vv, 'edit');
  return null;
}

/* Lệnh bảng (ẩn/hiện cột, lọc, điền nhiều ô, điền/đổi một ô). */
function agentCmd(q: string, t: string, r: Row | undefined, ctx: AskCtx, stage: Stage): Ans | undefined {
  const { rows } = ctx;
  let m: RegExpMatchArray | null;
  if ((m = q.match(/^\s*(ẩn|hiện|an|hien)\s+(?:cột\s+|cot\s+)?(.+?)\s*$/i)) && !r) {
    const f0 = aiField(m[2]);
    if (!f0) return noCol(m[2]);
    if (f0.key) return { html: 'Cột Mã DA luôn hiện.', act: [] };
    const hide = /^[aẩ]n/i.test(m[1]);
    return { html: 'Đã ' + (hide ? 'ẩn' : 'hiện') + ' cột <b>' + f0.col + ' · ' + esc(f0.name) + '</b>.', act: [], hide: { f: f0.id, on: hide }, log: [hide ? 'Ẩn cột' : 'Hiện cột', f0.col + ' ' + f0.name, CHAT] };
  }
  if (/(chi hien|loc|chi xem).*(can sua|loi|trong)/.test(t)) {
    return { html: 'Bảng đang chỉ hiện <b>' + rows.filter((x) => needsFix(x, ctx)).length + ' dòng cần sửa</b>. Bấm chip ⚠ trên thanh công cụ để bỏ lọc.', act: [], onlyFix: true, log: ['Lọc bảng', 'Dòng cần sửa', CHAT] };
  }
  if (/(bo loc|hien lai tat ca|hien het)/.test(t)) return { html: 'Đã hiện lại mọi dòng.', act: [], onlyFix: false };
  /* soạn nháp bằng AI: chuyển thành nút để chạy thật (V-LLM nếu backend sẵn sàng) */
  if (/^\s*(?:hãy\s+|nhờ\s+)?(?:ai\s+)?soạn\b/i.test(q) && !r) {
    return { html: 'Mình sẽ nhờ AI soạn nháp các ô còn trống (Mức độ rủi ro AC, Vấn đề &amp; rủi ro AT; AS soạn theo Progress Report). Nháp chưa ghi vào báo cáo cho tới khi bạn duyệt.', act: [{ act: 'ai', label: '✦ Nhờ AI soạn các ô trống' }] };
  }
  /* sửa hàng loạt theo phạm vi: Đổi Note "Chờ họp" cho tất cả dự án | Điền … cho các dự án đang trống | … chậm tiến độ | … rủi ro cao | … cần sửa */
  if (!r && (m = q.match(/^\s*(điền|ghi|đặt|đổi|sửa|chuyển)\s+(.+?)\s*(?:thành\s*|=\s*|:\s*)?["“](.+?)["”]\s*(?:cho|vào|ở)\s+(.+?)\s*$/i)) && /^(tat ca|moi|cac|toan bo)\b/.test(aiNorm(m[4]))) {
    const fb = aiField(m[2]);
    if (!fb) return noCol(m[2]);
    if (!aiCanFill(fb)) return { html: aiFill(rows[0], fb, m[3], stage)!, act: [] };
    const vb = aiOpt(fb, m[3]);
    if (vb === null) return { html: onlyOpts(fb), act: [] };
    const sc = aiNorm(m[4]);
    const kind = /trong/.test(sc) ? 'trống' : /cham tien do|dang cham/.test(sc) ? 'chậm tiến độ' : /nguy co/.test(sc) ? 'có nguy cơ chậm' : /rui ro cao/.test(sc) ? 'rủi ro cao' : /can sua/.test(sc) ? 'cần sửa' : '';
    const pick = (x: Row): boolean => kind === 'trống' ? !displayText(x, fb, ctx) : kind === 'chậm tiến độ' ? exTT(x, ctx) === 'Chậm tiến độ' : kind === 'có nguy cơ chậm' ? exTT(x, ctx) === 'Có nguy cơ chậm' : kind === 'rủi ro cao' ? aiText(x, 'rui') === 'Cao' : kind === 'cần sửa' ? needsFix(x, ctx) : true;
    const S = rows.filter(pick), E = S.filter((x) => displayText(x, fb, ctx) !== vb);
    if (!S.length) {
      return kind === 'trống'
        ? { html: 'Cột <b>' + esc(fb.name) + '</b> không còn ô trống. Muốn đặt lại cho mọi dự án, gõ: <i>' + esc(m[1]) + ' ' + esc(fb.name.split(' (')[0]) + ' "' + esc(m[3]) + '" cho tất cả dự án</i>.' + agChips([m[1] + ' ' + fb.name.split(' (')[0] + ' "' + m[3] + '" cho tất cả dự án']), act: [] }
        : { html: 'Không có dự án nào ' + (kind ? 'ở nhóm “' + kind + '”' : 'trong bảng') + '.', act: [] };
    }
    if (!E.length) return { html: 'Các dự án trong phạm vi đã là “' + esc(vb) + '” rồi, không có gì cần đổi.', act: [] };
    E.forEach((x) => stage(x, fb, vb, 'edit'));
    return undefined;
  }
  /* nhiều mã trong một lệnh: Đổi Tiến độ của I.A.3.1, I.A.4.1 thành Chậm tiến độ */
  const CD = '[IVX]+\\.[A-Z0-9]+\\.\\d+\\.\\d+';
  if ((m = q.match(new RegExp('^\\s*(?:điền|ghi|đặt|đổi|chuyển|sửa)\\s+(.+?)\\s+(?:của|cho|ở)\\s+(' + CD + '(?:\\s*(?:,|;|và)\\s*' + CD + ')+)\\s+(?:thành|là|=|:)\\s*["“]?(.+?)["”]?\\s*$', 'i')))) {
    const fm = aiField(m[1]);
    if (!fm) return noCol(m[1]);
    if (!aiCanFill(fm)) return { html: 'Cột <b>' + fm.col + ' · ' + esc(fm.name) + '</b> lấy từ ' + esc(KIND_NAME[fm.kind] || 'nguồn khác') + ' nên không điền tay được.', act: [] };
    const vm = aiOpt(fm, m[3]);
    if (vm === null) return { html: onlyOpts(fm), act: [] };
    const L = Array.from(new Set((m[2].match(new RegExp(CD, 'gi')) || []).map((c) => c.toUpperCase()))).map((c) => aiRow(rows, c)).filter((x): x is Row => !!x);
    const E = L.filter((x) => displayText(x, fm, ctx) !== vm);
    if (!E.length) return { html: 'Các dự án này đã là “' + esc(vm) + '” rồi, không có gì cần đổi.', act: [] };
    E.forEach((x) => stage(x, fm, vm, 'edit'));
    return undefined;
  }
  /* xóa nội dung một ô: Xóa Note của I.A.3.1 */
  if (r && (m = q.match(/^\s*(?:xóa|xoá)\s+(.+?)\s+(?:của|cho|ở)\s+[IVX]+\.[A-Z0-9]+\.\d+\.\d+\s*$/i))) {
    const fx = aiField(m[1]);
    if (!fx) return noCol(m[1]);
    if (!displayText(r, fx, ctx)) return { html: 'Ô <b>' + esc(fx.name.split(' (')[0]) + '</b> của <b>' + esc(r.ma) + '</b> đang trống sẵn rồi.', act: [] };
    const ex = aiFill(r, fx, '', stage);
    return ex ? { html: ex, act: [] } : undefined;
  }
  /* điền / đổi một ô: "Đổi Tiến độ của I.A.4.1 thành Chậm tiến độ" */
  if (r && (m = q.match(/^\s*(?:điền|ghi|đặt|đổi|chuyển|sửa)\s+(.+?)\s+(?:của|cho|ở)\s+[IVX]+\.[A-Z0-9]+\.\d+\.\d+\s+(?:thành|là|=|:)\s*["“]?(.+?)["”]?\s*$/i))) {
    const f1 = aiField(m[1]);
    if (!f1) return noCol(m[1]);
    const e1 = aiFill(r, f1, m[2], stage);
    return { html: e1 || 'Đã đổi <b>' + f1.col + ' · ' + esc(f1.name) + '</b> của <b>' + esc(r.ma) + '</b> thành “' + esc(displayText(r, f1, ctx)) + '”. Bấm Ctrl+Z nếu muốn hoàn tác.', act: [] };
  }
  /* "Điền Note Đã họp cho I.A.5.1" */
  if (r && (m = q.match(/^\s*(?:điền|ghi|đặt)\s+(.+?)\s+(?:cho|vào)\s+[IVX]+\.[A-Z0-9]+\.\d+\.\d+\s*$/i))) {
    const sp = aiSplit(m[1]);
    if (!sp || !sp.v) return { html: 'Bạn ghi theo mẫu: <i>Điền Note "Đã họp" cho ' + esc(r.ma) + '</i>.', act: [] };
    const e2 = aiFill(r, sp.f, sp.v, stage);
    return { html: e2 || 'Đã điền <b>' + sp.f.col + ' · ' + esc(sp.f.name) + '</b> của <b>' + esc(r.ma) + '</b> = “' + esc(displayText(r, sp.f, ctx)) + '”. Bấm Ctrl+Z nếu muốn hoàn tác.', act: [] };
  }
  /* "Sửa Note "Đã họp" cho I.A.5.1" (prototype ghi thẳng; bản này cũng đưa vào bản xem trước) */
  const mf = q.match(/^\s*(điền|ghi|đặt|sửa)\s+(.+?)\s*(?:=|:|là)?\s*["“'](.+?)["”']\s*(?:cho|vào|ở)\s+([IVX]+\.[A-Z]\.\d+\.\d+)\s*$/i);
  if (mf) {
    const rr = aiRow(rows, mf[4]);
    if (!rr) return { html: 'Mình không thấy mã <b>' + esc(mf[4]) + '</b> trong bảng tuần này.', act: [] };
    const f = aiField(mf[2]);
    if (!f) return { html: 'Mình không tìm thấy cột “' + esc(mf[2]) + '”. Bạn gõ đúng tên cột hoặc ký hiệu cột (ví dụ N, AE).', act: [] };
    if (locked(f) || ['cfg', 'calc', 'jira', 'bucket', 'future', 'past', 'none', 'report'].includes(f.kind)) return { html: 'Cột <b>' + f.col + ' · ' + esc(f.name) + '</b> lấy từ ' + esc(KIND_NAME[f.kind] || 'nguồn khác') + ' nên mình không điền tay được.', act: [] };
    const o = optsFor(f);
    if (o && !o.includes(mf[3])) return { html: onlyOpts(f), act: [] };
    stage(rr, f, mf[3], 'edit');
    return { html: 'Đã điền <b>' + f.col + ' · ' + esc(f.name) + '</b> của <b>' + esc(rr.ma) + '</b> = “' + esc(mf[3]) + '”. Ô được đánh dấu sửa tay; bấm Ctrl+Z nếu muốn hoàn tác.', act: [] };
  }
  return undefined;
}

/* Hỏi đáp dữ liệu tuần / một dự án theo mã. */
function weekQA(q: string, ctx: AskCtx): Ans {
  const { rows } = ctx, t = q.toLowerCase(), mc = q.match(/\b([IVX]+\.[A-Z]\.\d+\.\d+)\b/i), r = mc ? aiRow(rows, mc[1]) : undefined;
  if (r) {
    if (/rủi ro|vấn đề|risk/.test(t)) {
      const D = trDraft('rui', 'normal', trInputs(r, ctx));
      return { html: '<b>' + esc(r.ma) + '</b> · Mức độ rủi ro (AC): <b>' + esc(aiText(r, 'rui') || D.level) + '</b><ul>' + D.s.map((x) => '<li>' + esc(x.t) + '</li>').join('') + '</ul>'
        + 'Vấn đề, rủi ro (AT): ' + esc(aiText(r, 'vd') || 'chưa có') + '<div class="src">Nguồn: cột AC, AT · Progress Report và Comment của ' + esc(r.ma) + '</div>', act: [] };
    }
    const last = r.pr?.length ? r.pr[r.pr.length - 1] : null;
    return { html: '<b>' + esc(r.ma) + '</b> · ' + esc(r.viec) + '<ul><li>Trạng thái: ' + esc(cv(r, 'tt', ctx) || '—') + ' · Tiến độ: ' + esc(cv(r, 'td', ctx) || '—') + '</li>'
      + '<li>Hạn ' + esc(cv(r, 'end', ctx) || '—') + ' · PIC ' + esc(cv(r, 'pic', ctx) || '—') + '</li>'
      + '<li>Progress Report: ' + (noUpdate(r) ? 'chưa có dòng nào tuần 15–22/11' + (last ? ', lần gần nhất ' + trDate(last.date) : '') : 'có cập nhật tuần này') + '</li>'
      + '<li>Mức độ rủi ro: ' + esc(aiText(r, 'rui') || 'chưa có') + '</li></ul><div class="src">Nguồn: cột I, J, F, H, AC và Progress Report của ' + esc(r.ma) + '</div>', act: [] };
  }
  if (/tóm tắt|tổng quan|tuần này/.test(t)) {
    const late = rows.filter((x) => exTT(x, ctx) === 'Chậm tiến độ').length, rk = rows.filter((x) => exTT(x, ctx) === 'Có nguy cơ chậm').length;
    const nu = rows.filter(noUpdate), em = rows.reduce((n, x) => n + emptyReq(x, ctx), 0);
    return { html: 'Tuần 3/11 có <b>' + rows.length + ' dự án</b>: ' + (rows.length - late - rk) + ' đúng tiến độ, ' + rk + ' có nguy cơ chậm, ' + late + ' chậm.'
      + '<ul><li>' + em + ' ô bắt buộc còn trống · ' + pendingAI(rows) + ' ô nháp AI chờ duyệt.</li>'
      + (nu.length ? '<li>' + nu.length + ' dự án chưa có Progress Report tuần này: ' + nu.slice(0, 6).map(codeBtn).join(', ') + '</li>' : '<li>Mọi dự án đều đã cập nhật Progress Report tuần này.</li>')
      + '</ul><div class="src">Nguồn: bảng tuần 3/11 · Progress Report theo ngày {{yyyy-mm-dd}}</div>', act: [] };
  }
  if (/đang chọn|dự án này/.test(t) && ctx.sel) {
    const r1 = ctx.allRows[ctx.sel.i], why = exWhy(r1, ctx);
    return { html: '<b>' + esc(r1.ma) + '</b> · ' + esc(r1.viec) + '<ul><li>Tình trạng: ' + esc(exTT(r1, ctx)) + (why ? ' (' + esc(why) + ')' : '') + '</li>'
      + '<li>Hạn ' + esc(cv(r1, 'end', ctx) || '—') + ' · ' + exPct(r1) + '% việc xong · PIC ' + esc(cv(r1, 'pic', ctx) || '—') + '</li>'
      + '<li>Mức độ rủi ro: ' + esc(aiText(r1, 'rui') || 'chưa có') + '</li></ul><div class="src">Nguồn: cột F, H, J, AC của dòng ' + esc(r1.ma) + '</div>', act: [] };
  }
  if (/trễ|chậm|nguy cơ|rủi ro/.test(t)) {
    const list = uniq(rows.filter((x) => exTT(x, ctx) !== 'Đúng tiến độ'));
    return { html: 'Có <b>' + list.length + ' dự án</b> chậm hoặc có nguy cơ chậm:<ul>' + list.slice(0, 6).map((x) => '<li>' + codeBtn(x) + ' — ' + esc(exTT(x, ctx).toLowerCase()) + ', ' + esc(exWhy(x, ctx)) + '</li>').join('') + '</ul>'
      + (list.length > 6 ? '<div>… và ' + (list.length - 6) + ' dự án khác.</div>' : '') + '<div class="src">Theo quy tắc: còn ≤ 14 ngày tới hạn hoặc Mức độ rủi ro (AC) = Cao · nguồn cột H, J, AC</div>', act: [] };
  }
  if (/hạn|đến hạn|deadline/.test(t)) {
    const list = uniq(rows.filter((x) => { const d = parseVN(cv(x, 'end', ctx)); return !!d && d >= TODAY && (d.getTime() - TODAY.getTime()) / 864e5 <= 14; }));
    const to = new Date(TODAY.getTime() + 14 * 864e5);
    return { html: (list.length ? '<b>' + list.length + ' dự án</b> đến hạn từ nay tới ' + to.getDate() + '/' + (to.getMonth() + 1) + ':<ul>' + list.slice(0, 6).map((x) => '<li>' + codeBtn(x) + ' — hạn ' + esc(cv(x, 'end', ctx)) + ', ' + exPct(x) + '% việc xong</li>').join('') + '</ul>' : 'Không có dự án nào đến hạn trong 14 ngày tới.')
      + '<div class="src">Nguồn: cột H (Ngày kết thúc) từ dữ liệu hệ thống</div>', act: [] };
  }
  if (/trống|thiếu|ô/.test(t)) {
    const list = rows.map((x) => ({ r: x, n: emptyReq(x, ctx) })).filter((x) => x.n).sort((a, b) => b.n - a.n);
    return list.length
      ? { html: 'Các dự án còn nhiều ô bắt buộc trống nhất:<ul>' + list.slice(0, 5).map((x) => '<li>' + codeBtn(x.r) + ' — ' + x.n + ' ô trống</li>').join('') + '</ul><div class="src">Chỉ tính cột bắt buộc của khối tuần này</div>', act: [{ act: 'ai', label: '✦ Nhờ AI soạn các ô trống' }] }
      : { html: 'Không còn ô bắt buộc nào trống.', act: [] };
  }
  return { html: 'Mình chưa trả lời được câu này. Thử hỏi về dự án trễ hạn, sắp đến hạn, ô còn trống, hoặc tóm tắt tuần.', act: [] };
}

/**
 * Trả lời một câu hỏi/lệnh trong khung Trợ lý AI. Không đổi `ctx.rows`/`ctx.allRows`:
 * lệnh sửa bảng trả `stagedItems` (bản xem trước), ẩn/hiện cột và lọc trả `hide`/`onlyFix`/`log` cho store.
 */
export function askAnswer(q0: string, ctx: AskCtx): AskResult {
  const { rows } = ctx;
  let q = String(q0).replace(/^[\s(\[“"'‘]+/, '').replace(/[\s)\]”"’,.;]+$/, '');
  /* "đổi tiến độ I.A.3.1 chậm tiến độ" → "đổi tiến độ của I.A.3.1 thành chậm tiến độ" */
  const m = q.match(/^\s*(đổi|điền|sửa|đặt|chuyển|ghi)\s+(.+?)\s+(?:của\s+|cho\s+)?([IVX]+\.[A-Z0-9]+\.\d+\.\d+)\s+(?:thành\s+|là\s+|=\s*|:\s*)?(.+)$/i);
  const nCodes = (q.match(/[IVX]+\.[A-Z0-9]+\.\d+\.\d+/gi) || []).length;
  if (m && nCodes < 2) q = m[1] + ' ' + m[2] + ' của ' + m[3].toUpperCase() + ' thành ' + m[4];

  /* Lệnh sửa nhắc tới mã không có trong file: báo rõ, không đoán sang câu hỏi khác. Bỏ phần trong ngoặc kép và sau dấu ":" (nội dung ghi chú). */
  if (EDITISH.test(q)) {
    const head = (q.indexOf('"') < 0 && q.indexOf('“') < 0 ? q.split(':')[0] : q).replace(/["“][^"”]*["”]/g, ' ');
    const bad = Array.from(new Set((head.match(CODEISH) || []).map((c) => c.toUpperCase()))).filter((c) => !aiRow(rows, c));
    if (bad.length) {
      const have = rows.slice(0, 3).map((x) => x.ma);
      return { html: 'Không có dự án mã <b>' + bad.map(esc).join(', ') + '</b> trong file Jira đang mở, nên mình chưa sửa gì.' + (have.length ? ' Mã có trong file, ví dụ: ' + have.map((x) => '<b>' + esc(x) + '</b>').join(', ') + '.' : ''), act: [], stagedItems: [] };
    }
    /* "đánh dấu I.A.3.1, I.A.4.1 là rủi ro cao" → đổi Mức độ rủi ro từng dự án */
    const mk = q.match(/^\s*đánh dấu\s+(.+?)\s+(?:là|thành)\s+rủi ro\s+(cao|trung bình|thấp)\s*$/i);
    const codes = mk ? mk[1].match(CODEISH) : null;
    if (mk && codes) {
      const lv = mk[2][0].toUpperCase() + mk[2].slice(1).toLowerCase();
      const out: AgStageItem[] = [];
      Array.from(new Set(codes.map((c) => c.toUpperCase()))).forEach((c) => { out.push(...(askAnswer('Đổi Mức độ rủi ro của ' + c + ' thành ' + lv, ctx).stagedItems || [])); });
      return out.length
        ? { html: 'Mình đã soạn <b>' + out.length + ' thay đổi</b>. Xem lại bên dưới, bỏ tick dòng không muốn, rồi bấm <b>Áp dụng</b> — bảng chỉ đổi sau khi bạn duyệt.', act: [], stagedItems: out }
        : { html: 'Các dự án này đã ở mức rủi ro <b>' + esc(lv) + '</b>, không có gì cần đổi.', act: [], stagedItems: [] };
    }
  }

  const items: AgStageItem[] = [];
  const stage: Stage = (r, f, to, kind = 'edit') => {
    const from = kind === 'approve' ? r.ai[f.id as AiFieldId]?.text ?? '' : displayText(r, f, ctx) || '';
    if (kind !== 'approve' && from === to) return;
    items.push({ i: r.i, f: f.id, from, to, kind });
  };
  const t = aiNorm(q), mc = q.match(CODE3), r = mc ? aiRow(rows, mc[1]) : undefined;
  let res: Ans | undefined;
  if (/^duyet/.test(t) && /nhap|o ai|o nhap/.test(t)) {
    const L = r ? [r] : /tat ca|het|toan bo/.test(t) ? rows : [];
    L.forEach((rr) => FIELDS.forEach((f) => { const d = rr.ai[f.id as AiFieldId]; if (d && !d.ok) stage(rr, f, d.text, 'approve'); }));
    if (!L.length) res = agentCmd(q, t, r, ctx, stage) || weekQA(q, ctx);
  } else res = agentCmd(q, t, r, ctx, stage) || (items.length ? undefined : weekQA(q, ctx));

  if (items.length) return { html: 'Mình đã soạn <b>' + items.length + ' thay đổi</b>. Xem lại bên dưới, bỏ tick dòng không muốn, rồi bấm <b>Áp dụng</b> — bảng chỉ đổi sau khi bạn duyệt.', act: [], stagedItems: items };
  res = res || { html: 'Không có gì cần thay đổi.', act: [] };
  res.html = res.html.replace(/dữ liệu hệ thống|hệ thống/g, 'file Jira');
  if (res.html.indexOf('Mình chưa trả lời được') < 0) return { ...res, stagedItems: [] };

  /* câu chưa hiểu: hỏi lại, kèm gợi ý "làm hộ" */
  const mc2 = q.match(CODE3), r0 = mc2 ? aiRow(rows, mc2[1]) : ctx.sel ? ctx.allRows[ctx.sel.i] : null;
  const w = q.replace(VERB, '').split(/\s+/);
  let f: Field | undefined;
  for (let k = Math.min(w.length, 5); k >= 1 && !f; k--) f = aiField(w.slice(0, k).join(' '));
  if (VERB.test(q) || f) {
    if (f && !aiCanFill(f)) return { html: 'Cột <b>' + f.col + ' · ' + esc(f.name) + '</b> lấy thẳng từ Jira nên Agent không sửa trên bảng. Bạn sửa trên Jira rồi nhập lại file nhé.', act: [], stagedItems: [] };
    const ma = r0 ? r0.ma : (rows.find((x) => needsFix(x, ctx)) || rows[0])?.ma || 'I.A.3.1';
    const nm = f ? f.name.split(' (')[0] : '';
    const opts = f && optsFor(f);
    const L = f && opts ? opts.slice(0, 4).map((o) => 'Đổi ' + nm + ' của ' + ma + ' thành ' + o)
      : f ? ['Điền ' + nm + ' "…" cho ' + ma, 'Điền ' + nm + ' "Chờ họp khối" cho các dự án đang trống'] : agExamples(r0, rows);
    return { html: (f ? 'Bạn muốn đổi <b>' + esc(nm) + '</b> cho dự án nào, thành gì?' : 'Bạn muốn Agent sửa ô nào, cho dự án nào?')
      + ' Chọn nhanh bên dưới hoặc gõ theo mẫu <i>Đổi Tiến độ của ' + esc(ma) + ' thành Chậm tiến độ</i>. Agent soạn xong sẽ gửi bản xem trước, bạn duyệt mới áp dụng lên bảng.' + agChips(L), act: [], stagedItems: [] };
  }
  return { html: 'Mình chưa hiểu câu này. Bạn có thể hỏi về dữ liệu tuần này, hoặc nhờ Agent sửa bảng:' + agChips(agExamples(r0, rows)), act: [], stagedItems: [] };
}
