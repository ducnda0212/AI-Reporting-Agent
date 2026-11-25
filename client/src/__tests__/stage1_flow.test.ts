import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getState, mutate, resetStore } from '@/store';
import {
  impCancel, IMPORT_END_MS, IMPORT_STEP_MS, initStage1Bootstrap, skipImportWait, mpCloneProfile, mpDeleteProfile, mpPick, mpQuickChange, mpSaveNew, mpUpdateProfile, pvGo, pvStage, reopenSession, SRC_DEFAULT, uploadFile
} from '@/store/actions/flow';
import { cellValue, fieldById } from '@/lib/cell';
import { setCycle, TODAY, WEEKS } from '@/data/constants';
import { api, ApiError, friendlyError } from '@/services/api';
import type { MappingConfigOut, Row } from '@/types';
import { baseRows, FIXTURE_WEEKS, fixtureResponse, loadFixture, MAPPING } from './fixtures';

const CTX = { phaseBucket: {} };
const row = (over: Partial<Row>): Row => ({ ...baseRows()[0], tt: '', td: '', tt1: '', buoc: '', buocso: '', kh: '', vd: '', ...over });

beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

describe('cellValue ở Giai đoạn 1 (trước khi AI chạy)', () => {
  it('kh / vd lấy nội dung máy chủ bóc từ Progress Report; sửa tay rồi nháp AI đè lên', () => {
    const r = row({ kh: 'Triển khai Pilot', vd: 'Chờ duyệt ANBM' });
    expect(cellValue(r, fieldById('kh')!, CTX)).toBe('Triển khai Pilot');
    expect(cellValue(r, fieldById('vd')!, CTX)).toBe('Chờ duyệt ANBM');
    r.ai.vd = { text: 'Nháp AI', why: '', src: '', ok: false };
    expect(cellValue(r, fieldById('vd')!, CTX)).toBe('Nháp AI');
    r.ovr.vd = 'Sửa tay';
    expect(cellValue(r, fieldById('vd')!, CTX)).toBe('Sửa tay');
  });

  it('tt / td / tt1 / buoc / buocso dùng giá trị máy chủ; sửa tay tt thì tt1 tự tính lại theo ngày báo cáo', () => {
    setCycle('2026-11-20', FIXTURE_WEEKS);
    const r = row({ rawStatus: 'MONITORING', rawProgress: 'At Risk', tt: 'Đang thực hiện', td: 'Có rủi ro', tt1: 'Đang thực hiện Đúng tiến độ', buoc: '4. Thiết kế giải pháp', buocso: 'Bước 4', end: '30/12/2026' });
    for (const [id, v] of [['tt', 'Đang thực hiện'], ['td', 'Có rủi ro'], ['tt1', 'Đang thực hiện Đúng tiến độ'], ['buoc', '4. Thiết kế giải pháp'], ['buocso', 'Bước 4']] as const) {
      expect(cellValue(r, fieldById(id)!, CTX)).toBe(v);
    }
    r.ovr.tt = 'Chưa thực hiện';
    expect(cellValue(r, fieldById('tt1')!, CTX)).toBe('Trong kế hoạch');
    r.end = '01/11/2026'; // quá hạn so với 20/11
    expect(cellValue(r, fieldById('tt1')!, CTX)).toBe('Chưa thực hiện Chậm tiến độ');
  });
});

