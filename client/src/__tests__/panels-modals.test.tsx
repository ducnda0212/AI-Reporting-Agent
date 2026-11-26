import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { getState, mutate, resetStore, rowsOf } from '@/store';
import { loadFixture, mockReportApi, seedVersions } from './fixtures';
import { pnSetWidth, pnToggleBig, pnToggleSec, setModal, setPanel, setView } from '@/store/actions/flow';
import { askSubmit, startReview, trOpen } from '@/store/actions/ai';
import { poOpen, poSetFontSize, poSetSideW, poToggleExp, poToggleGroup } from '@/store/actions/popout';
import { helpOpenPanel, helpSetQuery, helpTourStart, tourAutoStart, tourExit, tourGo } from '@/store/actions/help';
import { doLock } from '@/store/actions/versions';
import { AiAssistantPanel } from '@/components/panels/AiAssistantPanel';
import { AiTracePanel } from '@/components/panels/AiTracePanel';
import { TplConfigPanel } from '@/components/panels/TplConfigPanel';
import { ProjectPopout } from '@/components/modals/ProjectPopout';
import { ExportModal } from '@/components/modals/ExportModal';
import { AiDoneModal } from '@/components/modals/AiDoneModal';
import { HelpDrawer } from '@/components/modals/HelpDrawer';
import { Spotlight } from '@/components/layers/Spotlight';
import { HELP, TOURS } from '@/data/constants';
import { TopBar } from '@/components/layout/TopBar';
import { Rail } from '@/components/layout/Rail';
import { FormatBar } from '@/components/grid/FormatBar';
import { Grid } from '@/components/grid/Grid';
import { ImportView } from '@/views/Import/ImportView';
import { VersionsView } from '@/views/Versions/VersionsView';
import { LogView } from '@/views/Log/LogView';

const FILE = '20261125_DAN_Jira-Export-Clean-Dataset_64DA.csv';
const fresh = (): void => { resetStore(); loadFixture(FILE); };
const store = (): Record<string, string> => ({});
const stubLs = (): Record<string, string> => {
  const m = store();
  vi.stubGlobal('localStorage', { getItem: (k: string) => (k in m ? m[k] : null), setItem: (k: string, v: string) => { m[k] = String(v); }, removeItem: (k: string) => { delete m[k]; } });
  return m;
};
afterEach(() => { vi.unstubAllGlobals(); });

describe('Panel Trợ lý AI', () => {
  it('màn chào ai9: quả cầu, lời chào, 3 thẻ số, 2 dải gợi ý, không còn .seg3', () => {
    fresh();
    const h = renderToString(<AiAssistantPanel />);
    expect(h).toContain('ai9orb');
    expect(h).toContain('Trợ lý AI');
    expect(h).toContain('Chào');
    expect(h).toContain('cần gì cho');
    expect(h).toContain('Hỏi nhanh');
    expect(h).toContain('Nhờ Agent làm');
    expect(h).toContain('id="askIn"');
    expect(h).not.toContain('seg3');
    expect(h).not.toContain('aisug');
  });

  it('lệnh sửa bảng chỉ tạo bản xem trước (stages) có checkbox, "Áp dụng N thay đổi" và "Bỏ"; một hàng .aisug phía trên ô nhập', () => {
    fresh();
    const ma = rowsOf(getState())[0].ma;
    const id = askSubmit('Đổi Tiến độ của ' + ma + ' thành Chậm tiến độ');
    expect(id).toBeTruthy();
    const h = renderToString(<AiAssistantPanel />);
    expect(h).toContain('Xem trước');
    expect(h).toContain('type="checkbox"');
    expect(h).toContain('Áp dụng 1 thay đổi');
    expect(h).toContain('>Bỏ<');
    expect(h.match(/class="aisug"/g)).toHaveLength(1);
    expect(h.indexOf('aisug')).toBeLessThan(h.indexOf('id="askIn"'));
  });

  it('panel nhớ độ rộng, phóng to và gập mục qua state.pn (và ghi pmo-proto-panel-v1)', () => {
    const m = stubLs();
    fresh();
    pnSetWidth('hub', 512.4);
    expect(getState().pn.w.hub).toBe(512);
    expect(JSON.parse(m['pmo-proto-panel-v1']).w.hub).toBe(512);
    expect(renderToString(<AiAssistantPanel />)).toContain('width:512px');
    pnToggleBig('hub');
    expect(renderToString(<AiAssistantPanel />)).toContain('pnbig');
    pnToggleSec('Mục A');
    expect(getState().pn.col['Mục A']).toBe(true);
    pnToggleSec('Mục A');
    expect(getState().pn.col['Mục A']).toBeUndefined();
  });
});

