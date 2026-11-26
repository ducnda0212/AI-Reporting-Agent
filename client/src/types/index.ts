/* Kiểu dữ liệu lõi của bản gọn (lite). Nguồn: object `state`, buildRow(), FIELDS trong prototype v4. */

export type ViewType = 'import' | 'grid' | 'ver' | 'log';
export type PanelType = 'ai' | 'aitrace' | 'tvcfg' | null;
export type ModalType = 'export' | 'aiDone' | null;

/* ---------- cột ---------- */
export type FieldId =
  | 'ma' | 'viec' | 'mang' | 'muctieu' | 'kpi' | 'pic' | 'start' | 'end'
  | 'tt' | 'td' | 'milestone' | 'buocso' | 'output' | 'note'
  | 'gdk' | 'phong' | 'tp' | 'bo' | 'po' | 'aieng' | 'airs' | 'mlops' | 'swe' | 'x'
  | 'caitien' | 'prio' | 'tt1' | 'giatri' | 'rui' | 'action' | 'nextstep' | 'loai' | 'link'
  | 'domain' | 'market' | 'buoc' | 'uoctinh'
  | 'w1ht' | 'w1kh' | 'w1vd' | 'w2ht' | 'w2kh' | 'w2vd' | 'ht' | 'kh' | 'vd' | 'w4ht' | 'w4kh' | 'w4vd';
export type AiFieldId = 'rui' | 'kh' | 'vd';
export type FieldGroup = 'pin' | 'info' | 'prog' | 'org' | 'eval' | 'w1' | 'w2' | 'w3' | 'w4';
export type FieldKind = 'jira' | 'cfg' | 'bucket' | 'manual' | 'calc' | 'ai' | 'report' | 'past' | 'future' | 'none';

export interface Field {
  col: string;
  id: FieldId;
  name: string;
  grp: FieldGroup;
  kind: FieldKind;
  src: string;
  w: number;
  key?: boolean;
  required?: boolean;
  opts?: readonly string[];
}

/* ---------- dòng dữ liệu ---------- */
export interface AiCell {
  text: string;
  why: string;
  src: string;
  ok: boolean;
}

export type StageState = 'done' | 'doing' | 'todo' | 'miss';
export interface WeekReport { date: string; done: string; plan: string }
export type WeekKey = 'w1' | 'w2' | 'w3' | 'w4';

/** Các cột có giá trị chữ nằm thẳng trên dòng (BE đã chuẩn hóa `tt`, `td`, `tt1`, `buoc`, `buocso`, `kh`, `vd`). */
type RowTextId = Exclude<FieldId, 'ma' | 'viec' | 'x'>;

export interface Row extends Partial<Record<RowTextId, string>> {
  i: number;
  ma: string;
  viec: string;
  key: string;
  g: string;
  real: boolean;
  dup: boolean;
  isNew: boolean;
  tplRow: number;
  rawStatus: string;
  rawProgress: string;
  rawPhase: string;
  labels: string;
  jira: { pic: string; po: string; gdk: string };
  pic: string;
  po: string;
  tl: string;
  poField: string;
  idOnly: boolean;
  pr: WeekReport[];
  prw: Partial<Record<WeekKey, WeekReport>>;
  comment: string;
  updated: string;
  tags: string[];
  done: number;
  total: number;
  reasons: Partial<Record<FieldId, string>>;
  ai: Partial<Record<AiFieldId, AiCell>>;
  ovr: Partial<Record<FieldId, string>>;
  stages: StageState[];
  /** Bản gốc chưa làm sạch của từng ô (nếu có) để so với bản đã làm sạch. */
  raw?: Record<string, string>;
  nChild?: number;
  priority?: string;
  /** Việc con gắn vào dự án (kiểm tra) và cờ "nguồn Jira đổi sau khi sửa tay". */
  subtasks?: { key: string; summary: string; status: string; assignee: string }[];
  needs_review?: boolean;
}

