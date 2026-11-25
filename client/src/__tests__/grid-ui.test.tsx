import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { getState, mutate, resetStore } from '@/store';
import { loadFixture } from './fixtures';
import { startReview } from '@/store/actions/ai';
import {
  applyEdit, approveRows, arrow, autofitCol, clearRowSel, edgeJump, fillTo, findSet, fixGo, gridOrder, grpSel, peSave, pkClose, pkOpen, pkPick,
  rowSelAll, selectCell, selectRange, setColW, startEdit, svflashClear, toggleCol, togglePin, toggleRowSel, typeKey
} from '@/store/actions/grid';
import { findMatches } from '@/lib/grid';
import { onGridKey } from '@/hooks/useKeyboard';
import { FormatBar } from '@/components/grid/FormatBar';
import { Grid } from '@/components/grid/Grid';
import { SelBar } from '@/components/grid/SelBar';
import { PickerPop } from '@/components/grid/PickerPop';
import { AgentCursor } from '@/components/grid/AgentCursor';
import { FillHandle } from '@/components/grid/FillHandle';
import { ContextMenu } from '@/components/layers/ContextMenu';
import { FilterPopup } from '@/components/layers/FilterPopup';
import { FindCard } from '@/components/layers/FindCard';
import { PECard } from '@/components/layers/PECard';
import { ctxOpen, findOpen, fltOpen } from '@/store/actions/grid';
import type { FieldId } from '@/types';

const rowOf = (ma: string) => getState().allRows.find((r) => r.ma === ma)!;
const count = (h: string, s: string) => h.split(s).length - 1;
const load = () => { resetStore(); loadFixture('x.csv'); mutate((d) => { d.view = 'grid'; }); };
const key = (k: string, o: Partial<KeyboardEvent> = {}) =>
  onGridKey({ key: k, target: null, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault() {}, stopImmediatePropagation() {}, ...o } as unknown as KeyboardEvent);

let errs: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errs = vi.spyOn(console, 'error'); });
afterEach(() => { expect(errs).not.toHaveBeenCalled(); errs.mockRestore(); vi.unstubAllGlobals(); resetStore(); });

