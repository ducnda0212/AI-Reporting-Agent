import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '@/App';
import { store, useStore } from '@/store';
import { loadFile } from '@/store/actions/flow';
import { cleanText, mapNorm } from '@/lib/text';
import type { ViewId } from '@/store/types';

describe('lib/text', () => {
  it('cleanText chuẩn hoá gạch đầu dòng và wiki', () => {
    expect(cleanText('* *Tiến độ:*\r\n- xong -> ok')).toBe('• Tiến độ:\n• Xong → ok');
  });
  it('mapNorm khớp Status viết khác kiểu', () => {
    expect(mapNorm({ 'IN PROGRESS': 'Đang thực hiện' }, 'in_progress')).toBe('Đang thực hiện');
  });
});

// SSR của zustand đọc getInitialState; ở đây muốn render theo state hiện tại
(store as unknown as { getInitialState: () => unknown }).getInitialState = store.getState;

describe('App smoke', () => {
  it('render được mọi màn hình khi chưa nạp và đã nạp dữ liệu', () => {
    const views: ViewId[] = ['import', 'check', 'grid', 'exec', 'cat', 'log', 'tpl', 'ver'];
    views.forEach((v) => { useStore.setState({ view: v, tour: null }); expect(renderToString(<App />).length).toBeGreaterThan(100); });
    loadFile('x.csv', true);
    expect(useStore.getState().loaded).toBe(true);
    views.forEach((v) => { useStore.setState({ view: v, tour: null }); expect(renderToString(<App />).length).toBeGreaterThan(100); });
    useStore.setState({ view: 'grid', panel: 'issues' });
    expect(renderToString(<App />)).toContain('Cảnh báo');
    useStore.setState({ panel: 'ai' });
    expect(renderToString(<App />)).toContain('Nháp AI');
    useStore.setState({ panel: 'project', panelRow: 0 });
    expect(renderToString(<App />)).toContain('giai đoạn');
  });
});
