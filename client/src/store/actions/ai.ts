/* Trợ lý AI: hỏi đáp + Agent sửa bảng qua BẢN XEM TRƯỚC (chỉ áp dụng khi duyệt), khung "AI soạn nháp", Gọi AI soạn ô trống,
   con trỏ ✦ Agent. Port từ prototype v4 (askSend R8f, stgAdd/stgHtml R8, panelTrace/trSet, aiStart, agWalk). */
import type { Draft } from 'immer';
import { AI_IDS, GROUPS } from '@/data/constants';
import { aiDrafts, askAnswer, trDraft, trInputs, trText, type TrVariant } from '@/lib/ai';
import { ck, fieldById } from '@/lib/cell';
import type { AgStageItem, AiFieldId, AppState, FieldId, TraceTarget } from '@/types';
import { getState, inBrowser, log, mutate, rowsOf, toast } from '@/store';
import { editCell } from './grid';

/* ---------- con trỏ ✦ Agent: UI đọc `walk` (đổi `seq` mỗi lần) để cuộn bảng và nháy ô ---------- */
function walk(d: Draft<AppState>, items: Pick<AgStageItem, 'i' | 'f' | 'off'>[], cls: 'aiflash' | 'aiwalk', n: number): void {
  d.walk = { list: items.filter((x) => !x.off).map((x) => [x.i, x.f]), cls, n, seq: (d.walk ? d.walk.seq : 0) + 1 };
}

/* ---------- hỏi đáp / Agent ---------- */
function answer(q: string, replaceBusy: boolean): string | null {
  const s = getState();
  const res = askAnswer(q, { rows: rowsOf(s), allRows: s.allRows, sel: s.sel, phaseBucket: s.phaseBucket });
  let id: string | null = null;
  mutate((d) => {
    if (replaceBusy && d.askLog.length && d.askLog[d.askLog.length - 1].busy) d.askLog.pop();
    let a = { html: res.html, act: res.act };
    if (res.stagedItems.length) {
      d.stgSeq++; id = 's' + d.stgSeq;
      d.stages[id] = { q, items: res.stagedItems, st: 'open' };
      walk(d, res.stagedItems, 'aiwalk', 6);
    } else if (/^Đã đổi <b>/.test(res.html)) a = { html: 'Không có gì cần thay đổi.', act: [] }; // sửa trùng giá trị hiện tại
    if (res.hide) { if (res.hide.on) d.hidden[res.hide.f] = true; else delete d.hidden[res.hide.f]; }
    if (res.onlyFix !== undefined) d.onlyFix = res.onlyFix;
    d.askLog.push(id ? { q, a, stage: id } : { q, a });
    if (res.log) log(d, ...res.log);
    log(d, 'Hỏi AI', q, '');
  });
  return id;
}

/** Hỏi ngay (không hiệu ứng gõ). Lệnh sửa bảng chỉ tạo bản xem trước trong `stages`; trả id bản đó, hoặc `null`. */
export function askSubmit(q: string): string | null {
  const t = q.trim();
  return t ? answer(t, false) : null;
}

/** Ô nhập #askIn / chip gợi ý: trên trình duyệt hiện "đang gõ…" 650ms + 8ms/ký tự (tối đa 450ms) rồi mới trả lời. */
export function askSend(q: string): void {
  const t = q.trim(), L = getState().askLog;
  if (!t || (L.length && L[L.length - 1].busy)) return;
  if (!inBrowser()) { answer(t, false); return; }
  mutate((d) => { d.askLog.push({ q: t, a: { html: '', act: [] }, busy: true }); });
  setTimeout(() => { answer(t, true); }, 650 + Math.min(t.length * 8, 450));
}