describe('Panel AI soạn nháp & cấu hình mẫu', () => {
  it('AiTracePanel: 3 phần đánh số, Luật viết, 3 biến thể, JSON V-LLM và nút chân khung', () => {
    fresh();
    const r = rowsOf(getState()).find((x) => x.ai.kh)!;
    trOpen(r.i, 'kh');
    expect(getState().panel).toBe('aitrace');
    const h = renderToString(<AiTracePanel />);
    expect(h).toContain('AI đọc gì');
    expect(h).toContain('Luật viết cho cột AS');
    expect(h).toContain('Nháp AI trả về');
    for (const v of ['Ngắn hơn', 'Mặc định', 'Chi tiết hơn']) expect(h).toContain(v);
    expect(h).toContain('<details class="trreq"');
    expect(h).toContain('Xem yêu cầu gửi V-LLM');
    expect(h).toContain('Duyệt');
    expect(h).toContain('Bỏ nháp');
  });

  it('TplConfigPanel: chọn số tuần, thêm khối tuần sau, danh sách cột theo nhóm', () => {
    fresh();
    setPanel('tvcfg');
    const h = renderToString(<TplConfigPanel />);
    expect(h).toContain('Cấu hình mẫu');
    expect(h).toContain('Số tuần trong báo cáo');
    expect(h).toContain('3 tuần');
    expect(h).toContain('Thêm khối tuần sau');
    expect(h).toContain('tvpl');
  });
});

describe('ProjectPopout', () => {
  it('2 cột Linear có vách .pa-split, cỡ chữ, điều hướng, timeline milestone và báo cáo tuần', () => {
    fresh();
    poOpen(0);
    const h = renderToString(<ProjectPopout />);
    expect(h).toContain('pa-box');
    expect(h).toContain('pa-split');
    expect(h).toContain('id="poQ"');
    expect(h).toContain('pa-fz');
    expect(h).toContain('1 / ');
    expect(h).toContain('Mục tiêu');
    expect(h).toContain('Báo cáo tuần');
    expect(h).toContain('Mới nhất trước');
    expect(h).toContain('--paside:300px');
    expect(h).not.toContain('Tuần 4/11');
  });

  it('milestone dạng dòng thời gian khi có dữ liệu; chữ dài rút gọn + "Xem thêm", mở ra thì "Thu gọn"', () => {
    fresh();
    const i = rowsOf(getState()).findIndex((r) => r.milestone && /\d+\/\d+\s*:/.test(r.milestone));
    expect(i).toBeGreaterThanOrEqual(0);
    const ri = rowsOf(getState())[i].i;
    mutate((d) => { d.allRows[ri].kpi = 'KPI dài. '.repeat(40); });
    poOpen(ri);
    let h = renderToString(<ProjectPopout />);
    expect(h).toContain('pa-ms');
    expect(h).toContain('Xem thêm');
    poToggleExp('kpi');
    h = renderToString(<ProjectPopout />);
    expect(h).toContain('Thu gọn');
  });

  it('writer cỡ chữ / vách kéo / gập mục: lưu pmo-po-fz, pmo-po-sidew; nhấp đúp về 300', () => {
    const m = stubLs();
    fresh(); poOpen(0);
    poSetFontSize(2);
    expect(getState().po.fz).toBe(16);
    expect(m['pmo-po-fz']).toBe('16');
    poSetSideW(420);
    expect(getState().po.sideW).toBe(420);
    expect(m['pmo-po-sidew']).toBe('420');
    expect(renderToString(<ProjectPopout />)).toContain('--paside:420px');
    poSetSideW(null);
    expect(getState().po.sideW).toBe(300);
    poToggleGroup('info');
    expect(renderToString(<ProjectPopout />)).toContain('aria-expanded="false"');
  });

  it('không vẽ gì khi chưa mở', () => {
    fresh();
    expect(renderToString(<ProjectPopout />)).toBe('');
  });
});

