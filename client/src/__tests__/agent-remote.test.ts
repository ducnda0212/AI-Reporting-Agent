import { describe, expect, it } from 'vitest';
import { REMOTE_MAX_TEXT, agentHtml, historyOf, keepLocal, nextQuestions, textColumns } from '@/lib/agentRemote';
import type { AgentAnswer, AgentFacts } from '@/lib/api';

const rows = [{ i: 3, ma: 'I.A.1.1' }, { i: 7, ma: 'II.B.2.4' }];
const ans = (o: Partial<AgentAnswer>): AgentAnswer => ({ intent: 'filter', answer: '', codes: [], by: 'v-llm-v1-medium', grounded: true, warnings: [], mode: 'vllm', model: 'v-llm-v1-medium', ...o });

describe('Agent hỏi đáp qua backend', () => {
  it('lệnh sửa bảng và câu về ô đang chọn giữ ở giao diện, câu hỏi số liệu đi qua backend', () => {
    ['Đổi tiến độ của I.A.1.1 thành Chậm tiến độ', 'nhờ điền Mức độ rủi ro', 'Duyệt hết nháp của I.A.1.1', 'Ẩn cột PIC', 'Tóm tắt dự án đang chọn', 'dự án này thế nào']
      .forEach((q) => expect(keepLocal(q), q).toBe(true));
    ['Tóm tắt tuần này', 'Dự án nào có nguy cơ trễ?', 'Nháp nào đang chờ duyệt?', 'Có bao nhiêu dự án rủi ro cao?', 'I.A.1.1 đang thế nào']
      .forEach((q) => expect(keepLocal(q), q).toBe(false));
  });

  it('mã dự án trong câu trả lời thành nút bấm tới đúng dòng, mã lạ để nguyên chữ', () => {
    const h = agentHtml(ans({ answer: 'Có 2 dự án chậm: I.A.1.1 và II.B.2.4, ngoài ra IX.Z.9.9.' }), rows);
    expect(h).toContain('<button class="cd" data-act="exGo" data-i="3">I.A.1.1</button>');
    expect(h).toContain('<button class="cd" data-act="exGo" data-i="7">II.B.2.4</button>');
    expect(h).toContain('ngoài ra IX.Z.9.9.');
    expect(h).not.toContain('data-i="undefined"');
  });

  it('chặn chèn HTML từ câu trả lời và ghi rõ ai viết lời văn', () => {
    const h = agentHtml(ans({ answer: '<img src=x onerror=alert(1)> Có 1 dự án.' }), rows);
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;img');
    expect(h).toContain('lời văn do v-llm-v1-medium');
  });

  it('câu trả lời mẫu: nói rõ khi AI lệch số liệu', () => {
    const rule = agentHtml(ans({ by: 'rule', grounded: true, answer: 'Có 3 dự án.' }), rows);
    expect(rule).toContain('Số liệu tính từ bảng hiện tại');
    expect(rule).not.toContain('lời văn do');
    const bad = agentHtml(ans({ by: 'rule', grounded: false, warnings: ['con số 9 không có trong số liệu'], answer: 'Có 3 dự án.' }), rows);
    expect(bad).toContain('AI trả lời lệch số liệu nên dùng câu mẫu');
    expect(bad).toContain('title="con số 9 không có trong số liệu"');   // lý do chi tiết nằm trong tooltip, không làm dòng nguồn dài ra
  });
});

describe('Nhớ ngữ cảnh khi hỏi tiếp', () => {
  it('"dự án đó" đi qua backend, còn "dự án này" (ô đang chọn) vẫn do giao diện xử lý', () => {
    expect(keepLocal('dự án đó là dự án gì')).toBe(false);
    expect(keepLocal('trong số đó dự án nào rủi ro cao')).toBe(false);
    expect(keepLocal('dự án này thế nào')).toBe(true);
  });

  it('historyOf lấy 3 câu gần nhất, bỏ tin đang gõ, mặc định không có mã', () => {
    const log = [
      { q: 'a', scope: ['I.A.1.1'] }, { q: 'b' }, { q: 'c', scope: ['II.B.2.4', 'I.A.1.1'] }, { q: 'd', scope: [] }, { q: 'đang gõ', busy: true },
    ];
    expect(historyOf(log)).toEqual([{ q: 'b', codes: [] }, { q: 'c', codes: ['II.B.2.4', 'I.A.1.1'] }, { q: 'd', codes: [] }]);
    expect(historyOf([])).toEqual([]);
    expect(historyOf([{ q: 'x'.repeat(500) }])[0].q).toHaveLength(200);
  });
});

