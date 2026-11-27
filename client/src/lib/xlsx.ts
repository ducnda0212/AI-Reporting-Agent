/* Đọc file CSV/XLSX/XLS (xem trước khi nhập) và xuất báo cáo .xlsx 49 cột (OOXML thuần JS). Port từ prototype v4.
   API trình duyệt (DecompressionStream, DOMParser, document) chỉ dùng bên trong hàm, không chạy lúc import. */
import { FIELDS, GRP } from '@/data/constants';
import type { AppState, Field, PreviewSheet, Row } from '@/types';
import { displayText, type CellCtx } from './cell';
import { groupedRows, sortRows, visibleFields } from './grid';

export interface ParsedFile { kind: 'csv' | 'xlsx'; enc?: string; delim?: string; sheets: PreviewSheet[] }

/* ---------- số liệu hiển thị của khung xem trước ---------- */
export function pvBytes(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return Math.max(1, Math.round(n / 1024)).toLocaleString('vi-VN') + ' KB';
  return (n / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' MB';
}
/** Tên cột kiểu Excel: 0 → A, 26 → AA. */
export function pvCol(n: number): string {
  let s = '';
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const pvNum = (n: number): string => n.toLocaleString('vi-VN');

function pvSheet(name: string, rows: string[][]): PreviewSheet {
  return { name, rows, nCols: rows.reduce((n, r) => Math.max(n, r.length), 0), nData: Math.max(0, rows.length - 1) };
}
const dropEmptyTail = (rows: string[][]): void => { while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop(); };

/* ---------- CSV ---------- */

/** Dấu phân cách có nhiều nhất ở dòng đầu (bỏ qua phần trong ngoặc kép). */
function pvDelim(text: string): string {
  const head = text.slice(0, 6000);
  let best = ',', bestN = -1;
  [',', ';', '\t', '|'].forEach((d) => {
    let q = false, n = 0;
    for (let i = 0; i < head.length; i++) {
      const c = head[i];
      if (c === '"') q = !q;
      else if (!q && (c === '\n' || c === '\r')) break;
      else if (!q && c === d) n++;
    }
    if (n > bestN) { bestN = n; best = d; }
  });
  return best;
}

export function pvParseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = [], n = text.length, d = delim.charCodeAt(0);
  let row: string[] = [], f = '', i = 0;
  while (i < n) {
    let c = text.charCodeAt(i);
    if (c === 34 && f === '') { /* ô trong ngoặc kép */
      i++;
      for (;;) {
        const j = text.indexOf('"', i);
        if (j < 0) { f += text.slice(i); i = n; break; }
        f += text.slice(i, j); i = j + 1;
        if (text.charCodeAt(i) === 34) { f += '"'; i++; continue; }
        break;
      }
      continue;
    }
    if (c === d) { row.push(f); f = ''; i++; continue; }
    if (c === 10 || c === 13) {
      row.push(f); f = ''; rows.push(row); row = [];
      if (c === 13 && text.charCodeAt(i + 1) === 10) i++;
      i++; continue;
    }
    const s = i;
    while (i < n) { c = text.charCodeAt(i); if (c === d || c === 10 || c === 13) break; i++; }
    f += text.slice(s, i);
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  dropEmptyTail(rows);
  return rows;
}

const DELIM_NAME: Record<string, string> = { ',': 'dấu phẩy', ';': 'dấu chấm phẩy', '\t': 'tab', '|': 'dấu gạch đứng' };

export function pvReadCsv(buf: ArrayBuffer): ParsedFile {
  let enc = 'UTF-8', text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { enc = 'Windows-1252'; text = new TextDecoder('windows-1252').decode(buf); }
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); enc = 'UTF-8 (BOM)'; }
  text = text.replace(/^sep=.\r?\n/i, '');
  const delim = pvDelim(text);
  return { kind: 'csv', enc, delim: DELIM_NAME[delim], sheets: [pvSheet('CSV', pvParseCsv(text, delim))] };
}

/* ---------- ZIP (đọc .xlsx không cần thư viện ngoài) ---------- */

