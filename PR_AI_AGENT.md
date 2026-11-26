## Tóm tắt

Thêm phần **AI** cho PMO Reporting: trợ lý hỏi đáp và **Agent sửa bảng** dùng V-LLM, nối vào giao diện. V-LLM chỉ **đọc ý định và đề xuất**; code kiểm tra, người dùng bấm "Áp dụng" thì bảng mới đổi. Không ghi trực tiếp vào bảng.

## Làm được gì

**Hỏi đáp (chỉ đọc)** – số liệu do code tính, V-LLM chỉ diễn đạt, câu trả lời được kiểm tra lại với số liệu.
- Tóm tắt tuần, lọc/đếm theo Tiến độ, Trạng thái, Mức độ rủi ro, Nhóm, người phụ trách; thống kê theo nhóm; lọc theo hạn; top N.
- Hỏi về một dự án theo mã, hỏi nội dung một ô ("KPI của I.A.4.1 là gì"), tìm theo nội dung chữ (từ khóa + embeddings nếu bật).
- Câu nối tiếp ("trong số đó…", "cái đó là gì") và dự án đang chọn trên bảng.
- Mã không có trong file thì nói rõ là không có, không trả lời lạc đề.

**Agent sửa bảng (đề xuất → xem trước → duyệt)**
- Lệnh viết tự nhiên: "mấy dự án trễ thì ghi note chờ CBLD", "I.A.1.1 chờ họp nhé", "cho I.A.1.2 mức rủi ro thấp", "dự án nào chưa có note thì điền đang xử lý".
- Tạo **bản xem trước** (tick/bỏ tick từng dòng, nút "Áp dụng N thay đổi" / "Bỏ"), có animation Agent điền. Bảng chỉ đổi sau khi bấm Áp dụng.
- Từ chối rõ ràng: mã không tồn tại, cột lấy từ Jira (khóa), giá trị ngoài danh sách chọn, câu mơ hồ (hỏi lại, không đoán phạm vi).
- Nói rõ khi không cần đổi ("I.A.3.1 đã có Tiến độ là … rồi") hoặc khi cả phạm vi đã có nội dung.

**Soạn nháp AI** (`/api/ai/draft`) – Mức độ rủi ro (AC), Vấn đề & rủi ro (AT) do V-LLM; Progress Report (AS) theo luật. Nháp tách riêng, chưa vào báo cáo cho tới khi người rà duyệt.

**Duyệt nháp, ẩn/hiện cột, lọc "chỉ dòng cần sửa"** qua chat, dùng chức năng có sẵn của giao diện.

## Luồng xử lý một câu chat

1. Giao diện gửi câu (kèm giá trị hiện có trong bảng, 3 câu trước, dòng đang chọn) lên `POST /api/agent/ask`.
2. **V-LLM đọc ý định trước**, không dựa vào từ khóa: hỏi đáp (summary/filter/analyze/project/search/pending), `edit`, `draft`, `approve`, `view`, `unknown`; kèm cờ `refers_previous` cho câu nối tiếp.
3. Code kiểm tra kết quả: mã dự án do code đọc từ câu (V-LLM bịa mã thì bỏ), giá trị ngoài danh sách bị bỏ, `view` thiếu tên cột thì không chạy.
4. Gọi đúng chức năng: hỏi đáp trả lời từ số liệu; `edit` dựng đề xuất rồi giao diện hiện bản xem trước; `draft`/`approve`/`view` giao diện chạy lệnh có sẵn.
5. **Dự phòng:** V-LLM tắt hoặc lỗi thì rơi về luật từ khóa như trước; lệnh sửa viết tự nhiên mà luật không hiểu thì báo rõ là chưa sửa gì.

## An toàn và dữ liệu

- Agent **không tự ghi**: mọi thay đổi qua bản xem trước.
- Giới hạn: tối đa 5 thao tác mỗi lệnh, 300 ô mỗi bản xem trước; `tất cả` chỉ được hiểu khi câu có nói rõ.
- Tên người được che trước khi gửi V-LLM. Nội dung trong dữ liệu (tên dự án, comment…) chỉ là dữ liệu, không phải lệnh.
- Chế độ chạy bằng `AI_MODE=vllm|mock` trong `server/.env` (**không commit key**, `.env.example` đã cập nhật).
- Cần infosec duyệt trước khi dùng dữ liệu thật với V-LLM.

## Thay đổi chính

- `server/app/ai/` – package AI: `llm.py` (client V-LLM, OpenAI-compatible), `settings.py`, `agent/qa.py` (đọc ý định + hỏi đáp), `agent/edit.py` (đề xuất sửa bảng), `rag.py` (tìm theo nội dung), `drafts.py`/`risk.py`/`weekly.py`/`criteria.py` (soạn nháp), `masking.py`, `api.py` (routes).
- `server/evals/` – bộ đánh giá: `edit_eval.py` (16 ca sửa), `intent_eval.py` (27 ca đọc ý định), `qa_eval.py` (hỏi đáp/RAG).
- `client/src/lib/` – `ai.ts` (luật tại chỗ, dự phòng), `agentRemote.ts` (nối backend, `intentCommand`), `agentEdit.ts`, `api.ts`; `store/actions/ai.ts` (luồng V-LLM-first); `components/panels/AiAssistantPanel.tsx` + `styles/agent-fx.css` (bản xem trước + animation).
- Test mới/cập nhật cho server và client; V-LLM giả trong `server/tests/fake_vllm.py`.
- `server/app/modules/mapping/wiki_parser.py` – sửa `sanitize_jira_markup` đổi `->`/`-->`/`>=`/`<=` thành `→`/`≥`/`≤`. Test `test_sanitize_arrows_and_comparators` đã **fail sẵn trên `develop`**, nên sửa luôn ở đây để pytest xanh.
- Đã merge `origin/develop` vào nhánh.

## Đã kiểm tra

- Server: `python -m pytest -q tests` → **321 passed, 7 skipped**.
- Client: `npm run typecheck`, `npm test` đã chạy qua.
- V-LLM thật: `edit_eval --mode live` **16/16**, `intent_eval --mode live` **27/27**, `qa_eval --mode live`: số liệu 12/12, chủ đề không có 4/4, hỏi trường theo mã 5/5, câu nối tiếp 2/2, tìm nội dung 26/26 trong 8 đoạn đầu; 0 mã bịa.

## Giới hạn đã biết / lưu ý cho reviewer

- Mỗi câu chat thêm 1 lần gọi V-LLM để đọc ý định (khoảng 0,5–1 giây); lệnh sửa gọi thêm 1 lần để dựng đề xuất.
- Xóa nội dung một ô qua V-LLM chưa hỗ trợ; luật tại chỗ `Xóa <cột> của <mã>` vẫn dùng được.
- Câu sửa rất ngắn không nêu cột/giá trị rõ ràng có thể bị hỏi lại.
- Luồng giao diện đầy đủ (gõ lệnh → xem trước → Áp dụng) và animation cần reviewer thử trên trình duyệt; phần tự động chỉ phủ logic.
