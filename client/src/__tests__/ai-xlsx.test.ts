import { describe, expect, it } from 'vitest';
import demoData from '@/data/demo.json';
import { aiDrafts, agExamples, askAnswer, trDraft, trInputs, trText, type AskCtx } from '@/lib/ai';
import { exFields, exXlsx, pvParse, pvParseCsv, pvReadCsv, pvUnzip } from '@/lib/xlsx';
import { FIELDS, GRP, PHASE_BUCKET } from '@/data/constants';
import type { Row } from '@/types';

/* Dòng tối thiểu dựng từ GOLD (buildRow thuộc Task 5): đủ trường mà lib/ai và lib/xlsx đọc. */
type Gold = (typeof demoData.gold.rows)[number];
function toRow(d: Gold, i: number): Row {
  const w = (d.prw || {}) as Row['prw'];
  const step = PHASE_BUCKET[d.rawPhase] || parseInt(d.rawPhase, 10) || 2;
  return {
    ...(d as unknown as Row),
    i, tplRow: d.row, isNew: false, dup: false, real: true,
    jira: { pic: d.assignees[0] || '', po: d.assignees[1] || '', gdk: d.teamName || '' },
    pic: d.assignees[0] || '', po: d.assignees[1] || '', tl: d.tl || '', poField: d.po || '', idOnly: false,
    gdk: d.teamName, tags: [], done: step, total: 12, reasons: {}, ai: {}, ovr: {},
    stages: Array.from({ length: 12 }, (_x, k) => (k < step - 2 ? 'done' : k < step ? 'doing' : 'todo')),
    ht: w.w3 ? w.w3.done : 'Chưa có Progress Report trong tuần này', loai: 'KHHĐ 2026', market: 'VN'
  };
}
const goldRows = (): Row[] => demoData.gold.rows.map(toRow);
const ctxOf = (rows: Row[]): AskCtx => ({ rows, allRows: rows, sel: null, phaseBucket: PHASE_BUCKET });
const ctx0 = { phaseBucket: PHASE_BUCKET };

describe('AI soạn nháp (trInputs / trDraft / aiDrafts)', () => {
  it('trInputs đọc Progress Report tuần này + Comment Risk, trDraft trích dẫn đúng câu nguồn', () => {
    const r = goldRows()[0];
    const I = trInputs(r, ctx0);
    expect(I.all.length).toBeGreaterThan(0);
    expect(I.cw?.date).toBe('2026-11-19');
    expect(I.all.find((x) => x.id === 'C1')).toMatchObject({ kind: 'risk', date: '18/11' });
    const ids = I.all.map((x) => x.id);
    (['kh', 'vd', 'rui'] as const).forEach((fid) => (['short', 'normal', 'detail'] as const).forEach((v) => {
      const D = trDraft(fid, v, I);
      expect(trText(D).length).toBeGreaterThan(0);
      D.s.forEach((s) => s.refs.forEach((ref) => expect(ids).toContain(ref)));
    }));
    /* Ngắn hơn = 1 ý đầu của "Công việc sẽ làm" */
    expect(trText(trDraft('kh', 'short', I))).toBe('Rà soát checklist nghiệm thu kỹ thuật');
    expect(trDraft('rui', 'normal', I).level).toBe('Trung bình');
  });

  it('aiDrafts trả về nháp cho ô AI còn trống, không ghi lên dòng', () => {
    const rows = goldRows();
    rows[1].ai.rui = { text: 'Cao', why: '', src: '', ok: true };
    const before = structuredClone(rows);
    const out = aiDrafts(rows, ctx0);
    expect(rows).toEqual(before);
    expect(out.length).toBe(rows.length * 3 - 1);
    expect(out.some((x) => x.i === 1 && x.f === 'rui')).toBe(false);
    const r0 = Object.fromEntries(out.filter((x) => x.i === 0).map((x) => [x.f, x.d]));
    expect(r0.rui).toMatchObject({ text: 'Trung bình', ok: false });
    expect(r0.kh.text).toBe('Rà soát checklist nghiệm thu kỹ thuật; Chuẩn bị báo cáo tổng hợp tuần 4');
    /* aiFixTexts: "Rủi ro: " → "Rủi ro (Comment 18/11): " khi nháp bắt đầu bằng Rủi ro */
    expect(r0.vd.text.startsWith('Rủi ro (Comment 18/11): ')).toBe(true);
  });
});