async function pvInflate(u8: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt không hỗ trợ giải nén file .xlsx');
  const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
  w.write(u8); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

export interface Unzipped { files: Record<string, { m: number; z: number; o: number }>; get(name: string): Promise<string | null> }

export function pvUnzip(buf: ArrayBuffer): Unzipped {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), n = u8.length;
  let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('Không phải file .xlsx hợp lệ');
  const cnt = dv.getUint16(eocd + 10, true), files: Unzipped['files'] = {};
  let off = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < cnt; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true);
    files[new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nl))] = { m: dv.getUint16(off + 10, true), z: dv.getUint32(off + 20, true), o: dv.getUint32(off + 42, true) };
    off += 46 + nl + el + cl;
  }
  return {
    files,
    async get(name) {
      const f = files[name];
      if (!f) return null;
      const s = f.o + 30 + dv.getUint16(f.o + 26, true) + dv.getUint16(f.o + 28, true), data = u8.subarray(s, s + f.z);
      return new TextDecoder().decode(f.m === 0 ? data : await pvInflate(data));
    }
  };
}

/* ---------- XLSX ---------- */

function pvTxt(el: Element): string {
  let out = '';
  const ts = el.getElementsByTagName('t');
  for (let i = 0; i < ts.length; i++) { if (ts[i].parentNode?.nodeName === 'rPh') continue; out += ts[i].textContent; }
  return out;
}
/** 0 số, 1 ngày/giờ, 2 phần trăm. */
function pvFmtKind(id: number, code: string | undefined): number {
  if (id === 9 || id === 10) return 2;
  if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return 1;
  if (!code) return 0;
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  if (c.includes('%')) return 2;
  return /[dmyhs]/i.test(c) && !/general/i.test(c) ? 1 : 0;
}
function pvSerial(v: number): string {
  const d = new Date(Math.round((v - 25569) * 864e5)), p = (x: number): string => ('0' + x).slice(-2);
  const time = p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + (d.getUTCSeconds() ? ':' + p(d.getUTCSeconds()) : '');
  if (v < 1) return time;
  const day = p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  return v % 1 > 1e-9 ? day + ' ' + time : day;
}