describe('ExportModal, AiDoneModal', () => {
  it('Chốt & xuất: 3 bước Kiểm tra → Chốt bản vN → Xuất file, không lỗi chặn, không Word/PDF/Báo cáo điều hành', () => {
    fresh();
    setModal('export');
    const h = renderToString(<ExportModal />);
    expect(h).toContain('Chốt &amp; xuất');
    expect(h).toContain('Kiểm tra');
    expect(h).toContain('Chốt bản v');
    expect(h).toContain('Xuất file');
    expect(h).toContain('id="lockBy"');
    expect(h).not.toContain('lỗi chặn — phải xử lý');
    for (const w of ['Báo cáo điều hành', 'Word', 'PDF']) expect(h).not.toContain(w);
  });

  it('sau khi chốt: tên file mặc định theo ngày báo cáo, nút "Xuất file từ vN", chọn cột xuất', async () => {
    fresh();
    mockReportApi();
    setModal('export');
    await doLock('Khuê', '');
    const h = renderToString(<ExportModal />);
    expect(h).toContain('Xuất báo cáo');
    expect(h).toContain('20261120_DAN_Bao-cao-PMO.xlsx');
    expect(h).toContain('cột AR–AT');
    expect(h).toContain('Xuất file từ v');
    expect(h).toContain('Đủ 49 cột theo mẫu');
    expect(h).toContain('Cột đang hiển thị');
  });

  it('không vẽ khi modal khác; AiDoneModal vẽ khi state.modal = aiDone', () => {
    fresh();
    expect(renderToString(<ExportModal />)).toBe('');
    expect(renderToString(<AiDoneModal />)).toBe('');
    mutate((d) => { d.modal = 'aiDone'; });
    expect(renderToString(<AiDoneModal />)).toContain('AI đã soạn xong');
    expect(renderToString(<AiDoneModal />)).toContain('Duyệt từng ô ngay');
  });
});

