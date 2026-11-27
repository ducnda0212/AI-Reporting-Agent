/** Gọi backend Python (server/, cổng 8000; Vite chuyển /api sang đó lúc dev). */

export interface AiStatus {
  mode: 'mock' | 'vllm'; model: string; host: string; auth: string; problems: string[];
}
export interface DraftReport { date?: string; done: string; plan: string }
export interface DraftRequestRow {
  id: number; code: string; task: string; status: string; progress: string; end: string; late: boolean;
  week: { key: string; start: string; end: string };
  weekReport: DraftReport | null; lastReport: DraftReport | null;
  comment: string; commentRaw: string; riskNotes: string; people: string[];
}
/** Gợi ý AI cho ô Vấn đề/rủi ro. `merged` = nội dung ô sau khi bấm "Đưa vào báo cáo". */
export interface DraftSuggestion { kind: 'action' | 'full'; text: string; merged: string; why: string; by: string; count: number; categories: string[] }
export interface DraftOut {
  /** need: none = đủ dữ liệu, không gọi AI · action = AI gợi ý đề xuất · full = AI phát hiện rủi ro từ report */
  issues: { text: string; from: string; why: string; need: 'none' | 'action' | 'full'; notes: string[]; suggestion: DraftSuggestion | null };
  riskLevel: { text: string; why: string; by: string };
}
export interface DraftResult {
  drafts: Record<string, DraftOut>; errors: Record<string, string>; aiCalls: number; mode: string; model: string;
}

async function req<T>(path: string, init?: RequestInit, timeoutMs = 120000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...init, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Trạng thái AI phía backend; `null` khi backend chưa chạy. */
export async function aiStatus(): Promise<AiStatus | null> {
  try { return await req<AiStatus>('/api/ai/status', undefined, 2500); } catch { return null; }
}

export const draftRemote = (rows: DraftRequestRow[]) =>
  req<DraftResult>('/api/ai/draft', { method: 'POST', body: JSON.stringify({ rows }) });

/** Một dòng bảng gửi cho Agent hỏi đáp. Giá trị lấy đúng như bảng đang hiển thị. */
export interface AgentRow {
  code: string; name: string; group: string; status: string; progress: string; risk: string;
  pic: string; start: string; end: string; pending: boolean;
  /** Cột chữ để Trợ lý tìm theo nội dung (RAG): mục tiêu, KPI, milestone, ghi chú, báo cáo tuần này/tuần trước, vấn đề, comment. */
  goal?: string; kpi?: string; milestone?: string; note?: string; done?: string; plan?: string; issue?: string; prev?: string; comment?: string;
}
/** Một dự án trong số liệu backend tính (đã là giá trị đúng như bảng). */
export interface FactProject { code: string; name?: string; tien_do?: string; rui_ro?: string; trang_thai?: string; nhom?: string; han?: string }
/** Một đoạn chữ tìm được trong bảng (RAG). */
export interface FactPassage { code: string; ten?: string; truong?: string; noi_dung?: string }
/** Số liệu backend tính sẵn cho câu trả lời; giao diện dùng để dựng danh sách và thống kê. Mọi trường đều tuỳ chọn. */
export interface AgentFacts {
  kieu?: string; so_luong?: number; so_doan?: number; tong?: number; con_lai?: number; tim_thay?: boolean; khop?: boolean;
  du_an?: FactProject | FactProject[] | null;
  doan?: FactPassage[];
  theo_tien_do?: Record<string, number>; theo_muc_do_rui_ro?: Record<string, number>;
  du_an_cham?: string[]; so_du_an_cham?: number; so_du_an_co_o_nhap_ai_cho_duyet?: number;
  phan_nhom?: { truong: string; theo: Record<string, number>; con_lai_nhom?: number };
}
/** Câu trả lời của Agent: số liệu do backend tính, AI chỉ diễn đạt. `grounded` false = AI lệch số liệu nên dùng câu mẫu. */
export interface AgentAnswer {
  intent: string; answer: string; codes: string[]; by: string; grounded: boolean; warnings: string[]; mode: string; model: string;
  /** Câu dẫn ngắn khi dùng câu mẫu (không liệt kê mã; danh sách do giao diện dựng từ `facts`). Chuỗi rỗng = chỉ hiện danh sách. */
  lead?: string;
  facts?: AgentFacts;
  /** Mã các dự án câu trả lời vừa nêu (tối đa 12), dùng làm ngữ cảnh cho câu hỏi kế tiếp. */
  scope?: string[];
  /** V-LLM đọc ra người dùng muốn làm gì trên giao diện (intent = 'view' | 'draft' | 'approve'): backend chỉ nói ý định, giao diện thực hiện. */
  view?: { action?: string; column?: string };
  /** Mã dự án trong câu (do code đọc) khi intent = 'approve'. */
  target?: string[];
}
/** Một câu trước đó gửi kèm để backend hiểu câu nối tiếp. */
export interface AgentTurn { q: string; codes: string[]; a?: string }

export const agentAsk = (question: string, rows: AgentRow[], history: AgentTurn[] = []) =>
  req<AgentAnswer>('/api/agent/ask', { method: 'POST', body: JSON.stringify({ question, rows, history }) }, 60000);

/** Lệnh sửa bảng do V-LLM đọc ý (backend chỉ đề xuất, không ghi). */
export interface AgentEditField { id: string; name: string; options: string[]; editable: boolean; lockedWhy: string }
export interface AgentEditRow { code: string; values: Record<string, string> }
export interface AgentProposal { code: string; field: string; fieldName: string; from: string; to: string }
export interface AgentEditAnswer {
  intent: 'edit'; answer: string; proposals: AgentProposal[]; skipped: { reason: string; field?: string }[]; unclear?: string; by: string; model?: string; mode?: string;
}
export const agentEdit = (question: string, rows: AgentEditRow[], fields: AgentEditField[], history: AgentTurn[] = []) =>
  req<AgentEditAnswer>('/api/agent/ask', { method: 'POST', body: JSON.stringify({ question, rows, fields, history, edit: true }) }, 60000);

