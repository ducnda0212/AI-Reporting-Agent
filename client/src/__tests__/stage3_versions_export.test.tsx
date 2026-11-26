import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCycle } from '@/data/constants';
import { getState, mutate, resetStore } from '@/store';
import { initStage1Bootstrap } from '@/store/actions/flow';
import { api } from '@/services/api';
import { doExport, doLock, reExport, verOpen } from '@/store/actions/versions';
import type { IngestResponse, VersionItem } from '@/types';
import { FIXTURE_WEEKS } from './fixtures';

beforeEach(() => resetStore());
afterEach(() => vi.restoreAllMocks());

const W4_WEEKS = FIXTURE_WEEKS.map((w) => ({ ...w, cur: w.k === 'w4', future: false }));
const VER: VersionItem = {
  id: 'ver_2026_11_w4_v1', session_id: 's1', cycle_id: '2026_11_w4', wk: 'w4', v: 1, by: 'Khuê', at: '26/11 12:00', note: 'N',
  exported: null, stats: { rows: 1, hand: 1, ai: 0 }, changes: [], mine: true, fileName: 'g.csv', snap: { 'I.C.1.2|ma': 'I.C.1.2' }
};

describe('Giai đoạn 3: chốt bản, xuất Excel và mở lại bản qua máy chủ', () => {
  it('doLock lưu lên máy chủ, doExport tải file thật kèm hai tuỳ chọn ghi file', async () => {
    mutate((d) => {
      d.loaded = true; d.sessionId = 's1'; d.cycleId = '2026_11_w4'; d.weeks = W4_WEEKS; d.fileName = 'g.csv'; d.activeToday = '2026-11-26';
      d.allRows = [{ i: 0, real: true, ma: 'I.C.1.2', viec: 'T1', ovr: { pic: 'Manual' }, ai: {}, reasons: {}, stages: [], note: 'Raw · note', w4ht: 'Done W4' } as never];
      d.fmt = { '0|w4ht': { b: true } };
    });
    const lockSpy = vi.spyOn(api, 'lockReport').mockResolvedValue(VER);
    const expSpy = vi.spyOn(api, 'exportExcel').mockResolvedValue({ blob: new Blob(['XLSX']), fileName: '20261126_DAN_Bao-cao-PMO.xlsx' });

    const locked = await doLock('Khuê', 'N');
    expect(locked?.id).toBe(VER.id);
    const sent = lockSpy.mock.calls[0][0];
    expect(sent).toMatchObject({ session_id: 's1', cycle_id: '2026_11_w4', wk: 'w4', by: 'Khuê', raw_notes: { 'I.C.1.2': 'Raw · note' }, fmt: { 'I.C.1.2|w4ht': { b: true } } });
    expect(sent.snap['I.C.1.2|w4ht']).toBe('Done W4'); // tuần đang làm (w4) được chụp, không còn bị '—'
    expect(getState().versions.map((v) => v.id)).toEqual([VER.id]);
    expect(getState().lockSeq).toBe(getState().logSeq);

    const blob = await doExport('20261126_DAN_Bao-cao-PMO.xlsx', { onlyCurrentWeek: false, appendOverrideNote: false });
    expect(blob?.size).toBe(4);
    expect(expSpy).toHaveBeenCalledWith(expect.objectContaining({ version_id: VER.id, only_current_week: false, append_override_note: false, ex_cols: 'vis' }));
    expect(getState().versions[0].exported).toBe('20261126_DAN_Bao-cao-PMO.xlsx');
  });

  it('doLock báo lỗi tên người chốt và lỗi máy chủ, không thêm bản', async () => {
    mutate((d) => { d.loaded = true; d.weeks = W4_WEEKS; d.allRows = []; });
    const spy = vi.spyOn(api, 'lockReport');
    expect(await doLock('Khuê', '')).toBeNull();
    expect(getState().lockMsg).toContain('Nhập file Jira');
    mutate((d) => { d.sessionId = 's1'; });
    expect(await doLock(' ', '')).toBeNull();
    expect(getState().lockMsg).toBe('Gõ tên người chốt trước.');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRejectedValue(new (await import('@/services/api')).ApiError('E_SESSION_NOT_FOUND', '', 404));
    expect(await doLock('Khuê', '')).toBeNull();
    expect(getState().lockMsg).toContain('Không tìm thấy lần nhập');
    expect(getState().versions).toEqual([]);
  });

  it('verOpen nạp phiên nếu chưa nạp, khôi phục định dạng và không kích hoạt lưu nháp', async () => {
    const saveDraftSpy = vi.spyOn(api, 'saveDraft');
    vi.spyOn(api, 'getSession').mockResolvedValue({
      success: true, session_id: 's1', file_name: 'g.csv', is_duplicate_file: false,
      file_stats: { total_rows: 1, total_cols: 10, dup_groups: 0, dup_cols: 0, skipped_empty_rows: 0, matched_projects: 1, used_cols: 5 },
      file_cols: ['Summary'], groups: [{ k: 'I.C.1', name: 'G' }], applied_mapping: { id: 'm1', name: 'M', matched_cols: 1, total_cols: 49 },
      diff_summary: { has_previous_session: false, added_projects: [], removed_projects: [], modified_count: 0, schema_changes: [] },
      rows: [{ i: 0, real: true, ma: 'I.C.1.2', viec: 'T1', ovr: {}, ai: {}, reasons: {}, pr: [], prw: {}, stages: [], tags: [], jira: { pic: '', po: '', gdk: '' } }],
      orphans: [], blockers: [], warnings: []
    } as unknown as IngestResponse);
    mutate((d) => {
      d.weeks = FIXTURE_WEEKS;
      d.versions = [{
        ...VER, id: 'ver_2026_11_w2_v1', cycle_id: '2026_11_w2', wk: 'w2', at: '14/11 10:00', stats: { rows: 1, hand: 0, ai: 0 },
        snap: { 'I.C.1.2|milestone': 'Snap MS' }, fmt: { 'I.C.1.2|milestone': { b: true } }, wrap: { 'I.C.1.2|milestone': true }, hidden: { kpi: true }
      }];
    });
    await verOpen('w2|1');
    const s = getState();
    expect(s.loaded).toBe(true);
    expect(s.editWk).toBe('w2');
    expect(s.allRows[0].ovr.milestone).toBe('Snap MS');
    expect(s.fmt['0|milestone']?.b).toBe(true);
    expect(s.wrap['0|milestone']).toBe(true);
    expect(s.hidden.kpi).toBe(true);
    await new Promise((r) => setTimeout(r, 900)); // quá 800ms của bộ đếm lưu nháp
    expect(saveDraftSpy).not.toHaveBeenCalled();
  });

  it('reExport tải lại đúng file của bản đã chốt; bootstrap nạp danh sách bản từ máy chủ', async () => {
    mutate((d) => { d.versions = [VER]; });
    const dl = vi.spyOn(api, 'downloadVersionExcel').mockResolvedValue({ blob: new Blob(['X']), fileName: 'a.xlsx' });
    await reExport('w4|1');
    expect(dl).toHaveBeenCalledWith(VER.id);
    resetStore();
    vi.spyOn(api, 'getActiveCycle').mockResolvedValue({ cycle_id: '2026_11_w4', current_wk: 'w4', today: '2026-11-26', weeks: W4_WEEKS });
    vi.spyOn(api, 'getIngestHistory').mockResolvedValue([]);
    vi.spyOn(api, 'listMappings').mockResolvedValue([]);
    vi.spyOn(api, 'listVersions').mockResolvedValue([VER]);
    await initStage1Bootstrap();
    expect(getState().versions.map((v) => v.id)).toEqual([VER.id]);
    setCycle('2026-11-22', []);
  });
});