describe('Cột chữ gửi cho Trợ lý tìm theo nội dung', () => {
  const cells: Record<string, string> = {
    muctieu: ' Xây nền tảng thực nghiệm ', kpi: '', milestone: 'UAT 12/12', note: '', ht: 'Xong API', kh: 'Chạy thử', vd: 'Chờ GPU',
    w1ht: 'Tuần đầu xong thiết kế', w1kh: '', w1vd: '', w2ht: '', w2kh: 'Review', w2vd: 'Thiếu người',
  };
  const show = (id: string): string => cells[id] ?? '';

  it('lấy đúng ô, cắt khoảng trắng, ô trống để chuỗi rỗng', () => {
    const t = textColumns(show, ' Jira comment ');
    expect(t).toEqual({
      goal: 'Xây nền tảng thực nghiệm', kpi: '', milestone: 'UAT 12/12', note: '', done: 'Xong API', plan: 'Chạy thử', issue: 'Chờ GPU',
      prev: 'Tuần 1 – đã làm: Tuần đầu xong thiết kế\nTuần 2 – kế hoạch: Review; vấn đề: Thiếu người', comment: 'Jira comment',
    });
  });

  it('không có báo cáo tuần trước thì prev rỗng, ô quá dài bị cắt', () => {
    expect(textColumns(() => '', '').prev).toBe('');
    expect(textColumns((id) => (id === 'vd' ? 'x'.repeat(5000) : ''), '').issue).toHaveLength(REMOTE_MAX_TEXT);
  });
});


