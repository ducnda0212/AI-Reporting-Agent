import type { TplStatus } from '../types';
import { mutate } from '../index';
import { setToast } from '../helpers';

/** Thư viện mẫu báo cáo + màn cấu hình mẫu 49 cột. */

export const tlFilter = (f: 'all' | TplStatus) => mutate((d) => { d.tlFlt = f; });
export const tlSearch = (q: string) => mutate((d) => { d.tlQ = q; });

export const tlOpen = (id: string) => mutate((d) => {
  d.menu = null;
  if (id === 't49') { if (d.view !== 'tpl' && !d.panel) d.panel = 'tvcfg'; d.view = 'tpl'; }
  else if (id === 'texec') d.view = 'exec';
  else { d.view = 'tlib'; d.tlDraft = id; }
});

/** Nhân bản một mẫu (mặc định: mẫu đầu tiên) thành bản nháp mới. */
export const tlDuplicate = (id?: string) => mutate((d) => {
  const src = d.tpls.find((t) => t.id === id) || d.tpls[0];
  d.tpls.push({ id: 'tc' + Date.now(), name: src.name + ' (bản sao)', file: '', fmt: src.fmt, size: src.size, st: 'draft', used: '', by: 'Khuê', at: '17/11/2026', desc: `Nhân bản từ “${src.name}”.` });
  d.menu = null; d.tlFlt = 'all';
  setToast(d, 'Đã tạo bản nháp từ ' + src.name);
});

export const tlArchive = (id: string) => mutate((d) => {
  const t = d.tpls.find((x) => x.id === id);
  if (!t || t.main) return;
  t.st = 'arch'; d.menu = null; setToast(d, 'Đã lưu trữ ' + t.name);
});
export const tlRestore = (id: string) => mutate((d) => {
  const t = d.tpls.find((x) => x.id === id);
  if (!t) return;
  t.st = 'draft'; d.menu = null; setToast(d, 'Đã khôi phục thành bản nháp');
});
export const tlUse = (id: string) => mutate((d) => {
  const t = d.tpls.find((x) => x.id === id);
  if (!t) return;
  t.st = 'use'; t.used = 'Tuần 3/11'; d.menu = null; d.tlDraft = null;
  setToast(d, t.name + ' sẽ được xuất cùng tuần 3/11');
});
export const tlUpload = () => mutate((d) => { d.menu = null; setToast(d, 'Bản thử: chọn file .xlsx có dòng tiêu đề để tạo mẫu'); });

export const tpKind = (k: string) => mutate((d) => { d.tpK = k; });
export const tpToggleMiss = () => mutate((d) => { d.tpMiss = !d.tpMiss; if (d.tpMiss) d.tpK = ''; });
export const tpSearch = (q: string) => mutate((d) => { d.tpQ = q; });