/* ---------- chọn ô, định dạng, lọc, tìm ---------- */
export interface CellRef { i: number; f: FieldId }
export interface SelectionRange { a: CellRef; b: CellRef }

export interface CellFormat {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  color?: string;
  fill?: string;
  ha?: 'left' | 'center' | 'right';
  va?: 'top' | 'middle' | 'bottom';
}

/** Cột → tập giá trị đang được giữ lại. */
export type FilterMap = Partial<Record<FieldId, Record<string, 1>>>;

export interface FindState {
  open: boolean;
  q: string;
  cs: boolean;
  whole: boolean;
  scope: 'all' | 'week' | 'col';
  all: boolean;
  filter: boolean;
  idx: number;
  focus: boolean;
  caret: number | null;
  listTo?: boolean;
}

/* ---------- Trợ lý AI ---------- */
export interface AskAnswer { html: string; act: { label: string; act: string; v?: string }[] }
/** `busy`: đang hiện hiệu ứng gõ; `stage`: id bản xem trước gắn dưới câu trả lời (thay `<!--STAGE:id-->` của prototype). */
/** `scope`: mã các dự án câu trả lời vừa nêu, gửi lại backend để hiểu câu nối tiếp ("dự án đó"). Không lưu vào lịch sử. */
export interface AskMessage { q: string; a: AskAnswer; busy?: boolean; stage?: string; scope?: string[] }
/** Một cuộc trò chuyện với Trợ lý AI đã lưu vào lịch sử (chỉ lưu chữ: câu hỏi và HTML câu trả lời). */
export interface ChatRec { id: string; title: string; at: number; log: { q: string; html: string }[] }

export interface AgStageItem {
  i: number;
  f: FieldId;
  from: string;
  to: string;
  kind: 'edit' | 'approve';
  off?: boolean;
}
/** `n`: số ô đã áp dụng; `more`: đang xem hết danh sách. */
export interface AgStage { q: string; items: AgStageItem[]; st: 'open' | 'applied' | 'dropped'; n?: number; more?: boolean }

export interface TraceTarget { i: number; f: FieldId }

/* ---------- popout dự án ---------- */
export interface PopoutHit { f: FieldId; sec: string }
export interface PopoutState {
  open: boolean;
  i: number | null;
  fz: number;
  col: Record<string, boolean>;
  q: string;
  hits: PopoutHit[];
  cur: number;
  wkDesc: boolean;
  colW: Record<string, number>;
  rowH: Record<string, number>;
  sideW: number;
  exp: Record<string, boolean>;
  wkOpen: Record<string, boolean>;
}

/* ---------- phiên bản, nhật ký, nhập file ---------- */
export type VersionChange = [ma: string, col: string, from: string, to: string];
export interface VersionItem {
  /** Có khi bản đã lưu trên máy chủ. */
  id?: string;
  session_id?: string;
  cycle_id?: string;
  wk: WeekKey;
  v: number;
  by: string;
  at: string;
  note: string;
  exported: string | null;
  stats: { rows: number; hand: number; ai: number };
  changes: VersionChange[];
  snap?: Record<string, string | null>;
  mine?: boolean;
  fileName?: string;
  /** Định dạng/ngắt dòng/cột ẩn lúc chốt, khoá `mã|cột`. */
  fmt?: Record<string, CellFormat>;
  wrap?: Record<string, boolean>;
  hidden?: Record<string, boolean>;
  /** Các lần sửa ghi lại lúc chốt bản. */
  edits?: VerEdit[];
}
/** Một lần sửa trong mốc chỉnh sửa của bản (`day` dạng "dd/mm/…"). */
export interface VerEdit { t: string; day?: string; a: string; o: string; d: string }

export type LogResult = 'Thành công' | 'Cảnh báo' | 'Lỗi';
/** `seq` tăng dần theo thứ tự ghi, `day` dạng "dd/mm/…". */
export interface LogEntry { t: string; a: string; o: string; d: string; r: LogResult; seq?: number; day?: string }

