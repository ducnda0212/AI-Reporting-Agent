/* Giá trị ô, nguồn ô và tìm kiếm. Port từ prototype v4 (cellValue, locked, optsFor, sourceValue, displayText, refOf, spillCls, mapNorm). */
import { FIELDS, MAN3, PROG_MAP, PROG_VALUES, STAGES, STATUS_MAP, STATUS_VALUES, TODAY } from '@/data/constants';
import type { AppState, Field, FieldId, Row } from '@/types';

/** Phần state mà cellValue cần: bảng quy đổi Phase → bước. */
export type CellCtx = Pick<AppState, 'phaseBucket'>;

const OVR_RAW = { tt: 'rawStatus', td: 'rawProgress' } as const;

export const fieldById = (id: string): Field | undefined => FIELDS.find((f) => f.id === id);

/** A=1, Z=26, AA=27 (cột Excel, đếm từ 1 như prototype). */
export function colNum(c: string): number {
  let n = 0;
  for (let k = 0; k < c.length; k++) n = n * 26 + (c.charCodeAt(k) - 64);
  return n;
}
export const colLetter = (f: Pick<Field, 'col'>): string => f.col;
export const ck = (i: number, fid: string): string => i + '|' + fid;
/** Tham chiếu ô kiểu Excel; dòng mới (chưa có trong mẫu) hiện `+`. */
export const refOf = (r: Pick<Row, 'tplRow'>, f: Pick<Field, 'col'>): string => f.col + (r.tplRow || '+');

export function parseVN(d: string | null | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '');
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

const normKey = (s: unknown): string => String(s || '').trim().toUpperCase().replace(/[\s_-]+/g, ' ');
/** Tra bảng quy đổi, bỏ qua khác biệt hoa/thường, khoảng trắng, `_`, `-`. */
export function mapNorm(map: Record<string, string>, raw: string): string | undefined {
  if (raw in map) return map[raw];
  const n = normKey(raw);
  const k = Object.keys(map).find((x) => normKey(x) === n);
  return k === undefined ? undefined : map[k];
}

export const locked = (f: Field): boolean =>
  !!f.key || f.kind === 'cfg' || ['future', 'none', 'past'].includes(f.kind) || f.grp === 'w1' || f.grp === 'w2';

export function optsFor(f: Field): readonly string[] | null {
  if (f.opts) return f.opts;
  if (f.id === 'tt') return STATUS_VALUES;
  if (f.id === 'td') return PROG_VALUES;
  if (f.id === 'rui') return MAN3;
  if (f.id === 'buoc') return STAGES.map((x, k) => k + 1 + '. ' + x);
  if (f.id === 'buocso') return STAGES.map((_x, k) => 'Bước ' + (k + 1));
  return null;
}

/** Tên cột dùng trong chữ gợi ý "Chọn …" / "Nhập …" (bỏ phần trong ngoặc, sau dấu phẩy; chữ đầu viết thường). */
export function phName(f: Pick<Field, 'name'>): string {
  const n = f.name.split(' (')[0].split(',')[0].trim();
  return n.length > 1 && n[1] === n[1].toLowerCase() ? n[0].toLowerCase() + n.slice(1) : n;
}

/** Ô có giá trị gốc lấy từ nguồn (Jira/quy đổi/tính/báo cáo) nên sửa tay sẽ lệch nguồn. */
export const isSrc = (f: Field): boolean => ['jira', 'bucket', 'calc', 'report', 'tpl'].includes(f.kind);

const statusOf = (r: Row): string | null => r.ovr?.tt || mapNorm(STATUS_MAP, r.rawStatus) || null;

