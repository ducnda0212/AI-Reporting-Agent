import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getState, mutate, resetStore, scheduleDraftSync, cancelPendingDraftSave, withSuppressedDraftSync } from '@/store';
import { api } from '@/services/api';

describe('Stage 2 Debounced Draft Auto-Save', () => {
  beforeEach(() => { vi.useFakeTimers(); resetStore(); });
  afterEach(() => { cancelPendingDraftSave(); vi.useRealTimers(); });

  it('debounces draft sync by 800ms and suppresses during initial hydration', async () => {
    const spy = vi.spyOn(api, 'saveDraft').mockResolvedValue({ success: true, session_id: 's1', updated_at: '' });
    withSuppressedDraftSync(() => {
      mutate((d) => { d.loaded = true; d.sessionId = 's1'; d.cycleId = '2026_11_w3'; d.allRows = [{ i: 0, ma: 'I.C.1.2', ovr: {}, ai: {}, reasons: {}, pr: [], prw: {}, stages: [], tags: [], jira: { pic: '', po: '', gdk: '' } } as any]; });
    });
    expect(spy).not.toHaveBeenCalled();

    mutate((d) => { d.allRows[0].ovr = { pic: 'Manual' }; });
    scheduleDraftSync(getState());
    vi.advanceTimersByTime(400);
    expect(spy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('s1', expect.objectContaining({ overrides: { 'I.C.1.2': { pic: 'Manual' } } }));
  });
});
