import { createStore, useStore as useZustand } from 'zustand';
import { PV_EXT, parseFile, type PvParsed } from '@/lib/filePreview';
import { toast } from './actions/flow';

/** File đang chọn ở bước Nhập file. Tách khỏi store chính vì chỉ sống tới lúc bấm "Đọc file này". */
export interface PvFile extends Partial<PvParsed> { name: string; size: number; ext: string; loading: boolean; err?: string; done?: boolean }
interface PvState { file: PvFile | null; sheet: number; fullscreen: boolean }

export const pvStore = createStore<PvState>(() => ({ file: null, sheet: 0, fullscreen: false }));
export const usePv = <T,>(sel: (s: PvState) => T) => useZustand(pvStore, sel);

let token = 0;
export function stageFile(file: File) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!PV_EXT.includes(ext)) { toast('Chỉ nhận file CSV hoặc Excel (.csv, .xlsx)'); return; }
  const tk = ++token;
  pvStore.setState({ file: { name: file.name, size: file.size, ext, loading: true }, sheet: 0, fullscreen: false });
  const fail = (err: string) => { if (tk === token) pvStore.setState((s) => ({ file: s.file && { ...s.file, loading: false, err } })); };
  if (file.size > 60 * 1048576) return fail('File lớn hơn 60 MB, không xem trước được.');
  file.arrayBuffer().then((b) => parseFile(b, ext)).then((res) => {
    if (tk === token) pvStore.setState((s) => ({ file: s.file && { ...s.file, ...res, loading: false } }));
  }).catch((e: Error) => fail(e?.message || 'Không đọc được file này.'));
}
export function clearFile() { token++; pvStore.setState({ file: null, sheet: 0, fullscreen: false }); }
export const setSheet = (k: number) => pvStore.setState({ sheet: k });
export const setFullscreen = (on: boolean) => pvStore.setState({ fullscreen: on });
export const markDone = (done: boolean) => pvStore.setState((s) => ({ file: s.file && { ...s.file, done } }));
