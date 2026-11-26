"""Bộ tiêu chí chung (bản v1) — tham số hệ thống dùng để tính điểm. Khớp client/src/data/risk.ts."""
CRITERIA = {
    'version': 'v1',
    'delayDays': (15, 5, 1),
    'financePct': (30, 15, 5),
    'urgentDays': 7,
    'soonDays': 30,
    'staleWeeks': 3,
    'priority': (12, 8, 4),
}
CATEGORIES = {
    'C1': 'Khách hàng & Yêu cầu/Phạm vi', 'C2': 'Hợp đồng, pháp lý & Nghiệm thu', 'C3': 'Tiến độ & Mốc', 'C4': 'Nguồn lực',
    'C5': 'Chất lượng', 'C6': 'Kỹ thuật, Hạ tầng & Tích hợp', 'C7': 'Phụ thuộc bên ngoài', 'C8': 'Hiệu quả tài chính',
    'C9': 'Công cụ & Năng suất (AI)', 'C10': 'Dữ liệu & Báo cáo',
}
SIGNALS = {
    'R01': 'Tồn ≥3 tuần chưa chuyển biến', 'R02': 'Thiếu hạn hoặc người phụ trách', 'R03': 'Hạn lùi ≥2 lần hoặc quá hạn',
    'R04': 'Biến mất khỏi báo cáo, chưa xác nhận đóng', 'R05': 'Dữ liệu Jira lệch báo cáo', 'R07': 'Làm khi chưa có HĐ/WO',
    'R08': 'Chất lượng dưới chuẩn', 'R09': '% tiến độ đứng im', 'R10': 'Phụ thuộc ngoài thiếu ETA/đầu mối', 'R11': 'Thiếu vị trí kéo dài',
}
MATRIX = {
    'C1': ['Ghi vào RID, PM xử lý trong họp tuần', 'PM chốt với KH bằng văn bản trong 2 tuần', 'Lượng hóa effort, lập CR, chốt phạm vi trước khi làm tiếp', 'Tạm khóa phần phạm vi chưa chốt; báo cáo lãnh đạo TT'],
    'C2': ['Nhắc KD/AM ghi nhận kế hoạch ký', 'KD/AM đặt hạn ký HĐ/WO/biên bản', 'KD/AM lập kế hoạch ký trong 1 tuần; giới hạn RA phát sinh', 'Báo cáo lãnh đạo TT ngay; cân nhắc tạm dừng'],
    'C3': ['PM cập nhật % và hạn trong BC tuần', 'PM nêu nguyên nhân và hạn mới', 'Replan mốc; báo cáo lãnh đạo TT nếu lùi ≥2 lần', 'Escalate lãnh đạo TT trong ngày'],
    'C4': ['PM theo dõi tuyển/điều phối', 'PMO điều phối nhân sự, hạn 2 tuần', 'PMO + lãnh đạo TT điều chuyển/bổ sung', 'Lãnh đạo TT quyết định điều chuyển ưu tiên'],
    'C5': ['PM theo dõi bug trong BC tuần', 'PM phân tích nguyên nhân gốc, kế hoạch giảm bug', 'Kế hoạch khắc phục trong 20 ngày làm việc', 'Chưa release/nghiệm thu đến khi đạt; báo cáo lãnh đạo TT'],
    'C6': ['Tech Lead xử lý theo sprint', 'Tech Lead đưa phương án và hạn trong tuần', 'Họp kỹ thuật, phương án dự phòng', 'Escalate Tech Lead cấp TT; war-room'],
    'C7': ['Ghi ETA và đầu mối vào RID', 'Nhắc bằng email, bổ sung ETA; theo dõi hằng tuần', 'Gửi văn bản chính thức; escalate nếu quá hạn 1 tuần', 'KD/lãnh đạo TT làm việc với lãnh đạo đối tác'],
    'C8': ['PMO theo dõi số liệu hằng tháng', 'PM/AM giải thích chênh lệch', 'Kế hoạch giải tồn/ký WO có hạn', 'Báo cáo lãnh đạo TT; rà soát RA/nhân sự'],
    'C10': ['PM sửa ở kỳ BC kế tiếp', 'PM xác nhận Jira so với BC trong tuần', 'Yêu cầu bổ sung BC ngay', 'Báo cáo lãnh đạo TT; audit RID/Jira'],
}
