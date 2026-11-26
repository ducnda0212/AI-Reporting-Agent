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
}
/** Câu trả lời của Agent: số liệu do backend tính, AI chỉ diễn đạt. `grounded` false = AI lệch số liệu nên dùng câu mẫu. */
export interface AgentAnswer {
  intent: string; answer: string; codes: string[]; by: string; grounded: boolean; warnings: string[]; mode: string; model: string;
}

export const agentAsk = (question: string, rows: AgentRow[]) =>
  req<AgentAnswer>('/api/agent/ask', { method: 'POST', body: JSON.stringify({ question, rows }) }, 60000);
