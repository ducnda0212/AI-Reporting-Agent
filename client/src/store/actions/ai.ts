/* Trợ lý AI: hỏi đáp + Agent sửa bảng qua BẢN XEM TRƯỚC (chỉ áp dụng khi duyệt), khung "AI soạn nháp", Gọi AI soạn ô trống,
   con trỏ ✦ Agent. Port từ prototype v4 (askSend R8f, stgAdd/stgHtml R8, panelTrace/trSet, aiStart, agWalk). */
import type { Draft } from 'immer';
import { AI_IDS } from '@/data/constants';
import { aiDrafts, askAnswer, exTT, isLate, trDraft, trInputs, trText, type TrVariant } from '@/lib/ai';
import { agentAsk, agentEdit, aiStatus, draftRemote, type AgentAnswer, type AgentRow, type AiStatus } from '@/lib/api';
import { editFields, editHtml, editRows, looksLikeEdit, toStageItems } from '@/lib/agentEdit';
import { DRAFT_CHUNK, draftRequestRow, mergeRemote, type RemoteDrafts } from '@/lib/draftRemote';
import { fromRec, toRec, upsert } from '@/lib/chatHistory';
import { REMOTE_MAX_QUESTION, REMOTE_MAX_ROWS, agentHtml, historyOf, intentCommand, keepLocal, textColumns } from '@/lib/agentRemote';
import { ck, displayText, fieldById } from '@/lib/cell';
import { groupedRows } from '@/lib/grid';
import type { AgStageItem, AiFieldId, AppState, ChatRec, FieldId, Row, TraceTarget } from '@/types';
import { getState, inBrowser, log, mutate, now, rowsOf, toast } from '@/store';
import { editCell } from './grid';

/* ---------- con trỏ ✦ Agent: UI đọc `walk` (đổi `seq` mỗi lần) để cuộn bảng và nháy ô ---------- */
function walk(d: Draft<AppState>, items: (Pick<AgStageItem, 'i' | 'f' | 'off'> & Partial<Pick<AgStageItem, 'to' | 'kind'>>)[], cls: 'aiflash' | 'aiwalk', n: number): void {
  const on = items.filter((x) => !x.off);
  /* `tags`: chữ hiện trên con trỏ ✦ Agent, cùng thứ tự với `list` ("Indo", "Duyệt") */
  d.walk = { list: on.map((x) => [x.i, x.f]), cls, n, seq: (d.walk ? d.walk.seq : 0) + 1, tags: on.map((x) => (x.kind === 'approve' ? 'Duyệt nháp' : x.to ? String(x.to) : '')) };
}

/* ---------- lịch sử trò chuyện ---------- */
/** Lưu cuộc trò chuyện đang mở vào lịch sử (tạo mới nếu chưa có). Gọi sau mỗi câu trả lời. */
function syncChat(d: Draft<AppState>): void {
  if (!d.chatId) d.chatId = 'c' + now().getTime().toString(36) + d.chats.length;
  const rec = toRec(d.chatId, now().getTime(), d.askLog);
  if (rec) d.chats = upsert(d.chats, rec);
}
const answering = (): boolean => { const L = getState().askLog; return !!L.length && !!L[L.length - 1].busy; };

