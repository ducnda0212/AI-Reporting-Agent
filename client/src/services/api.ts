/* Máy khách API (server/app): gọi `/api/v1/*` qua proxy của Vite tới 127.0.0.1:8000. Lỗi FastAPI `detail: { code, message }` thành ApiError. */
import type {
  ActiveCycle, ExportExcelIn, ImportFileMeta, IngestResponse, LockReportIn, MappingConfigIn, MappingConfigOut, RecalculateIn,
  SessionDraftIn, SessionDraftOut, SessionDraftSaveRes, VersionItem
} from '@/types';

const BASE = '/api/v1';

const FRIENDLY: Record<string, string> = {
  E_FILE_INVALID_SCHEMA: 'File thiếu cột Summary hoặc Issue key nên không đọc được. Có thể đây không phải file export từ Jira, hãy kiểm tra lại file rồi chọn lại.',
  E_FILE_UNSUPPORTED_FORMAT: 'Định dạng file chưa được hỗ trợ. Hãy dùng file .csv, .tsv, .txt, .xlsx hoặc .xlsm (file .xls cũ: mở bằng Excel rồi lưu thành .xlsx).',
  E_FILE_TOO_LARGE: 'File quá lớn (tối đa 50 MB). Hãy xuất ít cột hoặc ít dòng hơn từ Jira.',
  E_CYCLE_INVALID: 'Kỳ báo cáo không hợp lệ. Hãy tải lại trang rồi thử lại.',
  E_NETWORK: 'Không kết nối được máy chủ. Kiểm tra server đang chạy rồi thử lại.',
  E_SESSION_NOT_FOUND: 'Không tìm thấy lần nhập này, có thể đã bị xoá. Hãy nhập lại file.',
  E_SESSION_STALE: 'Lần nhập này được lưu theo định dạng cũ nên không mở lại được. Hãy nhập lại file.',
  E_FILE_NOT_FOUND: 'File gốc của lần nhập này không còn trên máy chủ. Hãy nhập lại file.',
  E_MAPPING_NOT_FOUND: 'Không tìm thấy cấu hình mapping này, có thể đã bị xoá. Hãy chọn cấu hình khác.',
  E_CANNOT_DELETE_DEFAULT_MAPPING: 'Không xoá được cấu hình mặc định. Hãy đặt cấu hình khác làm mặc định trước.',
  E_SRC_OVERRIDE_INVALID_FIELD: 'Cột này không đổi được nguồn Jira.',
  E_OVERRIDE_INVALID_FIELD: 'Cột này không đổi được nguồn Jira.',
  E_DRAFT_NOT_FOUND: 'Chưa có bản nháp cho lần nhập này.',
  E_ORPHAN_ASSIGNMENT_INVALID: 'Không gắn được issue vào dự án đã chọn.',
  E_VERSION_NOT_FOUND: 'Không tìm thấy bản đã chốt này, có thể đã bị xoá. Hãy tải lại trang.',
  E_LOCK_BY_REQUIRED: 'Cần nhập tên người chốt bản.'
};
const SERVER_ERROR = 'Máy chủ gặp lỗi khi xử lý. Thử lại sau, nếu vẫn lỗi hãy báo người phụ trách.';

/** Câu tiếng Việt cho người dùng thay cho mã lỗi của máy chủ; mã lạ giữ thông báo gốc. */
export function friendlyError(code: string, fallback: string, status = 0): string {
  return FRIENDLY[code] || (status >= 500 || /^E_HTTP_5/.test(code) ? SERVER_ERROR : fallback);
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(friendlyError(code, message, status));
  }
}

async function rawRequest(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(BASE + path, init);
  } catch {
    throw new ApiError('E_NETWORK', '', 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
    const d = body?.detail as { code?: string; message?: string } | string | undefined;
    if (d && typeof d === 'object' && d.code) throw new ApiError(d.code, d.message || d.code, res.status);
    throw new ApiError('E_HTTP_' + res.status, typeof d === 'string' ? d : 'Máy chủ trả lỗi ' + res.status, res.status);
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await (await rawRequest(path, init)).json()) as T;
}

export interface ExportBlobRes { blob: Blob; fileName: string }

/** Tải file: tên file do máy chủ gửi qua `X-Exported-Filename` (đã mã hoá %). */
async function requestBlob(path: string, init?: RequestInit): Promise<ExportBlobRes> {
  const res = await rawRequest(path, init);
  const raw = res.headers.get('X-Exported-Filename');
  return { blob: await res.blob(), fileName: raw ? decodeURIComponent(raw) : 'bao-cao.xlsx' };
}

const json = (method: string, body?: unknown): RequestInit => ({
  method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
});

export const api = {
  getActiveCycle: (): Promise<ActiveCycle> => request('/cycles/active'),
  getIngestHistory: (): Promise<ImportFileMeta[]> => request('/ingest/history'),
  ingestUpload(file: File, cycleId: string, mappingId?: string | null, forceReload = false): Promise<IngestResponse> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('cycle_id', cycleId);
    fd.append('force_reload', String(forceReload));
    if (mappingId) fd.append('mapping_id', mappingId);
    return request('/ingest/upload', { method: 'POST', body: fd });
  },
  getSession: (sessionId: string): Promise<IngestResponse> => request('/sessions/' + encodeURIComponent(sessionId)),
  listMappings: (): Promise<MappingConfigOut[]> => request('/mappings'),
  createMapping: (req: MappingConfigIn): Promise<MappingConfigOut> => request('/mappings', json('POST', req)),
  cloneMapping: (id: string, newName?: string): Promise<MappingConfigOut> =>
    request('/mappings/' + id + '/clone', json('POST', newName ? { new_name: newName } : {})),
  updateMapping: (id: string, req: Partial<MappingConfigIn>): Promise<MappingConfigOut> => request('/mappings/' + id, json('PUT', req)),
  setDefaultMapping: (id: string): Promise<MappingConfigOut> => request('/mappings/' + id + '/set-default', json('POST')),
  async deleteMapping(id: string): Promise<void> { await request('/mappings/' + id, json('DELETE')); },
  saveDraft: (sessionId: string, req: SessionDraftIn): Promise<SessionDraftSaveRes> =>
    request('/sessions/' + encodeURIComponent(sessionId) + '/draft', json('PUT', req)),
  async getDraft(sessionId: string): Promise<SessionDraftOut | null> {
    try { return await request('/sessions/' + encodeURIComponent(sessionId) + '/draft'); }
    catch (e) { if (e instanceof ApiError && e.code === 'E_DRAFT_NOT_FOUND') return null; throw e; }
  },
  recalculate: (req: RecalculateIn): Promise<IngestResponse> => request('/mapping/recalculate', json('POST', req)),
  listVersions: (cycleMonth?: string): Promise<VersionItem[]> =>
    request('/reports/versions' + (cycleMonth ? '?cycle_month=' + encodeURIComponent(cycleMonth) : '')),
  lockReport: (req: LockReportIn): Promise<VersionItem> => request('/reports/lock', json('POST', req)),
  exportExcel: (req: ExportExcelIn): Promise<ExportBlobRes> => requestBlob('/reports/export-excel', json('POST', req)),
  downloadVersionExcel: (versionId: string): Promise<ExportBlobRes> =>
    requestBlob('/reports/export-excel?version_id=' + encodeURIComponent(versionId))
};
