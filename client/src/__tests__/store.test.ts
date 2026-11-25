import { beforeEach, describe, expect, it } from 'vitest';
import { getState, resetStore, setNow } from '@/store';
import * as F from '@/store/actions/flow';
import * as G from '@/store/actions/grid';
import * as AI from '@/store/actions/ai';
import * as P from '@/store/actions/popout';
import * as V from '@/store/actions/versions';
import * as H from '@/store/actions/help';
import { cellValue, fieldById, sourceValue } from '@/lib/cell';
import type { AppState, Row } from '@/types';

const GOLD_FILE = '20261125_DAN_Jira-Export-Clean-Dataset_64DA.csv';
const byCode = (ma: string): Row => getState().allRows.find((r) => r.ma === ma)!;
const dataKeys = (s: AppState) => ({
  allRows: s.allRows, realOnly: s.realOnly, phaseBucket: s.phaseBucket, unsorted: s.unsorted,
  newCodes: s.newCodes, dupMerged: s.dupMerged, test: s.test
});

describe('Store · luồng 3 bước, nạp dữ liệu GOLD', () => {
  beforeEach(() => { resetStore(); setNow(() => new Date(2026, 10, 20, 9, 5)); });

  it('goStep chỉ nhận 1 (import), 3 (grid), 4 (export); chưa nạp thì báo nhập file trước', () => {
    F.goStep(3);
    expect(getState().view).toBe('import');
    expect(getState().toast).toBe('Chưa có dữ liệu — nhập file ở bước 1 trước');

    F.loadFileNow(GOLD_FILE);
    const s = getState();
    expect(s.loaded).toBe(true);
    expect(s.realOnly).toBe(true);
    expect(s.allRows.length).toBe(56);
    /* mỗi dòng có đủ 3 nháp AI, tất cả chờ duyệt (prototype pfApply · realOnly) */
    expect(s.allRows.every((r) => (['rui', 'kh', 'vd'] as const).every((k) => r.ai[k] && r.ai[k]!.ok === false))).toBe(true);
    /* cột hệ thống (cfg) có giá trị trên dòng */
    expect(byCode('I.A.3.1').mang).toBe('I.A.3.PAI – Cá nhân hóa trải nghiệm cho từng khách');
    expect(s.log[0]).toMatchObject({ a: 'Nhập file Jira', o: GOLD_FILE, r: 'Cảnh báo', t: '09:05', day: '20/11/2026', seq: 1 });
    expect(s.undoStack).toEqual([]); // nạp file không phải một bước hoàn tác

    F.goStep(3);
    expect(getState().view).toBe('grid');
    expect(F.curStep(getState())).toBe(3);
    F.goStep(4);
    expect(getState().modal).toBe('export');
    expect(F.curStep(getState())).toBe(4);
    F.goStep(1);
    expect(getState().view).toBe('import');
    expect(getState().modal).toBeNull();
    expect(F.curStep(getState())).toBe(1);
  });

  it('navGo quay lại / tiến tới màn trước (lịch sử 50 bước)', () => {
    F.loadFileNow(GOLD_FILE);
    F.setView('grid');
    F.setView('log');
    F.navGo(-1);
    expect(getState().view).toBe('grid');
    F.navGo(1);
    expect(getState().view).toBe('log');
    for (let k = 0; k < 60; k++) F.setView(k % 2 ? 'grid' : 'log');
    expect(getState().nav.st.length).toBe(50);
  });
});