/** Chat mới: cuộc đang mở đã nằm sẵn trong lịch sử, chỉ cần mở trang trống. Không đổi khi Agent đang trả lời. */
export function chatNew(): void {
  if (answering()) return;
  mutate((d) => { d.askLog = []; d.chatId = ''; d.chatView = 'chat'; d.chatQ = ''; }, { track: false });
}
/** Mở lại một cuộc trong lịch sử để xem và hỏi tiếp. */
export function chatOpen(id: string): void {
  if (answering()) return;
  mutate((d) => {
    const c = d.chats.find((x: ChatRec) => x.id === id); if (!c) return;
    d.askLog = fromRec(c); d.chatId = c.id; d.chatView = 'chat'; d.chatQ = '';
  }, { track: false });
}
/** Xoá một cuộc khỏi lịch sử; nếu là cuộc đang mở thì về trang trống. */
export function chatDelete(id: string): void {
  if (answering()) return;
  mutate((d) => { d.chats = d.chats.filter((x: ChatRec) => x.id !== id); if (d.chatId === id) { d.askLog = []; d.chatId = ''; } }, { track: false });
}
/** Bật/tắt màn lịch sử trong khung Trợ lý AI. */
export function chatHistory(on: boolean): void { mutate((d) => { d.chatView = on ? 'history' : 'chat'; if (!on) d.chatQ = ''; }, { track: false }); }
export function chatSearch(q: string): void { mutate((d) => { d.chatQ = q; }, { track: false }); }

