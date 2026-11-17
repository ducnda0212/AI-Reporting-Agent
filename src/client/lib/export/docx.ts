import type { AppState } from '@/store/types';
import { aiText, exOf, exPct, exStatus, hasIssues } from '../exec';
import { reportData } from './reportData';

/** .docx tối giản dựng thật bằng WordprocessingML (không cần thư viện): mở được trong Word, Google Docs, LibreOffice. */

let crcTable: number[] | null = null;
function crc32(u: Uint8Array): number {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u.length; i++) c = crcTable[(c ^ u[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
const le = (n: number, b: number) => { const a: number[] = []; for (let i = 0; i < b; i++) a.push((n >>> (8 * i)) & 255); return a; };

/** ZIP không nén (method 0) — đủ cho .docx. */
export function zipStore(files: Array<{ name: string; data: string }>): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  files.forEach((f) => {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const c = crc32(data);
    const h = [...le(0x04034b50, 4), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(c, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(name.length, 2), ...le(0, 2)];
    parts.push(new Uint8Array(h), name, data);
    central.push(new Uint8Array([...le(0x02014b50, 4), ...le(20, 2), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(c, 4), ...le(data.length, 4), ...le(data.length, 4), ...le(name.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(off, 4)]), name);
    off += h.length + name.length + data.length;
  });
  const cs = central.reduce((n, u) => n + u.length, 0);
  const end = new Uint8Array([...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(files.length, 2), ...le(files.length, 2), ...le(cs, 4), ...le(off, 4), ...le(0, 2)]);
  return new Blob([...parts, ...central, end] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

interface RunOpt { b?: boolean; i?: boolean; color?: string; sz?: number; shd?: string; jc?: string | null; before?: number; after?: number }
const X = (t: unknown) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const run = (t: unknown, o: RunOpt = {}) => {
  const rp = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${o.b ? '<w:b/>' : ''}${o.i ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.sz || 19}"/></w:rPr>`;
  return String(t == null ? '' : t).split('\n').map((line, k) => `<w:r>${rp}${k ? '<w:br/>' : ''}<w:t xml:space="preserve">${X(line)}</w:t></w:r>`).join('');
};
const para = (t: unknown, o: RunOpt = {}) =>
  `<w:p><w:pPr><w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 60 : o.after}"/>${o.shd ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>` : ''}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${run(t, o)}</w:p>`;
const bar = (t: string) => para(t, { b: true, color: 'FFFFFF', shd: '1F3864', sz: 22, before: 240, after: 0 });
const TOTAL = 15398;
const borders = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="A6A6A6"/>`).join('') + '</w:tblBorders>';

function table(cols: Array<[string, number]>, rows: unknown[][]): string {
  const w = cols.map((c) => Math.round((TOTAL * c[1]) / 100));
  const cell = (t: unknown, k: number, hd: boolean, center = false) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w[k]}" w:type="dxa"/>${hd ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : ''}</w:tcPr>${para(t, { b: hd, jc: hd || center ? 'center' : null, after: 0, sz: 18 })}</w:tc>`;
  const empty = `<w:tr><w:tc><w:tcPr><w:tcW w:w="${TOTAL}" w:type="dxa"/><w:gridSpan w:val="${cols.length}"/></w:tcPr>${para('Không có', { jc: 'center', color: '808080', after: 0, sz: 18 })}</w:tc></w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${TOTAL}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>`
    + `<w:tblGrid>${w.map((x) => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${cols.map((c, k) => cell(c[0], k, true)).join('')}</w:tr>`
    + (rows.length ? rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((t, k) => cell(t, k, false, k === 0)).join('')}</w:tr>`).join('') : empty) + '</w:tbl>';
}

export function docxXml(s: AppState): string {
  const D = reportData(s);
  const { run: runList, N, cnt, V, ok } = D;
  const kv = (k: string, v: unknown): [string, string] => [k, String(v)];
  const sum = [kv('Số dự án đang chạy', N), kv('Đúng tiến độ', cnt['Đúng tiến độ']), kv('Có nguy cơ chậm', cnt['Có nguy cơ chậm']), kv('Chậm tiến độ', cnt['Chậm tiến độ']), kv('Tỉ lệ đúng tiến độ', D.rate), kv('Nhận xét chung', ok(s.exNote))];
  const sumTbl = `<w:tbl><w:tblPr><w:tblW w:w="${TOTAL}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="3200"/><w:gridCol w:w="${TOTAL - 3200}"/></w:tblGrid>`
    + sum.map((x) => `<w:tr><w:tc><w:tcPr><w:tcW w:w="3200" w:type="dxa"/></w:tcPr>${para(x[0], { b: true, after: 0, sz: 19 })}</w:tc><w:tc><w:tcPr><w:tcW w:w="${TOTAL - 3200}" w:type="dxa"/></w:tcPr>${para(x[1], { after: 0, sz: 19 })}</w:tc></w:tr>`).join('') + '</w:tbl>';
  const body = para('PMO BÁO CÁO ĐIỀU HÀNH – TRUNG TÂM AI', { b: true, sz: 30, color: '1F3864', after: 120 })
    + `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${run('Kỳ báo cáo   ', { b: true })}<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="19"/><w:shd w:val="clear" w:color="auto" w:fill="FFF2CC"/></w:rPr><w:t xml:space="preserve"> Tuần 3 tháng 11 năm 2026 (15–22/11) </w:t></w:r>${run('   (Chỉ tính các dự án đang thực hiện)', { i: true, color: '595959' })}</w:p>`
    + bar('1. THÔNG TIN TỔNG QUAN TRUNG TÂM') + sumTbl
    + bar('2. CÁC CHỈ SỐ NỔI BẬT (KPI)') + table([['STT', 5], ['Mã DA', 9], ['Công việc', 26], ['Đầu mối chịu trách nhiệm', 14], ['KPI (mục tiêu)', 20], ['Kết quả đạt được', 26]],
      D.hl.map((r, k) => [k + 1, r.code, V(r, 'task'), V(r, 'pic'), V(r, 'kpi'), ok(exOf(s, r).kpiResult)]))
    + bar('3. TIẾN ĐỘ CÁC DỰ ÁN') + table([['STT', 5], ['Mã DA', 9], ['Công việc', 24], ['Tiến độ', 8], ['Hạn', 9], ['Tình trạng', 12], ['Việc hoàn thành trong tuần', 33]],
      runList.map((r, k) => [k + 1, r.code, V(r, 'task'), exPct(r) + ' %', V(r, 'end'), exStatus(s, r), V(r, 'w3Done')]))
    + bar('4. CÁC VẤN ĐỀ ĐANG GẶP PHẢI (RỦI RO, ISSUE…)') + table([['STT', 5], ['Mã DA', 9], ['Công việc', 24], ['Tình trạng', 12], ['Vấn đề, rủi ro & đề xuất', 50]],
      D.iss.map((r, k) => [k + 1, r.code, V(r, 'task'), exStatus(s, r), hasIssues(r)]))
    + bar('5. CÔNG VIỆC TUẦN KẾ TIẾP') + table([['STT', 5], ['Mã DA', 9], ['Công việc', 28], ['Kế hoạch tuần sau', 58]],
      D.nx.map((r, k) => [k + 1, r.code, V(r, 'task'), aiText(r, 'w3Plan')]))
    + bar('6. Ý KIẾN CẦN CHỈ ĐẠO CỦA BAN GIÁM ĐỐC') + table([['STT', 5], ['Mã DA', 9], ['Công việc', 28], ['Nội dung cần chỉ đạo', 58]],
      D.directives.map((r, k) => [k + 1, r.code, V(r, 'task'), exOf(s, r).directive!.text]))
    + para('Báo cáo lấy từ dữ liệu tuần 3/11, chỉ các dự án có Trạng thái = Đang thực hiện. Mục 4 và 6 chỉ hiện dự án có nội dung. Ô nháp AI chưa duyệt để trống.', { sz: 17, color: '595959', before: 200 });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'
    + body + '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>';
}

export function docxBlob(s: AppState): Blob {
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/document.xml', data: docxXml(s) },
  ]);
}
