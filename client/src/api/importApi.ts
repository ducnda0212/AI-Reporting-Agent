import type { ImportHistoryItem, ImportUploadResponse } from '@/types';

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    let isJson = true;
    try { const d = (await r.json()).detail; if (d) msg = typeof d === 'string' ? d : JSON.stringify(d); } catch { isJson = false; /* body không phải JSON */ }
    throw Object.assign(new Error(msg), { offline: !isJson && [500, 502, 503, 504].includes(r.status) });
  }
  return r.json();
}

export async function uploadJiraCsv(file: File, targetWeek = 'w3'): Promise<ImportUploadResponse> {
  const body = new FormData();
  body.append('file', file);
  return json(await fetch(`/api/import/upload?target_week=${encodeURIComponent(targetWeek)}`, { method: 'POST', body }));
}

export const getImportHistory = async (): Promise<ImportHistoryItem[]> => json(await fetch('/api/import/history'));

export const reapplyHistoryFile = async (fileId: string): Promise<ImportUploadResponse> =>
  json(await fetch(`/api/import/history/${encodeURIComponent(fileId)}`));
