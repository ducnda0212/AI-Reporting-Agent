/* Lịch sử trò chuyện của Trợ lý AI. Hàm thuần: không đọc/ghi state, không chạm localStorage.
   Một cuộc trò chuyện lưu dạng chữ (câu hỏi + HTML câu trả lời). Bản xem trước của Agent không lưu lại vì nó gắn với dòng đang có trên bảng. */
import type { AskMessage, ChatRec } from '@/types';

export const MAX_CHATS = 30;
const PREVIEW_NOTE = '<div class="src">Bản xem trước không được lưu lại khi mở lại cuộc trò chuyện.</div>';

/** Chữ thuần của một đoạn HTML (bỏ thẻ, trả lại ký tự đặc biệt), dùng cho dòng xem trước và tìm kiếm. */
export const textOf = (html: string): string =>
  html.replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function chatTitle(q: string): string {
  const t = q.replace(/\s+/g, ' ').trim();
  return !t ? 'Cuộc trò chuyện mới' : t.length > 60 ? t.slice(0, 57) + '…' : t;
}

/** Đóng gói cuộc trò chuyện đang mở; `null` khi chưa có câu nào trả lời xong. */
export function toRec(id: string, at: number, log: readonly AskMessage[]): ChatRec | null {
  const done = log.filter((m) => !m.busy);
  if (!done.length) return null;
  return { id, at, title: chatTitle(done[0].q), log: done.map((m) => ({ q: m.q, html: m.stage ? m.a.html + PREVIEW_NOTE : m.a.html })) };
}

export const fromRec = (r: ChatRec): AskMessage[] => r.log.map((m) => ({ q: m.q, a: { html: m.html, act: [] } }));

/** Đưa cuộc trò chuyện lên đầu danh sách, giữ tối đa MAX_CHATS. */
export const upsert = (list: readonly ChatRec[], rec: ChatRec): ChatRec[] => [rec, ...list.filter((c) => c.id !== rec.id)].slice(0, MAX_CHATS);

/** Đọc lịch sử từ localStorage; dữ liệu hỏng hoặc sai dạng thì bỏ qua từng mục. */
export function parseChats(raw: string | null): ChatRec[] {
  let v: unknown;
  try { v = JSON.parse(raw || 'null'); } catch { return []; }
  if (!Array.isArray(v)) return [];
  const out: ChatRec[] = [];
  for (const c of v as Record<string, unknown>[]) {
    if (!c || typeof c.id !== 'string' || typeof c.title !== 'string' || typeof c.at !== 'number' || !Array.isArray(c.log)) continue;
    const log = (c.log as Record<string, unknown>[])
      .filter((m) => m && typeof m.q === 'string' && typeof m.html === 'string')
      .map((m) => ({ q: m.q as string, html: m.html as string }));
    if (log.length) out.push({ id: c.id, title: c.title, at: c.at, log });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_CHATS);
}

export const previewOf = (r: ChatRec): string => textOf(r.log[r.log.length - 1].html);

const p2 = (n: number): string => String(n).padStart(2, '0');
const dayStart = (ms: number): number => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** "09:05" nếu là hôm nay, ngược lại "20/11". */
export function whenLabel(at: number, nowMs: number): string {
  const d = new Date(at);
  return at >= dayStart(nowMs) ? p2(d.getHours()) + ':' + p2(d.getMinutes()) : p2(d.getDate()) + '/' + p2(d.getMonth() + 1);
}

export interface ChatGroup { label: string; items: ChatRec[] }

/** Lọc theo từ khoá (tiêu đề, câu hỏi, câu trả lời) rồi chia nhóm Hôm nay / Hôm qua / Trước đó, mới nhất lên đầu. */
export function groupChats(list: readonly ChatRec[], nowMs: number, q: string): ChatGroup[] {
  const k = q.trim().toLowerCase();
  const hit = list.filter((c) => !k || c.title.toLowerCase().includes(k) || c.log.some((m) => m.q.toLowerCase().includes(k) || textOf(m.html).toLowerCase().includes(k)));
  const today = dayStart(nowMs), yday = today - 864e5;
  const pick = (f: (at: number) => boolean): ChatRec[] => hit.filter((c) => f(c.at)).sort((a, b) => b.at - a.at);
  return [
    { label: 'Hôm nay', items: pick((t) => t >= today) },
    { label: 'Hôm qua', items: pick((t) => t >= yday && t < today) },
    { label: 'Trước đó', items: pick((t) => t < yday) },
  ].filter((g) => g.items.length);
}
