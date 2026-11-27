import { beforeEach, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '@/App';
import { AssistantView } from '@/views/Assistant/AssistantView';
import { Rail } from '@/components/layout/Rail';
import { getState, mutate, resetStore } from '@/store';
import { setView } from '@/store/actions/flow';
import { loadFixture } from './fixtures';

describe('Màn Trợ lý toàn trang', () => {
  beforeEach(() => { resetStore(); loadFixture('x.csv'); });

  it('Rail có mục Trợ lý và bấm vào thì chuyển sang màn ai', () => {
    expect(renderToString(<Rail />)).toContain('Trợ lý');
    setView('ai');
    expect(getState().view).toBe('ai');
  });

  it('chưa hỏi gì: có lời chào, ô nhập lớn, gợi ý và cột lịch sử', () => {
    mutate((d) => { d.view = 'ai'; d.askLog = []; });
    const h = renderToString(<AssistantView />);
    expect(h).toContain('asv-hero');
    expect(h).toContain('id="askIn"');
    expect(h).toContain('asv-grid');
    expect(h).toContain('Lịch sử');
    expect(h).toContain('Chưa có cuộc trò chuyện nào');
  });

  it('đã có hội thoại: hiện câu hỏi, câu trả lời và vẫn có ô nhập', () => {
    mutate((d) => { d.view = 'ai'; d.askLog = [{ q: 'Tóm tắt tuần này', a: { html: '<b>Có 7 dự án</b>', act: [] } }]; });
    const h = renderToString(<AssistantView />);
    expect(h).toContain('Tóm tắt tuần này');
    expect(h).toContain('Có 7 dự án');
    expect(h).toContain('id="askIn"');
    expect(h).not.toContain('asv-hero');
  });

  it('App render màn ai và không mở thêm khung AI bên phải', () => {
    mutate((d) => { d.view = 'ai'; d.panel = 'ai'; d.tour = null; });
    const h = renderToString(<App />);
    expect(h).toContain('asv-col');
    expect(h).not.toContain('phub');
  });
});