/* ---------- bản xem trước ---------- */
export function stgToggle(id: string, k: number): void {
  mutate((d) => { const x = d.stages[id]?.items[k]; if (x) x.off = !x.off; });
}
export function stgMore(id: string): void { mutate((d) => { const S = d.stages[id]; if (S) S.more = true; }); }
export function stgDrop(id: string): void {
  mutate((d) => {
    const S = d.stages[id]; if (!S || S.st !== 'open') return;
    S.st = 'dropped';
    log(d, 'Bỏ đề xuất của Agent', S.items.length + ' thay đổi', S.q);
  });
}
/** Áp dụng các dòng đang tick, trong MỘT bước hoàn tác; sửa qua cùng đường ghi với sửa tay. */
export function stgApply(id: string): void {
  mutate((d) => {
    const S = d.stages[id]; if (!S || S.st !== 'open') return;
    let n = 0;
    S.items.forEach((x) => {
      if (x.off) return;
      if (x.kind === 'approve') { const a = d.allRows[x.i].ai[x.f as AiFieldId]; if (a && !a.ok) { a.ok = true; n++; } }
      else if (editCell(d, x.i, x.f, x.to)) n++;
    });
    S.st = 'applied'; S.n = n;
    log(d, 'Áp dụng đề xuất của Agent', n + ' ô', S.q);
    toast(d, 'Đã áp dụng ' + n + ' thay đổi');
    walk(d, S.items, 'aiflash', 6);
  });
}
/** "Xem trên bảng" sau khi áp dụng. */
export function stgShow(id: string): void {
  mutate((d) => {
    const S = d.stages[id]; if (!S) return;
    const x0 = S.items.find((x) => !x.off);
    if (x0) { d.view = 'grid'; d.sel = { i: x0.i, f: x0.f }; d.range = null; d.scrollSel = true; }
    walk(d, S.items, 'aiflash', 6);
  });
}
/** Bấm một dòng của bản xem trước: bảng đi tới ô đó. */
export function stgGo(i: number, f: FieldId): void { mutate((d) => walk(d, [{ i, f }], 'aiwalk', 1)); }