describe('Store · chế độ dữ liệu thử', () => {
  beforeEach(() => { resetStore(); setNow(() => new Date(2026, 10, 20, 9, 5)); F.loadFileNow(GOLD_FILE); });

  it('enterTest(dirty) rồi exitTest khôi phục đúng dữ liệu GOLD', () => {
    const before = dataKeys(getState());
    F.enterTest('dirty');
    expect(getState().test).toBe('dirty');
    expect(getState().realOnly).toBe(false);
    expect(getState().allRows[0].raw).toBeDefined();
    F.exitTest();
    expect(getState().test).toBeNull();
    expect(getState().allRows[0].raw).toBeUndefined();
    expect(dataKeys(getState())).toEqual(before);
  });

  it('mọi kịch bản, kể cả đổi qua lại giữa các kịch bản, thoát ra đều khôi phục nguyên trạng', () => {
    const before = dataKeys(getState());
    const check: Record<string, () => void> = {
      dirty: () => expect(getState().allRows.some((r) => r.raw?.ht && r.raw.ht !== r.ht)).toBe(true),
      risk: () => expect(getState().allRows[0].comment.startsWith('Risk: ')).toBe(true),
      perfect: () => expect(getState().realOnly).toBe(true),
      errors: () => expect(getState().allRows.every((r) => r.ai.vd && !r.ai.vd.ok)).toBe(true),
      many: () => expect(getState().allRows.every((r) => r.ai.rui?.ok && r.ai.kh?.ok && r.ai.vd?.ok)).toBe(true)
    };
    (['dirty', 'risk', 'perfect', 'errors', 'many'] as const).forEach((sc) => {
      F.enterTest(sc);
      expect(getState().test).toBe(sc);
      check[sc]();
      F.exitTest();
      expect(dataKeys(getState())).toEqual(before);
    });
    F.enterTest('dirty'); F.enterTest('risk'); F.testReseed();
    expect(getState().test).toBe('risk');
    F.exitTest();
    expect(dataKeys(getState())).toEqual(before);
  });
});

describe('Store · Agent xem trước, hoàn tác 100 bước', () => {
  beforeEach(() => { resetStore(); setNow(() => new Date(2026, 10, 20, 9, 5)); F.loadFileNow(GOLD_FILE); });

  it('askSubmit chỉ tạo bản xem trước; bảng đổi sau stgApply, và một lần undo hoàn tác', () => {
    const r0 = byCode('I.A.3.1');
    const rowsBefore = getState().allRows;
    const id = AI.askSubmit('Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ');
    expect(id).toBeTruthy();
    expect(getState().stages[id!]).toMatchObject({ st: 'open', items: [{ i: r0.i, f: 'td', from: 'Đúng tiến độ', to: 'Chậm tiến độ', kind: 'edit' }] });
    expect(getState().allRows).toBe(rowsBefore); // chưa áp dụng: dòng không đổi
    expect(getState().log[0]).toMatchObject({ a: 'Hỏi AI', o: 'Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ' });

    const nUndo = getState().undoStack.length;
    AI.stgApply(id!);
    expect(byCode('I.A.3.1').ovr.td).toBe('Chậm tiến độ');
    expect(getState().stages[id!]).toMatchObject({ st: 'applied', n: 1 });
    expect(getState().undoStack.length).toBe(nUndo + 1);
    G.undo();
    expect(byCode('I.A.3.1').ovr.td).toBeUndefined();
    G.redo();
    expect(byCode('I.A.3.1').ovr.td).toBe('Chậm tiến độ');
  });

  it('nhiều ô trong một bản xem trước = một bước hoàn tác', () => {
    const id = AI.askSubmit('Duyệt hết nháp của I.A.3.1')!;
    expect(getState().stages[id].items.map((x) => x.kind)).toEqual(['approve', 'approve', 'approve']);
    const nUndo = getState().undoStack.length;
    AI.stgApply(id);
    expect(getState().undoStack.length).toBe(nUndo + 1);
    expect((['rui', 'kh', 'vd'] as const).every((k) => byCode('I.A.3.1').ai[k]!.ok)).toBe(true);
    G.undo();
    expect((['rui', 'kh', 'vd'] as const).every((k) => !byCode('I.A.3.1').ai[k]!.ok)).toBe(true);
  });

  it('bỏ tick / bỏ bản xem trước không đổi bảng; sửa trùng giá trị báo không có thay đổi', () => {
    const id = AI.askSubmit('Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ')!;
    AI.stgToggle(id, 0);
    expect(getState().stages[id].items[0].off).toBe(true);
    const rows = getState().allRows;
    AI.stgDrop(id);
    expect(getState().stages[id].st).toBe('dropped');
    expect(getState().allRows).toBe(rows);

    expect(AI.askSubmit('Đổi Tiến độ của I.A.3.1 thành Đúng tiến độ')).toBeNull();
    expect(getState().askLog[getState().askLog.length - 1].a.html).toBe('Không có gì cần thay đổi.');
  });

  it('ẩn cột / lọc dòng cần sửa qua chat áp dụng ngay, ghi nhật ký', () => {
    expect(AI.askSubmit('Ẩn cột Note')).toBeNull();
    expect(getState().hidden.note).toBe(true);
    expect(getState().log.slice(0, 2).map((e) => e.a)).toEqual(['Hỏi AI', 'Ẩn cột']);
    AI.askSubmit('Chỉ hiện dòng cần sửa');
    expect(getState().onlyFix).toBe(true);
  });

  it('undo giữ tối đa 100 bước', () => {
    for (let k = 0; k < 105; k++) G.pkPick(0, 'tt', k % 2 ? 'Tạm dừng' : 'Hủy');
    expect(getState().undoStack.length).toBe(100);
  });
});

