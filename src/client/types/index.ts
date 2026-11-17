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
