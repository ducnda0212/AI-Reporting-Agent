import { beforeEach, describe, expect, it } from 'vitest';
import { castDraft } from 'immer';
import { getState, mutate, resetStore, setNow } from '@/store';
import * as F from '@/store/actions/flow';
import * as G from '@/store/actions/grid';
import * as AI from '@/store/actions/ai';
import * as P from '@/store/actions/popout';
import * as V from '@/store/actions/versions';
import * as H from '@/store/actions/help';
import { cellValue, fieldById, sourceValue } from '@/lib/cell';
import type { Row } from '@/types';
import { GOLD_FILE, loadFixture, SEED_VERSIONS } from './fixtures';

const byCode = (ma: string): Row => getState().allRows.find((r) => r.ma === ma)!;

describe('Store · luồng 3 bước, nạp dữ liệu từ máy chủ', () => {
  beforeEach(() => { resetStore(); setNow(() => new Date(2026, 10, 20, 9, 5)); });

  it('goStep chỉ nhận 1 (import), 3 (grid), 4 (export); chưa nạp thì báo nhập file trước', () => {
    F.goStep(3);
    expect(getState().view).toBe('import');
    expect(getState().toast).toBe('Chưa có dữ liệu — nhập file ở bước 1 trước');

    loadFixture(GOLD_FILE);
    const s = getState();
    expect(s.loaded).toBe(true);
    expect(s.realOnly).toBe(true);
    expect(s.allRows.length).toBe(56);
    /* mỗi dòng có đủ 3 nháp AI, tất cả chờ duyệt (prototype pfApply · realOnly) */
    expect(s.allRows.every((r) => (['rui', 'kh', 'vd'] as const).every((k) => r.ai[k] && r.ai[k]!.ok === false))).toBe(true);
    /* cột hệ thống (cfg) có giá trị trên dòng */
    expect(byCode('I.A.3.1').mang).toBe('I.A.3.PAI – Cá nhân hóa trải nghiệm cho từng khách');
    expect(s.fileName).toBe(GOLD_FILE);
    expect(s.groups.length).toBeGreaterThan(5);
    expect(s.sessionId).toBe('sess_test');
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
    loadFixture(GOLD_FILE);
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

describe('Store · Agent xem trước, hoàn tác 100 bước', () => {
  beforeEach(() => { resetStore(); setNow(() => new Date(2026, 10, 20, 9, 5)); loadFixture(GOLD_FILE); });

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
  beforeEach(() => { resetStore(); loadFixture(GOLD_FILE); });

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
  beforeEach(() => { resetStore(); setNow(() => new Date(2026, 10, 20, 9, 5)); loadFixture(GOLD_FILE); });

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
    mutate((d) => { d.versions = castDraft(structuredClone(SEED_VERSIONS)); });
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

describe('Store · ranh giới nạp lại file', () => {
  beforeEach(() => { resetStore(); loadFixture(GOLD_FILE); });

  it('nạp lại file xoá lịch sử hoàn tác: undo không áp sửa cũ lên dòng mới', () => {
    G.pkPick(0, 'tt', 'Tạm dừng');
    loadFixture(GOLD_FILE);
    expect(getState().undoStack).toEqual([]);
    expect(getState().allRows[0].ovr.tt).toBeUndefined();
    G.undo();
    expect(getState().allRows[0].ovr.tt).toBeUndefined();
  });

  it('bản xem trước tạo trước khi nạp lại file bị bỏ, stgApply không làm gì', () => {
    const id = AI.askSubmit('Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ')!;
    expect(getState().stages[id].st).toBe('open');
    loadFixture(GOLD_FILE);
    expect(getState().stages[id].st).toBe('dropped');
    const rows = getState().allRows;
    AI.stgApply(id);
    expect(getState().allRows).toBe(rows);
  });

  it('nạp file mới xoá dấu ô đã sửa', () => {
    G.pkPick(0, 'tt', 'Tạm dừng');
    expect(getState().touched['0|tt']).toBe(1);
    loadFixture(GOLD_FILE);
    expect(getState().touched).toEqual({});
  });

  it('goStep(2) bị từ chối, state không đổi', () => {
    const s = getState();
    F.goStep(2 as never);
    expect(getState()).toBe(s);
  });
});
