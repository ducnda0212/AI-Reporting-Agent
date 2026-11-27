"""Ca kiểm thử cho các công cụ của chế độ CÔNG CỤ (AI_AGENT_MODE=tools), cùng định dạng với robust_eval.ROUTE:
(câu, câu trước, ý định chấp nhận, hành động xem bảng).
Ý định 'hoi_lai' = V-LLM hỏi lại người dùng (spec có khoá `hoi_lai`), thay vì đoán sang việc khác.
Gồm: công cụ mới (soan_nhan_xet, kiem_tra_du_lieu, giai_thich_cot, chot_xuat, hoan_tac), câu mơ hồ phải hỏi lại, và các câu từng sai ngoài đời."""
from __future__ import annotations

NEW_ROUTE = [
    # soan_nhan_xet: nhờ SOẠN văn bản, không được trả bản tóm tắt số liệu
    ('Soạn nhận xét PMO ngắn cho tuần này: tình hình chung, dự án chậm và rủi ro cần chú ý', [], ('nhan_xet',), None),
    ('viet cho t doan nhan xet tuan nay', [], ('nhan_xet',), None),
    ('tổng kết tuần này bằng vài câu giúp mình', [], ('nhan_xet',), None),
    ('soan nhan xet pmo', [], ('nhan_xet',), None),
    # kiem_tra_du_lieu
    ('bảng còn thiếu gì trước khi chốt', [], ('kiem_tra',), None),
    ('kiem tra giup t du lieu da du chua', [], ('kiem_tra',), None),
    ('có chỗ nào sai sai trong bảng không', [], ('kiem_tra',), None),
    # giai_thich_cot
    ('cột Domain điền được không', [], ('giai_thich_cot',), None),
    ('tien do co nhung gia tri nao', [], ('giai_thich_cot', 'summary', 'analyze'), None),
    ('cột Trạng thái Jira lấy từ đâu', [], ('giai_thich_cot',), None),
    # chot_xuat / hoan_tac: chỉ báo ý định
    ('chốt báo cáo giúp t', [], ('export',), None),
    ('xuat file bao cao tuan nay', [], ('export',), None),
    ('qua buoc chot di', [], ('export',), None),
    ('hoàn tác', [], ('undo',), None),
    ('undo', [], ('undo',), None),
    ('quay lại như cũ giúp mình', [], ('undo',), None),
    ('khoi phuc lan sua vua roi', [], ('undo',), None),
    # phải hỏi lại, không đoán và không đưa kết quả của việc khác
    ('soạn email báo cáo gửi sếp', [], ('hoi_lai',), None),
    ('đổi cái đó đi', [], ('hoi_lai', 'edit'), None),
    ('làm giúp t cái báo cáo', [], ('hoi_lai',), None),
    ('cho t xem cái kia', [], ('hoi_lai',), None),
    # từng sai ngoài đời: đại từ "t" không phải mã dự án; "còn thiếu" = ô trống
    ('điền các domain còn thiếu cho t thành Food hết', [], ('edit',), None),
    ('dien domain con thieu thanh food', [], ('edit',), None),
    ('gán Voice cho mấy dự án chưa có nhóm giúp t', [], ('edit',), None),
    # không được nhầm công cụ mới với việc cũ
    ('tuần này thế nào', [], ('summary',), None),
    ('dự án nào chậm tiến độ', [], ('filter', 'analyze'), None),
    ('duyệt hết nháp cho t', [], ('approve',), None),
    ('xin chào', [], ('unknown',), None),
]