export interface ImportFileMeta {
  session_id: string;
  name: string;
  wk: string;
  at: string;
  by: string;
  issues: number;
  cols: number;
  prj: number;
  ver: string;
}

export interface PreviewSheet { name: string; rows: string[][]; nCols: number; nData: number }
export interface PreviewFile {
  name: string;
  size: number;
  ext: string;
  loading: boolean;
  done: boolean;
  err?: string;
  kind?: 'csv' | 'xlsx';
  enc?: string;
  delim?: string;
  sheets?: PreviewSheet[];
}

/* ---------- hợp đồng API (server/app/schemas) ---------- */
/** Số liệu thật máy chủ vừa đọc được, hiện ở màn Đang đọc trước khi chuyển sang tóm tắt. */
export interface ImportFound { issues: number; cols: number; dupGroups: number; projects: number; orphans: number; newCodes: number | null }
export interface FileStats {
  total_rows: number; total_cols: number; skipped_empty_rows: number; matched_projects: number;
  dup_groups: number; dup_cols: number; used_cols: number;
}
export interface GroupInfo { k: string; name: string }
export interface AppliedMapping { id: string; name: string; matched_cols: number; total_cols: number }
export interface DiffSummary {
  has_previous_session: boolean; added_projects: string[]; removed_projects: string[]; modified_count: number; schema_changes: string[];
}
export interface OrphanIssue { key: string; summary: string; issue_type: string; status: string; reason: string }
export interface IssueNote { code: string; message: string; key: string; field: string }
export interface IngestResponse {
  success: boolean;
  session_id: string;
  file_name: string;
  is_duplicate_file: boolean;
  file_stats: FileStats;
  file_cols: string[];
  groups: GroupInfo[];
  applied_mapping: AppliedMapping;
  diff_summary: DiffSummary;
  rows: Row[];
  orphans: OrphanIssue[];
  blockers: IssueNote[];
  warnings: IssueNote[];
}
export interface ActiveWeek { k: string; name: string; range: string; cur: boolean; future: boolean; start: string; end: string }
export interface ActiveCycle { cycle_id: string; current_wk: string; today: string; weeks: ActiveWeek[] }
export interface MappingColumnDef {
  field_id: string; col_letter: string; name: string; source_type: 'jira' | 'derived' | 'constant' | 'manual';
  source_field: string; fallbacks: string[]; required: boolean;
}
export interface ValueMappings {
  status_map: Record<string, string>; progress_map: Record<string, string>; phase_map: Record<string, string>; phase_bucket: Record<string, number>;
}
export interface MappingConfigOut {
  id: string; name: string; description?: string | null; is_default: boolean; status: string; version: number;
  columns: MappingColumnDef[]; value_mappings: ValueMappings; created_at?: string; updated_at?: string; created_by?: string;
}
export interface MappingConfigIn { name: string; description?: string | null; columns: MappingColumnDef[]; value_mappings: ValueMappings }
export interface RecalculateIn {
  session_id: string; mapping_id?: string | null; src_overrides?: Record<string, string>; value_mappings?: ValueMappings | null;
}

/** Bản nháp lưới của một phiên nhập (PUT/GET /sessions/{id}/draft). */
export interface SessionDraftIn {
  session_id: string; cycle_id: string; mapping_id?: string | null;
  rows: Row[]; overrides: Record<string, Record<string, string>>;
  fmt: Record<string, CellFormat>; wrap: Record<string, boolean>; touched: Record<string, number>; hidden: Record<string, boolean>;
  pin_viec: boolean; ex_cols: 'vis' | 'all'; lock_by: string; log_seq: number; lock_seq: number; audit_logs: LogEntry[];
}
export interface SessionDraftOut extends SessionDraftIn { updated_at: string }
export interface LockReportIn {
  session_id: string; cycle_id: string; wk: WeekKey; by: string; note: string; file_name: string;
  snap: Record<string, string | null>; raw_notes: Record<string, string>;
  fmt: Record<string, CellFormat>; wrap: Record<string, boolean>; hidden: Record<string, boolean>;
  stats: VersionItem['stats']; edits?: VerEdit[]; log_seq: number;
}
export interface ExportExcelIn {
  version_id: string; file_name?: string; ex_cols?: 'vis' | 'all'; hidden?: Record<string, boolean>;
  only_current_week?: boolean; append_override_note?: boolean;
}
export interface SessionDraftSaveRes { success: boolean; session_id: string; updated_at: string }

