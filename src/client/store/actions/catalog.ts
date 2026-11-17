import type { AppState } from '../types';
import { DEMO, SYS_PROJ, SYS_UNIT } from '@/data/constants';
import { fieldOf, selectRows } from '@/lib/cell';
import { sysVal } from '@/lib/catalog';
import { clone, nowStr } from '@/lib/text';
import { pushLog, setToast } from '../helpers';
import { mutate } from '../index';

/** "Dữ liệu hệ thống": yêu cầu sửa, chạy lại báo cáo, nạp bảng mẫu. */

const roleName = (d: AppState, id: string) => { const f = fieldOf(d, id); return `${f.col} ${f.name}`; };

export const setCatTab = (t: string) => mutate((d) => { d.view = 'cat'; d.catTab = t; d.modal = null; });
export const setCatAdmin = (on: boolean) => mutate((d) => { d.catAdmin = on; if (on && d.reqs.some((q) => q.status === 'pending')) d.catTab = 'req'; });
export const setCatQuery = (q: string) => mutate((d) => { d.catQ = q.trim().toUpperCase().replace(/\s+/g, ''); });
export const pickCatProject = (code: string) => mutate((d) => { d.catQ = code; });

/** mở form yêu cầu sửa; nếu mã chưa có trên hệ thống thì chuyển sang form tạo mới */
export function openEditRequest(code: string, field?: string, to?: string) {
  mutate((d) => {
    d.panel = null;
    if (!d.cat.projects[code]) {
      const r = d.allRows.find((x) => x.code === code);
      d.reqForm = { type: 'new', code, task: r ? r.task : '', g: r ? r.g : '' };
    } else {
      d.reqForm = { type: 'edit', code, field: field || 'pic', to: to || '', reason: to ? `Jira đang ghi “${to}”` : '' };
    }
    d.modal = 'req';
  });
}
export function openNewRequest(code: string) {
  mutate((d) => {
    const r = d.allRows.find((x) => x.code === code);
    d.reqForm = { type: 'new', code, task: r ? r.task : '', g: r ? r.g : code.split('.').slice(0, 3).join('.') };
    d.modal = 'req';
  });
}
export const setReqField = (field: string) => mutate((d) => { if (d.reqForm) { d.reqForm.field = field; d.reqForm.to = ''; } });

export interface ReqInput { why: string; task?: string; g?: string; pic?: string; field?: string; to?: string }
export function sendRequest(inp: ReqInput) {
  mutate((d) => {
    const F = d.reqForm;
    if (!F) return;
    const x: AppState['reqs'][number] = { id: Date.now(), code: F.code, type: F.type, at: nowStr(), by: d.lockBy, reason: inp.why.trim(), status: 'pending' };
    if (F.type === 'new') {
      x.task = (inp.task || '').trim(); x.g = inp.g || ''; x.pic = inp.pic || '';
      if (!x.g) { setToast(d, 'Chọn Mảng việc'); return; }
    } else {
      x.field = inp.field; x.from = sysVal(d, F.code, x.field!); x.to = (inp.to || '').trim();
      if (!x.to) { setToast(d, 'Nhập giá trị đúng'); return; }
      if (x.to === x.from) { setToast(d, 'Giá trị mới trùng giá trị đang lưu'); return; }
    }
    d.reqs.push(x); d.modal = null; d.reqForm = null;
    pushLog(d, 'Gửi yêu cầu sửa hệ thống', x.code, x.type === 'new' ? 'Tạo dự án mới' : `${roleName(d, x.field!)}: ${x.from || '(trống)'} → ${x.to}`, 'Hệ thống');
    setToast(d, 'Đã gửi yêu cầu — báo cáo giữ giá trị cũ đến khi hệ thống cập nhật');
  });
}

function applyReq(d: AppState, x: AppState['reqs'][number]) {
  if (x.type === 'new') {
    const g = x.g!;
    if (!d.cat.units[g]) d.cat.units[g] = { name: DEMO.workstream[g] || g, divisionHead: '', department: '', deptHead: '' };
    d.cat.projects[x.code] = { g, task: x.task || '', objective: '', kpi: '', pic: x.pic || '', start: '', end: '', businessOwner: '', po: '', aiEngineer: '', aiResearcher: '', mlopsEngineer: '', softwareEngineer: '' };
  } else if (x.field === 'workstream') {
    const p = d.cat.projects[x.code];
    if (p && d.cat.units[p.g]) d.cat.units[p.g].name = x.to!;
  } else if (SYS_UNIT.includes(x.field!)) {
    const p = d.cat.projects[x.code];
    if (p) { const u = (d.cat.units[p.g] = d.cat.units[p.g] || { name: p.g, divisionHead: '', department: '', deptHead: '' }); (u as unknown as Record<string, string>)[x.field!] = x.to!; }
  } else if (d.cat.projects[x.code]) d.cat.projects[x.code][x.field!] = x.to!;
}