/* ---------- hỏi đáp / Agent ---------- */
function answer(q: string, replaceBusy: boolean, cmd?: string | string[]): string | null {
  const s = getState();
  const ctx = { rows: rowsOf(s), allRows: s.allRows, sel: s.sel, phaseBucket: s.phaseBucket };
  /* V-LLM đã đọc ý định: `cmd` là lệnh chuẩn để chạy đúng chức năng có sẵn (ẩn cột, soạn nháp, duyệt…), khung chat vẫn hiện câu gốc của người dùng */
  const list = cmd === undefined ? [q] : Array.isArray(cmd) ? cmd : [cmd];
  const rs = list.map((c) => askAnswer(c, ctx));
  const res = rs.length === 1 ? rs[0] : { ...rs[0], stagedItems: rs.flatMap((r) => r.stagedItems), html: rs[0].html.replace(/<b>\d+ thay đổi<\/b>/, '<b>' + rs.reduce((n, r) => n + r.stagedItems.length, 0) + ' thay đổi</b>') };
  let id: string | null = null;
  mutate((d) => {
    if (replaceBusy && d.askLog.length && d.askLog[d.askLog.length - 1].busy) d.askLog.pop();
    let a = { html: res.html, act: res.act };
    if (res.stagedItems.length) {
      d.stgSeq++; id = 's' + d.stgSeq;
      d.stages[id] = { q, items: res.stagedItems, st: 'open' };
      walk(d, res.stagedItems, 'aiwalk', 6);
      if (d.view === 'grid') { const x0 = res.stagedItems.find((x) => !x.off); if (x0) { d.sel = { i: x0.i, f: x0.f }; d.scrollSel = true; } } // đưa ô đầu vào khung nhìn để con trỏ Agent tìm thấy
    } else if (/^Đã đổi <b>/.test(res.html)) a = { html: 'Không có gì cần thay đổi.', act: [] }; // sửa trùng giá trị hiện tại
    if (res.hide) { if (res.hide.on) d.hidden[res.hide.f] = true; else delete d.hidden[res.hide.f]; }
    if (res.onlyFix !== undefined) d.onlyFix = res.onlyFix;
    d.askLog.push(id ? { q, a, stage: id } : { q, a });
    syncChat(d);
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
  void respond(t);
}

/* ---------- hỏi đáp qua backend (/api/agent/ask) ---------- */
/** Backend có sẵn sàng trả lời bằng V-LLM không (nhớ kết quả 30 giây để không gọi lại mỗi câu). */
let backend: { at: number; st: AiStatus | null } | null = null;
async function backendReady(): Promise<boolean> {
  if (!backend || Date.now() - backend.at > 30000) backend = { at: Date.now(), st: await aiStatus() };
  const st = backend.st;
  return !!st && st.mode === 'vllm' && st.problems.length === 0;
}

/** Một dòng bảng theo đúng giá trị đang hiển thị; "Tiến độ" dùng cùng quy tắc với câu trả lời tại chỗ. */
function agentRow(r: Row, s: AppState): AgentRow {
  const show = (id: string): string => displayText(r, fieldById(id)!, s) || '';
  return {
    code: r.ma, name: r.viec, group: show('mang'), status: show('tt'), progress: exTT(r, s), risk: r.ai.rui?.text || show('rui'),
    pic: show('pic'), start: show('start'), end: show('end'), pending: (['rui', 'kh', 'vd'] as const).some((k) => !!r.ai[k] && !r.ai[k]!.ok),
    ...textColumns(show, r.comment),
  };
}

/** Gửi câu chat cho V-LLM (qua backend) để đọc Ý ĐỊNH: hỏi gì, hay muốn sửa / soạn nháp / duyệt / đổi cách xem bảng. `null` = backend tắt/lỗi, bảng quá lớn → dùng luật tại chỗ. */
async function remoteAsk(q: string): Promise<AgentAnswer | null> {
  const s = getState(), rows = rowsOf(s);
  if (q.length > REMOTE_MAX_QUESTION || !rows.length || rows.length > REMOTE_MAX_ROWS) return null;
  if (!(await backendReady())) return null;
  /* dòng đang chọn trên bảng là "dự án này" cho câu nối tiếp; đặt trước các câu đã hỏi nên câu hỏi gần nhất vẫn ưu tiên */
  const sel = s.sel ? s.allRows[s.sel.i] : null;
  const hist = historyOf(s.askLog);
  const history = sel && rows.some((r) => r.ma === sel.ma) ? [{ q: '(dòng đang chọn trên bảng)', codes: [sel.ma] }, ...hist] : hist;
  try { return await agentAsk(q, rows.map((r) => agentRow(r, s)), history); } catch { return null; }
}

/** Lệnh sửa bảng: nhờ V-LLM đọc ý, chỉ đề xuất; kết quả thành bản xem trước. `null` = V-LLM lỗi. */
interface RemoteEdit { html: string; items: AgStageItem[] }
async function remoteEdit(q: string): Promise<RemoteEdit | null> {
  const s = getState(), rows = rowsOf(s);
  if (!rows.length || rows.length > REMOTE_MAX_ROWS) return null;
  try {
    const res = await agentEdit(q, editRows(rows, s), editFields());
    const items = toStageItems(res, rows);
    return { html: editHtml(res, items.length), items };
  } catch { return null; }
}

/** Hiện câu trả lời lệnh sửa do V-LLM đọc ý: có đề xuất thì tạo bản xem trước như lệnh sửa tại chỗ. */
function answerEdit(q: string, e: RemoteEdit): void {
  mutate((d) => {
    if (d.askLog.length && d.askLog[d.askLog.length - 1].busy) d.askLog.pop();
    let id: string | null = null;
    if (e.items.length) {
      d.stgSeq++; id = 's' + d.stgSeq;
      d.stages[id] = { q, items: e.items, st: 'open' };
      walk(d, e.items, 'aiwalk', 6);
      if (d.view === 'grid') { const x0 = e.items[0]; d.sel = { i: x0.i, f: x0.f }; d.scrollSel = true; }
    }
    const a = { html: e.html, act: [] };
    d.askLog.push(id ? { q, a, stage: id } : { q, a });
    syncChat(d);
    log(d, 'Hỏi AI', q, 'V-LLM đọc ý lệnh sửa · ' + e.items.length + ' đề xuất');
  });
}

type Decision =
  | { kind: 'html'; html: string; scope: string[] }
  | { kind: 'edit'; edit: RemoteEdit }
  | { kind: 'local'; cmd: string | string[] }
  | { kind: 'say'; html: string }
  | { kind: 'fallback' };

const EDIT_DOWN = 'Mình hiểu đây là lệnh sửa bảng nhưng chưa đọc được ý vì V-LLM đang lỗi, nên mình chưa sửa gì. Bạn thử lại sau ít phút, hoặc gõ theo mẫu: <i>Đổi Note "Chờ họp" cho các dự án chậm tiến độ</i> hoặc <i>Đổi Tiến độ của I.A.3.1, I.A.4.1 thành Chậm tiến độ</i>.';

/** V-LLM đọc ý định trước, rồi gọi đúng chức năng. Không đoán ý bằng từ khóa khi V-LLM đang chạy. */
async function decide(q: string): Promise<Decision> {
  const res = await remoteAsk(q);
  if (!res) return { kind: 'fallback' };
  if (res.intent === 'edit') {
    const edit = await remoteEdit(q);
    return edit ? { kind: 'edit', edit } : { kind: 'say', html: EDIT_DOWN };
  }
  if (res.intent === 'view' || res.intent === 'draft' || res.intent === 'approve') {
    const cmd = intentCommand(res);
    return cmd ? { kind: 'local', cmd } : { kind: 'say', html: 'Mình hiểu bạn muốn đổi cách xem bảng nhưng chưa rõ cột nào. Bạn nói tên hoặc ký hiệu cột nhé, ví dụ: <i>Ẩn cột Note</i>.' };
  }
  return { kind: 'html', html: agentHtml(res, rowsOf(getState())), scope: res.scope ?? [] };
}

/** Hiện câu trả lời sau tối thiểu 650ms + 8ms/ký tự (như hiệu ứng gõ cũ); backend tắt/lỗi thì rơi về luật tại chỗ. */
async function respond(q: string): Promise<void> {
  const t0 = Date.now(), min = 650 + Math.min(q.length * 8, 450);
  const d0 = await decide(q);
  const wait = min - (Date.now() - t0);
  if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  const say = (html: string): void => mutate((d) => {
    if (d.askLog.length && d.askLog[d.askLog.length - 1].busy) d.askLog.pop();
    d.askLog.push({ q, a: { html, act: [] } });
    syncChat(d);
  });
  if (d0.kind === 'edit') { answerEdit(q, d0.edit); return; }
  if (d0.kind === 'local') { answer(q, true, d0.cmd); return; }
  if (d0.kind === 'say') { say(d0.html); return; }
  if (d0.kind === 'html') {
    mutate((d) => {
      if (d.askLog.length && d.askLog[d.askLog.length - 1].busy) d.askLog.pop();
      d.askLog.push({ q, a: { html: d0.html, act: [] }, scope: d0.scope });
      syncChat(d);
      log(d, 'Hỏi AI', q, 'V-LLM qua backend');
    });
    return;
  }
  /* V-LLM không dùng được: luật từ khóa tại chỗ (câu sửa viết tự nhiên thì nói rõ là chưa đọc được) */
  if (!keepLocal(q) && looksLikeEdit(q)) { say(EDIT_DOWN); return; }
  answer(q, true);
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
function writeDrafts(d: Draft<AppState>, remote?: RemoteDrafts): void {
  const rows = rowsOf(d), local = aiDrafts(rows, d);
  const m = remote ? mergeRemote(local, remote) : null, L = m ? m.cells : local;
  L.forEach((x) => { d.allRows[x.i].ai[x.f] = x.d; });
  const failed = remote ? Object.keys(remote.errors).length : 0;
  log(d, 'Gọi AI đọc Progress Report', rows.length + ' dòng',
    (remote ? 'V-LLM ' + remote.model + ' · ' + m!.fromAi + ' ô do AI soạn (AC, AT), ' + m!.byRule + ' ô theo luật từ Progress Report' + (failed ? ', ' + failed + ' dòng AI lỗi nên dùng nháp theo luật' : '')
      : 'Theo luật tại chỗ · ' + L.length + ' ô nháp (AC, AS, AT)') + ', chờ duyệt từng ô');
  d.modal = L.length ? 'aiDone' : null;
  if (!L.length) toast(d, 'Mọi ô đã có nội dung — không có gì để soạn thêm');
  else if (failed) toast(d, 'AI lỗi ở ' + failed + ' dòng, các dòng đó dùng nháp theo luật');
}

/** Gọi backend soạn nháp cho các dòng còn thiếu ô AC hoặc AT. Trả `null` khi backend tắt/chưa sẵn sàng hoặc không có dòng nào cần AI (dùng bản theo luật). */
async function remoteDrafts(): Promise<RemoteDrafts | null> {
  const s = getState(), rows = rowsOf(s);
  if (!rows.length || !(await backendReady())) return null;
  const need = new Set(aiDrafts(rows, s).filter((x) => x.f === 'rui' || x.f === 'vd').map((x) => x.i));
  const send = rows.filter((r) => need.has(r.i));
  if (!send.length) return null;
  const show = (r: Row) => (id: string): string => displayText(r, fieldById(id)!, s) || '';
  const out: RemoteDrafts = { drafts: {}, errors: {}, model: '' };
  mutate((d) => { d.aiRun = { n: 0, total: send.length }; }, { track: false });
  for (let k = 0; k < send.length; k += DRAFT_CHUNK) {
    const part = send.slice(k, k + DRAFT_CHUNK);
    try {
      const res = await draftRemote(part.map((r) => draftRequestRow(r, show(r), isLate(r, s))));
      Object.assign(out.drafts, res.drafts); Object.assign(out.errors, res.errors); out.model = res.model || out.model;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi gọi AI';
      part.forEach((r) => { out.errors[String(r.i)] = msg; });
    }
    mutate((d) => { if (d.aiRun) d.aiRun.n = Math.min(d.aiRun.total, k + part.length); }, { track: false });
  }
  if (!Object.keys(out.drafts).length) return null;  // cả lô lỗi: dùng bản theo luật, không báo AI đã soạn
  return out;
}

/** Thanh tiến trình giả khi không gọi được backend, rồi ghi nháp theo luật. */
function animateLocal(): void {
  const total = rowsOf(getState()).length;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { mutate((d) => { d.aiRun = null; writeDrafts(d); }); return; }
  mutate((d) => { d.aiRun = { n: 0, total }; d.modal = null; }, { track: false });
  const tick = (): void => {
    const R = getState().aiRun; if (!R) return;
    const n = Math.min(R.total, R.n + Math.ceil(R.total / 7));
    mutate((d) => { if (d.aiRun) d.aiRun.n = n; }, { track: false });
    if (n >= R.total) { setTimeout(() => mutate((d) => { d.aiRun = null; writeDrafts(d); }), 260); return; }
    setTimeout(tick, 230);
  };
  setTimeout(tick, 200);
}

/** Nút "✦ Nhờ AI soạn các ô trống": backend sẵn sàng thì V-LLM soạn AC và AT (AS lấy theo luật từ Progress Report), không thì chạy bản theo luật tại chỗ.
    Mọi nháp chờ duyệt từng ô. */
export function aiStart(): void {
  const s = getState();
  if (!inBrowser()) { mutate((d) => writeDrafts(d)); return; }
  if (s.aiRun) return;
  mutate((d) => { d.aiRun = { n: 0, total: rowsOf(s).length }; d.modal = null; }, { track: false });
  void remoteDrafts().then((remote) => {
    if (remote) mutate((d) => { d.aiRun = null; writeDrafts(d, remote); });
    else animateLocal();
  });
}

/* ---------- khung "AI soạn nháp" ---------- */
const trTarget = (s: AppState): TraceTarget | null =>
  s.sel && (AI_IDS as readonly string[]).includes(s.sel.f) && s.allRows[s.sel.i] ? { i: s.sel.i, f: s.sel.f } : s.trace;

/** Các ô nháp AI chờ duyệt (`i|f`) theo thứ tự nhóm → dòng → cột. */
export function pendingList(s: AppState): string[] {
  const out: string[] = [], rows = rowsOf(s);
  groupedRows(s.groups, rows).forEach(({ gr }) => gr.forEach((r) => {
    AI_IDS.forEach((fid) => { const a = r.ai[fid]; if (a && !a.ok) out.push(ck(r.i, fid)); });
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
