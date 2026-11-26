# Đánh giá chất lượng AI trên V-LLM medium

Ngày chạy: 26/11/2026. Bộ đánh giá: 26 ca V01–V26 lấy từ bộ tiêu chí chung (nhóm C9 và ca đã đóng V23 không tính Priority). Lệnh chạy: `python -m evals.run_eval --mode live --timeout 30` trong `server/`.

## Quyết định

- Dùng **v-llm-v1-medium** cho cả soạn nháp, đánh giá rủi ro (`VLLM_MODEL`) và Agent hỏi đáp/sửa ô (`AGENT_MODEL`).
- Lý do: model large bị quá tải khi đo (14–28 giây cho một câu rất ngắn, hết giờ chờ ở 3 ca đầu của eval). Medium trả lời trung vị 2–3 giây với chất lượng đủ dùng. Model small trả lỗi 502, không dùng được.
- Nếu đổi lại sang large, chạy lại eval trước khi quyết định.

## Kết quả (lần chạy cuối, medium, 26 ca)

| Tiêu chí | Kết quả |
|---|---|
| Độ chính xác: loại vấn đề đúng | 20/24 (83%) |
| Độ chính xác: loại RID đúng | 20/24 (83%) |
| Chỉ số riêng: Priority khớp PMO | 18/23 (78%) |
| Bám nguồn | 50/52 (96%) |
| Tính đầy đủ: assess có hành động + điều kiện đóng | 26/26 |
| Tính đầy đủ: draft có đề xuất cho rủi ro thiếu | 26/26 |
| Tuân thủ chỉ dẫn (định dạng, ≤25 từ, không tự gán người) | 25/26 (96%) |
| Nhận biết bối cảnh (ca thiếu thông tin được nói rõ) | 3/3 |
| P50 assess / draft | 3,0 / 1,7 giây |
| P95 assess / draft | 6,1 / 6,5 giây (mục tiêu ≤5 giây: chưa đạt) |

Diễn biến Priority qua các lần chạy: 61% → 65% → 78% → 78% (ổn định, không phải ngẫu nhiên).

## Những gì đã sửa để đạt kết quả trên

- **Thang điểm trong prompt:** đưa mô tả mức 1–4 của HĐ & nghiệm thu, chất lượng, kiểm soát/dữ liệu từ bộ tiêu chí gốc vào prompt.
- **"Đang chặn":** chỉ tính khi chặn sản xuất/nghiệm thu hoặc sự cố production; trễ, thiếu người, chờ phản hồi không phải chặn.
- **Số ngày trễ:** chỉ tính so với mốc cam kết KH. Nếu số AI trích có nguyên văn trong mô tả thì giữ; nếu AI tự tính từ ngày tháng thì khi đã quá hạn, dùng số ngày quá hạn do code tính.
- **Số liệu AI tự thêm:** bộ lọc `_strip_invented` áp cho cả draft và hành động của assess; bỏ vế chứa ngưỡng/thời hạn không có trong dữ liệu (đơn vị: ngày, tuần, tháng, giờ, lần, %, triệu, tỷ) và cấp leo thang tự thêm.
- **JSON bị cắt (medium):** draft và Agent sửa ô dùng `repair`; Agent sửa ô dùng schema phẳng.
- **Gợi ý phân loại ngắn** trong prompt (chờ bên ngoài → C7; sự cố hệ thống đang chạy/hạ tầng/tích hợp → C6; lỗi sản phẩm → C5; số liệu tài chính → C8; Jira lệch báo cáo → C10).

## Các ca còn lệch và vì sao không sửa tiếp

- **Priority lệch (V01, V06, V07, V24):** bộ đáp án có số ngày trễ (3, 2, 6, 10) mà mô tả không nêu. AI để 0 theo quy tắc "không đoán số". Ép AI đoán sẽ phá nguyên tắc bám nguồn.
- **Priority lệch V15; loại sai V11, V14, V15, V23:** mỗi ca đều có hai loại cùng hợp lý (ví dụ V15 vừa thiếu WO vừa là vấn đề tài chính). Chỉnh prompt theo từng ca sẽ thành học thuộc bộ test.
- **Việc cần PMO:** xem lại các ca trên trong bộ đáp án (ghi rõ số ngày trễ vào mô tả hoặc thống nhất lại loại).
- **Bám nguồn còn sót:** V09 là ngưỡng "PCV ≥85%" lấy từ chính bộ tiêu chí (chấp nhận được); V12 là một con số AI tự thêm vào điều kiện đóng (chưa lọc vì điều kiện đóng cần đo được, cần PMO quyết định).
- **Độ dài:** V02 có đề xuất 26 từ, vượt giới hạn 25 một từ.

## Tốc độ

Trung vị đạt, nhưng P95 vượt 5 giây vì V-LLM thỉnh thoảng chậm bất thường (có ca 10–23 giây). Code không sửa được điểm này. Giao diện nên hiện trạng thái "đang xử lý" cho assess và draft.

## Agent hỏi đáp và sửa ô (kiểm tra riêng, V-LLM thật)

- Hỏi đáp: 5/5 câu bám số liệu, 0,4–1,2 giây (đo trước đó trên medium).
- Đề xuất sửa ô: đúng 6/6 câu, 0,6–0,9 giây; Agent chỉ đề xuất, không tự ghi; từ chối sửa cột lấy thẳng từ Jira; hỏi lại khi câu lệnh mơ hồ.
- Frontend chưa nối `/api/agent/ask`.

## Chưa làm

- Job 3 của Agent: rà soát trước khi chốt báo cáo.
- Thử V-LLM tool-calling gốc (job 2 hiện dùng JSON ops).
- `client/src/lib/risk.ts` vẫn có logic `noOwner` riêng, cần khớp với bản Python.
- Chạy eval nhiều lượt (`--repeat 3`) để có P95 chắc hơn.