/** quản trị hệ thống duyệt / từ chối yêu cầu */
export function resolveRequest(id: number, ok: boolean) {
  mutate((d) => {
    const x = d.reqs.find((y) => y.id === id);
    if (!x) return;
    if (ok) {
      applyReq(d, x); x.status = 'done'; d.catPend++;
      pushLog(d, 'Hệ thống cập nhật', x.code, x.type === 'new' ? 'Đã tạo dự án' : `${roleName(d, x.field!)} → ${x.to}`, 'Hệ thống');
      setToast(d, 'Hệ thống đã cập nhật — báo cáo cần chạy lại');
    } else {
      x.status = 'rejected';
      pushLog(d, 'Hệ thống từ chối yêu cầu', x.code, x.type === 'new' ? 'Tạo dự án mới' : roleName(d, x.field!));
    }
  });
}

export function rerunReport() {
  mutate((d) => {
    const n = d.catPend;
    d.catRun = clone(d.cat); d.catPend = 0; d.catRunAt = nowStr();
    d.reqs.forEach((y) => { if (y.status === 'done') y.run = true; });
    pushLog(d, 'Chạy lại báo cáo', 'Tuần 3/11', `Lấy ${n} thông tin mới từ hệ thống`, 'Hệ thống');
    setToast(d, 'Đã chạy lại báo cáo với dữ liệu hệ thống mới nhất');
  });
}

/** nạp bảng mẫu .xlsx vào hệ thống; thư viện đọc Excel tải theo nhu cầu */
interface XlsxLib { read: (d: ArrayBuffer, o: object) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_json: (ws: unknown, o: object) => unknown[][] } }
declare global { interface Window { XLSX?: XlsxLib } }

function loadXlsx(): Promise<XlsxLib> {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, no) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    sc.onload = () => ok(window.XLSX!); sc.onerror = () => no(new Error('Không tải được thư viện đọc Excel'));
    document.head.appendChild(sc);
  });
}

export async function importSysFile(file: File) {
  try {
    const X = await loadXlsx();
    const buf = await file.arrayBuffer();
    const wb = X.read(buf, { type: 'array', cellDates: true });
    const aoa = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    mutate((d) => {
      const hr = aoa.findIndex((row) => row.some((v) => String(v).trim() === 'Mã DA'));
      if (hr < 0) { setToast(d, 'Không thấy dòng tiêu đề có “Mã DA” trong file'); return; }
      const byName: Record<string, string> = {};
      d.fields.forEach((f) => { byName[f.name] = f.id; });
      const idx = aoa[hr].map((h) => { const t = String(h).trim(); return t === 'Mã DA' ? 'code' : byName[t] || null; });
      const fmt = (v: unknown) => (v instanceof Date ? `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}` : String(v).trim());
      let n = 0;
      aoa.slice(hr + 1).forEach((row) => {
        const o: Record<string, string> = {};
        idx.forEach((id, k) => { if (id) o[id] = fmt(row[k]); });
        if (!o.code || /^Cột /.test(o.code)) return;
        const g = ((o.workstream || '').match(/^([IVX]+\.[A-Z]\.\d+)/) || [])[1] || o.code.split('.').slice(0, 3).join('.');
        const u = (d.cat.units[g] = d.cat.units[g] || { name: o.workstream || g, divisionHead: '', department: '', deptHead: '' }) as unknown as Record<string, string>;
        SYS_UNIT.forEach((id) => { if (o[id]) u[id] = o[id]; });
        if (o.workstream) u.name = o.workstream;
        const pj = d.cat.projects[o.code] || ({ g } as AppState['cat']['projects'][string]);
        pj.g = g;
        SYS_PROJ.forEach((id) => { if (id in o) pj[id] = o[id]; });
        d.cat.projects[o.code] = pj; n++;
      });
      d.catPend += n;
      pushLog(d, 'Nạp bảng mẫu vào hệ thống', file.name, `${n} dự án · chạy lại báo cáo để áp dụng`, 'Hệ thống');
      setToast(d, `Đã nạp ${n} dự án vào hệ thống — bấm “Chạy lại báo cáo” để áp dụng`);
    });
  } catch (e) {
    mutate((d) => setToast(d, 'Không đọc được file: ' + (e as Error).message));
  }
}

export { selectRows };