describe('HelpDrawer, Spotlight, tour', () => {
  it('HelpDrawer: 3 bước, 6 mục theo màn hình, phím tắt; tìm kiếm thu gọn còn mục khớp', () => {
    fresh();
    helpOpenPanel();
    let h = renderToString(<HelpDrawer />);
    expect(h).toContain('Mỗi tuần làm 3 bước');
    expect(h).toContain('id="hpQ"');
    expect(h).toContain('Phím tắt');
    for (const t of HELP) expect(h).toContain(t.t.replace(/&/g, '&amp;'));
    helpSetQuery('so sánh');
    h = renderToString(<HelpDrawer />);
    expect(h).not.toContain('Mỗi tuần làm 3 bước');
    expect(h).toContain('Phiên bản');
  });

  it('Spotlight: ẩn khi không chạy; hiện thẻ tour 1/N; hiện thẻ "Duyệt nháp AI · 1/n" khi review', () => {
    fresh();
    expect(renderToString(<Spotlight />)).toBe('<div id="spot"></div>');
    helpTourStart('all');
    let h = renderToString(<Spotlight />);
    expect(h).toContain('Hướng dẫn · 1/' + TOURS.all.length);
    expect(h).toContain('Bắt đầu →');
    tourExit();
    mutate((d) => { d.allRows.forEach((r) => { r.ai.kh = { text: 'x', why: 'w', src: 's', ok: false }; }); });
    startReview();
    h = renderToString(<Spotlight />);
    expect(h).toContain('Duyệt nháp AI · 1/');
    expect(h).toContain('Duyệt &amp; tiếp →');
    expect(h).toContain('AI soạn ra sao?');
  });

  it('tour lần đầu: bước Bảng cần dữ liệu, nạp mẫu xong vẫn ở màn Bảng', () => {
    stubLs();
    resetStore();
    tourAutoStart();
    tourGo(3); // grid-head
    expect(getState().view).toBe('grid');
    expect(getState().loaded).toBe(false);
    expect(getState().allRows).toEqual([]); // không tự nạp dữ liệu mẫu nữa
  });

  it('tour: ghi nhớ đã xem (pmo-tour-v1), chỉ tự chạy lần đầu', () => {
    const m = stubLs();
    fresh();
    expect(getState().tour).toBeNull();
    tourAutoStart();
    expect(getState().tour).toBe(0);
    tourGo(99);
    expect(getState().tour).toBeNull();
    expect(m['pmo-tour-v1']).toBe('1');
    tourAutoStart();
    expect(getState().tour).toBeNull();
    helpTourStart('grid');
    tourExit();
    expect(getState().tour).toBeNull();
  });

  it('selector của mọi bước tour có mặt trong DOM React thật (TopBar, Grid, FormatBar, Rail, trang Nhập/Phiên bản/Nhật ký)', () => {
    fresh();
    setView('grid');
    const dom = renderToString(<><TopBar /><Rail /><FormatBar /><Grid /></>);
    const has: Record<string, string[]> = {
      'nav[aria-label="Các bước"]': ['aria-label="Các bước"'], thead: ['<thead'], 'th:has([data-f="tt"])': ['data-f="tt"'],
      '.cell[data-f="tt"]': ['data-f="tt"'], '.fbar': ['class="fbar'], '[data-act="menu"][data-m="cols"]': ['data-m="cols"'], '.aichip': ['aichip'],
      '[data-act="modal"][data-m="export"]': ['data-m="export"'], '[data-act="view"][data-v="ver"]': ['data-v="ver"']
    };
    const other: Record<string, string> = { '#dropzone': 'id="dropzone"', '.vb': 'class="vb"', '.vlt': 'class="vlt"', '.lgbar': 'class="lgbar"', '.akq': 'akq', '.akbox': 'akbox' };
    for (const k of Object.keys(TOURS) as (keyof typeof TOURS)[]) {
      for (const st of TOURS[k]) {
        if (!st.sel) continue;
        const need = has[st.sel];
        if (need) need.forEach((n) => expect(dom, st.sel).toContain(n));
        else expect(other[st.sel], 'selector chưa được kiểm: ' + st.sel).toBeTruthy();
      }
    }
    resetStore();
    expect(renderToString(<ImportView />)).toContain(other['#dropzone']);
    fresh(); seedVersions();
    expect(renderToString(<VersionsView />)).toContain('class="vb"');
    expect(renderToString(<VersionsView />)).toContain('class="vlt"');
    const lg = renderToString(<LogView />);
    for (const n of ['lgbar', 'akq', 'akbox']) expect(lg).toContain(n);
  });

  it('tour lite: không còn chữ trái UI (bấm tên cột, Enter để sửa, Bốn bước)', () => {
    const txt = JSON.stringify(TOURS) + JSON.stringify(HELP);
    expect(txt).not.toContain('Bấm tên cột');
    expect(txt).not.toContain('nhấn Enter) để sửa');
    expect(txt).not.toContain('Bốn bước');
  });
});