describe('Câu trả lời gọn: câu dẫn ngắn + danh sách dựng từ số liệu', () => {
  const P = (code: string, o: Record<string, string> = {}) => ({ code, name: 'Dự án ' + code, tien_do: 'Chậm tiến độ', rui_ro: '', trang_thai: 'Đang làm', han: '15/11/2026', ...o });
  const facts = (o: Partial<AgentFacts>): AgentFacts => o as AgentFacts;

  it('danh sách dự án: mã là nút bấm, nhãn có màu theo ý nghĩa, rủi ro trống ghi "chưa đánh giá"', () => {
    const h = agentHtml(ans({ answer: 'Có 2 dự án khớp.', facts: facts({ kieu: 'projects', so_luong: 2, du_an: [P('I.A.1.1'), P('II.B.2.4', { tien_do: 'Đúng tiến độ', rui_ro: 'Cao' })] }) }), rows);
    expect(h).toContain('<p>Có 2 dự án khớp.</p>');
    expect(h).toContain('<li class="pi"><div class="pt"><button class="cd" data-act="exGo" data-i="3">I.A.1.1</button><span class="pn">Dự án I.A.1.1</span>');
    expect(h).toContain('<span class="pc e">Chậm tiến độ</span>');
    expect(h).toContain('<span class="pc o">Đúng tiến độ</span>');
    expect(h).toContain('<span class="pc e">Rủi ro: Cao</span>');
    expect(h).toContain('<span class="pc mut">Rủi ro: chưa đánh giá</span>');
    expect(h).toContain('Hạn 15/11/2026');
  });

  it('đếm theo nhóm kèm danh sách: mỗi nhóm một khối có tiêu đề, số dự án và từng dự án', () => {
    const h = agentHtml(ans({ answer: 'Có 4 dự án.', facts: facts({ kieu: 'analyze', so_luong: 4, phan_nhom: { truong: 'Tiến độ', theo: { 'Đúng tiến độ': 3, 'Chậm tiến độ': 1 } },
      du_an_theo_nhom: [{ nhom: 'Đúng tiến độ', so_luong: 3, du_an: [P('I.A.1.1', { tien_do: 'Đúng tiến độ' }), P('II.B.2.4', { tien_do: 'Đúng tiến độ' })], con_lai: 1 }, { nhom: 'Chậm tiến độ', so_luong: 1, du_an: [P('IX.Z.1.1')] }] }) }), rows);
    expect(h).toContain('<div class="sh">Đúng tiến độ (3)</div>');
    expect(h).toContain('<div class="sh">Chậm tiến độ (1)</div>');
    expect(h.match(/<li class="pi">/g)).toHaveLength(3);
    expect(h).toContain('Còn 1 dự án khác chưa hiện');
  });

  it('quá 6 dự án thì phần còn lại gập vào "Xem thêm", và nói rõ số dự án chưa hiện', () => {
    const many = Array.from({ length: 9 }, (_, k) => P('IX.Z.' + k + '.1'));
    const h = agentHtml(ans({ answer: 'Có 30 dự án.', facts: facts({ kieu: 'filter', so_luong: 30, du_an: many }) }), rows);
    expect(h.match(/<li class="pi">/g)).toHaveLength(9);
    expect(h).toContain('<summary>Xem thêm 3 dự án</summary>');
    expect(h).toContain('Còn 21 dự án khác chưa hiện');
    const few = agentHtml(ans({ answer: 'Có 2.', facts: facts({ kieu: 'filter', so_luong: 2, du_an: many.slice(0, 2) }) }), rows);
    expect(few).not.toContain('Xem thêm');
    expect(few).not.toContain('chưa hiện');
  });

  it('chặn chèn HTML trong tên dự án, đoạn nguồn và nhãn', () => {
    const h = agentHtml(ans({ answer: 'ok', facts: facts({ kieu: 'projects', so_luong: 1, du_an: [P('I.A.1.1', { name: '<b>x</b>', tien_do: '<i>y</i>' })] }) }), rows);
    expect(h).not.toContain('<b>x'); expect(h).not.toContain('<i>y');
    expect(h).toContain('&lt;b&gt;x&lt;/b&gt;');
    const s = agentHtml(ans({ answer: 'ok', facts: facts({ kieu: 'search', tim_thay: true, doan: [{ code: 'I.A.1.1', ten: '<u>t</u>', truong: 'Comment', noi_dung: '<script>1</script>' }] } as AgentFacts) }), rows);
    expect(s).not.toContain('<script'); expect(s).not.toContain('<u>');
  });

  it('một dự án: chỉ có thẻ dự án; rule + lead rỗng thì không có câu dẫn thừa', () => {
    const h = agentHtml(ans({ by: 'rule', answer: 'I.A.1.1 (Dự án I.A.1.1): tiến độ Chậm tiến độ, mức độ rủi ro chưa có, hạn 15/11/2026.', lead: '', facts: facts({ kieu: 'project', tim_thay: true, du_an: P('I.A.1.1') }) }), rows);
    expect(h).not.toContain('class="al"');
    expect(h).toContain('<ul class="pl"><li class="pi">');
    expect(h).not.toContain('tiến độ Chậm tiến độ, mức độ');   // không lặp lại câu mẫu dài
  });

  it('AI viết lời thì dùng lời AI; câu mẫu thì dùng câu dẫn ngắn thay vì câu mẫu liệt kê mã', () => {
    const f = facts({ kieu: 'filter', so_luong: 2, du_an: [P('I.A.1.1'), P('II.B.2.4')] });
    const viaRule = agentHtml(ans({ by: 'rule', answer: 'Có 2/4 dự án có Tiến độ = Chậm tiến độ: I.A.1.1, II.B.2.4.', lead: 'Có 2/4 dự án có Tiến độ = Chậm tiến độ.', facts: f }), rows);
    expect(viaRule).toContain('<p>Có 2/4 dự án có Tiến độ = Chậm tiến độ.</p>');
    expect(viaRule).not.toContain('Chậm tiến độ: <button');
    const viaAi = agentHtml(ans({ answer: 'Hai dự án chậm, nổi bật là I.A.1.1.', lead: 'không dùng', facts: f }), rows);
    expect(viaAi).toContain('nổi bật là <button class="cd" data-act="exGo" data-i="3">I.A.1.1</button>');
    expect(viaAi).not.toContain('không dùng');
  });

  it('lời AI nhiều dòng "- " thành gạch đầu dòng, bỏ dấu ** markdown', () => {
    const h = agentHtml(ans({ answer: 'Tìm thấy 2 ý:\n- **I.A.1.1**: chờ GPU\n- II.B.2.4: đã xong' }), rows);
    expect(h).toContain('<p>Tìm thấy 2 ý:</p>');
    expect(h).toContain('<ul class="bl"><li><button class="cd" data-act="exGo" data-i="3">I.A.1.1</button>: chờ GPU</li><li><button class="cd" data-act="exGo" data-i="7">II.B.2.4</button>: đã xong</li></ul>');
    expect(h).not.toContain('**');
  });

  it('tóm tắt tuần: chip theo tiến độ và rủi ro, mã dự án chậm là nút, số nháp chờ duyệt', () => {
    const h = agentHtml(ans({ by: 'rule', answer: 'x', lead: 'Tuần này có 4 dự án, trong đó 2 dự án chậm tiến độ.', facts: facts({
      kieu: 'summary', tong: 4, theo_tien_do: { 'Chậm tiến độ': 2, 'Đúng tiến độ': 1, 'Có nguy cơ chậm': 1 }, theo_muc_do_rui_ro: { Cao: 1, 'Chưa đánh giá': 3 },
      du_an_cham: ['I.A.1.1', 'II.B.2.4'], so_du_an_cham: 2, so_du_an_co_o_nhap_ai_cho_duyet: 2 }) }), rows);
    expect(h).toContain('<span class="pc e">Chậm tiến độ · 2</span>');
    expect(h).toContain('<span class="pc w">Có nguy cơ chậm · 1</span>');
    expect(h).toContain('<span class="pc e">Cao · 1</span>');
    expect(h).toContain('Chậm tiến độ (2)');
    expect(h).toContain('data-i="7">II.B.2.4</button>');
    expect(h).toContain('2 dự án có ô nháp AI chờ duyệt.');
  });

  it('đếm theo nhóm: tách mã nhóm khỏi tiêu đề, nhóm lớn nhất nổi bật, tỉ lệ theo nhóm lớn nhất, tên đầy đủ trong tooltip', () => {
    const h = agentHtml(ans({ answer: 'Nhóm nhiều nhất có 4 dự án.', facts: facts({ kieu: 'analyze', so_luong: 5, phan_nhom: { truong: 'Nhóm', theo: { 'II.E.1Nền tảng MLOps': 4, 'I.A.3.PAI - Cá nhân hóa': 1, 'Khác': 1 }, con_lai_nhom: 2 } }) }), rows);
    expect(h).toContain('Theo nhóm');
    expect(h).toContain('<span class="gc">II.E.1</span>Nền tảng MLOps');
    expect(h).toContain('<span class="gc">I.A.3</span>PAI - Cá nhân hóa');
    expect(h).toContain('<span class="bn">Khác</span>');          // tên không có mã thì giữ nguyên
    expect(h).toContain('class="br top" title="II.E.1Nền tảng MLOps"');
    expect(h.match(/class="br top"/g)).toHaveLength(1);
    expect(h).toContain('<i style="width:100%"></i>');
    expect(h).toContain('<i style="width:25%"></i>');
    expect(h).toContain('Và 2 nhóm khác.');
  });

  it('tìm theo nội dung: nguồn gập sẵn khi AI đã tóm tắt, mở sẵn khi dùng câu mẫu; đoạn dài bị cắt', () => {
    const f = facts({ kieu: 'search', tim_thay: true, so_doan: 1, doan: [{ code: 'I.A.1.1', ten: 'Nền tảng', truong: 'Báo cáo tuần này', noi_dung: 'a'.repeat(300) }] });
    const ai = agentHtml(ans({ answer: '- I.A.1.1: đang chờ GPU', facts: f }), rows);
    expect(ai).toContain('<details class="srcs"><summary>Nguồn trong bảng (1 đoạn)</summary>');
    expect(ai).toContain('<span class="pf">Báo cáo tuần này</span>');
    expect(ai).toContain('a'.repeat(170) + '…');
    expect(ai).not.toContain('a'.repeat(171));
    const rule = agentHtml(ans({ by: 'rule', answer: 'x', lead: 'Tìm thấy 1 đoạn liên quan trong bảng.', facts: f }), rows);
    expect(rule).toContain('<details class="srcs" open>');
  });

  it('phân tích: thẻ số, nhận xét, thanh phân bố và ma trận được vẽ từ số liệu backend, danh sách dự án vẫn còn', () => {
    const phan_tich = {
      so_du_an: 4,
      the_so: [{ nhan: 'Dự án', so: 4, muc: '' }, { nhan: 'Chậm tiến độ', so: 2, muc: 'e' }, { nhan: 'Quá hạn', so: 1, muc: 'e' }],
      phan_bo: { 'Tiến độ': { 'Chậm tiến độ': 2, 'Đúng tiến độ': 2 }, 'Mức độ rủi ro': { Cao: 1, 'Chưa đánh giá': 3 }, 'Trạng thái': { 'In Progress': 4 } },
      ma_tran: { tien_do: ['Chậm tiến độ', 'Đúng tiến độ'], rui_ro: ['Chưa đánh giá', 'Cao'], so: [[1, 1], [2, 0]] },
      nhan_xet: [{ muc: 'e', noi_dung: '1/4 dự án đang chạy đã quá hạn.' }, { muc: 'w', noi_dung: '3 dự án chưa đánh giá mức độ rủi ro.' }],
    };
    const f: AgentFacts = { kieu: 'analyze', muc_chi_tiet: 'day_du', so_luong: 4, tong: 10, phan_tich, du_an: [{ code: 'I.A.1.1', name: 'A', tien_do: 'Chậm tiến độ' }] };
    const h = agentHtml(ans({ answer: 'Có 4/10 dự án.', facts: f }), rows);
    expect(h).toContain('<b>4<small>/10</small></b>');
    expect(h).toContain('class="ax-k e"');
    expect(h).toContain('<div class="ax-h">Điều cần chú ý</div>');
    expect(h).toContain('1/4 dự án đang chạy đã quá hạn.');
    expect(h).toContain('<title>Chậm tiến độ · 2 (50%)</title>');   // vành khuyên Tiến độ
    expect(h).toContain('class="ax-mx"');
    expect(h).toContain('title="Chậm tiến độ × Cao: 1 dự án"');
    expect(h).not.toContain('aria-label="Trạng thái"');   // chỉ một giá trị: không vẽ thanh
    expect(h).toContain('<li class="pi">');
  });

  it('phân tích: vòng đúng tiến độ, cột theo hạn và thanh từng nhóm', () => {
    const phan_tich = {
      so_du_an: 10, ty_le_dung_tien_do: 70, the_so: [{ nhan: 'Dự án', so: 10 }],
      lich_han: [{ nhan: 'Quá hạn', so: 2, muc: 'e' }, { nhan: '0–7 ngày', so: 0, muc: 'w' }, { nhan: 'Chưa có hạn', so: 1, muc: 'n' }],
      theo_nhom: [{ nhom: 'I.A.3.PAI - Voice', tong: 6, cham: 3, nguy_co: 1, dung: 2 }, { nhom: 'II.E.1Nền tảng', tong: 4, cham: 0, nguy_co: 0, dung: 4 }], con_lai_nhom: 2,
    };
    const h = agentHtml(ans({ answer: 'x', facts: { kieu: 'filter', muc_chi_tiet: 'day_du', so_luong: 10, tong: 10, phan_tich, du_an: [] } }), rows);
    expect(h).toContain('aria-label="Đúng tiến độ 70%"');
    expect(h).toContain('stroke-dasharray="70 30"');
    expect(h).toContain('class="ax-col e"');
    expect(h).toContain('title="Quá hạn: 2 dự án"');
    expect(h).toContain('Tình hình từng nhóm');
    expect(h).toContain('title="Chậm tiến độ: 3"');
    expect(h).toContain('và 2 nhóm khác');
    const grouped = agentHtml(ans({ answer: 'x', facts: { kieu: 'analyze', muc_chi_tiet: 'day_du', so_luong: 10, phan_tich, phan_nhom: { truong: 'Nhóm', theo: { A: 6, B: 4 } } } }), rows);
    expect(grouped).not.toContain('Tình hình từng nhóm');
  });

  it('mức chi tiết do V-LLM chọn: ngắn chỉ thẻ số, vừa (mặc định) thêm nhận xét và biểu đồ chính, đầy đủ vẽ hết', () => {
    const phan_tich = {
      so_du_an: 10, ty_le_dung_tien_do: 70, the_so: [{ nhan: 'Dự án', so: 10 }, { nhan: 'Chậm tiến độ', so: 3, muc: 'e' }],
      phan_bo: { 'Tiến độ': { A: 6, B: 4 }, 'Mức độ rủi ro': { Cao: 5, Thấp: 5 }, 'Trạng thái': { X: 6, Y: 4 } },
      lich_han: [{ nhan: 'Quá hạn', so: 2, muc: 'e' }], theo_nhom: [{ nhom: 'G1', tong: 6, cham: 1, nguy_co: 0, dung: 5 }, { nhom: 'G2', tong: 4, cham: 0, nguy_co: 0, dung: 4 }],
      ma_tran: { tien_do: ['A', 'B'], rui_ro: ['Cao', 'Thấp'], so: [[1, 5], [4, 0]] }, nhan_xet: [{ muc: 'e', noi_dung: '2/10 dự án quá hạn.' }],
    };
    const html = (lv?: 'ngan' | 'vua' | 'day_du'): string => agentHtml(ans({ answer: 'x', facts: { kieu: 'filter', so_luong: 10, tong: 10, phan_tich, du_an: [], ...(lv ? { muc_chi_tiet: lv } : {}) } }), rows);
    const short = html('ngan');
    expect(short).toContain('class="ax-kp"');
    ['ax-hero', 'Điều cần chú ý', 'ax-dn', 'ax-cols', 'ax-mx', 'Tình hình từng nhóm'].forEach((c) => expect(short, c).not.toContain(c));
    const mid = html();
    expect(mid).toContain('Điều cần chú ý'); expect(mid).toContain('ax-hero'); expect(mid).toContain('ax-dn'); expect(mid).toContain('aria-label="Tiến độ"');
    expect(mid).not.toContain('aria-label="Mức độ rủi ro"');   // mặc định chỉ một biểu đồ chính
    expect(mid).not.toContain('aria-label="Trạng thái"');
    ['ax-cols', 'ax-mx', 'Tình hình từng nhóm'].forEach((c) => expect(mid, c).not.toContain(c));
    const full = html('day_du');
    ['ax-cols', 'ax-mx', 'Tình hình từng nhóm', 'aria-label="Trạng thái"'].forEach((c) => expect(full, c).toContain(c));
  });

  it('phân tích: tóm tắt dùng khối phân tích thay cho chip; không có phan_tich thì vẫn dùng chip như cũ; đếm theo cột không vẽ lại thanh của cột đó', () => {
    const base: AgentFacts = { kieu: 'summary', tong: 4, theo_tien_do: { 'Chậm tiến độ': 2 }, theo_muc_do_rui_ro: { Cao: 1 } };
    expect(agentHtml(ans({ answer: 'x', facts: base }), rows)).toContain('<div class="sh">Tiến độ</div>');
    const pt = { so_du_an: 4, the_so: [{ nhan: 'Dự án', so: 4 }], phan_bo: { 'Tiến độ': { A: 3, B: 1 }, 'Mức độ rủi ro': { Cao: 2, Thấp: 2 } } };
    const withPt = agentHtml(ans({ answer: 'x', facts: { ...base, phan_tich: pt } }), rows);
    expect(withPt).toContain('class="ax"');
    expect(withPt).not.toContain('<div class="sh">Tiến độ</div>');
    const grouped = agentHtml(ans({ answer: 'x', facts: { kieu: 'analyze', so_luong: 4, phan_tich: pt, phan_nhom: { truong: 'Tiến độ', theo: { A: 3, B: 1 } } } }), rows);
    expect(grouped).not.toContain('aria-label="Tiến độ"');
    expect(grouped).toContain('aria-label="Mức độ rủi ro"');
  });

  it('backend cũ không gửi facts/lead: vẫn hiện câu trả lời như trước', () => {
    const h = agentHtml(ans({ by: 'rule', answer: 'Có 3 dự án.' }), rows);
    expect(h).toContain('<p>Có 3 dự án.</p>');
    expect(h).not.toContain('class="pl"');
  });
});


