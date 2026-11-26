/* Hiệu ứng Agent: các bước hiện lần lượt trong lúc chờ, và chữ trên con trỏ ✦. */
import { describe, expect, it } from 'vitest';
import { STEP_MS, activeStep, cursorTag, runSteps, stepState } from '@/lib/agentRun';

describe('thẻ "Agent đang làm"', () => {
  it('lệnh sửa bảng dùng bước soạn thay đổi, câu hỏi dùng bước trả lời', () => {
    const c = runSteps('Đổi Market của I.A.4.1 thành Indo'), q = runSteps('Dự án nào đang chậm?');
    expect(c.command).toBe(true); expect(c.title).toBe('Agent đang soạn thay đổi'); expect(c.steps).toHaveLength(4); expect(c.steps[3]).toBe('Dựng bản xem trước');
    expect(q.command).toBe(false); expect(q.title).toBe('Agent đang trả lời'); expect(q.steps[3]).toBe('Viết câu trả lời');
  });
  it('bước chuyển theo thời gian và bước cuối không bao giờ xong khi chưa có kết quả', () => {
    expect(activeStep(0, 4)).toBe(0);
    expect(activeStep(STEP_MS, 4)).toBe(1);
    expect(activeStep(STEP_MS * 3, 4)).toBe(3);
    expect(activeStep(60000, 4)).toBe(3);
    expect(stepState(0, 3)).toBe('ok'); expect(stepState(3, 3)).toBe('on'); expect(stepState(3, 2)).toBe('wait');
  });
});

describe('chữ trên con trỏ Agent', () => {
  it('bản xem trước hiện mũi tên, đã áp dụng hiện dấu tick', () => {
    expect(cursorTag('Indo', false)).toBe('→ Indo');
    expect(cursorTag('Indo', true)).toBe('✓ Indo');
  });
  it('rỗng thì không hiện chữ; chữ dài bị cắt gọn và gộp xuống dòng', () => {
    expect(cursorTag('', true)).toBe('');
    expect(cursorTag('  \n ', false)).toBe('');
    const t = cursorTag('Vướng: chờ GPU từ hạ tầng\nnên trễ hai tuần', false);
    expect(t.length).toBe(2 + 26); expect(t.endsWith('…')).toBe(true); expect(t.includes('\n')).toBe(false);
  });
});