/* Cột `cfg` (hệ thống) của bản gọn không có danh mục: lấy thẳng trên dòng (`r.mang` do bước nạp dữ liệu gán). */
export function cellValue(r: Row, f: Field, ctx: CellCtx): string | null {
  const o = r.ovr?.[f.id];
  if (o) return o;
  const text = (r as Partial<Record<FieldId, string>>)[f.id] || null;
  if (f.kind === 'cfg') return text;
  switch (f.id) {
    case 'ma': return r.ma;
    case 'tt': return statusOf(r);
    case 'td': return normKey(r.rawStatus) === 'PENDING' ? 'Tạm dừng' : mapNorm(PROG_MAP, r.rawProgress) || null;
    case 'tt1': {
      /* đề xuất, chờ chốt: kết hợp thời gian (Start/Due so với ngày báo cáo) và Tiến độ */
      const t = statusOf(r);
      if (!t) return null;
      if (t === 'Hủy' || t === 'Tạm dừng') return t;
      const due = parseVN(r.end);
      const prog = mapNorm(PROG_MAP, r.rawProgress);
      let late = r.ovr?.td ? r.ovr.td === 'Chậm tiến độ' : prog === 'Chậm tiến độ';
      if (t === 'Chưa thực hiện') return due && due < TODAY ? 'Chưa thực hiện Chậm tiến độ' : 'Trong kế hoạch';
      if (t === 'Đã hoàn thành') return 'Đã hoàn thành ' + (late ? 'Chậm tiến độ' : 'Đúng tiến độ');
      if (due && due < TODAY) late = true;
      if (!late && !prog && !r.ovr?.td) return null;
      return 'Đang thực hiện ' + (late ? 'Chậm tiến độ' : 'Đúng tiến độ');
    }
    case 'buoc': { const n = ctx.phaseBucket[r.rawPhase]; return n ? n + '. ' + STAGES[n - 1] : null; }
    case 'buocso': { const n = ctx.phaseBucket[r.rawPhase]; return n ? 'Bước ' + n : null; }
    case 'note': {
      const auto = Object.keys(r.reasons)
        .map((k) => 'GĐ ' + (+k + 1) + ': ' + r.reasons[k as FieldId])
        .concat(Object.keys(r.ovr || {}).filter((k) => k !== 'note').map((k) => {
          const raw = OVR_RAW[k as keyof typeof OVR_RAW];
          return fieldById(k)!.col + ' sửa tay' + (raw ? ' (Jira: ' + r[raw] + ')' : '');
        })).join(' · ');
      return [r.note, auto].filter(Boolean).join(' · ') || null;
    }
    case 'rui': case 'kh': case 'vd': return r.ai[f.id]?.text ?? null;
  }
  if (f.kind === 'none' || f.kind === 'future') return null;
  return text;
}

/** Giá trị ô khi bỏ phần sửa tay (để so với nguồn). */
export function sourceValue(r: Row, f: Field, ctx: CellCtx): string | null {
  const { [f.id]: _drop, ...ovr } = r.ovr;
  return cellValue({ ...r, ovr }, f, ctx);
}

/** Chữ hiển thị/tìm kiếm trong ô; nháp AI chưa duyệt vẫn đọc được. */
export function displayText(r: Row, f: Field, ctx: CellCtx): string {
  if (f.kind === 'future' || f.kind === 'none') return '';
  let v = cellValue(r, f, ctx);
  if (v === null && f.kind === 'ai' && r.ai[f.id as 'rui']) v = r.ai[f.id as 'rui']!.text;
  return v === null ? '' : String(v);
}

/** Lớp màu "chip" của ô trạng thái/tiến độ: e lỗi, w cảnh báo, n trung tính, o ổn, b đang chạy. */
export function spillCls(t: string): 'e' | 'w' | 'n' | 'o' | 'b' {
  t = String(t || '');
  if (/Chậm|Hủy|Huỷ/.test(t)) return 'e';
  if (/Tạm dừng|Chưa thực hiện|Trong kế hoạch/.test(t)) return /Tạm dừng/.test(t) ? 'w' : 'n';
  if (/Đúng tiến độ|Đã hoàn thành/.test(t)) return 'o';
  if (/Đang thực hiện/.test(t)) return 'b';
  return 'n';
}
