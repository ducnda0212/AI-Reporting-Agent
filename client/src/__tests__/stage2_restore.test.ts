import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { App } from '@/App';
import { getState, mutate, resetStore, setActiveSessionStorage, getActiveSessionStorage } from '@/store';
import { initStage1Bootstrap, reopenSession, applyIngest, uploadFile } from '@/store/actions/flow';
import { api, ApiError } from '@/services/api';
import type { SessionDraftOut } from '@/types';
import { fixtureResponse, FIXTURE_WEEKS } from './fixtures';

const draftOut = (ovr: Record<string, string> = { pic: 'Edited PIC' }): SessionDraftOut => ({
  session_id: 's1', cycle_id: '2026_11_w3',
  rows: [{ ...fixtureResponse().rows[0], ovr }],
  overrides: { [fixtureResponse().rows[0].ma]: ovr },
  fmt: { '0|ht': { b: true } }, wrap: { '0|ht': true }, touched: { '0|pic': 1 },
  hidden: { x: true }, pin_viec: true, ex_cols: 'vis', lock_by: 'Khuê', log_seq: 1, lock_seq: 0,
  audit_logs: [{ t: '02:00', day: '26/11/2026', seq: 1, a: 'Sửa ô', o: 'I.C.1.2 · F', d: '→ Edited PIC', r: 'Thành công' }],
  updated_at: '2026-11-26T02:00:00'
} as unknown as SessionDraftOut);

describe('Stage 2 Draft Restoration (F5, Reopen, Duplicate & Recalculate)', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) });
    vi.useFakeTimers(); resetStore();
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('reopenSession restores saved SessionDraft rows, fmt, wrap and audit logs', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue(fixtureResponse());
    vi.spyOn(api, 'getDraft').mockResolvedValue(draftOut());
    await reopenSession('s1');
    const s = getState();
    expect(s.allRows[0].ovr.pic).toBe('Edited PIC');
    expect(s.fmt['0|ht']?.b).toBe(true);
    expect(s.log.some((e) => e.a === 'Sửa ô')).toBe(true);
  });

  it('reopen of a session with no draft resets state leaked from the previous session', async () => {
    vi.spyOn(api, 'getSession').mockResolvedValue(fixtureResponse());
    const gd = vi.spyOn(api, 'getDraft').mockResolvedValueOnce(draftOut()).mockResolvedValueOnce(null);
    await reopenSession('A');
    expect(getState().fmt['0|ht']?.b).toBe(true);
    await reopenSession('B');
    const s = getState();
    expect(gd).toHaveBeenCalledTimes(2);
    expect([s.fmt, s.wrap, s.touched, s.logSeq]).toEqual([{}, {}, {}, 1]);
    expect(s.log.map((e) => e.a)).toEqual(['Nhập file Jira']);
  });

  it('applyIngest keeps fmt, wrap, touched, log, hidden, pinViec', () => {
    mutate((d) => { d.fmt = { '0|ht': { b: true } } as never; d.wrap = { '0|ht': true }; d.touched = { '0|pic': 1 }; d.pinViec = true; d.hidden = { x: true } as never; });
    applyIngest(fixtureResponse(), { keepTouched: true });
    const s = getState();
    expect([s.fmt['0|ht']?.b, s.wrap['0|ht'], s.touched['0|pic'], s.pinViec, s.hidden.x]).toEqual([true, true, 1, true, true]);
  });

  describe('F5 bootstrap', () => {
    beforeEach(() => {
      vi.spyOn(api, 'getActiveCycle').mockResolvedValue({ cycle_id: '2026_11_w3', current_wk: 'w3', today: '2026-11-22', weeks: FIXTURE_WEEKS });
      vi.spyOn(api, 'getIngestHistory').mockResolvedValue([]);
      vi.spyOn(api, 'listMappings').mockResolvedValue([]);
    });

    it('no draft: restores session + view, synthesizes import log, never PUTs', async () => {
      const save = vi.spyOn(api, 'saveDraft');
      setActiveSessionStorage('s1', 'grid');
      vi.spyOn(api, 'getSession').mockResolvedValue(fixtureResponse());
      vi.spyOn(api, 'getDraft').mockResolvedValue(null);
      await initStage1Bootstrap();
      await vi.advanceTimersByTimeAsync(2000);
      const s = getState();
      expect([s.loaded, s.view, s.log.some((e) => e.a === 'Nhập file Jira')]).toEqual([true, 'grid', true]);
      expect(save).not.toHaveBeenCalled();
    });

    it('404 session clears LS.activeSession', async () => {
      setActiveSessionStorage('gone', 'grid');
      vi.spyOn(api, 'getSession').mockRejectedValue(new ApiError('E_SESSION_NOT_FOUND', 'x', 404));
      vi.spyOn(api, 'getDraft').mockResolvedValue(null);
      await initStage1Bootstrap();
      expect(getActiveSessionStorage()).toBeNull();
      expect(getState().loaded).toBe(false);
    });

    describe('không nháy sang Nhập file khi F5', () => {
      beforeEach(() => { vi.stubGlobal('window', {}); vi.stubGlobal('document', {}); });

      it('giữ màn cũ và cờ restoringSession tới khi tải xong; lỗi 404 mới về Nhập file', async () => {
        setActiveSessionStorage('s1', 'grid');
        resetStore();
        expect([getState().view, getState().restoringSession, getState().loaded]).toEqual(['grid', true, false]);
        vi.stubGlobal('window', undefined); vi.stubGlobal('document', undefined); // App SSR như phía máy chủ
        expect(renderToString(createElement(App))).toContain('Đang khôi phục phiên làm việc');
        expect(renderToString(createElement(App))).not.toContain('Chọn file CSV / Excel');
        vi.stubGlobal('window', {}); vi.stubGlobal('document', {});

        vi.spyOn(api, 'getSession').mockResolvedValue(fixtureResponse());
        vi.spyOn(api, 'getDraft').mockResolvedValue(null);
        await initStage1Bootstrap();
        expect([getState().view, getState().restoringSession, getState().loaded]).toEqual(['grid', false, true]);

        setActiveSessionStorage('gone', 'ver');
        resetStore();
        expect(getState().view).toBe('ver');
        vi.spyOn(api, 'getSession').mockRejectedValue(new ApiError('E_SESSION_NOT_FOUND', 'x', 404));
        await initStage1Bootstrap();
        expect([getState().view, getState().restoringSession]).toEqual(['import', false]);
      });

      it('mở ở màn Nhập file thì không bật cờ khôi phục', () => {
        setActiveSessionStorage('s1', 'import');
        resetStore();
        expect(getState().restoringSession).toBe(false);
      });
    });
  });

  it('duplicate upload hydrates the saved draft before the toast and does not PUT', async () => {
    const save = vi.spyOn(api, 'saveDraft');
    vi.spyOn(api, 'ingestUpload').mockResolvedValue({ ...fixtureResponse(), session_id: 's1', is_duplicate_file: true });
    vi.spyOn(api, 'getDraft').mockResolvedValue(draftOut());
    vi.spyOn(api, 'getIngestHistory').mockResolvedValue([]);
    await uploadFile(new File(['x'], 'a.csv'));
    await vi.advanceTimersByTimeAsync(2000);
    const s = getState();
    expect(s.allRows[0].ovr.pic).toBe('Edited PIC');
    expect(s.toast).toContain('đã nhập trước đó');
    expect(save).not.toHaveBeenCalled();
  });
});
