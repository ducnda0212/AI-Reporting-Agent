import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { getState, mutate, resetStore, rowsOf } from '@/store';
import {
  enterTest, fillCount, histToggle, impCancel, lgReset, lgSetF, lgSetQ, lgSetW, loadFileNow, pvGo, pvSetFs, pvSetSheet, pvStage,
  setImpF, setReplaceFile, setView, themeToggle
} from '@/store/actions/flow';
import { doLock, verOpen, vlEdit, vlTogExpand, wkHist, wkOpen } from '@/store/actions/versions';
import { TopBar } from '@/components/layout/TopBar';
import { Rail } from '@/components/layout/Rail';
import { StatusBar } from '@/components/layout/StatusBar';
import { TestBanner } from '@/components/layout/TestBanner';
import { EditBanner } from '@/components/layout/EditBanner';
import { Toast } from '@/components/layout/Toast';
import { RiskText, textHasRisk } from '@/components/common/RiskText';
import { ImportView } from '@/views/Import/ImportView';
import { FilePreviewModal } from '@/views/Import/FilePreviewModal';
import { VersionsView } from '@/views/Versions/VersionsView';
import { LogView } from '@/views/Log/LogView';

const csvFile = (name: string, text: string) => ({ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer as ArrayBuffer });

describe('Layout Shell & Views SSR', () => {
  it('TopBar hiển thị đúng 3 bước và Rail chỉ có 3 mục Bảng, Phiên bản, Nhật ký', () => {
    resetStore();
    loadFileNow('20261125_DAN_Jira-Export-Clean-Dataset_64DA.csv');
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
    loadFileNow('x.csv');
    const imp = renderToString(<ImportView />);
    expect(imp).toContain('Mở bảng báo cáo');
    expect(imp).toContain('42 cột · lấy từ đâu, kèm giá trị mẫu');
    expect(imp).toContain('<b>112</b>');
    expect(imp).not.toContain('Phòng chịu trách nhiệm'); // NO_JIRA bị ẩn
    const verHtml = renderToString(<VersionsView />);
    expect(verHtml).toContain('vbsvg');
    expect(verHtml).toContain('Mở trên bảng');
    const logHtml = renderToString(<LogView />);
    expect(logHtml).toContain('Nhật ký');
    expect(logHtml).toContain('Nhập file Jira');
    expect(logHtml).toContain('lgav sys');
  });

  it('màn Đang đọc, Thay file, lọc cột ở bước 1', () => {
    resetStore();
    mutate((d) => { d.importing = { name: 'a.csv', step: 2 }; });
    const ld = renderToString(<ImportView />);
    expect(ld).toContain('Đang đọc file Jira');
    expect(ld).toContain('4 nhóm cột đã gộp');
    expect(ld).toContain('Huỷ, chọn file khác');
    impCancel();
    expect(getState().importing).toBeNull();
    expect(getState().toast).toBe('Đã huỷ đọc file');

    loadFileNow('x.csv');
    setReplaceFile(true);
    expect(renderToString(<ImportView />)).toContain('Thay file Jira');
    setReplaceFile(false);
    setImpF('low');
    expect(getState().impF).toBe('low');
    expect(renderToString(<ImportView />)).toMatch(/class="ispill on">Thiếu dữ liệu/);
    histToggle();
    expect(getState().histOpen).toBe(true);
  });

  it('StatusBar, TestBanner, EditBanner, Toast, RiskText', () => {
    resetStore();
    expect(renderToString(<StatusBar />)).toBe('');
    loadFileNow('x.csv');
    setView('grid');
    const sb = renderToString(<StatusBar />);
    expect(sb).toContain(rowsOf(getState()).length + ' dòng · 49 cột');
    expect(sb).toContain('100%');
    expect(sb).not.toContain('ftcell');
    expect(sb).not.toContain('ô bắt buộc còn trống');

    enterTest('risk');
    expect(renderToString(<TestBanner />)).toContain('CHẾ ĐỘ TEST');
    expect(renderToString(<Toast />)).toContain('Chế độ test · Nhiều rủi ro');

    resetStore();
    vlEdit('w2|2');
    expect(renderToString(<EditBanner />)).toContain('Đang sửa tiếp Bản 2 · Tuần 02/11 · 07–14/11');

    expect(textHasRisk('Chậm review thiết kế')).toBe(true);
    expect(renderToString(<RiskText text="Không có" />)).toContain('pl none');
    expect(renderToString(<RiskText text="Vendor giao trễ" oneLine />)).toContain('<b class="rk">trễ</b>');
  });

  it('VersionsView: bấm dòng xổ 5 chỉ số; LogView: lọc loại, người, tìm', () => {
    resetStore();
    loadFileNow('x.csv');
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
    pvSetFs(false);
    expect(renderToString(<FilePreviewModal />)).toBe('');
    pvGo();
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
    loadFileNow('x.csv');
    await pvStage(csvFile('b.csv', 'A\n1\n'));
    setReplaceFile(true);
    expect([getState().replaceFile, getState().pv]).toEqual([true, null]);
    loadFileNow('y.csv');
    expect(getState().replaceFile).toBe(false);
  });

  it('verOpen: bản không có dữ liệu báo lỗi; bản đã chốt mở lại trên bảng', () => {
    resetStore();
    verOpen('w2|2');
    expect(getState().toast).toBe('Bản này không có dữ liệu để mở lại');
    loadFileNow('x.csv');
    doLock('Khuê', '');
    const k = getState().verSel!;
    setView('import');
    verOpen(k);
    expect([getState().view, getState().openedVer]).toEqual(['grid', k]);
    expect(getState().toast).toMatch(/^Đã mở bản v/);
  });

  it('wkOpen / wkHist, fillCount, themeToggle', () => {
    resetStore();
    mutate((d) => { d.menu = 'week'; });
    wkOpen('w3');
    expect([getState().menu, getState().view]).toEqual([null, 'import']);
    wkOpen('w2');
    expect([getState().view, getState().verSel]).toEqual(['ver', 'w2|2']);
    expect(getState().toast).toBe('Tuần đã chốt chỉ xem, không sửa — đang mở bản v2');
    resetStore(); wkHist();
    expect(getState().view).toBe('ver');

    expect(fillCount(getState())).toBe(0);
    loadFileNow('x.csv');
    expect(fillCount(getState())).toBeGreaterThan(0); // mọi nháp AI đang chờ duyệt
    enterTest('many');
    expect(fillCount(getState())).toBe(0);

    expect(themeToggle()).toBe('dark'); // node: theme hiện tại mặc định 'light'
    expect(getState().toast).toBe('Đã chuyển sang giao diện tối');
  });
});