describe('Spreadsheet Grid UI SSR', () => {
  it('FormatBar có chip Trợ lý AI ngang, Dòng cần sửa, và không có nút Rổ gom', () => {
    resetStore();
    loadFixture('x.csv');
    mutate((d) => { d.menu = 'cols'; });
    const fb = renderToString(<FormatBar />);
    expect(fb).toContain('aichip');
    expect(fb).toContain('Khối cột');
    expect(fb).not.toContain('Rổ gom');
    /* chip ✦ AI: số ô nháp chờ duyệt; chip ⚠ gọn (R34); menu Cột đủ phần */
    expect(fb).toMatch(/class="xgchip aichip"[^>]*>[\s\S]*?AI<em>168<\/em>/);
    expect(fb).toContain('class="fixchip sm"');
    expect(fb).toContain('<span class="sr-only">Dòng cần sửa</span>');
    expect(fb).toContain('Cấu hình mẫu: số tuần, cột, phiên bản…');
    expect(fb).toContain('class="gtgm"');
    for (const t of ['Thông tin', 'Tiến độ', 'Đơn vị &amp; NS', 'Phân loại', 'T01/11', 'T02/11', 'T3/11', 'T4/11']) expect(fb).toContain('>' + t + '</button>');
    expect(count(fb, 'data-act="toggleCol"')).toBe(49);
    expect(fb).toContain('Ghim cột Công việc khi cuộn ngang');
    expect(fb).toContain('Đủ 49 cột');
  });

  it('Grid render đầy đủ 49 cột, link Mã DA popout và placeholder ô bắt buộc', () => {
    resetStore();
    loadFixture('x.csv');
    const g = renderToString(<Grid />);
    expect(g).toContain('Mã DA');
    expect(g).toContain('I.A.3.1');
    expect(g).toContain('fixgo');
    expect(g).toMatch(/\d+ ô cần sửa · \d+ dòng →/);
    expect(g).toContain('class="malink" data-poi="' + rowOf('I.A.3.1').i + '"');
    mutate((d) => { d.hidden = {}; });
    expect(count(renderToString(<Grid />), 'data-act="fltOpen"')).toBe(49);
  });

  it('Viền hồng đầu bảng nằm ở tuần hiện tại (tuần 4), nhãn các tuần cùng một dạng', () => {
    resetStore();
    loadFixture('x.csv');
    mutate((d) => { d.hidden = {}; d.weeks = d.weeks.map((w) => ({ ...w, cur: w.k === 'w4', future: false })); });
    const g = renderToString(<Grid />);
    const th = (name: string) => (g.match(new RegExp('<th[^>]*>(?:(?!</th>).)*' + name + '(?:(?!</th>).)*</th>')) ?? [''])[0];
    expect(th('Tuần 04/11')).toContain('inset 0 3px 0');
    expect(th('Tuần 03/11')).not.toContain('inset 0 3px 0');
    expect(th('Tuần 03/11')).not.toMatch(/tuần này|chưa tới|đã chốt/);
    expect(th('Tuần 04/11')).not.toMatch(/tuần này|chưa tới|đã chốt/);
  });

  it('Ô bảng: nhãn trạng thái, mũi tên ▾, chữ gợi ý ô bắt buộc, không có <select> trong ô', () => {
    load();
    const r = rowOf('I.A.3.1');
    mutate((d) => { const x = d.allRows[r.i]; x.rawProgress = ''; x.rawStatus = 'IN PROGRESS'; x.loai = ''; });
    const g = renderToString(<Grid />);
    expect(g).toMatch(/class="spill [eonbw]"/);
    expect(g).toContain('<i class="cdd" aria-hidden="true">▾</i>');
    expect(g).toContain('class="reqph pick" title="Bắt buộc · bấm để chọn"');
    expect(g).toContain('Chọn tiến độ<i class="reqv" aria-hidden="true">▾</i>');
    expect(g).toContain('Nhập loại dự án');
    expect(g).toContain('class="cellsel');
    expect(g).not.toContain('<select');
    /* nút .cellsel trông như <select> của prototype: căn trái, một dòng, cắt "…" */
    expect(g).toMatch(/<button class="cellsel[^"]*" data-act="cellPick"[^>]*style="width:\d+px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"/);
    applyEdit(r.i, 'giatri', 'Cao');
    selectCell(r.i, 'giatri');
    mutate((d) => { d.fmt[r.i + '|giatri'] = { ha: 'right' }; });
    expect(renderToString(<Grid />)).toMatch(/data-f="giatri" style="width:\d+px;text-align:right;white-space:nowrap/);
  });

  it('Ô Agent đề xuất có viền .aipend + ghost diff, ô vừa sửa nháy .svflash, ô "cần sửa" .fxpulse', () => {
    load();
    const r = rowOf('I.A.3.1');
    mutate((d) => { d.stages.s1 = { q: 'x', st: 'open', items: [{ i: r.i, f: 'td', from: 'Đúng tiến độ', to: 'Chậm tiến độ', kind: 'edit' }] }; });
    let g = renderToString(<Grid />);
    expect(g).toContain('aipend');
    expect(g).toContain('<span class="aighost"><span class="aiold">Đúng tiến độ</span><span class="ainew">✦ Chậm tiến độ</span></span>');
    expect(g).toContain('title="Agent đề xuất: Chậm tiến độ — duyệt trong khung Trợ lý AI"');

    expect(applyEdit(r.i, 'note', 'Ghi chú mới')).toBe(true);
    expect(getState().svflash).toEqual([r.i + '|note']);
    g = renderToString(<Grid />);
    expect(g).toMatch(/class="cell[^"]* svflash" data-act="cell" data-i="\d+" data-f="note"/);
    svflashClear();
    expect(getState().svflash).toEqual([]);

    fixGo(r.g);
    const T = getState().fxTip!;
    expect(renderToString(<Grid />)).toMatch(new RegExp('class="[^"]*fxpulse[^"]*" data-act="cell(Pick)?" data-i="' + T.i + '" data-f="' + T.f + '"'));
    expect(renderToString(<AgentCursor />)).toContain('<b>Ô 1/' + T.n + '</b>');
  });

  it('FormatBar .fxval: ô hệ thống chỉ xem "col · Jira", ô nháp AI có nút Duyệt, ô danh sách dùng <select class="sel"> như prototype', () => {
    load();
    const r = rowOf('I.A.3.1');
    selectCell(r.i, 'viec');
    let fb = renderToString(<FormatBar />);
    expect(fb).toContain('<span class="lbl" style="flex:none">C · Jira</span>');
    expect(fb).toContain('value="' + 'C' + r.tplRow + '"');
    selectCell(r.i, 'kh');
    fb = renderToString(<FormatBar />);
    expect(fb).toContain('AS · AI nháp');
    expect(fb).toContain('data-act="approve"');
    selectCell(r.i, 'tt');
    expect(renderToString(<FormatBar />)).toContain('<select class="sel" data-act="fxEdit"');
    selectRange({ i: r.i, f: 'tt' }, { i: r.i, f: 'td' });
    expect(renderToString(<FormatBar />)).toContain('· 2 ô');
  });
});

describe('Dropdown chọn 1 chạm #pkPop (Review Focus 4)', () => {
  it('cột có nguồn: Theo Jira + nhãn có ✓; Theo Jira xoá giá trị sửa tay', () => {
    load();
    const r = rowOf('I.A.3.1');
    expect(pkOpen(r.i, 'tt')).toBe(true);
    let p = renderToString(<PickerPop />);
    expect(p).toContain('id="pkPop"');
    expect(p).toContain('<span class="pksrc">Theo Jira</span>');
    expect(p).toContain('<i>✓</i>');
    expect(p).toContain('class="spill');
    expect(p).not.toContain('Bỏ giá trị');
    pkPick(r.i, 'tt', 'Tạm dừng');
    expect(getState().pk).toBeNull();
    expect(getState().allRows[r.i].ovr.tt).toBe('Tạm dừng');
    pkOpen(r.i, 'tt');
    p = renderToString(<PickerPop />);
    expect(p).toMatch(/class="pko on" role="option" aria-selected="true" data-v="Tạm dừng"/);
    pkPick(r.i, 'tt', '');
    expect('tt' in getState().allRows[r.i].ovr).toBe(false);
  });

  it('cột nhập tay có giá trị: "Bỏ giá trị", không có "Theo Jira"; ô hệ thống / khoá không mở', () => {
    load();
    const r = rowOf('I.A.3.1');
    pkPick(r.i, 'giatri', 'Cao');
    pkOpen(r.i, 'giatri');
    const p = renderToString(<PickerPop />);
    expect(p).toContain('Bỏ giá trị');
    expect(p).not.toContain('Theo Jira');
    pkClose();
    expect(pkOpen(r.i, 'viec')).toBe(false);
    expect(pkOpen(r.i, 'w1ht')).toBe(false);
    expect(getState().pk).toBeNull();
  });

  it('F2 / gõ chữ trên ô danh sách mở #pkPop; ô chữ mở khung soạn #pe', () => {
    load();
    const r = rowOf('I.A.3.1');
    startEdit(r.i, 'td');
    expect(getState().pk).toEqual({ i: r.i, f: 'td' });
    pkClose();
    selectCell(r.i, 'note');
    typeKey('x');
    expect(getState().pe).toMatchObject({ i: r.i, f: 'note', val: 'x' });
    expect(renderToString(<PECard />)).toContain('id="peText"');
  });
});

describe('Store writers của bảng (Task 7)', () => {
  it('khung soạn: lưu có làm gọn, nháp AI giữ nguyên nội dung thì được duyệt', () => {
    load();
    const r = rowOf('I.A.3.1');
    startEdit(r.i, 'note');
    peSave('  a   b  ');
    expect(getState().pe).toBeNull();
    expect(getState().allRows[r.i].note).toBe('a b');
    expect(getState().toast).toMatch(/^Đã lưu ô N\d+ · đã làm gọn định dạng$/);
    const text = getState().allRows[r.i].ai.kh!.text;
    startEdit(r.i, 'kh');
    peSave(text);
    expect(getState().allRows[r.i].ai.kh!.ok).toBe(true);
  });

  it('rộng cột lưu pmo-proto-grid-v1, ẩn cột + ghim lưu pmo-proto-cols-v4, đọc lại khi mở', () => {
    const mem: Record<string, string> = {};
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } });
    load();
    setColW('tt', 222.4);
    expect(JSON.parse(mem['pmo-proto-grid-v1']).colW).toEqual({ tt: 222 });
    autofitCol('td', (t) => t.length * 7);
    expect(getState().gx.colW.td).toBeGreaterThanOrEqual(70);
    expect(getState().toast).toMatch(/^Cột J vừa nội dung · \d+px$/);
    toggleCol('tt');
    togglePin();
    expect(JSON.parse(mem['pmo-proto-cols-v4'])).toMatchObject({ hidden: { tt: true }, pin: false });
    resetStore();
    expect(getState().gx.colW.tt).toBe(222);
    expect(getState().hidden.tt).toBe(true);
    expect(getState().pinViec).toBe(false);
    setColW('tt', null);
    expect(getState().gx.colW.tt).toBeUndefined();
  });

  it('tick dòng: chọn tất cả / cả nhóm / bỏ chọn, SelBar chỉ hiện khi có dòng tick, duyệt cả dự án', () => {
    load();
    expect(renderToString(<SelBar />)).toBe('');
    const r = rowOf('I.A.3.1');
    toggleRowSel(r.i);
    const sb = renderToString(<SelBar />);
    expect(sb).toContain('Đã chọn 1 dự án');
    expect(sb).toContain('3 ô AI chờ duyệt (AC, AS, AT)');
    expect(sb).toContain('Duyệt từng ô trong 1 dự án →');
    approveRows();
    expect(getState().rowSel).toEqual({});
    expect(Object.values(getState().allRows[r.i].ai).every((a) => a!.ok)).toBe(true);
    expect(getState().log[0].a).toBe('Duyệt cả dự án');
    grpSel(r.g);
    expect(Object.keys(getState().rowSel).length).toBe(getState().allRows.filter((x) => x.g === r.g).length);
    grpSel(r.g);
    expect(getState().rowSel).toEqual({});
    rowSelAll();
    expect(Object.keys(getState().rowSel).length).toBe(56);
    clearRowSel();
    expect(getState().rowSel).toEqual({});
  });

  it('đổi dữ liệu (vào / ra chế độ thử) bỏ mọi lớp đang giữ chỉ số dòng cũ', () => {
    const open = (): void => {
      const O = gridOrder(getState());
      startEdit(O[0], 'note');
      toggleRowSel(O[1]);
      pkOpen(O[1], 'tt');
      ctxOpen(5, 5, O[1], 'tt');
      applyEdit(O[2], 'note', 'Z');
      fixGo(getState().allRows[O[0]].g);
      startReview();
    };
    const closed = (): void => {
      const s = getState();
      expect([s.pe, s.pk, s.ctx, s.fxTip, s.review]).toEqual([null, null, null, null, null]);
      expect([s.svflash, s.rowSel]).toEqual([[], {}]);
    };
    load(); open();
    loadFixture('y.csv'); closed();
  });

  it('kéo tay nắm điền xuống / lên, chép giá trị và chọn cả vùng đã điền', () => {
    load();
    const O = gridOrder(getState());
    applyEdit(O[1], 'note', 'X');
    selectCell(O[1], 'note');
    fillTo(3);
    const s = getState();
    expect([O[2], O[3]].map((i) => s.allRows[i].note)).toEqual(['X', 'X']);
    expect(s.range).toEqual({ a: { i: O[1], f: 'note' }, b: { i: O[3], f: 'note' } });
    expect(s.log[0]).toMatchObject({ a: 'Kéo điền', o: '1 cột · 2 dòng', d: '2 ô' });
    selectCell(O[1], 'note');
    fillTo(0);
    expect(getState().allRows[O[0]].note).toBe('X');
  });

  it('mũi tên (Shift nới vùng), Ctrl+mũi tên nhảy mép, kéo chọn vùng, "Duyệt từng ô", tìm theo cột đang chọn', () => {
    load();
    const O = gridOrder(getState());
    selectCell(O[0], 'tt');
    arrow(1, 0, true);
    expect(getState().range).toEqual({ a: { i: O[0], f: 'tt' }, b: { i: O[1], f: 'tt' } });
    arrow(0, 1, false);
    expect(getState().sel).toEqual({ i: O[0], f: 'td' }); // không Shift: dời từ ô neo, bỏ vùng (prototype L6405)
    expect(getState().range).toBeNull();
    selectCell(O[0], 'ma');
    expect(edgeJump(getState(), 1, 0)).toEqual({ i: O[O.length - 1], f: 'ma' }); // cột luôn có dữ liệu: tới dòng cuối
    expect(edgeJump(getState(), 0, -1)).toEqual({ i: O[0], f: 'ma' });
    selectRange({ i: O[0], f: 'ma' }, { i: O[2], f: 'viec' });
    expect(getState().range!.b).toEqual({ i: O[2], f: 'viec' });
    startReview([O[0] + '|kh', O[0] + '|vd']);
    expect(getState().review!.list).toEqual([{ i: O[0], f: 'kh' }, { i: O[0], f: 'vd' }]);
    findSet({ q: 'Đúng tiến độ', scope: 'col' });
    selectCell(O[0], 'td');
    const s = getState();
    expect(findMatches(s, s.allRows).every((m) => m.f === 'td')).toBe(true);
  });

  it('phím: Enter xuống ô dưới (không mở sửa), Tab sang phải, F2 sửa, Ctrl+Z hoàn tác', () => {
    load();
    const O = gridOrder(getState());
    selectCell(O[0], 'note');
    key('Enter');
    expect(getState().sel).toEqual({ i: O[1], f: 'note' });
    expect(getState().pe).toBeNull();
    key('Tab', { shiftKey: true });
    expect(getState().sel!.f).toBe('output');
    key('F2');
    expect(getState().pe).toMatchObject({ i: O[1], f: 'output' });
    key('Escape');
    expect(getState().pe).toBeNull();
    selectCell(O[1], 'tt');
    key('F2');
    expect(getState().pk).toEqual({ i: O[1], f: 'tt' });
    key('Escape');
    expect(getState().pk).toBeNull();
    applyEdit(O[1], 'note', 'Y');
    key('z', { ctrlKey: true });
    expect(getState().allRows[O[1]].note).not.toBe('Y');
    key('y', { ctrlKey: true });
    expect(getState().allRows[O[1]].note).toBe('Y');
  });
});

describe('Lớp nổi của bảng render sạch (SSR)', () => {
  it('FilterPopup, ContextMenu, FindCard, FillHandle', () => {
    load();
    const r = rowOf('I.A.3.1');
    fltOpen('tt');
    const fp = renderToString(<FilterPopup />);
    expect(fp).toContain('id="fltpop"');
    expect(fp).toContain('↑ Sắp xếp A → Z');
    expect(fp).toContain('(Chọn tất cả)');
    ctxOpen(10, 10, r.i, 'note' as FieldId);
    const cm = renderToString(<ContextMenu />);
    expect(cm).toContain('id="ctxm"');
    expect(cm).toContain('Vừa độ rộng cột theo nội dung');
    findOpen();
    findSet({ q: 'I.A.3.1', all: true });
    const fc = renderToString(<FindCard />);
    expect(fc).toContain('id="findc"');
    expect(fc).toContain('Cột đang chọn');
    expect(fc).toContain('<mark>I.A.3.1</mark>');
    expect(renderToString(<FillHandle />)).toContain('id="fillh"');
  });
});
