import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '@/App';
import { getState, mutate, resetStore } from '@/store';
import { TopBar } from '@/components/layout/TopBar';
import { Rail } from '@/components/layout/Rail';
import { StatusBar } from '@/components/layout/StatusBar';
import { setView, setPanel, setModal } from '@/store/actions/flow';
import { GOLD_FILE, loadFixture } from './fixtures';
import { trOpen } from '@/store/actions/ai';
import { poOpen } from '@/store/actions/popout';


describe('Full App Integration SSR', () => {
  it('import -> grid -> panel/popout -> ver -> log, không có màn ẩn', () => {
    resetStore();
    const imp = renderToString(<App />);
    expect(imp).toContain('Kéo file CSV hoặc Excel export từ Jira vào đây');
    expect(imp).not.toContain('class="rail"');

    loadFixture(GOLD_FILE);
    setView('grid');
    const grid = renderToString(<App />);
    expect(grid).toContain('class="rail"');
    expect(grid).toContain('gridwrap');
    const chrome = renderToString(<><TopBar /><Rail /></>); // tên cột bảng có chữ 'Rủi ro' nên chỉ kiểm khung điều hướng
    for (const hidden of ['Điều hành', 'Rủi ro', 'Mẫu BC', 'Cảnh báo']) expect(chrome).not.toContain(hidden);

    setPanel('ai');
    expect(renderToString(<App />)).toContain('aria-label="Trợ lý AI"');

    trOpen(0, 'rui'); // đặt panel 'aitrace' + sel
    const trace = renderToString(<App />);
    expect(trace).toContain('data-act="trClose"');
    expect(trace).not.toContain('aria-label="Trợ lý AI"');

    setPanel('tvcfg');
    expect(renderToString(<App />)).toContain('aria-label="Số tuần"');
    setPanel(null);

    setModal('export');
    expect(renderToString(<App />)).toContain('aria-label="Chốt và xuất"');
    setModal('aiDone');
    expect(renderToString(<App />)).toContain('aria-label="AI đã soạn xong"');
    setModal(null);

    poOpen(0);
    expect(renderToString(<App />)).toContain('po-box');

    setView('ver');
    const ver = renderToString(<App />);
    expect(ver).toContain('vlwrap');
    expect(ver).not.toContain('data-act="cell"');

    setView('log');
    const lg = renderToString(<App />);
    expect(lg).toContain('lxwrap');
    expect(lg).toContain('lgbar');
    expect(lg).not.toContain('data-act="cell"');
  });

  it('StatusBar: link "Xem AI soạn ra sao" chỉ khi chọn đúng 1 ô AI', () => {
    resetStore(); loadFixture(GOLD_FILE); setView('grid');
    const link = 'Xem AI soạn ra sao';
    mutate((d) => { d.sel = { i: 0, f: 'rui' }; d.range = null; });
    expect(renderToString(<StatusBar />)).toContain(link);
    mutate((d) => { d.range = { a: { i: 0, f: 'rui' }, b: { i: 1, f: 'rui' } }; });
    expect(renderToString(<StatusBar />)).not.toContain(link);
    mutate((d) => { d.range = null; d.sel = { i: 0, f: 'ma' }; });
    expect(renderToString(<StatusBar />)).not.toContain(link);
    mutate((d) => { d.sel = { i: 0, f: 'rui' }; d.panel = 'aitrace'; });
    expect(renderToString(<StatusBar />)).not.toContain(link);
    expect(getState().sel?.f).toBe('rui');
  });
});
