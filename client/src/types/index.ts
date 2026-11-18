export type FieldKind =
  | 'jira' | 'bucket' | 'cfg' | 'manual' | 'calc' | 'ai' | 'report' | 'tpl' | 'past' | 'future' | 'none';

export type GroupId = 'pin' | 'info' | 'prog' | 'org' | 'eval' | 'w1' | 'w2' | 'w3' | 'w4';

export interface Field {
  col: string;
  id: string;
  name: string;
  grp: GroupId;
  kind: FieldKind;
  src: string;
  w: number;
  key?: boolean;
  required?: boolean;
  opts?: string[];
}

export interface WeekReport { date?: string; done: string; plan: string }

export interface DemoRow {
  code: string; g: string; row: number | null; tpl: Record<string, string>;
  key: string; task: string; rawStatus: string; rawProgress: string; rawPhase: string;
  labels: string; assignees: string[]; po: string; tl: string; teamName: string;
  kpi: string; objective: string; milestone: string; start: string; end: string;
  pr: WeekReport[]; prw: Record<string, WeekReport | undefined>; comment: string;
  priority?: string; updated: string; real?: boolean; dup?: boolean; isNew?: boolean;
  assigneeIdOnly?: boolean;
}

export interface DemoData {
  fileStats: { cols: number; dupGroups: number; dupCols: number; uniq: number; empty: number; issues: number };
  fileCols: string[];
  workstream: Record<string, string>;
  rows: DemoRow[];
  newRows: DemoRow[];
  tempCodes: string[];
  stagesKnown: Record<string, string>;
  phases: string[];
}

export type StageState = 'done' | 'doing' | 'todo' | 'risk' | 'miss';

export interface AiDraft { text: string; ok: boolean; why?: string; src?: string; edited?: boolean }

export interface Row {
  i: number; code: string; task: string; key: string; g: string; real?: boolean; dup?: boolean;
  isNew: boolean; tplRow: number | null;
  rawStatus: string; rawProgress: string; rawPhase: string; labels: string;
  jira: { pic: string; po: string; divisionHead: string };
  pic: string; po: string; tl: string; poField: string; idOnly: boolean;
  kpi: string; objective: string; milestone: string; start: string; end: string;
  divisionHead: string; department: string;
  pr: WeekReport[]; prw: Record<string, WeekReport | undefined>; comment: string; updated: string;
  tags: string[]; done: number; total: number;
  reasons: Record<number, string>;
  ai: Record<string, AiDraft | undefined>;
  ovr: Record<string, string | undefined>;
  stages: StageState[];
  note?: string;
  raw?: Record<string, string>;
  // cột nhập tay / báo cáo — truy cập động theo Field.id
  [k: string]: unknown;
}

export interface CatUnit { name: string; divisionHead: string; department: string; deptHead: string }
export interface CatProject {
  g: string; task: string; objective: string; kpi: string; pic: string; start: string; end: string;
  businessOwner: string; po: string; aiEngineer: string; aiResearcher: string; mlopsEngineer: string; softwareEngineer: string;
  [k: string]: string;
}
export interface Catalog { units: Record<string, CatUnit>; projects: Record<string, CatProject> }

export interface Version {
  wk: string; v: number; by: string; at: string; note: string; exported: string;
  stats: { rows: number; hand: number; ai: number };
  changes: Array<[string, string, string | null, string | null]>;
  snap?: Record<string, string | null>;
}

export interface LogEntry { t: string; a: string; o: string; d: string; r: string }

/* ---------- đánh giá rủi ro & vấn đề ---------- */
export interface RiskCriteria {
  version: string; updatedAt: string;
  delayDays: [number, number, number]; financePct: [number, number, number];
  urgentDays: number; soonDays: number; staleWeeks: number;
  priority: [number, number, number];
}
export type RiskKind = 'Issue' | 'Risk' | 'Dependency';
export interface RiskAction { ref: string; text: string; owner: string; due: string }
export interface RiskCase {
  id: string; rowIndex: number; kind: RiskKind; category: string; source: string;
  text: string; why: string;
  impact: { delayDays: number; financePct: number; contract: number; quality: number; dataControl: number };
  daysToDue: number; blocked: boolean; weeksOpen: number; noOwner: boolean; probability: '' | 'Thấp' | 'Trung bình' | 'Cao';
  signals: Array<[code: string, note: string]>;
  actions: RiskAction[];
  closeWhen: string; similarCases: string[]; confidence: 'high' | 'low'; uncertainty?: string; alternativeCategory?: string;
  missingInfo: string[];
}
export type RiskPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type RiskColor = 'Đỏ' | 'Vàng' | 'Xanh' | 'Lưu ý dữ liệu';
/** Quyết định của người duyệt cho một ca: đồng ý, bỏ, hoặc sửa kết quả AI. */
export interface RiskDecision { kind: 'ok' | 'drop' | 'edit'; at: string; priority?: RiskPriority; category?: string; from?: RiskPriority; reason?: string }
export type RiskFilter = 'all' | 'pend' | 'un' | 'e' | 'w' | 'o';

/* ---- API nhập file Jira (server/routers/import_router.py) ---- */
export interface JiraColumnInfo { index: number; name: string; non_null_count: number; sample_values: string[] }
export interface ImportUploadResponse {
  file_info: { id: string; filename: string; is_duplicate: boolean; file_hash: string; file_size: number; uploaded_at: string; target_month: string; target_week: string };
  file_stats: { total_cols: number; total_issues: number; duplicate_groups: number; loaded_at: string };
  columns: JiraColumnInfo[];
  issues_sample: Record<string, unknown>[];
}
export interface ImportHistoryItem { id: string; filename: string; uploaded_at: string; target_month: string; target_week: string; total_issues: number; total_cols: number; file_size: number }