describe('Store · picker #pkPop', () => {
  beforeEach(() => { resetStore(); F.loadFileNow(GOLD_FILE); });

  it('"Theo Jira" xoá giá trị sửa tay, ô về giá trị nguồn', () => {
    const tt = fieldById('tt')!, ctx = getState();
    G.pkPick(0, 'tt', 'Tạm dừng');
    expect(getState().allRows[0].ovr.tt).toBe('Tạm dừng');
    expect(getState().touched['0|tt']).toBe(1);
    G.pkPick(0, 'tt', '');
    const r = getState().allRows[0];
    expect(r.ovr.tt).toBeUndefined();
    expect(cellValue(r, tt, ctx)).toBe(sourceValue(r, tt, ctx));
    expect(cellValue(r, tt, ctx)).toBe('Đang thực hiện');
  });

  it('"Bỏ giá trị" trên cột nhập tay xoá hẳn giá trị', () => {
    const f = fieldById('giatri')!;
    expect(cellValue(getState().allRows[0], f, getState())).toBe('Trung bình');
    G.pkPick(0, 'giatri', '');
    expect(getState().allRows[0].giatri).toBe('');
    expect(cellValue(getState().allRows[0], f, getState())).toBeNull();
  });
});

describe('Store · popout, phiên bản, hướng dẫn', () => {
  beforeEach(() => { resetStore(); setNow(() => new Date(2026, 10, 20, 9, 5)); F.loadFileNow(GOLD_FILE); });

  it('popout mở dự án, tìm trong thẻ, đi giữa các kết quả rồi đóng', () => {
    P.poOpen(0);
    expect(getState().po.open).toBe(true);
    expect(getState().po.i).toBe(0);
    P.poSetQuery('KPI');
    const hits = getState().po.hits;
    expect(hits.length).toBeGreaterThan(0);
    expect(getState().po.cur).toBe(0);
    P.poNavMatch(-1);
    expect(getState().po.cur).toBe(hits.length - 1);
    P.poNavProject(1);
    expect(getState().po.i).toBe(1);
    P.poClose();
    expect(getState().po.open).toBe(false);
  });

  it('vlEdit mở bản cũ lên bảng, hiện banner sửa tiếp, không đổi danh sách phiên bản', () => {
    const versions = getState().versions;
    const copy = structuredClone(versions);
    V.vlEdit('w2|2');
    expect(getState().view).toBe('grid');
    expect(getState().editWk).toBe('w2');
    expect(getState().openedVer).toBe('w2|2');
    expect(getState().versions).toEqual(copy);
    V.vlExitEdit();
    expect(getState().editWk).toBeNull();
  });

  it('chốt bản rồi xuất Excel 49 cột', () => {
    V.doLock('', '');
    expect(getState().lockMsg).toBe('Gõ tên người chốt trước.');
    V.doLock('Khuê', '');
    const v = getState().versions[0];
    expect(v).toMatchObject({ wk: 'w3', v: 1, by: 'Khuê', at: '20/11 09:05', mine: true, fileName: GOLD_FILE });
    expect(v.snap).toBeDefined();
    expect(getState().log[0].a).toBe('Chốt bản');
    const blob = V.doExport('20261121_DAN_Bao-cao-PMO.xlsx');
    expect(blob.size).toBeGreaterThan(0);
    expect(getState().versions[0].exported).toBe('20261121_DAN_Bao-cao-PMO.xlsx');
  });

  it('mở trung tâm hướng dẫn và chạy tour', () => {
    H.helpOpenPanel();
    expect(getState().help).toBe(true);
    H.helpTourStart('grid');
    expect(getState().help).toBe(false);
    expect(getState().tour).toBe(0);
    expect(getState().view).toBe('grid');
    H.tourGo(99);
    expect(getState().tour).toBeNull();
  });
});