describe('bootstrap, upload, mở lại phiên', () => {
  it('initStage1Bootstrap nạp kỳ báo cáo, lịch sử, cấu hình mapping; WEEKS / TODAY theo máy chủ', async () => {
    vi.spyOn(api, 'getActiveCycle').mockResolvedValue({ cycle_id: '2026_11_w3', current_wk: 'w3', today: '2026-11-22', weeks: FIXTURE_WEEKS });
    vi.spyOn(api, 'getIngestHistory').mockResolvedValue([{ session_id: 's9', name: 'a.csv', wk: 'Tuần 3', at: '20/11 09:00', by: 'local', issues: 3, cols: 5, prj: 2, ver: '' }]);
    vi.spyOn(api, 'listMappings').mockResolvedValue([MAPPING]);
    await initStage1Bootstrap();
    const s = getState();
    expect([s.cycleId, s.activeToday, s.impHist[0].session_id, s.mappings[0].id]).toEqual(['2026_11_w3', '2026-11-22', 's9', MAPPING.id]);
    expect(WEEKS.map((w) => w.k)).toEqual(['w3', 'w2', 'w1']);
    expect(TODAY.getDate()).toBe(22);
  });

  it('uploadFile gửi file thật, commit bảng + thống kê + nhóm; lỗi máy chủ báo toast và mở lại ô chọn file', async () => {
    mutate((d) => { d.mappings = [MAPPING] as never; });
    const up = vi.spyOn(api, 'ingestUpload').mockResolvedValue(fixtureResponse('a.csv'));
    vi.spyOn(api, 'getIngestHistory').mockResolvedValue([]);
    const file = new File(['x'], 'a.csv');
    await uploadFile(file);
    expect(up).toHaveBeenCalledWith(file, '2026_11_w3', null, false);
    const s = getState();
    expect([s.loaded, s.importing, s.busy, s.fileName, s.sessionId]).toEqual([true, null, false, 'a.csv', 'sess_test']);
    expect(s.allRows.length).toBe(56);
    expect(s.groups.length).toBeGreaterThan(5);
    expect(s.fileCols.length).toBeGreaterThan(10);
    expect(s.applied).toMatchObject({ matched_cols: 42, total_cols: 49 });
    expect(s.log[0]).toMatchObject({ a: 'Nhập file Jira', o: 'a.csv' });

    resetStore();
    up.mockRejectedValueOnce(new ApiError('E_FILE_UNSUPPORTED_FORMAT', 'Hãy lưu file .xls sang .xlsx', 422));
    await uploadFile(new File(['x'], 'old.xls'));
    expect([getState().loaded, getState().importing, getState().busy]).toEqual([false, null, false]);
    expect(getState().importErr).toBe(friendlyError('E_FILE_UNSUPPORTED_FORMAT', ''));
  });

  it('lỗi nhập file ở ô xem trước: giữ file đã chọn, hiện lỗi cố định; chọn file khác thì xoá lỗi', async () => {
    await pvStage({ name: 'a.csv', size: 20, arrayBuffer: async () => new TextEncoder().encode('Summary,Issue key\nA,K-1\n').buffer as ArrayBuffer });
    const up = vi.spyOn(api, 'ingestUpload').mockRejectedValue(new ApiError('E_FILE_INVALID_SCHEMA', 'missing Summary / Issue key column', 422));
    await pvGo();
    const s = getState();
    expect(s.importErr).toBe(friendlyError('E_FILE_INVALID_SCHEMA', ''));
    expect(s.importErr).not.toContain('missing Summary');
    expect([s.pv?.name, s.pv?.done, s.loaded, s.busy, s.toast]).toEqual(['a.csv', false, false, false, null]);
    up.mockResolvedValueOnce(fixtureResponse('a.csv'));
    await pvGo(); // thử lại cùng file được
    expect([getState().loaded, getState().importErr, getState().pv?.done]).toEqual([true, null, true]);

    up.mockRejectedValueOnce(new ApiError('E_FILE_INVALID_SCHEMA', 'x', 422));
    resetStore();
    await pvStage({ name: 'b.csv', size: 20, arrayBuffer: async () => new TextEncoder().encode('Summary,Issue key\nA,K-1\n').buffer as ArrayBuffer });
    await pvGo();
    expect(getState().importErr).not.toBeNull();
    await pvStage({ name: 'c.csv', size: 20, arrayBuffer: async () => new TextEncoder().encode('Summary,Issue key\nA,K-1\n').buffer as ArrayBuffer });
    expect(getState().importErr).toBeNull();
  });

  describe('màn đọc file hiện từng bước với số liệu thật rồi tự chuyển', () => {
    const base = fixtureResponse('a.csv');
    const res = { ...base, orphans: base.orphans.concat([{ key: 'K-1', summary: '', issue_type: '', status: '', reason: 'NO_DA_CODE' }, { key: 'K-2', summary: '', issue_type: '', status: '', reason: 'NO_DA_CODE' }]),
      diff_summary: { ...base.diff_summary, has_previous_session: true, added_projects: ['X'] } };
    const found = { issues: res.file_stats.total_rows, cols: res.file_stats.total_cols, dupGroups: res.file_stats.dup_groups, projects: res.file_stats.matched_projects, orphans: 2, newCodes: 1 };
    const browser = (): void => { vi.useFakeTimers(); vi.stubGlobal('window', {}); vi.stubGlobal('document', {}); };
    const flush = async (): Promise<void> => { for (let k = 0; k < 8; k++) await Promise.resolve(); };
    const start = async (): Promise<{ p: Promise<void> }> => {
      vi.spyOn(api, 'ingestUpload').mockResolvedValue(res);
      vi.spyOn(api, 'getIngestHistory').mockResolvedValue([]);
      const p = uploadFile(new File(['x'], 'a.csv'));
      await flush();
      return { p };
    };
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

    it('đứng ở bước 1 với số thật, mỗi IMPORT_STEP_MS một bước, rồi dừng IMPORT_END_MS (tổng 3 giây) mới nạp bảng', async () => {
      browser();
      const { p } = await start();
      expect(getState().importing).toEqual({ name: 'a.csv', step: 0, found });
      expect(getState().loaded).toBe(false);
      for (let k = 1; k <= 4; k++) {
        vi.advanceTimersByTime(IMPORT_STEP_MS - 1);
        await flush();
        expect(getState().importing?.step).toBe(k - 1);
        vi.advanceTimersByTime(1);
        await flush();
        expect(getState().importing?.step).toBe(k);
        expect(getState().loaded).toBe(false);
      }
      vi.advanceTimersByTime(IMPORT_END_MS - 1);
      await flush();
      expect(getState().loaded).toBe(false);
      vi.advanceTimersByTime(1);
      await p;
      expect([getState().loaded, getState().importing, getState().busy]).toEqual([true, null, false]);
      expect(IMPORT_STEP_MS * 4 + IMPORT_END_MS).toBe(3000);
    });

    it('skipImportWait giữa chừng thì nạp ngay và không còn hẹn giờ nào chạy thêm', async () => {
      browser();
      const { p } = await start();
      vi.advanceTimersByTime(IMPORT_STEP_MS);
      await flush();
      expect(getState().importing?.step).toBe(1);
      skipImportWait();
      await p;
      expect(getState().loaded).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(5000);
      expect(getState().importing).toBeNull();
    });

    it('huỷ giữa chừng thì không nạp bảng và không kẹt trạng thái bận', async () => {
      browser();
      const { p } = await start();
      vi.advanceTimersByTime(IMPORT_STEP_MS);
      await flush();
      impCancel();
      vi.advanceTimersByTime(5000);
      await p;
      expect([getState().loaded, getState().busy, getState().importing]).toEqual([false, false, null]);
    });

    it('không có trình duyệt (node) hoặc giảm chuyển động thì đặt số liệu rồi nạp ngay, không chờ', async () => {
      vi.spyOn(api, 'ingestUpload').mockResolvedValue(res);
      vi.spyOn(api, 'getIngestHistory').mockResolvedValue([]);
      await uploadFile(new File(['x'], 'a.csv'));
      expect(getState().loaded).toBe(true);
      resetStore();
      vi.useFakeTimers();
      vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
      vi.stubGlobal('document', {});
      await uploadFile(new File(['x'], 'b.csv'));
      expect(getState().loaded).toBe(true);
    });

    it('lỗi máy chủ: không hiện bước nào, báo lỗi trong ô xem trước', async () => {
      browser();
      vi.spyOn(api, 'ingestUpload').mockRejectedValue(new ApiError('E_FILE_INVALID_SCHEMA', 'x', 422));
      await uploadFile(new File(['x'], 'a.csv'));
      const s = getState();
      expect([s.importing, s.loaded, s.busy]).toEqual([null, false, false]);
      expect(s.importErr).toBe(friendlyError('E_FILE_INVALID_SCHEMA', ''));
    });
  });

  it('reopenSession nạp lại đúng phiên đã lưu', async () => {
    const get = vi.spyOn(api, 'getSession').mockResolvedValue(fixtureResponse('old.csv'));
    await reopenSession('sess_old');
    expect(get).toHaveBeenCalledWith('sess_old');
    expect([getState().loaded, getState().fileName]).toEqual([true, 'old.csv']);
  });
});