/* ---------- Gọi AI soạn các ô trống ---------- */
function writeDrafts(d: Draft<AppState>): void {
  const rows = rowsOf(d), L = aiDrafts(rows, d);
  L.forEach((x) => { d.allRows[x.i].ai[x.f] = x.d; });
  log(d, 'Gọi AI đọc Progress Report', rows.length + ' dòng', 'V-LLM · ' + L.length + ' ô nháp (AC, AS, AT), chờ duyệt từng ô');
  d.modal = L.length ? 'aiDone' : null;
  if (!L.length) toast(d, 'Mọi ô đã có nội dung — không có gì để soạn thêm');
}
/** Nút "✦ Nhờ AI soạn các ô trống": trên trình duyệt chạy thanh tiến trình `aiRun` rồi mới ghi nháp. */
export function aiStart(): void {
  const total = rowsOf(getState()).length;
  if (!inBrowser() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { mutate(writeDrafts); return; }
  mutate((d) => { d.aiRun = { n: 0, total }; d.modal = null; });
  const tick = (): void => {
    const R = getState().aiRun; if (!R) return;
    const n = Math.min(R.total, R.n + Math.ceil(R.total / 7));
    mutate((d) => { if (d.aiRun) d.aiRun.n = n; });
    if (n >= R.total) { setTimeout(() => mutate((d) => { d.aiRun = null; writeDrafts(d); }), 260); return; }
    setTimeout(tick, 230);
  };
  setTimeout(tick, 200);
}

/* ---------- khung "AI soạn nháp" ---------- */
const trTarget = (s: AppState): TraceTarget | null =>
  s.sel && (AI_IDS as readonly string[]).includes(s.sel.f) && s.allRows[s.sel.i] ? { i: s.sel.i, f: s.sel.f } : s.trace;

/** Các ô nháp AI chờ duyệt (`i|f`) theo thứ tự nhóm → dòng → cột. */
export function pendingList(s: AppState): string[] {
  const out: string[] = [], rows = rowsOf(s);
  GROUPS.forEach((g) => rows.forEach((r) => {
    if (r.g === g.k) AI_IDS.forEach((fid) => { const a = r.ai[fid]; if (a && !a.ok) out.push(ck(r.i, fid)); });
  }));
  return out;
}

function trSet(d: Draft<AppState>, t: TraceTarget, text: string, ok: boolean): void {
  const r = d.allRows[t.i], k = t.f as AiFieldId, a = r.ai[k];
  r.ai[k] = { text, why: (a && a.why) || 'Progress Report', src: (a && a.src) || '', ok };
}
/** Sửa nháp trong khung trace (ô đang chọn nếu là ô AI, không thì ô đang mở). */
function withTarget(fn: (d: Draft<AppState>, t: TraceTarget, where: string) => void): void {
  const t = trTarget(getState()); if (!t) return;
  mutate((d) => fn(d, t, d.allRows[t.i].ma + ' · ' + fieldById(t.f)!.col));
}

export function trOpen(i: number, f: FieldId): void {
  mutate((d) => { d.trace = { i, f }; d.sel = { i, f }; d.panel = 'aitrace'; d.trEdit = null; d.view = 'grid'; d.scrollSel = true; });
}
export function trClose(): void { mutate((d) => { d.panel = null; d.trace = null; d.trEdit = null; }); }
export function trReqToggle(): void { mutate((d) => { d.trReq = !d.trReq; }); }

/** Ngắn hơn / Mặc định / Chi tiết hơn (và "Nhờ AI soạn"): nháp mới chờ duyệt, trên trình duyệt sau 750ms. */
export function trVar(v: TrVariant): void {
  const t = trTarget(getState()); if (!t) return;
  const key = ck(t.i, t.f);
  const run = (): void => mutate((d) => {
    d.trVar[key] = v;
    trSet(d, t, trText(trDraft(t.f as AiFieldId, v, trInputs(d.allRows[t.i], d))), false);
    d.trBusy = null;
    log(d, 'AI soạn lại nháp', d.allRows[t.i].ma + ' · ' + fieldById(t.f)!.col, v === 'short' ? 'Ngắn hơn' : v === 'detail' ? 'Chi tiết hơn' : 'Mặc định');
  });
  if (!inBrowser()) return run();
  mutate((d) => { d.trBusy = key; d.trEdit = null; });
  setTimeout(run, 750);
}
/** Chọn mức rủi ro (cột AC) = duyệt luôn. */
export function trLv(v: string): void {
  withTarget((d, t, where) => { trSet(d, t, v, true); d.touched[ck(t.i, t.f)] = 1; log(d, 'Duyệt nháp AI', where.split(' · ')[0] + ' · AC', v); });
}
export function trOk(): void {
  withTarget((d, t, where) => {
    const a = d.allRows[t.i].ai[t.f as AiFieldId]; if (!a) return;
    a.ok = true;
    log(d, 'Duyệt nháp AI', where, 'Duyệt trong khung AI soạn nháp');
    toast(d, 'Đã duyệt ' + where);
  });
}
export function trEdit(): void { const t = trTarget(getState()); if (t) mutate((d) => { d.trEdit = ck(t.i, t.f); }); }
export function trEditNo(): void { mutate((d) => { d.trEdit = null; }); }
/** Lưu chữ sửa tay trong khung trace = duyệt. */
export function trEditOk(text: string): void {
  withTarget((d, t, where) => {
    const v = text.trim();
    if (v) { trSet(d, t, v, true); d.touched[ck(t.i, t.f)] = 1; }
    d.trEdit = null;
    log(d, 'Sửa nháp AI', where, 'Sửa tay rồi duyệt');
  });
}
export function trDrop(): void {
  withTarget((d, t, where) => { delete d.allRows[t.i].ai[t.f as AiFieldId]; log(d, 'Bỏ nháp AI', where, 'Ô để trống'); });
}
/** "Ô nháp kế ›". */
export function trNext(): void {
  const L = pendingList(getState());
  if (!L.length) { mutate((d) => toast(d, 'Không còn ô nháp nào chờ duyệt')); return; }
  const [i, f] = L[0].split('|');
  trOpen(+i, f as FieldId);
}

/** "Duyệt từng ô" (thanh tick dòng, vùng đang chọn): bật chế độ duyệt các nháp AI, chỉ trong `keys` (`i|f`) nếu có.
    Task 8 vẽ thanh duyệt từ `state.review`. */
export function startReview(keys?: string[]): void {
  const s = getState(), all = pendingList(s), list = keys ? all.filter((k) => keys.includes(k)) : all;
  mutate((d) => {
    if (!list.length) return toast(d, all.length ? 'Không có nháp nào trong vùng chọn' : 'Chưa có nháp chờ duyệt — bấm “Nhờ AI soạn” trước');
    d.view = 'grid'; d.panel = null; d.modal = null; d.menu = null;
    d.onlyFix = false; d.search = ''; d.collapsed = {};
    AI_IDS.forEach((f) => { delete d.hidden[f]; });
    d.review = { list: list.map((k) => { const [i, f] = k.split('|'); return { i: +i, f: f as FieldId }; }), pos: 0, done: 0 };
  });
}

/* ---------- thẻ "Duyệt nháp AI · k/n" trên lớp Spotlight (prototype reviewMove/reviewApprove/reviewDrop L5830-5855) ---------- */
const pendingN = (d: Draft<AppState>): number => rowsOf(d).reduce((n, r) => n + AI_IDS.filter((k) => r.ai[k] && !r.ai[k]!.ok).length, 0);
function rvMove(d: Draft<AppState>, step: number): void {
  const rv = d.review; if (!rv) return;
  const np = rv.pos + step;
  if (np < 0) return;
  if (np >= rv.list.length) {
    d.review = null;
    log(d, 'Duyệt nội dung AI', rv.done + ' ô', 'Duyệt từng ô trong chế độ tập trung');
    const left = pendingN(d);
    return toast(d, left ? 'Đã đi hết danh sách · còn ' + left + ' ô chưa duyệt' : 'Đã duyệt hết nháp AI');
  }
  rv.pos = np; d.sel = null;
}
export function reviewMove(step: 1 | -1): void { mutate((d) => rvMove(d, step)); }
/** "Duyệt & tiếp →" / Enter: lưu chữ đã sửa (hoặc mức rủi ro đang chọn) rồi sang ô kế. */
export function reviewApprove(text?: string): void {
  mutate((d) => {
    const it = d.review && d.review.list[d.review.pos], a = it && d.allRows[it.i].ai[it.f as AiFieldId];
    if (a) {
      const v = (text ?? a.text).trim();
      if (v && v !== a.text) a.text = v;
      if (!a.ok) { a.ok = true; d.review!.done++; }
    }
    rvMove(d, 1);
  });
}
export function reviewDrop(): void {
  mutate((d) => {
    const it = d.review && d.review.list[d.review.pos]; if (!it) return;
    const f = fieldById(it.f)!;
    delete d.allRows[it.i].ai[it.f as AiFieldId];
    log(d, 'Bỏ nháp AI', d.allRows[it.i].ma + ' · ' + f.col + ' ' + f.name, 'Ô để trống, có thể tự gõ sau');
    rvMove(d, 1);
  });
}
export function reviewExit(): void { mutate((d) => { d.review = null; }); }
/** "AI soạn ra sao?": thoát duyệt, mở khung AI soạn nháp cho ô đang duyệt. */
export function reviewTrace(): void {
  const rv = getState().review, it = rv && rv.list[rv.pos];
  reviewExit();
  if (it) trOpen(it.i, it.f);
}

/* ---------- nút trong câu trả lời / modal "AI đã soạn xong" ---------- */
/** Mã DA trong câu trả lời (`data-act="exGo"`): tới ô Mã DA của dự án trên bảng. */
export function exGo(i: number): void {
  mutate((d) => { d.view = 'grid'; d.sel = { i, f: 'ma' }; d.range = null; d.scrollSel = true; });
}
/** "Duyệt theo dự án trên bảng". */
export function byProject(): void {
  mutate((d) => {
    d.modal = null; d.view = 'grid'; d.onlyFix = false; d.panel = null;
    AI_IDS.forEach((f) => { delete d.hidden[f]; });
    toast(d, 'Tick ô bên trái mỗi dự án (hoặc ô trên cùng để chọn tất cả), rồi bấm “Duyệt … ô của … dự án”');
  });
}