export async function pvReadXlsx(buf: ArrayBuffer): Promise<ParsedFile> {
  const z = pvUnzip(buf), P = new DOMParser();
  const xml = async (n: string): Promise<Document | null> => { const t = await z.get(n); return t ? P.parseFromString(t, 'application/xml') : null; };
  const wb = await xml('xl/workbook.xml');
  if (!wb) throw new Error('Không thấy workbook.xml — file không phải Excel .xlsx');
  const relMap: Record<string, string> = {}, rels = await xml('xl/_rels/workbook.xml.rels');
  if (rels) Array.from(rels.getElementsByTagName('Relationship')).forEach((r) => { relMap[r.getAttribute('Id')!] = r.getAttribute('Target')!; });
  const ss: string[] = [], sx = await xml('xl/sharedStrings.xml');
  if (sx) Array.from(sx.getElementsByTagName('si')).forEach((si) => ss.push(pvTxt(si)));
  const xf: number[] = [], st = await xml('xl/styles.xml');
  if (st) {
    const nf: Record<string, string> = {};
    Array.from(st.getElementsByTagName('numFmt')).forEach((x) => { nf[x.getAttribute('numFmtId')!] = x.getAttribute('formatCode')!; });
    const cx = st.getElementsByTagName('cellXfs')[0];
    if (cx) Array.from(cx.children).forEach((x) => { const id = +x.getAttribute('numFmtId')!; xf.push(pvFmtKind(id, nf[id])); });
  }
  const sheets: PreviewSheet[] = [], shs = wb.getElementsByTagName('sheet');
  for (let si = 0; si < shs.length; si++) {
    const sh = shs[si], rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || '';
    const tg = relMap[rid] || 'worksheets/sheet' + (si + 1) + '.xml';
    const doc = await xml(tg.charAt(0) === '/' ? tg.slice(1) : 'xl/' + tg.replace(/^\.\//, ''));
    const rows: string[][] = [];
    if (doc) {
      const rs = doc.getElementsByTagName('row');
      for (let ri = 0; ri < rs.length; ri++) {
        const rEl = rs[ri], rIdx = (+rEl.getAttribute('r')! || ri + 1) - 1, cs = rEl.getElementsByTagName('c'), arr: string[] = [];
        let pos = 0;
        for (let ci = 0; ci < cs.length; ci++) {
          const c = cs[ci], ref = c.getAttribute('r');
          let col = pos;
          const m = ref ? /^([A-Z]+)/.exec(ref) : null;
          if (m) { col = 0; for (let q = 0; q < m[1].length; q++) col = col * 26 + (m[1].charCodeAt(q) - 64); col--; }
          pos = col + 1;
          const t = c.getAttribute('t'), vEl = c.getElementsByTagName('v')[0], v = vEl ? vEl.textContent || '' : '';
          let out = '';
          if (t === 's') out = ss[+v] ?? '';
          else if (t === 'inlineStr') out = pvTxt(c);
          else if (t === 'b') out = v === '1' ? 'TRUE' : 'FALSE';
          else if (t === 'str' || t === 'e' || t === 'd') out = v;
          else if (v !== '') {
            const kind = xf[+(c.getAttribute('s') || 0)] || 0, num = parseFloat(v);
            if (isNaN(num)) out = v;
            else if (kind === 1) out = pvSerial(num);
            else if (kind === 2) out = String(+(num * 100).toPrecision(12)) + '%';
            else out = String(+num.toPrecision(15));
          }
          arr[col] = out;
        }
        for (let x = 0; x < arr.length; x++) if (arr[x] === undefined) arr[x] = '';
        rows[rIdx] = arr;
      }
      for (let y = 0; y < rows.length; y++) if (!rows[y]) rows[y] = [];
      dropEmptyTail(rows);
    }
    sheets.push(pvSheet(sh.getAttribute('name') || 'Sheet' + (si + 1), rows));
  }
  if (!sheets.length) throw new Error('File Excel không có sheet nào');
  return { kind: 'xlsx', sheets };
}

/* dự phòng: SheetJS cho file .xls cũ hoặc khi đọc trực tiếp thất bại (tải từ CDN khi cần) */
interface SheetJS {
  read(buf: ArrayBuffer, o: { type: 'array'; cellDates: boolean }): { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json(ws: unknown, o: { header: 1; defval: string; raw: boolean }): unknown[][] };
}
const LIB_ERR = 'Không tải được thư viện đọc file Excel cũ (.xls)';
function pvLoadLib(): Promise<SheetJS> {
  return new Promise((ok, no) => {
    if (typeof document === 'undefined') return no(new Error(LIB_ERR));
    const w = window as unknown as { XLSX?: SheetJS };
    if (w.XLSX) return ok(w.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => (w.XLSX ? ok(w.XLSX) : no(new Error(LIB_ERR)));
    s.onerror = () => no(new Error(LIB_ERR));
    document.head.appendChild(s);
  });
}
async function pvReadXlsLib(buf: ArrayBuffer): Promise<ParsedFile> {
  const X = await pvLoadLib(), wb = X.read(buf, { type: 'array', cellDates: true });
  const sheets = wb.SheetNames.map((n) => {
    const aoa = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false }).map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v))));
    dropEmptyTail(aoa);
    return pvSheet(n, aoa);
  });
  return { kind: 'xlsx', sheets };
}

/** Nhận diện theo byte đầu: PK → .xlsx (lỗi thì thử SheetJS), D0 CF → .xls cũ, còn lại CSV. */
export async function pvParse(buf: ArrayBuffer): Promise<ParsedFile> {
  const u = new Uint8Array(buf.slice(0, 4));
  if (u[0] === 0x50 && u[1] === 0x4b) {
    try { return await pvReadXlsx(buf); }
    catch (e) { try { return await pvReadXlsLib(buf); } catch { throw e; } }
  }
  if (u[0] === 0xd0 && u[1] === 0xcf) return pvReadXlsLib(buf);
  return pvReadCsv(buf);
}

/* ---------- xuất .xlsx ---------- */