describe('askAnswer (Agent kiểu Rovo: chỉ đề xuất, không ghi bảng)', () => {
  it('lệnh đổi một ô trả về stagedItems, không mutate rows/allRows', () => {
    const rows = goldRows();
    const before = structuredClone(rows);
    const res = askAnswer('Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ', ctxOf(rows));
    expect(rows).toEqual(before);
    expect(res.stagedItems).toEqual([{ i: 0, f: 'td', from: 'Đúng tiến độ', to: 'Chậm tiến độ', kind: 'edit' }]);
    expect(res.html).toContain('Mình đã soạn <b>1 thay đổi</b>');
    /* câu viết tắt được chuẩn hoá */
    expect(askAnswer('đổi tiến độ I.A.3.1 chậm', ctxOf(rows)).stagedItems[0]).toMatchObject({ f: 'td', to: 'Chậm tiến độ' });
  });

  it('duyệt nháp: đưa vào bản xem trước kind approve, ô nháp vẫn chưa duyệt', () => {
    const rows = goldRows();
    rows[0].ai.rui = { text: 'Cao', why: '', src: '', ok: false };
    const before = structuredClone(rows);
    const res = askAnswer('Duyệt hết nháp của I.A.3.1', ctxOf(rows));
    expect(rows).toEqual(before);
    expect(rows[0].ai.rui!.ok).toBe(false);
    expect(res.stagedItems).toEqual([{ i: 0, f: 'rui', from: 'Cao', to: 'Cao', kind: 'approve' }]);
  });

  it('điền Note cho các dự án đang trống: stage đủ dòng trống, không mutate', () => {
    const rows = goldRows();
    rows[2].note = 'Đã họp';
    const before = structuredClone(rows);
    const res = askAnswer('Điền Note "Chờ họp khối" cho các dự án đang trống', ctxOf(rows));
    expect(rows).toEqual(before);
    expect(res.stagedItems.length).toBe(rows.length - 1);
    expect(res.stagedItems.every((x) => x.f === 'note' && x.to === 'Chờ họp khối' && x.i !== 2)).toBe(true);
  });

  it('ẩn cột / lọc dòng trả về hiệu ứng cho store, không mutate', () => {
    const rows = goldRows();
    const before = structuredClone(rows);
    const hide = askAnswer('Ẩn cột KPI', ctxOf(rows));
    expect(hide.hide).toEqual({ f: 'kpi', on: true });
    expect(hide.html).toBe('Đã ẩn cột <b>E · KPI</b>.');
    expect(askAnswer('Chỉ hiện dòng cần sửa', ctxOf(rows)).onlyFix).toBe(true);
    expect(rows).toEqual(before);
  });

  it('cột lấy từ Jira không sửa được; thiếu mã thì hỏi lại với gợi ý', () => {
    const rows = goldRows();
    expect(askAnswer('Đổi PIC của I.A.3.1 thành An', ctxOf(rows)).html).toContain('lấy từ file Jira nên không điền tay được');
    const ask = askAnswer('Đổi Tiến độ', ctxOf(rows));
    expect(ask.stagedItems).toEqual([]);
    expect(ask.html).toContain('Bạn muốn đổi <b>Tiến độ</b> cho dự án nào, thành gì?');
    expect(agExamples(null, rows)[0]).toBe('Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ');
  });

  it('hỏi đáp: tóm tắt tuần, rủi ro theo mã dự án, câu không hiểu', () => {
    const rows = goldRows();
    expect(askAnswer('Tóm tắt tuần này', ctxOf(rows)).html).toContain('Tuần 3/11 có <b>' + rows.length + ' dự án</b>');
    const rk = askAnswer('Rủi ro của I.A.3.1?', ctxOf(rows)).html;
    expect(rk).toContain('<b>I.A.3.1</b> · Mức độ rủi ro (AC): <b>Trung bình</b>');
    expect(askAnswer('xin chào', ctxOf(rows)).html).toContain('Mình chưa hiểu câu này.');
  });
});

describe('Đọc file CSV/XLSX và xuất .xlsx', () => {
  it('pvParseCsv xử lý ngoặc kép, xuống dòng trong ô, CRLF', () => {
    expect(pvParseCsv('a,"b ""x""\ny",c\r\n1,2,3\r\n,,\n', ',')).toEqual([['a', 'b "x"\ny', 'c'], ['1', '2', '3']]);
  });

  it('pvReadCsv đọc GOLD CSV (UTF-8, dấu phẩy)', () => {
    const buf = new TextEncoder().encode(demoData.goldCsv).buffer as ArrayBuffer;
    const parsed = pvReadCsv(buf);
    expect(parsed).toMatchObject({ kind: 'csv', enc: 'UTF-8', delim: 'dấu phẩy' });
    expect(parsed.sheets[0].rows.length).toBeGreaterThan(10);
    expect(parsed.sheets[0].rows[0][0]).toBe('Summary');
  });

  it('pvParse: CSV đi đường CSV; .xls cũ khi không tải được SheetJS báo lỗi thân thiện', async () => {
    const csv = await pvParse(new TextEncoder().encode('a;b\n1;2').buffer as ArrayBuffer);
    expect(csv.delim).toBe('dấu chấm phẩy');
    await expect(pvParse(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]).buffer)).rejects.toThrow('Không tải được thư viện đọc file Excel cũ (.xls)');
  });

  it('exXlsx tạo file ZIP (PK) 49 cột, hàng nhóm + header có style, đọc lại được', async () => {
    const rows = goldRows();
    const cols = exFields('all', { kpi: true });
    expect(cols.length).toBe(49);
    const blob = exXlsx(rows, cols, { phaseBucket: PHASE_BUCKET, sort: null });
    const buf = await blob.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 2));
    expect([head[0], head[1]]).toEqual([0x50, 0x4b]);
    const z = pvUnzip(buf);
    const sheet = (await z.get('xl/worksheets/sheet1.xml'))!;
    expect(sheet.match(/<col /g)!.length).toBe(49);
    const row1 = /<row r="1">(.*?)<\/row>/.exec(sheet)![1];
    const groups = FIELDS.filter((f, k) => !k || FIELDS[k - 1].grp !== f.grp).map((f) => GRP[f.grp].replace(/&/g, '&amp;'));
    expect([...row1.matchAll(/<t xml:space="preserve">([^<]+)<\/t>/g)].map((m) => m[1])).toEqual(groups);
    expect(sheet).toContain('<t xml:space="preserve">I.A.3.1</t>');
    expect(sheet).toContain('<autoFilter ref="A2:AW' + (rows.length + 2) + '"/>');
    const styles = (await z.get('xl/styles.xml'))!;
    expect(styles).toContain('wrapText="1"');
    expect(styles).toContain('<left style="thin">');
    /* chỉ cột đang hiện */
    expect(exFields('vis', { kpi: true }).some((f) => f.id === 'kpi')).toBe(false);
  });
});
