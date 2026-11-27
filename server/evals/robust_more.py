"""Thêm nhiều câu cho robust_eval: HỎI đủ kiểu và YÊU CẦU LÀM đủ kiểu, kể cả hỏi rồi làm trong cùng cuộc chat."""
from __future__ import annotations

from evals.robust_eval_base import H_ASK, H_DRAFT, H_EDIT, op

Q = ('filter', 'analyze')
# ---------------- HỎI ----------------
ROUTE_ASK = [
    # tổng quan
    ('tổng quan tuần này', [], ('summary',), None), ('báo cáo tuần này thế nào', [], ('summary',), None),
    ('cho mình biết tình hình chung', [], ('summary',), None), ('có bao nhiêu dự án tất cả', [], ('summary', 'analyze'), None),
    ('tuan nay co gi dang chu y', [], ('summary', 'analyze'), None), ('tóm tắt nhanh giúp', [], ('summary',), None),
    ('overview đi', [], ('summary',), None), ('sức khỏe danh mục dự án sao rồi', [], ('summary', 'analyze'), None),
    # đếm / lọc một điều kiện
    ('bao nhiêu dự án chậm tiến độ', [], Q, None), ('có mấy dự án đúng tiến độ', [], Q, None),
    ('dự án nào có nguy cơ chậm', [], Q, None), ('liệt kê dự án rủi ro cao', [], Q, None),
    ('rủi ro trung bình có những dự án nào', [], Q, None), ('những dự án đã hoàn thành', [], Q, None),
    ('dự án nào đang thực hiện', [], Q, None), ('dự án nào chưa thực hiện', [], Q, None),
    ('cho xem các dự án nhóm Food', [], Q, None), ('nhóm Voice có mấy dự án', [], Q, None),
    ('co may du an ride', [], Q, None), ('dự án late là gì', [], Q + ('summary', 'search'), None),
    ('đếm giúp dự án chậm', [], Q, None), ('chậm bao nhiêu cái', [], Q, None),
    ('cho t list dự án trễ', [], Q, None), ('ds dự án rr cao', [], Q, None),
    # nhiều điều kiện / nhóm / hạn / top N
    ('dự án Food nào chậm tiến độ', [], ('analyze',), None), ('Voice mà rủi ro cao có không', [], ('analyze',), None),
    ('mỗi nhóm có bao nhiêu dự án', [], ('analyze',), None), ('nhóm nào chậm nhiều nhất', [], ('analyze',), None),
    ('nhóm nào nhiều rủi ro cao nhất', [], ('analyze',), None), ('thống kê tiến độ theo nhóm', [], ('analyze',), None),
    ('ai phụ trách nhiều dự án chậm nhất', [], ('analyze',), None), ('dự án nào quá hạn rồi', [], ('analyze',), None),
    ('7 ngày tới có dự án nào đến hạn', [], ('analyze',), None), ('trong 14 ngày tới dự án nào hết hạn', [], ('analyze',), None),
    ('tháng này dự án nào đến hạn', [], ('analyze',), None), ('5 dự án gần hạn nhất', [], ('analyze',), None),
    ('dự án nào hạn xa nhất', [], ('analyze',), None), ('top 3 dự án chậm', [], ('analyze', 'filter'), None),
    ('so sánh số dự án chậm giữa các nhóm', [], ('analyze',), None), ('dự án đang thực hiện mà chậm tiến độ', [], ('analyze',), None),
    # về một dự án / nội dung
    ('I.A.1.1 là dự án gì', [], ('project', 'search'), None), ('cho mình thông tin I.C.1.2', [], ('project', 'search'), None),
    ('tình trạng của I.A.2.1', [], ('project', 'search'), None), ('ai phụ trách II.A.1.1', [], ('project', 'search'), None),
    ('KPI của I.A.1.1 là gì', [], ('search', 'project'), None), ('mục tiêu I.C.1.1 ra sao', [], ('search', 'project'), None),
    ('i.a.1.2 dang lam gi', [], ('project', 'search'), None), ('dự án nào đang chờ GPU', [], ('search',), None),
    ('có dự án nào nói về dữ liệu tài xế không', [], ('search',), None), ('vướng mắc của các dự án là gì', [], ('search', 'analyze'), None),
    ('dự án nào đề cập tới đối tác', [], ('search',), None), ('tìm dự án có chữ dashboard', [], ('search',), None),
    # nháp
    ('có bao nhiêu ô nháp AI chờ duyệt', [], ('pending',), None), ('nháp nào chưa duyệt', [], ('pending',), None),
    ('dự án nào còn nháp', [], ('pending',), None), ('con nhap nao cho duyet ko', [], ('pending',), None),
    # nối tiếp
    ('còn nhóm Voice thì sao', H_ASK, Q, None), ('vậy dự án đúng tiến độ?', H_ASK, Q, None),
    ('trong đó có dự án nào Food', H_ASK, ('analyze', 'filter'), None), ('ai phụ trách mấy dự án đó', H_ASK, ('analyze', 'project', 'projects', 'summary', 'filter', 'search'), None),
    ('còn gì nữa không', H_ASK, ('unknown', 'summary', 'filter', 'analyze'), None),
    # lạc đề / không liên quan
    ('bạn là ai', [], ('unknown', 'help'), None), ('kể chuyện cười đi', [], ('unknown',), None),
    ('giá vàng hôm nay', [], ('unknown',), None), ('viết email xin nghỉ phép', [], ('unknown',), None),
    ('thanks', H_ASK, ('unknown',), None), ('ừ', H_ASK, ('unknown',), None),
]
# ---------------- YÊU CẦU LÀM ----------------
ROUTE_DO = [
    # sửa: nhiều cách nói
    ('đổi tiến độ của I.A.1.1 thành chậm', [], ('edit',), None), ('sửa rủi ro I.C.1.2 sang cao', [], ('edit',), None),
    ('cập nhật ghi chú I.A.1.2: đang chờ phê duyệt', [], ('edit',), None), ('I.A.2.1 đúng tiến độ rồi', [], ('edit',), None),
    ('I.C.1.1 vẫn có nguy cơ chậm nha', [], ('edit',), None), ('đặt mức rủi ro trung bình cho I.A.1.1 và I.A.1.2', [], ('edit',), None),
    ('cho hết dự án Voice rủi ro thấp', [], ('edit',), None), ('mấy dự án Ride ghi note đã họp', [], ('edit',), None),
    ('các dự án chưa có rủi ro thì để trung bình', [], ('edit',), None), ('dự án nào chậm thì note chờ CBLD', [], ('edit',), None),
    ('tất cả dự án ghi chú đang theo dõi', [], ('edit',), None), ('hạ hết rủi ro cao xuống trung bình', [], ('edit',), None),
    ('nâng I.C.1.2 lên rủi ro cao', [], ('edit',), None), ('xóa ghi chú I.A.1.1', [], ('edit',), None),
    ('i.a.1.1 note cho hop khoi', [], ('edit',), None), ('td i.c.1.1 la cham', [], ('edit',), None),
    ('rr thap cho i.a.2.1', [], ('edit',), None), ('ghi note "đã gửi PO" cho I.C.1.2', [], ('edit',), None),
    ('nhớ ghi I.A.1.2 là chờ GPU nhé', [], ('edit',), None), ('làm giúp mình: I.A.2.1 rủi ro cao, I.C.1.1 rủi ro thấp', [], ('edit',), None),
    ('chuyển I.A.1.1 sang hoàn thành', [], ('edit',), None),
    # soạn nháp
    ('soạn nháp giúp mình', [], ('draft',), None), ('nhờ AI điền phần rủi ro còn thiếu', [], ('draft',), None),
    ('viết giúp mình mục vấn đề và rủi ro cho các dự án trống', [], ('draft',), None), ('AI soạn progress report đi', [], ('draft',), None),
    ('điền hết ô trống bằng AI', [], ('draft',), None), ('ai viet nhap giup t', [], ('draft',), None),
    ('tự động điền các ô còn thiếu', [], ('draft',), None), ('gợi ý rủi ro cho các dự án chưa đánh giá', [], ('draft',), None),
    # duyệt
    ('duyệt nháp của I.A.1.1', [], ('approve',), None), ('chấp nhận hết các ô AI soạn', [], ('approve',), None),
    ('duyệt tất cả', [], ('approve',), None), ('ok duyệt hết nháp đi', [], ('approve',), None), ('duyet nhap i.c.1.2', [], ('approve',), None),
    # đổi cách xem
    ('ẩn cột Ghi chú', [], ('view',), 'hide'), ('ẩn cột PIC đi', [], ('view',), 'hide'), ('hiện lại cột Note', [], ('view',), 'show'),
    ('bật lại cột Mục tiêu', [], ('view',), 'show'), ('chỉ hiện dòng cần sửa', [], ('view',), 'only_fix'),
    ('lọc dòng còn lỗi thôi', [], ('view',), 'only_fix'), ('bỏ lọc', [], ('view',), 'show_all'), ('hiện hết các dòng', [], ('view',), 'show_all'),
    ('cho xem lại cả bảng', [], ('view',), 'show_all'), ('giấu cột KPI giùm', [], ('view',), 'hide'),
    # nối tiếp trong lúc làm
    ('cũng làm vậy cho I.C.1.2', H_EDIT, ('edit',), None), ('thêm I.C.1.2 vào luôn', H_EDIT, ('edit',), None),
    ('thôi bỏ I.A.1.1 ra', H_EDIT, ('edit', 'unknown'), None), ('đổi thành "chờ họp khối" nhé', H_EDIT, ('edit',), None),
    ('làm lại đi', H_DRAFT, ('draft',), None), ('soạn tiếp các ô còn lại', H_DRAFT, ('draft',), None),
    # nhập nhằng: hỏi hay làm?
    ('tiến độ của I.A.1.1 là gì', [], ('project', 'search'), None), ('rủi ro của I.A.1.1 đang là gì', [], ('project', 'search'), None),
    ('dự án nào đã được sửa rủi ro', [], ('unknown', 'search', 'pending', 'analyze', 'filter'), None),
]

