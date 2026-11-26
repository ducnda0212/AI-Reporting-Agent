/* Lệnh sửa bảng do V-LLM đọc ý: chỉ đề xuất, giao diện đổi thành bản xem trước. Kiểm hàm dựng yêu cầu và hàm đọc kết quả. */
import { describe, expect, it } from 'vitest';
import { FIELDS } from '@/data/constants';
import { keepLocal } from '@/lib/agentRemote';
import { editFields, editHtml, editRows, localDidNotUnderstand, looksLikeEdit, toStageItems } from '@/lib/agentEdit';
import { PHASE_BUCKET, baseRows } from './fixtures';

const rows = baseRows();
const ctx = { phaseBucket: PHASE_BUCKET };
const prop = (code: string, field: string, from: string, to: string) => ({ code, field, fieldName: field, from, to });

describe('nhận ra luật tại chỗ không hiểu lệnh', () => {
  it('câu xin ví dụ hoặc hỏi lại là chưa hiểu; báo lỗi rõ hoặc đã soạn là đã hiểu', () => {
    expect(localDidNotUnderstand('Mình chưa hiểu câu này. Bạn có thể hỏi')).toBe(true);
    expect(localDidNotUnderstand('Bạn muốn Agent sửa ô nào, cho dự án nào?')).toBe(true);
    expect(localDidNotUnderstand('Bạn muốn đổi <b>Note</b> cho dự án nào, thành gì?')).toBe(true);
    expect(localDidNotUnderstand('Không có dự án mã <b>DA02</b> trong file Jira đang mở, nên mình chưa sửa gì.')).toBe(false);
    expect(localDidNotUnderstand('Cột <b>Note</b> không còn ô trống.')).toBe(false);
  });
});

describe('dựng yêu cầu gửi backend', () => {
  it('mỗi cột có id, tên, giá trị cho phép; cột lấy từ nguồn khác không sửa tay được', () => {
    const f = editFields(), td = f.find((x) => x.id === 'td')!, jira = f.find((x) => !x.editable)!;
    expect(f).toHaveLength(FIELDS.length);
    expect(td.options.length).toBeGreaterThan(0);
    expect(jira.lockedWhy).not.toBe('');
  });
  it('mỗi dòng có mã và giá trị đang hiển thị của mọi cột (ô trống là chuỗi rỗng)', () => {
    const e = editRows(rows, ctx);
    expect(e).toHaveLength(rows.length);
    expect(e[0].code).toBe(rows[0].ma);
    expect(Object.keys(e[0].values)).toHaveLength(FIELDS.length);
    expect(Object.values(e[0].values).every((v) => typeof v === 'string')).toBe(true);
  });
});

describe('đọc đề xuất của V-LLM', () => {
  it('đề xuất hợp lệ thành dòng xem trước đúng dòng và đúng cột', () => {
    const r = rows[2], out = toStageItems({ proposals: [prop(r.ma, 'note', '', 'Chờ họp')] }, rows);
    expect(out).toEqual([{ i: r.i, f: 'note', from: '', to: 'Chờ họp', kind: 'edit' }]);
  });
  it('bỏ mã không có, cột không có, cột không sửa tay được và ô không đổi', () => {
    const locked = FIELDS.find((f) => f.key)!.id;
    const out = toStageItems({ proposals: [prop('ZZ.9.9.9', 'note', '', 'x'), prop(rows[0].ma, 'khong-co', '', 'x'), prop(rows[0].ma, locked, 'a', 'b'), prop(rows[0].ma, 'note', 'x', 'x')] }, rows);
    expect(out).toHaveLength(0);
  });
  it('câu trả lời có số thay đổi; không có đề xuất thì nêu lý do, và chặn chèn HTML', () => {
    expect(editHtml({ answer: 'x', skipped: [] }, 3)).toContain('<b>3 thay đổi</b>');
    const h = editHtml({ answer: 'Agent chưa đề xuất thay đổi nào. <img src=x>', skipped: [{ reason: 'Cột Tên lấy từ Jira <b>x</b>' }] }, 0);
    expect(h).toContain('chưa đề xuất');
    expect(h).not.toContain('<img');
    expect(h).toContain('&lt;b&gt;x');
  });
});

