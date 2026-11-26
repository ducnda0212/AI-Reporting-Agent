import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { getState, mutate, resetStore, rowsOf } from '@/store';
import {
  fillCount, histToggle, impCancel, lgReset, lgSetF, lgSetQ, lgSetW, pvGo, pvSetFs, pvSetSheet, pvStage,
  setImpF, setReplaceFile, setView, themeToggle
} from '@/store/actions/flow';
import { doLock, verOpen, vlEdit, vlTogExpand, wkHist, wkOpen } from '@/store/actions/versions';
import { TopBar } from '@/components/layout/TopBar';
import { Rail } from '@/components/layout/Rail';
import { StatusBar } from '@/components/layout/StatusBar';
import { EditBanner } from '@/components/layout/EditBanner';
import { Toast } from '@/components/layout/Toast';
import { RiskText, textHasRisk } from '@/components/common/RiskText';
import { ImportView } from '@/views/Import/ImportView';
import { FilePreviewModal } from '@/views/Import/FilePreviewModal';
import { VersionsView } from '@/views/Versions/VersionsView';
import { LogView } from '@/views/Log/LogView';
import { api } from '@/services/api';
import { fixtureResponse, loadFixture, mockReportApi, seedVersions } from './fixtures';

const csvFile = (name: string, text: string) => ({ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer });

