import type { RiskCase, RiskCriteria } from '@/types';

/** Bộ tiêu chí đánh giá rủi ro (mock). Các ngưỡng do hệ thống dùng để tính điểm, AI không tự tính. */
export const RISK_CRITERIA: RiskCriteria = {
  version: 'v1',
  updatedAt: '12/11',
  delayDays: [15, 5, 1],      // ngưỡng trễ tiến độ (ngày) cho Impact 4/3/2
  financePct: [30, 15, 5],    // ngưỡng lệch effort (%) cho Impact 4/3/2
  urgentDays: 7,              // còn ≤ 7 ngày: Urgency cơ sở 3
  soonDays: 30,               // còn ≤ 30 ngày: Urgency cơ sở 2
  staleWeeks: 3,              // tồn ≥ 3 tuần thì +1 Urgency
  priority: [12, 8, 4],       // điểm >= 12: P1, >= 8: P2, >= 4: P3, còn lại P4
};

export const RISK_CATEGORIES: Record<string, string> = {
  C1: 'Khách hàng & Yêu cầu/Phạm vi', C2: 'Hợp đồng, pháp lý & Nghiệm thu', C3: 'Tiến độ & Mốc', C4: 'Nguồn lực', C5: 'Chất lượng',
  C6: 'Kỹ thuật, Hạ tầng & Tích hợp', C7: 'Phụ thuộc bên ngoài', C8: 'Hiệu quả tài chính', C9: 'Công cụ & Năng suất (AI)', C10: 'Dữ liệu & Báo cáo',
};

export const RISK_SIGNALS: Record<string, string> = {
  R01: 'Tồn ≥3 tuần chưa chuyển biến', R02: 'Thiếu hạn hoặc người phụ trách', R03: 'Hạn lùi ≥2 lần hoặc quá hạn',
  R04: 'Biến mất khỏi báo cáo, chưa xác nhận đóng', R05: 'Dữ liệu Jira lệch báo cáo', R07: 'Làm khi chưa có HĐ/WO',
  R08: 'Chất lượng dưới chuẩn', R09: '% tiến độ đứng im', R10: 'Phụ thuộc ngoài thiếu ETA/đầu mối', R11: 'Thiếu vị trí kéo dài',
};

/** Action chuẩn theo loại vấn đề và mức Impact (1–4). */
export const RISK_MATRIX: Record<string, string[]> = {
  C1: ['Ghi vào RID, PM xử lý trong họp tuần', 'PM chốt với KH bằng văn bản trong 2 tuần', 'Lượng hóa effort, lập CR, chốt phạm vi trước khi làm tiếp', 'Tạm khóa phần phạm vi chưa chốt; báo cáo lãnh đạo TT'],
  C2: ['Nhắc KD/AM ghi nhận kế hoạch ký', 'KD/AM đặt hạn ký HĐ/WO/biên bản', 'KD/AM lập kế hoạch ký trong 1 tuần; giới hạn RA phát sinh', 'Báo cáo lãnh đạo TT ngay; cân nhắc tạm dừng'],
  C3: ['PM cập nhật % và hạn trong BC tuần', 'PM nêu nguyên nhân và hạn mới', 'Replan mốc; báo cáo lãnh đạo TT nếu lùi ≥2 lần', 'Escalate lãnh đạo TT trong ngày'],
  C4: ['PM theo dõi tuyển/điều phối', 'PMO điều phối nhân sự, hạn 2 tuần', 'PMO + lãnh đạo TT điều chuyển/bổ sung', 'Lãnh đạo TT quyết định điều chuyển ưu tiên'],
  C5: ['PM theo dõi bug trong BC tuần', 'PM phân tích nguyên nhân gốc, kế hoạch giảm bug', 'Kế hoạch khắc phục trong 20 ngày làm việc', 'Chưa release/nghiệm thu đến khi đạt; báo cáo lãnh đạo TT'],
  C6: ['Tech Lead xử lý theo sprint', 'Tech Lead đưa phương án và hạn trong tuần', 'Họp kỹ thuật, phương án dự phòng', 'Escalate Tech Lead cấp TT; war-room'],
  C7: ['Ghi ETA và đầu mối vào RID', 'Nhắc bằng email, bổ sung ETA; theo dõi hằng tuần', 'Gửi văn bản chính thức; escalate nếu quá hạn 1 tuần', 'KD/lãnh đạo TT làm việc với lãnh đạo đối tác'],
  C8: ['PMO theo dõi số liệu hằng tháng', 'PM/AM giải thích chênh lệch', 'Kế hoạch giải tồn/ký WO có hạn', 'Báo cáo lãnh đạo TT; rà soát RA/nhân sự'],
  C10: ['PM sửa ở kỳ BC kế tiếp', 'PM xác nhận Jira so với BC trong tuần', 'Yêu cầu bổ sung BC ngay', 'Báo cáo lãnh đạo TT; audit RID/Jira'],
};

