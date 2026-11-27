import { beforeEach, describe, expect, it } from 'vitest';
import { getState, mutate, resetStore, setNow } from '@/store';
import * as AI from '@/store/actions/ai';
import { chatTitle, groupChats, MAX_CHATS, parseChats, previewOf, textOf, toRec, upsert, whenLabel } from '@/lib/chatHistory';
import type { AskMessage, ChatRec } from '@/types';

const msg = (q: string, html: string, extra: Partial<AskMessage> = {}): AskMessage => ({ q, a: { html, act: [] }, ...extra });
const rec = (id: string, at: number, q = 'Câu hỏi ' + id): ChatRec => ({ id, at, title: q, log: [{ q, html: '<b>Trả lời</b> ' + id }] });
const NOW = new Date(2026, 10, 26, 12, 0).getTime();   // 26/11/2026 12:00
const HOUR = 36e5, DAY = 864e5;

describe('Lịch sử trò chuyện · hàm thuần', () => {
  it('tiêu đề lấy từ câu hỏi đầu, cắt ở 60 ký tự', () => {
    expect(chatTitle('  Tóm tắt   tuần này ')).toBe('Tóm tắt tuần này');
    expect(chatTitle('a'.repeat(80))).toHaveLength(58);
    expect(chatTitle('   ')).toBe('Cuộc trò chuyện mới');
  });

  it('chỉ lưu câu đã trả lời xong; bản xem trước được ghi chú là không lưu lại', () => {
    expect(toRec('c1', 1, [msg('q', '', { busy: true })])).toBeNull();
    const r = toRec('c1', 5, [msg('Đổi tiến độ', 'Mình đã soạn 2 thay đổi', { stage: 's1' }), msg('hỏi tiếp', '', { busy: true })])!;
    expect(r.log).toHaveLength(1);
    expect(r.title).toBe('Đổi tiến độ');
    expect(r.log[0].html).toContain('Bản xem trước không được lưu lại');
  });

  it('upsert đưa cuộc vừa cập nhật lên đầu, không nhân đôi và giữ tối đa 30 cuộc', () => {
    const L = upsert(upsert([], rec('a', 1)), rec('b', 2));
    expect(upsert(L, rec('a', 3)).map((c) => c.id)).toEqual(['a', 'b']);
    const many = Array.from({ length: MAX_CHATS + 5 }, (_, i) => rec('x' + i, i)).reduce<ChatRec[]>((acc, c) => upsert(acc, c), []);
    expect(many).toHaveLength(MAX_CHATS);
    expect(many[0].id).toBe('x' + (MAX_CHATS + 4));
  });

  it('đọc localStorage: dữ liệu hỏng hoặc mục sai dạng bị bỏ qua, mục đúng giữ nguyên', () => {
    expect(parseChats(null)).toEqual([]);
    expect(parseChats('không phải json')).toEqual([]);
    expect(parseChats('{"a":1}')).toEqual([]);
    const ok = rec('ok', 9);
    const got = parseChats(JSON.stringify([{ id: 1 }, null, { ...ok, log: [] }, ok, { ...ok, id: 'x', log: [{ q: 1 }, { q: 'q', html: 'h' }] }]));
    expect(got.map((c) => c.id)).toEqual(['ok', 'x']);
    expect(got[1].log).toEqual([{ q: 'q', html: 'h' }]);
  });

  it('xem trước là chữ thuần, không còn thẻ HTML', () => {
    expect(textOf('<b>Có 2</b> dự án &lt;chậm&gt; &amp; <button>I.A.1.1</button>')).toBe('Có 2 dự án <chậm> & I.A.1.1');
    expect(previewOf(rec('a', 1))).toBe('Trả lời a');
  });

  it('nhóm Hôm nay / Hôm qua / Trước đó, mới nhất trước; giờ cho hôm nay, ngày cho hôm trước', () => {
    const L = [rec('old', NOW - 5 * DAY), rec('y', NOW - DAY), rec('t1', NOW - 3 * HOUR), rec('t2', NOW - HOUR)];
    const g = groupChats(L, NOW, '');
    expect(g.map((x) => x.label)).toEqual(['Hôm nay', 'Hôm qua', 'Trước đó']);
    expect(g[0].items.map((c) => c.id)).toEqual(['t2', 't1']);
    expect(whenLabel(NOW - HOUR, NOW)).toBe('11:00');
    expect(whenLabel(NOW - 5 * DAY, NOW)).toBe('21/11');
  });

  it('tìm theo tiêu đề, câu hỏi hoặc nội dung câu trả lời, không phân biệt hoa thường', () => {
    const L = [rec('a', NOW - HOUR, 'Tóm tắt tuần này'), { ...rec('b', NOW - 2 * HOUR, 'Dự án chậm'), log: [{ q: 'Dự án chậm', html: 'Có <b>I.C.1.12</b> nguy cơ' }] }];
    expect(groupChats(L, NOW, 'TÓM TẮT').flatMap((g) => g.items.map((c) => c.id))).toEqual(['a']);
    expect(groupChats(L, NOW, 'i.c.1.12').flatMap((g) => g.items.map((c) => c.id))).toEqual(['b']);
    expect(groupChats(L, NOW, 'không có')).toEqual([]);
  });
});