let crcT: number[] | null = null;
function crc32(u: Uint8Array): number {
  const T = crcT || (crcT = Array.from({ length: 256 }, (_x, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
  let c = 0xffffffff;
  for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP không nén (store) — đủ cho Excel mở được. */
export function zipStore(files: { name: string; data: string | Uint8Array<ArrayBuffer> }[], type: string): Blob {
  const enc = new TextEncoder(), parts: Uint8Array<ArrayBuffer>[] = [], central: Uint8Array<ArrayBuffer>[] = [];
  const le = (n: number, b: number): number[] => Array.from({ length: b }, (_x, i) => (n >>> (8 * i)) & 255);
  let off = 0;
  files.forEach((f) => {
    const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, c = crc32(data);
    const h = [...le(0x04034b50, 4), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(c, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(name.length, 2), ...le(0, 2)];
    parts.push(new Uint8Array(h), name, data);
    central.push(new Uint8Array([...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(c, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(name.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(off, 4)]), name);
    off += h.length + name.length + data.length;
  });
  const cs = central.reduce((s, u) => s + u.length, 0);
  const end = new Uint8Array([...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(files.length, 2), ...le(files.length, 2), ...le(cs, 4), ...le(off, 4), ...le(0, 2)]);
  return new Blob([...parts, ...central, end], { type });
}

/** Cột đưa vào file: đang hiển thị hoặc đủ 49 cột theo mẫu. */
export const exFields = (exCols: AppState['exCols'], hidden: AppState['hidden']): Field[] =>
  exCols === 'all' ? FIELDS.slice() : visibleFields(hidden);
/** Tên file xuất, luôn đuôi .xlsx. */
export function xlsxName(fname: string | null | undefined): string {
  const n = String(fname || 'bao-cao.xlsx').trim();
  return /\.xlsx$/i.test(n) ? n : n + '.xlsx';
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** File Excel: hàng 1 tên nhóm cột, hàng 2 tên cột (đậm, nền xám, viền, xuống dòng), dữ liệu theo nhóm dự án; cố định 2 cột/2 hàng đầu, có lọc. */
export function exXlsx(rows: Row[], cols: Field[], ctx: CellCtx & Pick<AppState, 'sort' | 'groups'>): Blob {
  const X = (t: unknown): string => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const cl = (n: number): string => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const list = groupedRows(ctx.groups, rows).flatMap(({ gr }) => sortRows(gr, ctx.sort, ctx));
  const c = (ci: number, ri: number, t: unknown, s: number): string => '<c r="' + cl(ci) + ri + '" t="inlineStr" s="' + s + '"><is><t xml:space="preserve">' + X(t) + '</t></is></c>';
  const sd = '<row r="1">' + cols.map((f, i) => c(i, 1, !i || cols[i - 1].grp !== f.grp ? GRP[f.grp] || f.grp : '', 1)).join('') + '</row>'
    + '<row r="2">' + cols.map((f, i) => c(i, 2, f.name, 1)).join('') + '</row>'
    + list.map((r, k) => '<row r="' + (k + 3) + '">' + cols.map((f, i) => c(i, k + 3, displayText(r, f, ctx), 2)).join('') + '</row>').join('');
  const colsX = '<cols>' + cols.map((f, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + Math.max(8, Math.round(f.w / 7)) + '" customWidth="1"/>').join('') + '</cols>';
  const last = cl(cols.length - 1), nRow = list.length + 2;
  const sheet = HEAD + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="2" topLeftCell="C3" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>' + colsX + '<sheetData>' + sd + '</sheetData><autoFilter ref="A2:' + last + nRow + '"/></worksheet>';
  const styles = HEAD + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFEFF3"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFD0D0D8"/></left><right style="thin"><color rgb="FFD0D0D8"/></right><top style="thin"><color rgb="FFD0D0D8"/></top><bottom style="thin"><color rgb="FFD0D0D8"/></bottom></border></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf><xf borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipStore([
    { name: '[Content_Types].xml', data: HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: '_rels/.rels', data: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: HEAD + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + REL + '"><sheets><sheet name="Tuan 3-11" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'Tuan 3-11\'!$A$2:$' + last + '$' + nRow + '</definedName></definedNames></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="' + REL + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + REL + '/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/styles.xml', data: styles }
  ], XLSX_TYPE);
}