const none = { delayDays: 0, financePct: 0, contract: 0, quality: 0, dataControl: 0 };

/** 8 vấn đề/rủi ro mà AI đã chấm (mock). `rowIndex` trỏ tới dòng dự án tương ứng. */
export const RISK_CASES: RiskCase[] = [
  {
    id: 'RI-01', rowIndex: 2, kind: 'Issue', category: 'C3', source: 'Cột Rủi ro, tuần 3/11',
    text: 'Mốc UAT với khách hàng lùi lần 2 (30/10 → 08/11 → 20/11). Tiến độ dev đứng ở 60% hai tuần liền, chưa rõ nguyên nhân.',
    why: 'Nguyên nhân gốc là chậm tiến độ nội bộ, không phải khách hàng đổi yêu cầu.',
    impact: { ...none, delayDays: 12 }, daysToDue: 3, blocked: false, weeksOpen: 2, noOwner: false, probability: '',
    signals: [['R03', 'Hạn UAT đổi 30/10 → 08/11 → 20/11'], ['R09', 'Tiến độ 60% ở cả tuần 27/10 và 03/11']],
    actions: [
      { ref: 'A03', text: 'Replan mốc UAT, ghi rõ nguyên nhân lùi; báo cáo lãnh đạo trung tâm trong tuần', owner: 'PM', due: '21/11' },
      { ref: '', text: 'Bổ sung 1 dev từ nhóm nền tảng trong 2 tuần để giữ mốc mới', owner: 'PMO', due: '24/11' },
    ],
    closeWhen: 'Có mốc UAT mới được khách hàng xác nhận bằng mail; tiến độ tăng lại 2 tuần liền.', similarCases: ['V05', 'V20'], confidence: 'high', missingInfo: [],
  },
  {
    id: 'RI-02', rowIndex: 8, kind: 'Issue', category: 'C5', source: 'Cột Vấn đề, tuần 3/11',
    text: 'Tỉ lệ bug nội bộ sprint 14 lên 22%, có 6 bug critical chưa xử lý. UAT bắt đầu sau 9 ngày.',
    why: 'Chất lượng sản phẩm chưa đạt trước UAT.',
    impact: { ...none, quality: 4 }, daysToDue: 9, blocked: false, weeksOpen: 1, noOwner: false, probability: '',
    signals: [['R08', 'Bug critical trước mốc nghiệm thu']],
    actions: [
      { ref: 'A08', text: 'Lập kế hoạch khắc phục 6 bug critical, RCA nhóm lỗi lặp lại; QA review hằng tuần', owner: 'PM + QA', due: '28/11' },
      { ref: '', text: 'Chưa vào UAT khi còn bug critical mở', owner: 'PM', due: '26/11' },
    ],
    closeWhen: 'Không còn bug critical mở; tỉ lệ bug nội bộ về dưới chuẩn 2 sprint liền.', similarCases: ['V09', 'V10'], confidence: 'low',
    uncertainty: 'Bộ tiêu chí chưa có công thức và ngưỡng Defect Rate. AI chấm Chất lượng = 4 dựa vào “bug critical trước go-live”.',
    missingInfo: ['Ngưỡng chuẩn của tỉ lệ bug nội bộ'],
  },
  {
    id: 'RI-03', rowIndex: 5, kind: 'Dependency', category: 'C7', source: 'Cột Rủi ro, tuần 3/11',
    text: 'Chưa nhận đủ dữ liệu GPS từ đối tác. Đối tác hẹn 25/11, phía dự án chưa có người đầu mối.',
    why: 'Đang chờ bên ngoài bàn giao dữ liệu.',
    impact: { ...none, delayDays: 4 }, daysToDue: 8, blocked: false, weeksOpen: 1, noOwner: true, probability: '',
    signals: [['R02', 'Chưa có người phụ trách phía dự án'], ['R10', 'Có ETA nhưng chưa có đầu mối']],
    actions: [{ ref: 'A04', text: 'Cử đầu mối nhận dữ liệu; gửi mail chính thức xác nhận hạn 25/11', owner: 'PM', due: '19/11' }],
    closeWhen: 'Đối tác bàn giao đủ dữ liệu và nhóm dữ liệu xác nhận đã kiểm tra.', similarCases: ['V06', 'V01'], confidence: 'high', missingInfo: [],
  },
  {
    id: 'RI-04', rowIndex: 11, kind: 'Issue', category: 'C4', source: 'Cột Vấn đề, tuần 3/11',
    text: 'Thiếu 1 BA từ 3 tuần nay, velocity giảm khoảng 25%, chưa có kế hoạch bổ sung.',
    why: 'Thiếu vị trí kéo dài làm chậm tiến độ.',
    impact: { ...none, delayDays: 5 }, daysToDue: 20, blocked: false, weeksOpen: 3, noOwner: false, probability: '',
    signals: [['R01', 'Nội dung giống 3 tuần liền'], ['R11', 'Vị trí BA trống từ 27/10']],
    actions: [{ ref: 'A09', text: 'PMO điều phối 1 BA từ dự án đang giảm tải; PM đánh giá phương án thuê ngoài', owner: 'PMO + PM', due: '01/12' }],
    closeWhen: 'BA mới bắt đầu làm việc; velocity về mức trung bình 3 sprint trước.', similarCases: ['V07'], confidence: 'high', missingInfo: [],
  },
  {
    id: 'RI-05', rowIndex: 14, kind: 'Issue', category: 'C1', source: 'Cột Vấn đề, tuần 3/11',
    text: 'Khách hàng đề nghị thêm luồng phê duyệt 2 cấp, ngoài phạm vi đã chốt. Ước tính tăng 18% effort. Sprint kế tiếp bắt đầu sau 6 ngày.',
    why: 'Khách hàng bổ sung yêu cầu ngoài phạm vi.',
    impact: { ...none, financePct: 18 }, daysToDue: 6, blocked: false, weeksOpen: 1, noOwner: false, probability: '',
    signals: [],
    actions: [{ ref: 'A05', text: 'Lượng hóa effort, lập CR và chốt phạm vi với khách hàng trước khi làm', owner: 'PM + KD', due: '22/11' }],
    closeWhen: 'CR được khách hàng ký hoặc khách hàng rút yêu cầu bằng văn bản.', similarCases: ['V03'], confidence: 'high', missingInfo: [],
  },
  {
    id: 'RI-06', rowIndex: 17, kind: 'Issue', category: 'C2', source: 'Cột Vấn đề, tuần 3/11',
    text: 'Hợp đồng giai đoạn 2 chưa ký, đội đã làm 5 tuần. Chốt doanh thu tháng vào 30/11.',
    why: 'Thiếu hợp đồng là nguyên nhân gốc; hệ quả là lệch doanh thu.',
    impact: { ...none, contract: 3 }, daysToDue: 13, blocked: false, weeksOpen: 5, noOwner: false, probability: '',
    signals: [['R01', 'Tồn 5 tuần'], ['R07', 'Sản xuất khi chưa có hợp đồng']],
    actions: [{ ref: 'A06', text: 'KD/AM lập kế hoạch ký có hạn trong 1 tuần; PMO giới hạn effort phát sinh', owner: 'KD/AM', due: '24/11' }],
    closeWhen: 'Hợp đồng giai đoạn 2 được ký; effort đã làm được ghi nhận.', similarCases: ['V02', 'V15'], confidence: 'low',
    uncertainty: 'Nằm giữa C2 (Hợp đồng) và C8 (Tài chính). AI chọn C2 theo quy tắc mã nhỏ hơn, nhưng ca mẫu V15 lại chọn C8.',
    alternativeCategory: 'C8', missingInfo: [],
  },
  {
    id: 'RI-07', rowIndex: 23, kind: 'Issue', category: 'C10', source: 'So với báo cáo tuần 02/11',
    text: 'Rủi ro “Chậm phê duyệt kiến trúc” có ở tuần trước nhưng không còn trong tuần này, không có xác nhận đóng.',
    why: 'Vấn đề nằm ở dữ liệu báo cáo, chưa chắc đã xử lý xong.',
    impact: { ...none, dataControl: 2 }, daysToDue: 3, blocked: false, weeksOpen: 1, noOwner: false, probability: '',
    signals: [['R04', 'Có ở báo cáo 02/11, mất ở 3/11']],
    actions: [{ ref: 'A07', text: 'PM xác nhận rủi ro đã đóng (kèm bằng chứng) hoặc ghi lại vào báo cáo', owner: 'PM', due: '20/11' }],
    closeWhen: 'PM xác nhận bằng mail hoặc rủi ro được ghi lại.', similarCases: ['V16', 'V17'], confidence: 'high', missingInfo: ['Rủi ro đã được xử lý hay bị bỏ sót?'],
  },
  {
    id: 'RI-08', rowIndex: 20, kind: 'Risk', category: 'C6', source: 'Cột Rủi ro, tuần 3/11',
    text: 'Có thể thiếu GPU khi mở rộng huấn luyện vào tháng 12. PM đánh giá xác suất thấp.',
    why: 'Giới hạn hạ tầng cần Tech Lead xử lý.',
    impact: { ...none, delayDays: 3 }, daysToDue: 35, blocked: false, weeksOpen: 0, noOwner: false, probability: 'Thấp',
    signals: [],
    actions: [{ ref: '', text: 'Tech Lead ước tính nhu cầu GPU tháng 12 và đặt trước với đội hạ tầng', owner: 'Tech Lead', due: '05/12' }],
    closeWhen: 'Đã có xác nhận cấp GPU hoặc kế hoạch huấn luyện đổi không cần thêm.', similarCases: ['V04', 'V12'], confidence: 'high', missingInfo: [],
  },
];
