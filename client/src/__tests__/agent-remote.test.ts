import { describe, expect, it } from 'vitest';
import { agentHtml, keepLocal } from '@/lib/agentRemote';
import type { AgentAnswer } from '@/lib/api';

const rows = [{ i: 3, ma: 'I.A.1.1' }, { i: 7, ma: 'II.B.2.4' }];
const ans = (o: Partial<AgentAnswer>): AgentAnswer => ({ intent: 'filter', answer: '', codes: [], by: 'v-llm-v1-medium', grounded: true, warnings: [], mode: 'vllm', model: 'v-llm-v1-medium', ...o });

describe('Agent hỏi đáp qua backend', () => {
  it('lệnh sửa bảng và câu về ô đang chọn giữ ở giao diện, câu hỏi số liệu đi qua backend', () => {
    ['Đổi tiến độ của I.A.1.1 thành Chậm tiến độ', 'nhờ điền Mức độ rủi ro', 'Duyệt hết nháp của I.A.1.1', 'Ẩn cột PIC', 'Tóm tắt dự án đang chọn', 'dự án này thế nào']
      .forEach((q) => expect(keepLocal(q), q).toBe(true));
    ['Tóm tắt tuần này', 'Dự án nào có nguy cơ trễ?', 'Nháp nào đang chờ duyệt?', 'Có bao nhiêu dự án rủi ro cao?', 'I.A.1.1 đang thế nào']
      .forEach((q) => expect(keepLocal(q), q).toBe(false));
  });

  it('mã dự án trong câu trả lời thành nút bấm tới đúng dòng, mã lạ để nguyên chữ', () => {
    const h = agentHtml(ans({ answer: 'Có 2 dự án chậm: I.A.1.1 và II.B.2.4, ngoài ra IX.Z.9.9.' }), rows);
    expect(h).toContain('<button class="cd" data-act="exGo" data-i="3">I.A.1.1</button>');
    expect(h).toContain('<button class="cd" data-act="exGo" data-i="7">II.B.2.4</button>');
    expect(h).toContain('ngoài ra IX.Z.9.9.');
    expect(h).not.toContain('data-i="undefined"');
  });

  it('chặn chèn HTML từ câu trả lời và ghi rõ ai viết lời văn', () => {
    const h = agentHtml(ans({ answer: '<img src=x onerror=alert(1)> Có 1 dự án.' }), rows);
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;img');
    expect(h).toContain('lời văn do v-llm-v1-medium');
  });

  it('câu trả lời mẫu: nói rõ khi AI lệch số liệu', () => {
    const rule = agentHtml(ans({ by: 'rule', grounded: true, answer: 'Có 3 dự án.' }), rows);
    expect(rule).toContain('Số liệu tính từ bảng hiện tại');
    expect(rule).not.toContain('lời văn do');
    const bad = agentHtml(ans({ by: 'rule', grounded: false, warnings: ['con số 9 không có trong số liệu'], answer: 'Có 3 dự án.' }), rows);
    expect(bad).toContain('AI trả lời lệch số liệu nên dùng câu mẫu');
    expect(bad).toContain('con số 9 không có trong số liệu');   // nêu lý do để biết AI lệch ở đâu
  });
});
