/* Giá trị ô, nguồn ô và tìm kiếm. Port từ prototype v4 (cellValue, locked, optsFor, sourceValue, displayText, refOf, spillCls, mapNorm). */
import { FIELDS, GRP, MAN3, PROG_MAP, PROG_VALUES, STAGES, STATUS_MAP, STATUS_VALUES, TODAY, WEEKS } from '@/data/constants';
import type { AppState, Field, FieldGroup, FieldId, FieldKind, Row, WeekKey } from '@/types';

/** Các tuần của kỳ đang mở (không có thì đọc `WEEKS` toàn cục do `setCycle` cập nhật). */
export type WeeksCtx = Partial<Pick<AppState, 'weeks'>>;
/** Phần state mà cellValue cần: bảng quy đổi Phase → bước, và các tuần của kỳ. */
export type CellCtx = Pick<AppState, 'phaseBucket'> & WeeksCtx;

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

/** Tuần đang làm của kỳ (`cur`); chưa có kỳ thì tuần 3. */
export const activeWkOf = (s?: WeeksCtx): WeekKey => (s?.weeks?.find((w) => w.cur)?.k ?? WEEKS.find((w) => w.cur)?.k ?? 'w3') as WeekKey;

type WeekState = 'cur' | 'past' | 'future';
/** Trạng thái của khối tuần theo kỳ; `undefined` khi chưa biết kỳ (bảng chưa nạp) để dùng loại cột gốc. */
function weekState(grp: string, s?: WeeksCtx): WeekState | undefined {
  if (s?.weeks?.length) { const w = s.weeks.find((x) => x.k === grp); return w ? (w.future ? 'future' : w.cur ? 'cur' : 'past') : undefined; }
  if (WEEKS.length) { const w = WEEKS.find((x) => x.k === grp); return w ? (w.cur ? 'cur' : 'past') : 'future'; }
  return undefined;
}

/** Loại cột theo kỳ: khối tuần đang làm sửa được (`report`, hoặc `ai` nếu cột gốc là AI), tuần chưa tới là `future`, tuần đã qua là `past`. */
export function effectiveKind(f: Field, s?: WeeksCtx): FieldKind {
  const st = /^w[1-4]$/.test(f.grp) ? weekState(f.grp, s) : undefined;
  return !st ? f.kind : st === 'future' ? 'future' : st === 'cur' ? (f.kind === 'ai' ? 'ai' : 'report') : 'past';
}

/** Nhãn ngắn của tuần trên nút khối cột / Cấu hình mẫu: T01/11, T02/11, T3/11, T4/11 (tháng theo mã kỳ `YYYY_MM_wN`). */
export const wkShort = (k: string, cycleId: string): string => 'T' + (+k[1] < 3 ? '0' + k[1] : k[1]) + '/' + (cycleId.slice(5, 7) || '11');

/** Tên khối cột: khối tuần lấy tên tuần của kỳ (bỏ phần ngày), khối khác theo `GRP`. */
export function grpName(g: FieldGroup, s?: WeeksCtx): string {
  return /^w[1-4]$/.test(g) ? (s?.weeks?.find((w) => w.k === g)?.name ?? GRP[g]).split(' · ')[0] : GRP[g];
}

export const locked = (f: Field, s?: WeeksCtx): boolean =>
  !!f.key || ['cfg', 'future', 'none', 'past'].includes(effectiveKind(f, s)) || ((f.grp === 'w1' || f.grp === 'w2') && !weekState(f.grp, s));

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

/* Trạng thái / tiến độ: sửa tay, rồi giá trị máy chủ đã quy đổi theo cấu hình mapping, rồi bảng quy đổi mặc định. */
const statusOf = (r: Row): string | null => r.ovr?.tt || r.tt || mapNorm(STATUS_MAP, r.rawStatus) || null;
const progOf = (r: Row): string | undefined => r.td || mapNorm(PROG_MAP, r.rawProgress);

/* Cột `cfg` (hệ thống) của bản gọn không có danh mục: lấy thẳng trên dòng (`r.mang` do bước nạp dữ liệu gán). */
export function cellValue(r: Row, f: Field, ctx: CellCtx): string | null {
  const o = r.ovr?.[f.id];
  if (o) return o;
  const text = (r as Partial<Record<FieldId, string>>)[f.id] || null;
  if (f.kind === 'cfg') return text;
  switch (f.id) {
    case 'ma': return r.ma;
    case 'tt': return statusOf(r);
    case 'td': return normKey(r.rawStatus) === 'PENDING' ? 'Tạm dừng' : progOf(r) || null;
    case 'tt1': {
      /* đề xuất, chờ chốt: kết hợp thời gian (Start/Due so với ngày báo cáo) và Tiến độ */
      if (r.tt1 && !r.ovr?.tt && !r.ovr?.td) return r.tt1;
      const t = statusOf(r);
      if (!t) return null;
      if (t === 'Hủy' || t === 'Tạm dừng') return t;
      const due = parseVN(r.end);
      const prog = progOf(r);
      let late = r.ovr?.td ? r.ovr.td === 'Chậm tiến độ' : prog === 'Chậm tiến độ';
      if (t === 'Chưa thực hiện') return due && due < TODAY ? 'Chưa thực hiện Chậm tiến độ' : 'Trong kế hoạch';
      if (t === 'Đã hoàn thành') return 'Đã hoàn thành ' + (late ? 'Chậm tiến độ' : 'Đúng tiến độ');
      if (due && due < TODAY) late = true;
      if (!late && !prog && !r.ovr?.td) return null;
      return 'Đang thực hiện ' + (late ? 'Chậm tiến độ' : 'Đúng tiến độ');
    }
    case 'buoc': { if (r.buoc) return r.buoc; const n = ctx.phaseBucket[r.rawPhase]; return n ? n + '. ' + STAGES[n - 1] : null; }
    case 'buocso': { if (r.buocso) return r.buocso; const n = ctx.phaseBucket[r.rawPhase]; return n ? 'Bước ' + n : null; }
    case 'note': {
      const auto = Object.keys(r.reasons)
        .map((k) => 'GĐ ' + (+k + 1) + ': ' + r.reasons[k as FieldId])
        .concat(Object.keys(r.ovr || {}).filter((k) => k !== 'note').map((k) => {
          const raw = OVR_RAW[k as keyof typeof OVR_RAW];
          return fieldById(k)!.col + ' sửa tay' + (raw ? ' (Jira: ' + r[raw] + ')' : '');
        })).join(' · ');
      return [r.note, auto].filter(Boolean).join(' · ') || null;
    }
    case 'rui': return r.ai[f.id]?.text ?? null;
    /* kh / vd: nháp AI nếu có, không thì nội dung máy chủ bóc từ Progress Report / Risk Notes */
    case 'kh': case 'vd': return r.ai[f.id]?.text ?? text;
  }
  const k = effectiveKind(f, ctx);
  if (k === 'none' || k === 'future') return null;
  return text;
}

/** Giá trị ô khi bỏ phần sửa tay (để so với nguồn). */
export function sourceValue(r: Row, f: Field, ctx: CellCtx): string | null {
  const { [f.id]: _drop, ...ovr } = r.ovr;
  return cellValue({ ...r, ovr }, f, ctx);
}

/** Chữ hiển thị/tìm kiếm trong ô; nháp AI chưa duyệt vẫn đọc được. */
export function displayText(r: Row, f: Field, ctx: CellCtx): string {
  const k = effectiveKind(f, ctx);
  if (k === 'future' || k === 'none') return '';
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
