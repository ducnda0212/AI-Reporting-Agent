import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, friendlyError } from '@/services/api';

const ok = (body: unknown): Response => ({ ok: true, status: 200, json: async () => body }) as Response;
const fail = (status: number, body: unknown): Response => ({ ok: false, status, json: async () => body }) as Response;

afterEach(() => vi.restoreAllMocks());

const CODES = [
  'E_FILE_INVALID_SCHEMA', 'E_FILE_UNSUPPORTED_FORMAT', 'E_FILE_TOO_LARGE', 'E_CYCLE_INVALID', 'E_NETWORK', 'E_SESSION_NOT_FOUND',
  'E_SESSION_STALE', 'E_FILE_NOT_FOUND', 'E_MAPPING_NOT_FOUND', 'E_CANNOT_DELETE_DEFAULT_MAPPING', 'E_SRC_OVERRIDE_INVALID_FIELD',
  'E_ORPHAN_ASSIGNMENT_INVALID'
];

describe('friendlyError', () => {
  it('mỗi mã lỗi có một câu tiếng Việt riêng, không phải mã kỹ thuật', () => {
    const texts = CODES.map((c) => friendlyError(c, 'raw english'));
    for (const [i, t] of texts.entries()) {
      expect(t, CODES[i]).not.toBe('raw english');
      expect(t).not.toContain('E_');
      expect(t).toMatch(/[ạảãàáâấầẩẫậăắằẳẵặẹẻẽèéêếềểễệỉĩịọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựỳỷỹỵđ]/i);
    }
    expect(new Set(texts).size).toBe(CODES.length);
  });

  it('mã lạ giữ thông báo gốc; lỗi 5xx dùng câu lỗi máy chủ', () => {
    expect(friendlyError('E_WHATEVER', 'Server said X')).toBe('Server said X');
    const generic = friendlyError('E_HTTP_500', 'x', 500);
    expect(generic).toContain('Máy chủ gặp lỗi');
    expect(friendlyError('E_WHATEVER', 'x', 503)).toBe(generic);
  });

  it('phản hồi 500 không phải JSON thành câu lỗi máy chủ', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('not json'); } } as unknown as Response);
    const e = await api.getActiveCycle().catch((x: unknown) => x);
    expect((e as ApiError).message).toBe(friendlyError('E_HTTP_500', '', 500));
  });
});

describe('api client (Giai đoạn 1)', () => {
  it('ingestUpload gửi FormData tới /api/v1/ingest/upload kèm cycle_id, mapping_id', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ success: true, session_id: 's1', rows: [] }));
    const file = new File(['Summary,Issue key\nI.C.1.2 A,K-1'], 'test.csv', { type: 'text/csv' });
    const res = await api.ingestUpload(file, '2026_11_w3', 'map_x', true);
    expect(res.session_id).toBe('s1');
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/v1/ingest/upload');
    expect(init?.method).toBe('POST');
    const fd = init?.body as FormData;
    expect([fd.get('cycle_id'), fd.get('mapping_id'), fd.get('force_reload')]).toEqual(['2026_11_w3', 'map_x', 'true']);
    expect((fd.get('file') as File).name).toBe('test.csv');
  });

  it('lỗi FastAPI detail {code,message} thành ApiError; mất kết nối báo E_NETWORK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(fail(422, { detail: { code: 'E_FILE_UNSUPPORTED_FORMAT', message: 'Hãy lưu sang .xlsx' } }));
    const e = await api.getActiveCycle().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: 'E_FILE_UNSUPPORTED_FORMAT', status: 422 });
    expect((e as ApiError).message).toBe(friendlyError('E_FILE_UNSUPPORTED_FORMAT', 'Hãy lưu sang .xlsx'));
    expect((e as ApiError).message).toContain('.xlsx');
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('failed'));
    await expect(api.getIngestHistory()).rejects.toMatchObject({ code: 'E_NETWORK' });
  });

  it('recalculate / clone / delete dùng đúng đường dẫn và phương thức', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({}));
    await api.recalculate({ session_id: 's1', src_overrides: { phong: 'Dept' } });
    await api.cloneMapping('m1');
    await api.deleteMapping('m1');
    await api.getSession('a b');
    expect(f.mock.calls.map((c) => [c[0], c[1]?.method || 'GET'])).toEqual([
      ['/api/v1/mapping/recalculate', 'POST'], ['/api/v1/mappings/m1/clone', 'POST'], ['/api/v1/mappings/m1', 'DELETE'], ['/api/v1/sessions/a%20b', 'GET']
    ]);
    expect(JSON.parse(f.mock.calls[0][1]?.body as string)).toEqual({ session_id: 's1', src_overrides: { phong: 'Dept' } });
  });
});