describe('Báo cáo chi tiết một dự án và gợi ý ưu tiên', () => {
  const P = { code: 'I.A.1.1', name: 'Điều phối tài xế', tien_do: 'Chậm tiến độ', rui_ro: 'Thấp', trang_thai: 'Đang thực hiện', han: '10/12/2026' };
  it('mỗi ô nội dung là một khối riêng, gộp đoạn, tách ý theo số thứ tự và không lặp mã dự án', () => {
    const doan = [
      { code: 'I.A.1.1', truong: 'Vấn đề, rủi ro và đề xuất', noi_dung: 'Rủi ro: dự án chậm.' },
      { code: 'I.A.1.1', truong: 'Vấn đề, rủi ro và đề xuất', noi_dung: 'Đề xuất: cập nhật kế hoạch.' },
      { code: 'I.A.1.1', truong: 'KPI', noi_dung: '1. Tỉ lệ chuyển đổi >= 12% 2. Độ trễ P95 <= 250ms' },
      { code: 'I.A.1.1', truong: 'Công việc đã hoàn thành trong tuần', noi_dung: '[2026-11-19] - Đánh giá mở rộng phạm vi' },
    ];
    const h = agentHtml(ans({ intent: 'project', answer: 'ok', facts: { kieu: 'project', tim_thay: true, du_an: P, doan } as AgentFacts }), rows);
    expect(h).toContain('class="rpt"');
    expect(h).toContain('Vấn đề, rủi ro và đề xuất');
    expect(h).toContain('Rủi ro: dự án chậm. Đề xuất: cập nhật kế hoạch.');   // hai đoạn của cùng một ô được gộp
    expect(h).toContain('<b class="rpt-dt">19/11</b>');
    expect((h.match(/data-act="exGo"/g) || []).length).toBe(1);   // mã dự án chỉ xuất hiện ở tiêu đề
    expect(h.indexOf('Việc đã làm tuần này')).toBeGreaterThan(h.indexOf('Vấn đề'));
    expect(h).toContain('<details class="rpt-g"><summary><span class="rpt-tt">KPI</span><small');
  });
  it('ô dài có nút xem đầy đủ, chữ trong báo cáo bị thoát HTML', () => {
    const long = 'a'.repeat(60) + ' ' + 'từ '.repeat(150);
    const h = agentHtml(ans({ answer: 'ok', facts: { kieu: 'project', tim_thay: true, du_an: P, doan: [{ code: 'I.A.1.1', truong: 'Kế hoạch tuần sau', noi_dung: long + '<img src=x>' }] } as AgentFacts }), rows);
    expect(h).toContain('Xem đầy đủ');
    expect(h).not.toContain('<img');
  });
  it('gợi ý ưu tiên: ba nhóm kèm lý do, cách xếp và lưu ý', () => {
    const facts = { kieu: 'prioritize', dang_chay: 5, nen_giu: { so: 1, du_an: [{ ...P, code: 'I.A.1.1', tien_do: 'Đúng tiến độ', ly_do: 'đúng tiến độ, hạn còn 10 ngày' }] },
      can_xem_lai: { so: 1, du_an: [{ ...P, code: 'II.B.2.4', rui_ro: 'Cao', ly_do: 'chậm tiến độ, rủi ro cao, quá hạn 5 ngày' }] }, co_the_hoan: { so: 0, du_an: [] },
      tieu_chi: ['Nên giữ: sắp về đích.'], luu_y: 'Bảng không có ngân sách.' } as AgentFacts;
    const h = agentHtml(ans({ intent: 'prioritize', answer: 'Gợi ý.', facts }), rows);
    expect(h).toContain('Nên giữ <b>1</b>');
    expect(h).toContain('Cần xem lại <b>1</b>');
    expect(h).not.toContain('Có thể hoãn');
    expect(h).toContain('quá hạn 5 ngày');
    expect(h).toContain('Bảng không có ngân sách.');
  });
  it('gợi ý ưu tiên có sức chứa và nhóm bảo vệ: có nút soạn ghi chú tạm hoãn gửi lệnh sửa', () => {
    const facts = { kieu: 'prioritize', dang_chay: 5, suc_chua: { giu_toi_da: 2, giu: { so: 1, du_an: [{ ...P, code: 'I.A.1.1', ly_do: 'thuộc nhóm bảo vệ · đúng tiến độ' }] }, hoan: { so: 1, du_an: [{ ...P, code: 'II.B.2.4', ly_do: 'chậm tiến độ' }] }, bao_ve_vuot_suc_chua: false },
      bao_ve: { nhom: ['Nhóm = Food'], so: 1, du_an: [{ ...P, code: 'I.A.1.1' }] }, nen_giu: { so: 0, du_an: [] }, can_xem_lai: { so: 0, du_an: [] }, co_the_hoan: { so: 0, du_an: [] } } as AgentFacts;
    const h = agentHtml(ans({ intent: 'prioritize', answer: 'Gợi ý.', facts }), rows);
    expect(h).toContain('Nên giữ (tối đa 2)');
    expect(h.match(/I\.A\.1\.1/g)?.length).toBe(1);   // nhóm bảo vệ không lặp lại ở hai mục
    expect(h).toContain('bảo vệ');
    expect(h).toContain('data-act="askIdea"');
    expect(h).toContain('II.B.2.4');
    expect(h).toContain('Đề xuất tạm hoãn');
  });
  it('gợi ý hỏi tiếp theo đúng ngữ cảnh câu trả lời, mã dự án lấy từ số liệu', () => {
    const sum = agentHtml(ans({ intent: 'summary', answer: 'ok', facts: { kieu: 'summary', tong: 4, du_an_cham: ['II.B.2.4', 'I.A.1.1'], theo_tien_do: { 'Chậm tiến độ': 2, 'Đúng tiến độ': 2 }, so_du_an_co_o_nhap_ai_cho_duyet: 1 } as AgentFacts }), rows);
    expect(sum).toContain('data-q="Chi tiết dự án II.B.2.4"');
    expect(sum).toContain('Nếu bị cắt kinh phí thì nên ưu tiên dự án nào?');
    expect(sum.match(/data-act="askIdea"/g)!.length).toBeLessThanOrEqual(3);
    const pf = { intent: 'project', facts: { kieu: 'project', tim_thay: true, du_an: { ...P, code: 'I.A.1.1', nhom: 'I.A.1.Food' } } as AgentFacts };
    expect(nextQuestions(pf, ['I.A.1.1'])).not.toContain('Các dự án cùng nhóm I.A.1');   // nhóm chỉ có 1 dự án: không gợi ý vô nghĩa
    const pj = nextQuestions(pf, ['I.A.1.1', 'I.A.1.2']);
    expect(pj).toContain('Các dự án cùng nhóm I.A.1');
    expect(pj.every((t) => t.includes('I.A.1.1') || t.includes('I.A.1'))).toBe(true);
    expect(nextQuestions({ intent: 'help', facts: undefined })).toEqual([]);
  });
  it('thống kê có thanh chia đoạn tỷ lệ; gợi ý ưu tiên có thanh giữ / hoãn', () => {
    const h = agentHtml(ans({ intent: 'summary', answer: 'ok', facts: { kieu: 'summary', tong: 4, theo_tien_do: { 'Chậm tiến độ': 3, 'Đúng tiến độ': 1 } } as AgentFacts }), rows);
    expect(h).toContain('class="fx-seg"');
    expect(h).toContain('style="flex:3;--i:0"');
    const pr = agentHtml(ans({ intent: 'prioritize', answer: 'ok', facts: { kieu: 'prioritize', dang_chay: 3, nen_giu: { so: 1, du_an: [{ ...P, ly_do: 'a, hạn còn 3 ngày' }] }, can_xem_lai: { so: 0, du_an: [] }, co_the_hoan: { so: 2, du_an: [] }, con_lai: 0 } as AgentFacts }), rows);
    expect(pr).toContain('fx-seg');
  });
  it('báo cáo dự án: mục viết IN HOA + dấu • được tách thành tiêu đề nhỏ và danh sách, mục gấp có dòng xem trước', () => {
    const goal = '1. BÀI TOÁN & BỐI CẢNH Dự án thuộc lộ trình ứng dụng AI. 2. MỤC TIÊU & TÁC ĐỘNG KINH DOANH • Cải thiện độ chính xác ETA • Chỉ tiêu: MAE ≤ 1.2 phút 3. PHẠM VI & TRADEOFF • Phạm vi: Hà Nội • Tradeoff: SLA';
    const h = agentHtml(ans({ intent: 'project', answer: 'ok', facts: { kieu: 'project', tim_thay: true, du_an: P, doan: [{ code: 'I.A.1.1', truong: 'Mục tiêu', noi_dung: goal }] } as AgentFacts }), rows);
    expect(h).toContain('<h5>Bài toán &amp; bối cảnh</h5>');
    expect(h).toContain('<h5>Mục tiêu &amp; tác động kinh doanh</h5>');
    expect(h).toContain('<li>Cải thiện độ chính xác ETA</li>');
    expect(h).toContain('class="rpt-pk">Bài toán &amp; bối cảnh · Mục tiêu &amp; tác động kinh doanh · Phạm vi &amp; tradeoff</small>');
  });
  it('báo cáo dự án nêu mâu thuẫn: đã hoàn thành nhưng tiến độ chậm', () => {
    const h = agentHtml(ans({ intent: 'project', answer: 'ok', facts: { kieu: 'project', tim_thay: true, du_an: { ...P, trang_thai: 'Đã hoàn thành', tien_do: 'Chậm tiến độ', han: '15/11/2026' }, doan: [{ code: 'I.A.1.1', truong: 'Ghi chú', noi_dung: 'x' }] } as AgentFacts }), rows);
    expect(h).toContain('class="rpt-n"');
    expect(h).toContain('Nên đối chiếu lại.');
    expect(h).not.toContain('Quá hạn');   // dự án đã xong thì không báo quá hạn
  });
  it('so với tuần trước: hai cột Tuần trước / Tuần này, không phải thẻ tóm tắt dự án', () => {
    const facts = { kieu: 'search', so_sanh: true, ma_hoi: 'I.A.1.1', tim_thay: true, doan: [
      { code: 'I.A.1.1', ten: 'Dự án A', truong: 'Báo cáo các tuần trước', noi_dung: '[2026-10-01] - Hoàn thành thiết kế' },
      { code: 'I.A.1.1', ten: 'Dự án A', truong: 'Công việc đã hoàn thành trong tuần', noi_dung: 'Chạy thử bản beta' },
      { code: 'I.A.1.1', ten: 'Dự án A', truong: 'Kế hoạch tuần sau', noi_dung: 'Mở rộng thử nghiệm' },
    ] } as AgentFacts;
    const h = agentHtml(ans({ intent: 'search', answer: 'Có thay đổi.', facts }), rows);
    expect(h).toContain('class="cmp"');
    expect(h).toContain('Tuần trước');
    expect(h).toContain('Tuần này');
    expect(h).toContain('Chạy thử bản beta');
    expect(h).toContain('Hoàn thành thiết kế');
    expect(h).not.toContain('Nguồn trong bảng');
  });
  it('so với tuần trước nhưng bảng chưa có nội dung tuần trước: nói rõ, không bịa', () => {
    const facts = { kieu: 'search', so_sanh: true, ma_hoi: 'I.A.1.1', tim_thay: true, doan: [{ code: 'I.A.1.1', ten: 'A', truong: 'Kế hoạch tuần sau', noi_dung: 'Làm tiếp' }] } as AgentFacts;
    const h = agentHtml(ans({ intent: 'search', answer: 'ok', facts }), rows);
    expect(h).toContain('chưa so sánh được');
  });
  it('phân tích chỉ 1 dự án: không vẽ thẻ vòng % và biểu đồ', () => {
    const facts = { kieu: 'filter', so_luong: 1, tong: 4, du_an: [P], phan_tich: { so_du_an: 1, ty_le_dung_tien_do: 100, the_so: [{ nhan: 'Dự án', so: 1, muc: 'n' }], phan_bo: {}, nhan_xet: [] } } as unknown as AgentFacts;
    const h = agentHtml(ans({ intent: 'filter', answer: 'ok', facts }), rows);
    expect(h).not.toContain('ax-hero');
  });
  it('hỏi "dự án nào…" ra ít dự án: chỉ câu trả lời và danh sách, không vẽ vòng % và thẻ số lặp lại câu hỏi', () => {
    const P2 = (c: string) => ({ code: c, name: 'Dự án ' + c, tien_do: 'Có nguy cơ chậm', rui_ro: 'Thấp', trang_thai: 'Đang thực hiện', han: '10/12/2026' });
    const phan_tich = { so_du_an: 4, ty_le_dung_tien_do: 0, the_so: [{ nhan: 'Dự án', so: 4, muc: 'n' }, { nhan: 'Có nguy cơ chậm', so: 4, muc: 'w' }], phan_bo: {}, nhan_xet: [{ muc: 'w', noi_dung: '4 dự án đến hạn trong 14 ngày tới.' }] };
    const facts = { kieu: 'filter', khop: true, so_luong: 4, tong: 56, du_an: [P2('I.A.1.1'), P2('I.A.1.2'), P2('I.A.1.3'), P2('I.A.1.4')], phan_tich } as unknown as AgentFacts;
    const h = agentHtml(ans({ intent: 'filter', answer: 'Có 4 dự án.', facts }), rows);
    ['ax-hero', 'ax-kp', 'Điều cần chú ý'].forEach((c) => expect(h, c).not.toContain(c));
    expect(h).toContain('I.A.1.4');
  });
});
