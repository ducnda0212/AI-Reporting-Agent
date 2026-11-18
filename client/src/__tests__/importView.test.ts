import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelImport, handleUploadSuccess, loadFile, loadHistoryList, uploadFileReal } from '@/store/actions/flow';
import { getState, store } from '@/store';

const resp = (dup = false) => ({
  file_info: { id: 'file-123', filename: 'jira_real.csv', is_duplicate: dup, file_hash: 'h', file_size: 1, uploaded_at: 't', target_week: 'w3' },
  file_stats: { total_cols: 277, total_issues: 39, duplicate_groups: 12, loaded_at: '10:00' },
  columns: [{ index: 0, name: 'Summary', non_null_count: 39, sample_values: ['I.A.5.1 Task 1'] }],
  issues_sample: [],
});

describe('Real Import Flow Action', () => {
  const init = store.getInitialState();
  afterEach(() => { vi.unstubAllGlobals(); store.setState(init, true); });
  const ok = (r: unknown) => ({ ok: true, json: async () => r });
  const deferred = () => { let res!: (v: unknown) => void; const p = new Promise((r) => { res = r; }); return { p, res }; };
  const named = (name: string) => { const r = resp(); r.file_info.filename = name; return r; };

  it('ignores a stale response from a cancelled upload', async () => {
    const a = deferred(), b = deferred();
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(a.p).mockReturnValueOnce(b.p).mockResolvedValue(ok([])));
    const pa = uploadFileReal(new File(['x'], 'a.csv'));
    cancelImport();
    const pb = uploadFileReal(new File(['x'], 'b.csv'));
    a.res(ok(named('a.csv'))); await pa;
    expect(getState().fileName).toBeUndefined();
    expect(getState().importing?.name).toBe('b.csv');
    b.res(ok(named('b.csv'))); await pb;
    expect(getState().fileName).toBe('b.csv');
  });

  it('keeps previous fileStats when an upload fails', async () => {
    handleUploadSuccess(resp());
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: [{ msg: 'bad' }] }) }));
    await uploadFileReal(new File(['x'], 'a.csv'));
    expect(getState().fileStats.cols).toBe(277);
    expect(getState().toast).toContain('bad');
  });

  it('updates store with real parsed columns and file stats', () => {
    handleUploadSuccess(resp(true));
    const s = getState();
    expect(s.fileName).toBe('jira_real.csv');
    expect(s.fileStats).toMatchObject({ cols: 277, totalIssues: 39, dupGroups: 12 });
    expect(s.rawCols[0].name).toBe('Summary');
    expect(s.isDuplicateAlert).toBe(true);
  });

  it('rejects non-csv client-side without calling the backend', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    await uploadFileReal(new File(['x'], 'a.xlsx'));
    expect(f).not.toHaveBeenCalled();
    expect(getState().toast).toMatch(/\.csv/);
  });

  it('shows a toast when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    await uploadFileReal(new File(['x'], 'a.csv'));
    expect(getState().importing).toBeNull();
    expect(getState().toast).toMatch(/backend/i);
  });

  it('loadFile (reduced-motion/silent path) clears the importing overlay', () => {
    store.setState({ ...getState(), importing: { name: 'x.csv', step: 0 } }, true);
    loadFile('x.csv', true); // REDUCED và silent cùng đi vào loadFileNow
    expect(getState().importing).toBeNull();
    expect(getState().loaded).toBe(true);
  });

  it('records the real file id so the sample/tour path is distinguishable', () => {
    expect(getState().realFile).toBeNull();
    handleUploadSuccess(resp());
    expect(getState().realFile).toEqual({ id: 'file-123', week: 'w3' });
  });

  it('treats a 500 with a non-JSON body (Vite proxy, backend down) as offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new SyntaxError('x'); } }));
    await uploadFileReal(new File(['x'], 'a.csv'));
    expect(getState().toast).toMatch(/uvicorn/);
  });

  it('history load: offline gets the hint, other errors stay silent (no "file import" toast)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ detail: 'boom' }) }));
    await loadHistoryList();
    expect(getState().toast).toBeFalsy();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    await loadHistoryList();
    expect(getState().toast).toMatch(/backend/i);
  });
});