describe('Layout Shell & Views SSR', () => {
  it('WeekPicker lấy tháng theo kỳ (cycleId), không theo ngày thật: 31/12 thuộc Tuần 1 tháng 1', () => {
    resetStore();
    mutate((d) => {
      d.loaded = true; d.view = 'grid'; d.cycleId = '2027_01_w1'; d.activeToday = '2026-12-31';
      d.weeks = [{ k: 'w1', name: 'Tuần 01/01', range: '31/12–06/01', cur: true, future: false, start: '2026-12-31', end: '2027-01-06' }] as never;
    });
    const top = renderToString(<TopBar />);
    expect(top).toContain('Th1<');
    expect(top).not.toContain('Th12');
  });
  it('TopBar hiển thị đúng 3 bước và Rail chỉ có 3 mục Bảng, Phiên bản, Nhật ký', () => {
    resetStore();
    loadFixture();
    const top = renderToString(<TopBar />);
    expect(top).toContain('Nhập file');
    expect(top).toContain('Bảng · điền &amp; duyệt');
    expect(top).toContain('Chốt &amp; xuất');
    expect(top).not.toContain('Kiểm tra dữ liệu');
    expect(top).toContain('Xuất báo cáo');
    expect(top).not.toContain('class="wkp"'); // đang ở màn nhập file: ẩn chọn tuần

    const rail = renderToString(<Rail />);
    expect(rail).toContain('Bảng');
    expect(rail).toContain('Phiên bản');
    expect(rail).toContain('Nhật ký');
    expect(rail).not.toContain('Điều hành');
    expect(rail).not.toContain('Rủi ro');
    expect(rail).not.toContain('Mẫu BC');
    expect(rail.match(/class="ri/g)).toHaveLength(3);
  });

  it('ImportView, VersionsView (kèm SVG chart) và LogView render sạch', () => {
    resetStore();
    expect(renderToString(<ImportView />)).toContain('Nhập file Jira');
    loadFixture('x.csv');
    const imp = renderToString(<ImportView />);
    expect(imp).toContain('Mở bảng báo cáo');
    expect(imp).toContain('49 cột · lấy từ đâu, kèm giá trị mẫu');
    expect(imp).toContain('<b>112</b>');
    expect(imp).toContain('Phòng chịu trách nhiệm'); // đủ 49 cột
    expect(imp).toContain('class="mpbar"');
    expect(imp).toContain('class="sel issel"');
    seedVersions();
    const verHtml = renderToString(<VersionsView />);
    expect(verHtml).toContain('vbsvg');
    expect(verHtml).toContain('Mở trên bảng');
    const logHtml = renderToString(<LogView />);
    expect(logHtml).toContain('Nhật ký');
    expect(logHtml).toContain('Nhập file Jira');
    expect(logHtml).toContain('lgav sys');
  });

  it('màn Đang đọc theo công thức impLoadA của prototype, số liệu thật', () => {
    resetStore();
    const found = { issues: 125, cols: 90, dupGroups: 3, projects: 56, orphans: 12, newCodes: 2 };
    mutate((d) => { d.importing = { name: 'a.csv', step: 0 }; });
    const wait = renderToString(<ImportView />);
    expect(wait).toContain('skel');
    expect(wait).not.toContain('Xem tóm tắt ngay');
    expect(wait.match(/Đang xử lý…/g)).toHaveLength(1);
    expect(wait.match(/class="lst ok"/g)).toBeNull();

    mutate((d) => { d.importing = { name: 'a.csv', step: 2, found }; });
    const mid = renderToString(<ImportView />);
    expect(mid).toContain('90 cột, 125 issue');
    expect(mid).toContain('3 nhóm cột đã gộp');
    expect(mid).not.toContain('56 dự án ghép được'); // bước 3 chưa xong
    expect(mid.match(/class="lst ok"/g)).toHaveLength(2);
    expect(mid.match(/Đang xử lý…/g)).toHaveLength(1);
    expect(mid.match(/Chờ/g)).toHaveLength(1);
    for (const v of ['>125</b>', '>90</b>', '>3</b>']) expect(mid).toContain(v);
    expect(mid).not.toContain('>56</b>');
    expect(mid.match(/class="skel"/g)).toHaveLength(3);
    expect(mid).toContain('aria-valuenow="63"');
    expect(mid).toContain('Xem tóm tắt ngay');

    mutate((d) => { d.importing = { name: 'a.csv', step: 4, found }; });
    const all = renderToString(<ImportView />);
    expect(all.match(/class="lst ok"/g)).toHaveLength(4);
    expect(all).toContain('56 dự án ghép được, 12 issue chưa có mã');
    expect(all).toContain('2 mã mới');
    expect(all).toContain('class="e">12</b>');
    expect(all).toContain('class="w">2</b>');
    expect(all).not.toContain('skel');
    expect(all).toContain('aria-valuenow="100"');

    mutate((d) => { d.importing = { name: 'a.csv', step: 4, found: { ...found, newCodes: null } }; });
    const first = renderToString(<ImportView />);
    expect(first).toContain('Chưa có file tuần trước để so');
    expect(first).toContain('>—</b>');
  });

  it('màn Đang đọc, Thay file, lọc cột ở bước 1', () => {
    resetStore();
    mutate((d) => { d.importing = { name: 'a.csv', step: 2 }; });
    const ld = renderToString(<ImportView />);
    expect(ld).toContain('Đang đọc file Jira');
    expect(ld).toContain('Huỷ, chọn file khác');
    impCancel();
    expect(getState().importing).toBeNull();
    expect(getState().toast).toBe('Đã huỷ đọc file');

    loadFixture('x.csv');
    setReplaceFile(true);
    expect(renderToString(<ImportView />)).toContain('Thay file Jira');
    setReplaceFile(false);
    setImpF('low');
    expect(getState().impF).toBe('low');
    expect(renderToString(<ImportView />)).toMatch(/class="ispill on">Thiếu dữ liệu/);
    histToggle();
    expect(getState().histOpen).toBe(true);
  });

  it('StatusBar, EditBanner, Toast, RiskText', () => {
    resetStore();
    expect(renderToString(<StatusBar />)).toBe('');
    loadFixture('x.csv');
    setView('grid');
    const sb = renderToString(<StatusBar />);
    expect(sb).toContain(rowsOf(getState()).length + ' dòng · 49 cột');
    expect(sb).toContain('100%');
    expect(sb).not.toContain('ftcell');
    expect(sb).not.toContain('ô bắt buộc còn trống');

    mutate((d) => { d.toast = 'Đã lưu'; });
    expect(renderToString(<Toast />)).toContain('Đã lưu');

    resetStore();
    loadFixture('x.csv');
    seedVersions();
    vlEdit('w2|2');
    expect(renderToString(<EditBanner />)).toContain('Đang sửa tiếp Bản 2 · Tuần 02/11 · 07–14/11');

    expect(textHasRisk('Chậm review thiết kế')).toBe(true);
    expect(renderToString(<RiskText text="Không có" />)).toContain('pl none');
    expect(renderToString(<RiskText text="Vendor giao trễ" oneLine />)).toContain('<b class="rk">trễ</b>');
  });

  it('VersionsView: bấm dòng xổ 5 chỉ số; LogView: lọc loại, người, tìm', () => {
    resetStore();
    loadFixture('x.csv');
    seedVersions();
    vlTogExpand('w2|2');
    const v = renderToString(<VersionsView />);
    expect(v).toContain('vloks');
    expect(v).toContain('Mở trên bảng tính →');
    expect(v.match(/class="vlok"/g)).toHaveLength(5);

    lgSetF('ai');
    expect(renderToString(<LogView />)).toContain('khớp bộ lọc');
    lgSetF('data'); lgSetW('Tự động');
    expect(renderToString(<LogView />)).toContain('Nhập file Jira');
    expect(renderToString(<LogView />)).toContain('Bỏ lọc');
    lgReset();
    expect([getState().lgF, getState().lgW]).toEqual(['', '']);
    lgSetQ('không có gì như vậy');
    expect(renderToString(<LogView />)).toContain('Không có hoạt động nào khớp bộ lọc.');
  });
});

describe('Hành động mới cho bước 1, chọn tuần, nhật ký, giao diện', () => {
  it('pvStage: sai đuôi báo lỗi; CSV đọc xong thì xem trước, đổi sheet, mở toàn màn hình, đọc file này', async () => {
    resetStore();
    await pvStage(csvFile('a.pdf', 'x'));
    expect(getState().pv).toBeNull();
    expect(getState().toast).toBe('Chỉ nhận file CSV hoặc Excel (.csv, .xlsx, .xls)');

    await pvStage({ name: 'big.csv', size: 61 * 1048576, arrayBuffer: async () => new ArrayBuffer(0) });
    expect(getState().pv?.err).toBe('File lớn hơn 60 MB, không xem trước được.');

    await pvStage(csvFile('jira.csv', 'Summary,Status\nI.A.3.1 Việc,DONE\n'));
    const pv = getState().pv!;
    expect([pv.loading, pv.kind, pv.sheets?.[0].nData]).toEqual([false, 'csv', 1]);
    expect(renderToString(<ImportView />)).toContain('Đọc file này');
    pvSetSheet(0); pvSetFs(true);
    expect([getState().pvSheet, getState().pvFs]).toEqual([0, true]);
    const fs = renderToString(<FilePreviewModal />);
    expect(fs).toContain('id="pvfs"');
    expect(fs).toContain('id="pvaddr"');
    expect(fs).toContain('id="pvval"');
    expect(fs).toContain('id="pvq"');
    expect(fs).toContain('pvf-close');
    expect(fs).not.toContain('pvf-back');
    expect(fs).not.toContain('Quay lại');
    pvSetFs(false);
    expect(renderToString(<FilePreviewModal />)).toBe('');
    const up = vi.spyOn(api, 'ingestUpload').mockResolvedValue(fixtureResponse('jira.csv'));
    await pvGo();
    expect(up).toHaveBeenCalledOnce();
    up.mockRestore();
    expect(getState().pv?.done).toBe(true);
    expect([getState().loaded, getState().fileName]).toEqual([true, 'jira.csv']);
    await pvStage(undefined);
    expect(getState().toast).toBe('Không thấy file nào được thả vào');
  });

  it('kết quả đọc của lần chọn cũ bị bỏ khi đã chọn file khác', async () => {
    resetStore();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const slow = pvStage({ name: 'old.csv', size: 4, arrayBuffer: async () => { await gate; return new TextEncoder().encode('A\n1\n').buffer as ArrayBuffer; } });
    await pvStage(csvFile('new.csv', 'B\n2\n'));
    release(); await slow;
    expect([getState().pv?.name, getState().pv?.sheets?.[0].rows[0][0]]).toEqual(['new.csv', 'B']);
  });

  it('Thay file khác bỏ file xem trước; nạp file tắt chế độ thay file', async () => {
    resetStore();
    loadFixture('x.csv');
    await pvStage(csvFile('b.csv', 'A\n1\n'));
    setReplaceFile(true);
    expect([getState().replaceFile, getState().pv]).toEqual([true, null]);
    loadFixture('y.csv');
    expect(getState().replaceFile).toBe(false);
  });

  it('verOpen: bản không có dữ liệu báo lỗi; bản đã chốt mở lại trên bảng', async () => {
    resetStore();
    await verOpen('w2|2');
    expect(getState().toast).toBe('Bản này không có dữ liệu để mở lại');
    loadFixture('x.csv');
    mockReportApi();
    await doLock('Khuê', '');
    const k = getState().verSel!;
    setView('import');
    await verOpen(k);
    expect([getState().view, getState().openedVer]).toEqual(['grid', k]);
    expect(getState().toast).toMatch(/^Đã mở bản v/);
  });

  it('wkOpen / wkHist, fillCount, themeToggle', () => {
    resetStore();
    seedVersions();
    mutate((d) => { d.menu = 'week'; });
    wkOpen('w3');
    expect([getState().menu, getState().view]).toEqual([null, 'import']);
    wkOpen('w2');
    expect([getState().view, getState().verSel]).toEqual(['ver', 'w2|2']);
    expect(getState().toast).toBe('Tuần đã chốt chỉ xem, không sửa — đang mở bản v2');
    resetStore(); wkHist();
    expect(getState().view).toBe('ver');

    expect(fillCount(getState())).toBe(0);
    loadFixture('x.csv');
    expect(fillCount(getState())).toBeGreaterThan(0); // mọi nháp AI đang chờ duyệt

    expect(themeToggle()).toBe('dark'); // node: theme hiện tại mặc định 'light'
    expect(getState().toast).toBe('Đã chuyển sang giao diện tối');
  });
});
