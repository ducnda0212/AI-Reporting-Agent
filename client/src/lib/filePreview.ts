/** Đọc CSV / Excel ngay trong trình duyệt để xem trước. Không phụ thuộc thư viện ngoài (xlsx đọc bằng DecompressionStream). */

export interface PvSheet { name: string; rows: string[][]; nCols: number; nData: number }
export interface PvParsed { kind: 'csv' | 'xlsx'; enc?: string; delim?: string; sheets: PvSheet[] }

export const PV_EXT = ['csv', 'tsv', 'txt', 'xlsx', 'xlsm', 'xls'];

export const pvBytes = (n: number) =>
  n < 1024 ? n + ' B' : n < 1048576 ? Math.max(1, Math.round(n / 1024)).toLocaleString('vi-VN') + ' KB' : (n / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' MB';
export const pvNum = (n: number) => n.toLocaleString('vi-VN');
export function pvCol(n: number) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function sheet(name: string, rows: string[][]): PvSheet {
  let nCols = 0; rows.forEach((r) => { if (r.length > nCols) nCols = r.length; });
  return { name, rows, nCols, nData: Math.max(0, rows.length - 1) };
}
const trimEmptyTail = (rows: string[][]) => { while (rows.length && rows[rows.length - 1].every((v) => !v)) rows.pop(); return rows; };

/* ---------- CSV ---------- */
function delimOf(text: string) {
  const head = text.slice(0, 6000); let best = ',', bestN = -1;
  for (const d of [',', ';', '\t', '|']) {
    let q = false, n = 0;
    for (const c of head) { if (c === '"') q = !q; else if (!q && (c === '\n' || c === '\r')) break; else if (!q && c === d) n++; }
    if (n > bestN) { bestN = n; best = d; }
  }
  return best;
}
export function parseCsv(text: string, delim: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ''; let i = 0; const n = text.length; const d = delim.charCodeAt(0);
  while (i < n) {
    let c = text.charCodeAt(i);
    if (c === 34 && f === '') { // ô trong ngoặc kép
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
    if (c === 10 || c === 13) { row.push(f); f = ''; rows.push(row); row = []; if (c === 13 && text.charCodeAt(i + 1) === 10) i++; i++; continue; }
    const s = i;
    while (i < n) { c = text.charCodeAt(i); if (c === d || c === 10 || c === 13) break; i++; }
    f += text.slice(s, i);
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return trimEmptyTail(rows);
}
function readCsv(buf: ArrayBuffer): PvParsed {
  let enc = 'UTF-8'; let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { enc = 'Windows-1252'; text = new TextDecoder('windows-1252').decode(buf); }
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); enc = 'UTF-8 (BOM)'; }
  text = text.replace(/^sep=.\r?\n/i, '');
  const d = delimOf(text);
  const delim = ({ ',': 'dấu phẩy', ';': 'dấu chấm phẩy', '\t': 'tab', '|': 'dấu gạch đứng' } as Record<string, string>)[d];
  return { kind: 'csv', enc, delim, sheets: [sheet('CSV', parseCsv(text, d))] };
}

/* ---------- xlsx ---------- */
async function inflate(u8: Uint8Array) {
  const ds = new DecompressionStream('deflate-raw'); const w = ds.writable.getWriter();
  w.write(u8 as BufferSource); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
function unzip(buf: ArrayBuffer) {
  const u8 = new Uint8Array(buf); const dv = new DataView(buf); const n = u8.length; let eocd = -1;
  for (let i = n - 22; i >= Math.max(0, n - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Không phải file .xlsx hợp lệ');
  const cnt = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true);
  const files: Record<string, { m: number; z: number; o: number }> = {};
  for (let k = 0; k < cnt; k++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const nl = dv.getUint16(off + 28, true), el = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true);
    files[new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nl))] = { m: dv.getUint16(off + 10, true), z: dv.getUint32(off + 20, true), o: dv.getUint32(off + 42, true) };
    off += 46 + nl + el + cl;
  }
  return async (name: string) => {
    const f = files[name]; if (!f) return null;
    const s = f.o + 30 + dv.getUint16(f.o + 26, true) + dv.getUint16(f.o + 28, true); const data = u8.subarray(s, s + f.z);
    return new TextDecoder().decode(f.m === 0 ? data : await inflate(data));
  };
}
const txt = (el: Element) => { let out = ''; Array.from(el.getElementsByTagName('t')).forEach((t) => { if (t.parentNode?.nodeName !== 'rPh') out += t.textContent; }); return out; };
function fmtKind(id: number, code?: string) {
  if (id === 9 || id === 10) return 2;
  if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return 1;
  if (!code) return 0;
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  if (c.includes('%')) return 2;
  return /[dmyhs]/i.test(c) && !/general/i.test(c) ? 1 : 0;
}
function serial(v: number) {
  const d = new Date(Math.round((v - 25569) * 864e5)); const p = (x: number) => ('0' + x).slice(-2);
  const time = p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + (d.getUTCSeconds() ? ':' + p(d.getUTCSeconds()) : '');
  if (v < 1) return time;
  const day = p(d.getUTCDate()) + '/' + p(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  return v % 1 > 1e-9 ? day + ' ' + time : day;
}
async function readXlsx(buf: ArrayBuffer): Promise<PvParsed> {
  const get = unzip(buf); const P = new DOMParser();
  const xml = async (n: string) => { const t = await get(n); return t ? P.parseFromString(t, 'application/xml') : null; };
  const wb = await xml('xl/workbook.xml');
  if (!wb) throw new Error('Không thấy workbook.xml — file không phải Excel .xlsx');
  const relMap: Record<string, string> = {}; const rels = await xml('xl/_rels/workbook.xml.rels');
  if (rels) Array.from(rels.getElementsByTagName('Relationship')).forEach((r) => { relMap[r.getAttribute('Id')!] = r.getAttribute('Target')!; });
  const ss: string[] = []; const sx = await xml('xl/sharedStrings.xml');
  if (sx) Array.from(sx.getElementsByTagName('si')).forEach((si) => ss.push(txt(si)));
  const xf: number[] = []; const st = await xml('xl/styles.xml');
  if (st) {
    const nf: Record<string, string> = {};
    Array.from(st.getElementsByTagName('numFmt')).forEach((x) => { nf[x.getAttribute('numFmtId')!] = x.getAttribute('formatCode')!; });
    const cx = st.getElementsByTagName('cellXfs')[0];
    if (cx) Array.from(cx.children).forEach((x) => { const id = +x.getAttribute('numFmtId')!; xf.push(fmtKind(id, nf[id])); });
  }
  const sheets: PvSheet[] = []; const shs = Array.from(wb.getElementsByTagName('sheet'));
  for (let si = 0; si < shs.length; si++) {
    const sh = shs[si];
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || '';
    const tg = relMap[rid] || 'worksheets/sheet' + (si + 1) + '.xml';
    const doc = await xml(tg.startsWith('/') ? tg.slice(1) : 'xl/' + tg.replace(/^\.\//, ''));
    const rows: string[][] = [];
    if (doc) {
      Array.from(doc.getElementsByTagName('row')).forEach((rEl, ri) => {
        const rIdx = (+(rEl.getAttribute('r') || 0) || ri + 1) - 1; const arr: string[] = []; let pos = 0;
        Array.from(rEl.getElementsByTagName('c')).forEach((c) => {
          let col = pos; const ref = c.getAttribute('r'); const m = ref && /^([A-Z]+)/.exec(ref);
          if (m) { col = 0; for (let q = 0; q < m[1].length; q++) col = col * 26 + (m[1].charCodeAt(q) - 64); col--; }
          pos = col + 1;
          const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0]?.textContent ?? ''; let out = '';
          if (t === 's') out = ss[+v] ?? '';
          else if (t === 'inlineStr') out = txt(c);
          else if (t === 'b') out = v === '1' ? 'TRUE' : 'FALSE';
          else if (t === 'str' || t === 'e' || t === 'd') out = v;
          else if (v !== '') {
            const kind = xf[+(c.getAttribute('s') || 0)] || 0; const num = parseFloat(v);
            out = isNaN(num) ? v : kind === 1 ? serial(num) : kind === 2 ? String(+(num * 100).toPrecision(12)) + '%' : String(+num.toPrecision(15));
          }
          arr[col] = out;
        });
        for (let x = 0; x < arr.length; x++) if (arr[x] === undefined) arr[x] = '';
        rows[rIdx] = arr;
      });
      for (let y = 0; y < rows.length; y++) if (!rows[y]) rows[y] = [];
      trimEmptyTail(rows);
    }
    sheets.push(sheet(sh.getAttribute('name') || 'Sheet' + (si + 1), rows));
  }
  if (!sheets.length) throw new Error('File Excel không có sheet nào');
  return { kind: 'xlsx', sheets };
}

export async function parseFile(buf: ArrayBuffer, ext: string): Promise<PvParsed> {
  const u = new Uint8Array(buf.slice(0, 4));
  if (u[0] === 0x50 && u[1] === 0x4b) { try { return await readXlsx(buf); } catch (e) { try { return await readXlsLib(buf); } catch { throw e; } } }
  if ((u[0] === 0xd0 && u[1] === 0xcf) || ext === 'xls') return readXlsLib(buf);
  return readCsv(buf);
}

/* dự phòng: SheetJS từ CDN cho .xls cũ hoặc khi đọc trực tiếp .xlsx thất bại */
type XlsxLib = { read: (b: ArrayBuffer, o: object) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_json: (s: unknown, o: object) => unknown[][] } };
function loadXlsxLib(): Promise<XlsxLib> {
  const w = window as unknown as { XLSX?: XlsxLib };
  return new Promise((ok, no) => {
    if (w.XLSX) return ok(w.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => ok(w.XLSX!); s.onerror = () => no(new Error('Không tải được thư viện đọc file Excel cũ (.xls)'));
    document.head.appendChild(s);
  });
}
async function readXlsLib(buf: ArrayBuffer): Promise<PvParsed> {
  const X = await loadXlsxLib(); const wb = X.read(buf, { type: 'array', cellDates: true });
  return { kind: 'xlsx', sheets: wb.SheetNames.map((n) => sheet(n, trimEmptyTail(X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false }).map((r) => r.map((v) => (v == null ? '' : String(v))))))) };
}