# ---------------- LỆNH SỬA: (câu, câu trước, kế hoạch giả, kết quả mong đợi) ----------------
EDITS_MORE = [
    ('đổi tiến độ của I.A.1.2 thành chậm', [], [op('td', 'Chậm tiến độ', codes=['I.A.1.2'])], {('I.A.1.2', 'td'): 'Chậm tiến độ'}),
    ('I.C.1.1 đúng tiến độ nha', [], [op('td', 'Đúng tiến độ', codes=['I.C.1.1'])], {('I.C.1.1', 'td'): 'Đúng tiến độ'}),
    ('cho I.A.2.1 và I.C.1.1 rủi ro thấp', [], [op('rui', 'Thấp', codes=['I.A.2.1', 'I.C.1.1'])], {('I.A.2.1', 'rui'): 'Thấp', ('I.C.1.1', 'rui'): 'Thấp'}),
    ('mấy dự án Voice ghi note đã họp', [], [op('ghichu', 'đã họp', wf='mang', wv='Voice')], {('I.A.2.1', 'ghichu'): 'đã họp', ('I.C.1.1', 'ghichu'): 'đã họp'}),
    ('dự án nào chậm thì note chờ CBLD', [], [op('ghichu', 'chờ CBLD', wf='td', wv='Chậm tiến độ')], {('I.A.1.1', 'ghichu'): 'chờ CBLD', ('I.A.2.1', 'ghichu'): 'chờ CBLD', ('II.A.1.1', 'ghichu'): 'chờ CBLD'}),
    ('dự án nào chưa có rủi ro thì để trung bình', [], [op('rui', 'Trung bình', only_empty=True)], {('I.A.1.2', 'rui'): 'Trung bình', ('I.C.1.1', 'rui'): 'Trung bình'}),
    ('tất cả dự án ghi chú đang theo dõi', [], [op('ghichu', 'đang theo dõi', all_=True)], {(r, 'ghichu'): 'đang theo dõi' for r in ['I.A.1.1', 'I.A.1.2', 'I.A.2.1', 'I.C.1.1', 'I.C.1.2', 'II.A.1.1']}),
    ('hạ rủi ro I.A.1.1 xuống trung bình', [], [op('rui', 'Trung bình', codes=['I.A.1.1'])], {('I.A.1.1', 'rui'): 'Trung bình'}),
    ('i.a.1.2 note cho hop khoi', [], [op('ghichu', 'chờ họp khối', codes=['I.A.1.2'])], {('I.A.1.2', 'ghichu'): 'chờ họp khối'}),
    ('rr thap cho i.a.1.1', [], [op('rui', 'Thấp', codes=['I.A.1.1'])], {('I.A.1.1', 'rui'): 'Thấp'}),
    ('làm giúp mình: I.A.2.1 rủi ro cao, I.C.1.1 rủi ro thấp', [], [op('rui', 'Cao', codes=['I.A.2.1']), op('rui', 'Thấp', codes=['I.C.1.1'])], {('I.A.2.1', 'rui'): 'Cao', ('I.C.1.1', 'rui'): 'Thấp'}),
    ('đổi rủi ro I.A.1.1 thành siêu cao', [], [op('rui', 'siêu cao', codes=['I.A.1.1'])], {}),                      # giá trị ngoài danh sách -> không đề xuất
    ('đổi tiến độ của I.Z.9.9 thành chậm', [], [op('td', 'Chậm tiến độ', codes=['I.Z.9.9'])], {}),                  # mã không có trong bảng
    ('cũng làm vậy cho I.C.1.2', H_EDIT, [op('ghichu', 'chờ họp', codes=['I.C.1.2'])], {('I.C.1.2', 'ghichu'): 'chờ họp'}),
    ('đổi thành "chờ họp khối" nhé', H_EDIT, [op('ghichu', 'chờ họp khối', codes=['I.A.1.1', 'I.A.2.1', 'II.A.1.1'])], {(c, 'ghichu'): 'chờ họp khối' for c in ['I.A.1.1', 'I.A.2.1', 'II.A.1.1']}),
    ('thêm I.C.1.2 vào luôn', H_EDIT, [op('ghichu', 'chờ họp', codes=['I.C.1.2'])], {('I.C.1.2', 'ghichu'): 'chờ họp'}),
    ('ghi chú chờ họp', H_EDIT, [op('ghichu', 'chờ họp', codes=['I.A.1.1'])], {}),                                   # không nhắc dự án, không từ nối: không lấy mã cũ
]