/* ---------- lịch sử điều hướng / hoàn tác ---------- */
export interface NavSnap {
  view: ViewType;
  vlView: 'lib' | 'one' | 'cmp';
  verSel: string | null;
  vlA: string | null;
  vlB: string | null;
  panel: PanelType;
  key: string;
}

export interface UndoSnap {
  n: number;
  r: { o: Row['ovr']; a: Row['ai']; m: Partial<Record<FieldId, string>> }[];
  f: Record<string, CellFormat>;
  w: Record<string, boolean>;
}

export interface TourStep {
  id: string;
  sel?: string;
  view?: ViewType;
  /** Mã phiên bản (`tuần|số`) cần mở sẵn khi chạy bước ở màn Phiên bản. */
  ver?: string;
  t: string;
  b: string;
}

/* ---------- state gốc ---------- */
export interface AppState {
  view: ViewType;
  panel: PanelType;
  modal: ModalType;
  loaded: boolean;
  /** F5 đang khôi phục phiên đã mở: giữ nguyên màn cũ (không nháy sang Nhập file) tới khi tải xong. */
  restoringSession: boolean;
  importing: { name: string; step: number; found?: ImportFound } | null;
  fileName: string;
  realOnly: boolean;
  newCodes: 'pending' | 'added' | 'ignored';
  dupMerged: boolean;
  phaseBucket: Record<string, number>;
  unsorted: string[];
  /** Dữ liệu thật từ máy chủ: kỳ báo cáo, tuần, phiên nhập, cột file, nhóm mảng việc, cấu hình mapping đang dùng. */
  cycleId: string;
  weeks: ActiveWeek[];
  activeToday: string;
  sessionId: string | null;
  fileCols: string[];
  fileStats: FileStats | null;
  groups: GroupInfo[];
  applied: AppliedMapping | null;
  orphans: OrphanIssue[];
  blockers: IssueNote[];
  warnings: IssueNote[];
  mappings: MappingConfigOut[];
  mpUsed: string | null;
  /** Nguồn cột Jira đã đổi (mapQuick) nhưng chưa lưu thành cấu hình. */
  mpSrc: Record<string, string>;
  mpDirty: boolean;
  mpSave: boolean;
  /** Đang gọi máy chủ (nạp file / tính lại mapping): khoá nút để khỏi bấm đúp. */
  busy: boolean;
  /** Lỗi của lần nhập file gần nhất, hiện trong ô xem trước cho tới khi chọn file khác. */
  importErr: string | null;

  allRows: Row[];
  sel: CellRef | null;
  range: SelectionRange | null;
  search: string;
  onlyFix: boolean;
  collapsed: Record<string, boolean>;
  rowSel: Record<string, boolean>;
  hidden: Partial<Record<FieldId, boolean>>;
  pinViec: boolean;
  menu: string | null;
  pop: FieldId | null;
  /** Ô đang mở dropdown chọn 1 chạm #pkPop. */
  pk: CellRef | null;
  /** Khung soạn ô bật ra (#pe); `peAuto` = lựa chọn "Tự làm gọn khi lưu" nhớ giữa các lần mở. */
  pe: { i: number; f: FieldId; val: string; raw: boolean; auto: boolean } | null;
  peAuto: boolean;
  /** Ô vừa sửa tay (`i|f`), nháy xanh `.svflash` rồi được xoá. */
  svflash: string[];
  fpop: { f: FieldId; q: string; pick: Record<string, boolean>; focus: boolean } | null;
  ctx: { x: number; y: number; i: number; f: FieldId; t: number } | null;
  colFilter: FilterMap;
  sort: { f: FieldId; dir: 'asc' | 'desc' } | null;
  fmt: Record<string, CellFormat>;
  wrap: Record<string, boolean>;
  find: FindState;
  scrollSel: boolean;
  navScroll: boolean;
  findScroll: boolean;
  /** Phóng to bảng, cao dòng kéo tay, rộng cột kéo tay / vừa nội dung (lưu pmo-proto-grid-v1). */
  gx: { zoom: number; rowH: Record<string, number>; colW: Record<string, number> };
  /** Khung bên phải: độ rộng theo loại khung, mục đang gập, khung đang phóng to. */
  pn: { w: Record<string, number>; col: Record<string, boolean>; big: string | null };