describe('Lịch sử trò chuyện · hành động trong store', () => {
  beforeEach(() => { resetStore(); setNow(() => new Date(2026, 10, 26, 12, 0)); });

  it('mỗi câu trả lời lưu vào cùng một cuộc; Chat mới mở trang trống mà vẫn giữ cuộc cũ', () => {
    AI.askSubmit('Tóm tắt tuần này');
    AI.askSubmit('Dự án nào chậm?');
    let s = getState();
    expect(s.chats).toHaveLength(1);
    expect(s.chats[0].log).toHaveLength(2);
    expect(s.chats[0].title).toBe('Tóm tắt tuần này');
    expect(s.chatId).toBe(s.chats[0].id);

    AI.chatNew();
    s = getState();
    expect(s.askLog).toEqual([]);
    expect(s.chatId).toBe('');
    expect(s.chats).toHaveLength(1);

    AI.askSubmit('Tóm tắt tuần này');
    expect(getState().chats).toHaveLength(2);
  });

  it('mở lại cuộc cũ để hỏi tiếp; xoá cuộc đang mở thì về trang trống', () => {
    AI.askSubmit('Tóm tắt tuần này');
    const first = getState().chatId;
    AI.chatNew();
    AI.askSubmit('Dự án nào chậm?');
    expect(getState().chats).toHaveLength(2);

    AI.chatHistory(true);
    expect(getState().chatView).toBe('history');
    AI.chatOpen(first);
    let s = getState();
    expect(s.chatView).toBe('chat');
    expect(s.askLog.map((m) => m.q)).toEqual(['Tóm tắt tuần này']);
    AI.askSubmit('Dự án nào chậm?');
    expect(getState().chats.find((c) => c.id === first)!.log).toHaveLength(2);
    expect(getState().chats).toHaveLength(2);

    AI.chatDelete(first);
    s = getState();
    expect(s.chats.map((c) => c.id)).not.toContain(first);
    expect(s.askLog).toEqual([]);
    expect(s.chatId).toBe('');
  });

  it('không đổi cuộc trò chuyện khi Agent đang trả lời', () => {
    AI.askSubmit('Tóm tắt tuần này');
    const id = getState().chatId;
    const busy = { q: 'đang hỏi', a: { html: '', act: [] }, busy: true };
    mutate((d) => { d.askLog.push(busy); }, { track: false });
    AI.chatNew();
    expect(getState().chatId).toBe(id);
    AI.chatDelete(id);
    expect(getState().chats.map((c) => c.id)).toContain(id);
  });

  it('xoá tất cả lịch sử: cả cuộc đang mở về trang trống; không đổi khi Agent đang trả lời', () => {
    AI.askSubmit('Tóm tắt tuần này');
    AI.chatNew();
    AI.askSubmit('Dự án nào chậm?');
    expect(getState().chats).toHaveLength(2);
    const busy = { q: 'đang hỏi', a: { html: '', act: [] }, busy: true };
    mutate((d) => { d.askLog.push(busy); }, { track: false });
    AI.chatClear();
    expect(getState().chats).toHaveLength(2);
    mutate((d) => { d.askLog = d.askLog.filter((m) => !m.busy); }, { track: false });
    AI.chatClear();
    const s = getState();
    expect(s.chats).toEqual([]);
    expect(s.askLog).toEqual([]);
    expect(s.chatId).toBe('');
  });
});