describe('Store · ranh giới chế độ thử / nạp lại file (fix vòng 1)', () => {
  beforeEach(() => { resetStore(); F.loadFileNow(GOLD_FILE); });

  it('undo sau exitTest không đưa dữ liệu chế độ thử vào bảng thật', () => {
    G.pkPick(0, 'tt', 'Tạm dừng');
    const real = getState().allRows;
    F.enterTest('dirty');
    expect(getState().undoStack).toEqual([]);
    G.pkPick(0, 'tt', 'Hủy');
    F.exitTest();
    expect(getState().undoStack).toEqual([]);
    expect(getState().redoStack).toEqual([]);
    G.undo();
    expect(getState().toast).toBe('Không còn thao tác để hoàn tác');
    expect(getState().test).toBeNull();
    expect(getState().allRows).toBe(real);
    expect(getState().allRows[0].ovr.tt).toBe('Tạm dừng');
    expect((['rui', 'kh', 'vd'] as const).every((k) => getState().allRows[0].ai[k])).toBe(true);
  });

  it('nạp lại file xoá lịch sử hoàn tác: undo không áp sửa cũ lên dòng mới', () => {
    G.pkPick(0, 'tt', 'Tạm dừng');
    F.loadFileNow(GOLD_FILE);
    expect(getState().undoStack).toEqual([]);
    expect(getState().allRows[0].ovr.tt).toBeUndefined();
    G.undo();
    expect(getState().allRows[0].ovr.tt).toBeUndefined();
  });

  it('bản xem trước tạo trước exitTest / loadFileNow bị bỏ, stgApply không làm gì', () => {
    F.enterTest('risk'); // kịch bản risk đã để I.A.3.1 chậm tiến độ
    const id1 = AI.askSubmit('Đổi Tiến độ của I.A.3.1 thành Tạm dừng')!;
    expect(getState().stages[id1].st).toBe('open');
    F.exitTest();
    expect(getState().stages[id1].st).toBe('dropped');
    const rows1 = getState().allRows;
    AI.stgApply(id1);
    expect(getState().allRows).toBe(rows1);

    const id2 = AI.askSubmit('Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ')!;
    F.loadFileNow(GOLD_FILE);
    expect(getState().stages[id2].st).toBe('dropped');
    const rows2 = getState().allRows;
    AI.stgApply(id2);
    expect(getState().allRows).toBe(rows2);
  });

  it('sửa trước khi vào thử còn nguyên sau exitTest; sửa trong chế độ thử bị bỏ; dấu ô đã sửa được xoá', () => {
    G.pkPick(0, 'tt', 'Tạm dừng');
    F.enterTest('perfect');
    expect(getState().touched).toEqual({});
    G.pkPick(1, 'td', 'Chậm tiến độ');
    expect(getState().touched['1|td']).toBe(1);
    F.exitTest();
    expect(getState().allRows[0].ovr.tt).toBe('Tạm dừng');
    expect(getState().allRows[1].ovr.td).toBeUndefined();
    expect(getState().touched).toEqual({});
  });

  it('goStep(2) bị từ chối, state không đổi', () => {
    const s = getState();
    F.goStep(2 as never);
    expect(getState()).toBe(s);
  });
});