describe('nhận ra câu sửa viết tự nhiên', () => {
  const EDIT = [
    'mấy dự án đang trễ thì ghi note chờ họp giúp mình', 'cho I.A.3.1 với I.A.4.1 mức rủi ro cao nhé', 'dự án nào chưa có note thì ghi chờ CBLD', 'những dự án chậm note lại giúp mình là chờ họp',
    'I.A.3.1 note chờ họp', 'set note của I.A.3.1 là chờ họp', 'chỉnh tiến độ I.A.3.1 thành chậm giúp mình', 'dự án I.A.3.1 tiến độ phải là Chậm tiến độ', 'cho các dự án Food ghi chú là đã họp',
    'nhớ ghi note "chờ khách" cho I.A.4.1 nha', 'mình muốn đổi mức rủi ro của I.A.3.1 sang cao', 'bạn ghi giúp mình note chờ họp cho tất cả dự án chậm', 'các dự án chưa điền note thì điền chờ CBLD giúp mình',
    'đưa I.A.3.1 về mức rủi ro thấp', 'I.A.3.1 và I.A.4.1 chuyển sang rủi ro cao', 'cập nhật note cho I.A.3.1: đã gửi mail', 'xoá note của mấy dự án trễ', 'muốn đặt note chờ họp cho dự án rủi ro cao',
    'làm ơn đổi tiến độ của I.A.3.1 thành đúng tiến độ', 'dự án rủi ro cao thì note là cần escalate', 'với những dự án trễ hạn, ghi note chờ PO', 'sửa giúp mình mức rủi ro I.A.3.1 thành trung bình',
    'cho mình đổi note I.A.3.1 thành đã họp', 'đặt rủi ro của I.A.3.1 là cao', 'mark I.A.3.1 rủi ro cao', 'I.A.3.1 mức rủi ro cao', 'tiến độ của I.A.3.1 chuyển thành chậm', 'note I.A.3.1 = chờ họp',
    'giúp mình ghi note chờ họp cho I.A.3.1', 'nhờ bạn đặt mức rủi ro của I.A.4.1 là thấp', 'các dự án nhóm Voice đổi tiến độ thành đúng tiến độ', 'tất cả dự án trễ thì cho rủi ro cao',
    'chỉnh note I.A.3.1 thành xong rồi', 'cho mình ghi note đã gửi email vào I.A.3.1', 'dự án chưa có note thì điền chờ PO nhé', 'I.A.3.1, I.A.4.1 và I.A.5.1 rủi ro thấp',
    'đánh dấu dự án chậm là rủi ro cao', 'xóa note I.A.3.1', 'update tiến độ I.A.3.1 thành đúng tiến độ', 'chuyển I.A.3.1 sang chậm tiến độ giúp mình', 'thêm note chờ họp cho các dự án rủi ro cao',
    'đặt note = đã họp cho tất cả dự án', 'I.A.3.1 tiến độ chậm tiến độ',
  ];
  const ASK = [
    'Dự án nào đang chậm?', 'Có bao nhiêu dự án rủi ro cao?', 'Tóm tắt tuần này', 'ghi chú của I.A.3.1 là gì?', 'dự án nào chưa có note?', 'Dự án nào có nguy cơ trễ', 'I.A.3.1 thế nào rồi',
    'dự án nào đến hạn trong 14 ngày tới', 'liệt kê dự án rủi ro cao', 'note của I.A.3.1 đang ghi gì', 'vì sao I.A.3.1 bị chậm', 'dự án nào do Minh phụ trách', 'mấy dự án trễ là gì', 'thống kê theo tiến độ',
    'tìm dự án nói về GPU', 'nháp nào đang chờ duyệt', 'có dự án nào đổi mức rủi ro tuần này không', 'ai ghi note cho I.A.3.1', 'dự án nào rủi ro cao mà chưa có note', 'có dự án nào bị đổi trạng thái không',
    'tiến độ của I.A.3.1 là gì', 'giải thích vì sao I.A.3.1 rủi ro cao', 'dự án chậm nhất là dự án nào', 'số dự án chưa có note là bao nhiêu', 'so sánh I.A.3.1 và I.A.4.1', 'I.A.3.1 đang ở giai đoạn nào',
    'các dự án nhóm Voice đang thế nào', 'top 5 dự án sắp đến hạn', 'mức rủi ro của I.A.3.1 là gì', 'nội dung note của mấy dự án trễ là gì', 'báo cáo tuần này có gì đáng chú ý', 'xin chào', 'cảm ơn bạn',
  ];
  it('câu sửa viết tự nhiên (không cần bắt đầu bằng động từ) đều được nhận', () => {
    EDIT.forEach((q) => expect(keepLocal(q) || looksLikeEdit(q), q).toBe(true));
  });
  it('câu hỏi số liệu không bị nhầm là lệnh sửa', () => {
    ASK.forEach((q) => expect(keepLocal(q) || looksLikeEdit(q), q).toBe(false));
  });
});