describe('cấu hình mapping (mpBar + mapQuick)', () => {
  beforeEach(() => { loadFixture(); });

  it('mpQuickChange gửi src_overrides tới recalculate, đánh dấu chưa lưu; chọn lại mặc định thì bỏ đổi', async () => {
    const res = fixtureResponse('f.csv', [{ ...baseRows()[0], phong: 'AI Dept' }]);
    const rc = vi.spyOn(api, 'recalculate').mockResolvedValue(res);
    await mpQuickChange('phong', 'Custom field (Dept)');
    let s = getState();
    expect(rc).toHaveBeenLastCalledWith({ session_id: 'sess_test', mapping_id: MAPPING.id, src_overrides: { phong: 'Custom field (Dept)' } });
    expect([s.mpDirty, s.mpSrc.phong, s.allRows[0].phong]).toEqual([true, 'Custom field (Dept)', 'AI Dept']);
    await mpQuickChange('phong', SRC_DEFAULT);
    s = getState();
    expect(rc).toHaveBeenLastCalledWith({ session_id: 'sess_test', mapping_id: MAPPING.id, src_overrides: {} });
    expect([s.mpDirty, s.mpSrc]).toEqual([false, {}]);
  });

  it('mpPick đổi cấu hình rồi tính lại; mpSaveNew / mpUpdateProfile ghi nguồn đã đổi vào cột cấu hình', async () => {
    const cfg: MappingConfigOut = { ...MAPPING, columns: [{ field_id: 'phong', col_letter: 'P', name: 'Phòng', source_type: 'jira', source_field: 'Custom field (Department)', fallbacks: [], required: false }] };
    mutate((d) => { d.mappings = [cfg, { ...cfg, id: 'map_2', name: 'Khác', is_default: false }] as never; });
    const rc = vi.spyOn(api, 'recalculate').mockResolvedValue(fixtureResponse('f.csv'));
    await mpPick('map_2');
    expect(rc).toHaveBeenLastCalledWith({ session_id: 'sess_test', mapping_id: 'map_2', src_overrides: {} });

    mutate((d) => { d.mpUsed = cfg.id; d.mpSrc = { phong: 'Assignee' }; d.mpDirty = true; });
    const create = vi.spyOn(api, 'createMapping').mockResolvedValue({ ...cfg, id: 'map_new', name: 'Mới' });
    vi.spyOn(api, 'listMappings').mockResolvedValue([cfg]);
    await mpSaveNew('Mới');
    expect(create.mock.calls[0][0].columns[0]).toMatchObject({ field_id: 'phong', source_type: 'jira', source_field: 'Assignee', fallbacks: [] });
    expect(create.mock.calls[0][0].name).toBe('Mới');

    mutate((d) => { d.mpUsed = cfg.id; d.mpSrc = { phong: 'Assignee' }; d.mpDirty = true; });
    const upd = vi.spyOn(api, 'updateMapping').mockResolvedValue(cfg);
    await mpUpdateProfile();
    expect(upd).toHaveBeenCalledWith(cfg.id, { columns: [expect.objectContaining({ source_field: 'Assignee' })] });
    expect([getState().mpDirty, getState().mpSrc]).toEqual([false, {}]);
  });

  it('mpCloneProfile nhân bản rồi dùng bản sao; xoá cấu hình mặc định báo thân thiện', async () => {
    mutate((d) => { d.mappings = [MAPPING] as never; });
    const clone = vi.spyOn(api, 'cloneMapping').mockResolvedValue({ ...MAPPING, id: 'map_c', name: 'Bản sao', is_default: false });
    vi.spyOn(api, 'listMappings').mockResolvedValue([MAPPING, { ...MAPPING, id: 'map_c', name: 'Bản sao', is_default: false }]);
    const rc = vi.spyOn(api, 'recalculate').mockResolvedValue(fixtureResponse('f.csv'));
    await mpCloneProfile();
    expect(clone).toHaveBeenCalledWith(MAPPING.id);
    expect(rc).toHaveBeenLastCalledWith({ session_id: 'sess_test', mapping_id: 'map_c', src_overrides: {} });

    vi.spyOn(api, 'deleteMapping').mockRejectedValue(new ApiError('E_CANNOT_DELETE_DEFAULT_MAPPING', 'x', 400));
    mutate((d) => { d.mpUsed = MAPPING.id; });
    await mpDeleteProfile();
    expect(getState().toast).toBe(friendlyError('E_CANNOT_DELETE_DEFAULT_MAPPING', 'x'));
  });

  it('lỗi mapping giữ thông báo 6 giây (thông báo thường 2,2 giây)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    try {
      mutate((d) => { d.mappings = [MAPPING] as never; });
      vi.spyOn(api, 'recalculate').mockRejectedValue(new ApiError('E_NETWORK', 'x', 0));
      await mpPick(MAPPING.id);
      const msg = getState().toast;
      expect(msg).toBe(friendlyError('E_NETWORK', 'x'));
      vi.advanceTimersByTime(2300);
      expect(getState().toast).toBe(msg);
      vi.advanceTimersByTime(3800);
      expect(getState().toast).toBeNull();
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});