  askLog: AskMessage[];
  /** Lịch sử trò chuyện (mới nhất trước, lưu localStorage), cuộc đang mở, màn đang xem và từ khoá tìm trong lịch sử. */
  chats: ChatRec[];
  chatId: string;
  chatView: 'chat' | 'history';
  chatQ: string;
  stages: Record<string, AgStage>;
  trace: TraceTarget | null;
  trEdit: string | null;
  /** Biến thể nháp đang chọn theo ô `i|f`. */
  trVar: Record<string, 'short' | 'normal' | 'detail'>;
  /** Ô đang chờ AI soạn lại (`i|f`). */
  trBusy: string | null;
  trReq: boolean;
  /** Hiệu ứng con trỏ ✦ Agent: danh sách ô đi qua, lớp nháy, số ô tối đa; `seq` tăng mỗi lần chạy. */
  walk: { list: [number, FieldId][]; cls: 'aiflash' | 'aiwalk'; n: number; seq: number; tags?: string[] } | null;
  aiRun: { n: number; total: number } | null;
  review: { list: CellRef[]; pos: number; done: number } | null;

  po: PopoutState;

  versions: VersionItem[];
  verSel: string | null;
  vlView: 'lib' | 'one' | 'cmp';
  vlA: string | null;
  vlB: string | null;
  editWk: WeekKey | null;
  vlOpen: string | null;
  vbA: string | null;
  vbB: string | null;
  vbMore: boolean;
  openedVer: string | null;
  lockBy: string;
  lockMsg: string | null;
  exported: string | null;
  exCols: 'vis' | 'all';

  log: LogEntry[];
  lgQ: string;
  /** Lọc nhật ký: loại hoạt động (`''` = mọi hoạt động) và người làm (`''` = mọi người). */
  lgF: string;
  lgW: string;

  help: boolean;
  helpQ: string;
  helpOpen: string | null;
  tour: number | null;
  tourKey: TourKey;
  toast: string | null;
  pv: PreviewFile | null;
  /** Sheet đang xem của file xem trước; `pvFs` = đang mở xem toàn màn hình (#pvfs). */
  pvSheet: number;
  pvFs: boolean;
  impHist: ImportFileMeta[];
  /** Bước 1: đang "Thay file khác", lọc bảng 49 cột (Tất cả / Đủ / Thiếu dữ liệu), mở danh sách file cũ hơn. */
  replaceFile: boolean;
  impF: 'all' | 'full' | 'low';
  histOpen: boolean;

  nav: { st: NavSnap[]; ix: number };
  undoStack: UndoSnap[];
  redoStack: UndoSnap[];

  /** Ô người dùng đã sửa trong phiên (`i|f`). */
  touched: Record<string, 1>;
  /** Vị trí "N ô cần sửa" theo nhóm và nhãn nổi của ô đang tới. */
  fixPos: Record<string, number>;
  fxTip: { k: number; n: number; i: number; f: FieldId; why: string } | null;
  /** Số thứ tự nhật ký, mốc nhật ký lúc chốt bản gần nhất, bộ đếm bản xem trước. */
  logSeq: number;
  lockSeq: number;
  stgSeq: number;
}

export type TourKey = 'all' | 'imp' | 'grid' | 'ai' | 'exp' | 'ver' | 'log';
