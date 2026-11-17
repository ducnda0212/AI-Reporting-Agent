import type { Catalog, DemoRow, Row, Version } from '@/types';
import { BASE_PHASE_BUCKET, DEMO, DEPARTMENT_OF } from './constants';

/** Dữ liệu mock — giữ nguyên từ bản prototype, sẽ thay bằng API sau. */

const PERSON_NAMES = ['Trần Minh', 'Phan Ngọc', 'Lý Phương', 'Đặng Quân', 'Hồ Ruby', 'Tạ Sơn', 'Lâm Thảo', 'Vũ Hải'];
const DOMAIN_BY_GROUP: Record<string, string> = {
  'I.A': 'Food', 'I.C': 'Ride', 'II.A': 'Driver', 'II.B': 'Fleet', 'II.D': 'Platform', 'II.E': 'Platform', 'II.I': 'Platform',
};

function buildRow(d: DemoRow, i: number): Row {
  const step = BASE_PHASE_BUCKET[d.rawPhase] || parseInt(d.rawPhase, 10) || 2;
  const r: Row = {
    i, code: d.code, task: d.task, key: d.key, g: d.g, real: d.real, dup: d.dup, isNew: !!d.isNew, tplRow: d.row,
    rawStatus: d.rawStatus, rawProgress: d.rawProgress, rawPhase: d.rawPhase, labels: d.labels,
    jira: {
      pic: d.assignees[0] || '', po: d.assignees[1] || '',
      divisionHead: d.real ? d.teamName || '' : d.g.indexOf('II') === 0 ? 'QLTT Khối 2' : 'QLTT Khối 1',
    },
    pic: d.assignees[0] || '', po: d.assignees[1] || '', tl: d.assignees[2] || d.tl || '', poField: d.po || '',
    idOnly: !!d.assigneeIdOnly,
    kpi: d.kpi, objective: d.objective, milestone: d.milestone, start: d.start, end: d.end, divisionHead: d.teamName, department: '',
    pr: d.pr, prw: d.prw, comment: d.comment, updated: d.updated, tags: [],
    done: step, total: 12, reasons: {}, ai: {}, ovr: {},
    stages: Array.from({ length: 12 }, (_, k) => (k < step - 2 ? 'done' : k < step ? 'doing' : 'todo')),
  };
  const w = d.prw || {};
  r.w1Done = w.w1 ? w.w1.done : ''; r.w1Plan = w.w1 ? w.w1.plan : '';
  r.w2Done = w.w2 ? w.w2.done : ''; r.w2Plan = w.w2 ? w.w2.plan : '';
  r.w3Done = w.w3
    ? w.w3.done
    : w.w2
      ? 'Tiếp tục theo kế hoạch tuần trước: ' + (w.w2.plan || w.w2.done || '').split('\n')[0]
      : 'Theo dõi vận hành, không có thay đổi lớn trong tuần';
  const t = d.tpl || {};
  const prev = !d.isNew;
  const j = i;
  const top = r.g.split('.').slice(0, 2).join('.');
  r.businessValue = t.AB || (prev ? ['Trung bình', 'Cao', 'Thấp'][j % 3] : 'Trung bình');
  r.action = t.AD || (prev ? (r.rawStatus === 'DONE' ? 'Đã đóng' : r.rawStatus === 'PENDING' ? 'Tạm dừng' : 'Đi tiếp') : '');
  r.nextStep = t.AE || (prev && j % 3 === 1 ? 'Mở rộng Quy mô (Scale)' : '');
  r.projectType = t.AF || (prev ? 'KHHĐ 2026' : '');
  r.market = prev ? ['VN', 'VN', 'Indo', 'VN', 'Malay', 'VN', 'Toàn khu vực'][j % 7] : '';
  r.domain = prev ? DOMAIN_BY_GROUP[top] || 'Platform' : '';
  r.link = prev ? 'confluence/pmo/' + r.code : '';
  r.businessOwner = prev ? PERSON_NAMES[(j + 1) % 8] : '';
  r.deptHead = prev ? 'TP ' + PERSON_NAMES[j % 8] : '';
  r.aiEngineer = prev ? PERSON_NAMES[(j + 2) % 8] : '';
  r.aiResearcher = prev && j % 3 === 1 ? PERSON_NAMES[(j + 5) % 8] : '';
  r.mlopsEngineer = prev ? PERSON_NAMES[(j + 6) % 8] : '';
  r.softwareEngineer = prev && j % 4 !== 3 ? PERSON_NAMES[(j + 1) % 8] + ' (BE)' : '';
  r.initiativeType = prev ? (j % 3 === 0 ? 'Cải tiến' : 'Xây mới') : '';
  r.prio = prev ? 'P' + (1 + (j % 3)) : '';
  r.valueEstimate = prev && j % 6 === 0 ? 'Tiết kiệm ~1,2 tỷ/năm (ước tính)' : '';
  r.output = '';
  r.w1Issues = prev ? (j % 4 === 0 ? 'Thiếu dữ liệu nhãn, đề xuất bổ sung' : 'Không có') : t.AN || '';
  r.w2Issues = prev ? (r.rawProgress === 'Off-track' ? 'Chậm tiến độ, đề xuất chốt lại mốc' : 'Không có') : '';
  if (t.AL) r.w1Done = t.AL;
  if (t.AM) r.w1Plan = t.AM;
  if (t.AN) r.w1Issues = t.AN;
  if (t.C && !d.real) r.task = t.C;
  if (t.D && !d.real) r.objective = t.D;
  if (t.F && !d.real) r.pic = t.F;
  return r;
}

export function seedRows(): Row[] {
  const all = DEMO.rows.concat(DEMO.newRows).map(buildRow);
  all.forEach((r) => { if (r.code === 'I.A.4.1') { r.stages[7] = 'miss'; r.stages[9] = 'miss'; } });
  return all;
}

export function seedCatalog(allRows: Row[]): Catalog {
  const c: Catalog = { units: {}, projects: {} };
  let nu = 0;
  allRows.forEach((r, j) => {
    if (r.isNew) return;
    const top = r.g.split('.').slice(0, 2).join('.');
    if (!c.units[r.g]) {
      c.units[r.g] = {
        name: DEMO.workstream[r.g] || r.g,
        divisionHead: r.jira.divisionHead || (top.indexOf('II') === 0 ? 'QLTT Khối 2' : 'QLTT Khối 1'),
        department: DEPARTMENT_OF[top] || '', deptHead: PERSON_NAMES[(nu++ * 3) % 8],
      };
    }
    if (c.projects[r.code] || r.code === 'II.E.1.2') return; /* II.E.1.2: cố ý chưa có trên hệ thống để minh hoạ */
    c.projects[r.code] = {
      g: r.g, task: r.task, objective: r.objective || '', kpi: r.kpi || '', pic: r.jira.pic || PERSON_NAMES[(j + 3) % 8],
      start: r.start || '', end: r.end || '', businessOwner: (r.businessOwner as string) || PERSON_NAMES[(j + 1) % 8], po: r.jira.po || PERSON_NAMES[(j + 4) % 8],
      aiEngineer: (r.aiEngineer as string) || '', aiResearcher: (r.aiResearcher as string) || '', mlopsEngineer: (r.mlopsEngineer as string) || '',
      softwareEngineer: ((r.softwareEngineer as string) || '').replace(' (BE)', ''),
    };
  });
  Object.keys(c.units).forEach((g) => {
    const cnt: Record<string, number> = {};
    allRows.forEach((r) => { if (r.g === g && r.jira.divisionHead) cnt[r.jira.divisionHead] = (cnt[r.jira.divisionHead] || 0) + 1; });
    const best = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x])[0];
    if (best) c.units[g].divisionHead = best;
  });
  /* vài chỗ Jira ghi khác hệ thống để minh hoạ cảnh báo đối chiếu */
  if (c.projects['I.A.4.2']) c.projects['I.A.4.2'].pic = 'Mai Linh';
  if (c.projects['I.C.1.3']) c.projects['I.C.1.3'].po = 'Vũ Hải';
  ['I.C.1.5', 'II.A.2.1', 'I.A.6.2'].forEach((k, n) => {
    if (c.projects[k]) c.projects[k].end = ['28/11/2026', '30/11/2026', '03/12/2026'][n];
  });
  return c;
}

export const SEED_VERSIONS: Version[] = [
  { wk: 'w2', v: 2, by: 'Khuê', at: '14/11 16:20', note: 'Sửa sau họp khối: cập nhật rủi ro II.E.1.2', exported: '20261114_DAN_Bao-cao-PMO.xlsx',
    stats: { rows: 38, hand: 6, ai: 114 },
    changes: [['II.E.1.2', 'AC Mức độ rủi ro', 'Thấp', 'Trung bình'], ['II.E.1.2', 'AT Vấn đề, rủi ro…', 'Không có', 'Xin lùi golive sang 15/11 vì chờ PD DPO, ANBM'], ['I.C.1.2', 'J Tiến độ', 'Đúng tiến độ', 'Chậm tiến độ']] },
  { wk: 'w2', v: 1, by: 'Khuê', at: '13/11 17:05', note: 'Bản gửi trước họp', exported: '20261113_DAN_Bao-cao-PMO.xlsx', stats: { rows: 38, hand: 4, ai: 114 }, changes: [] },
  { wk: 'w1', v: 1, by: 'Tuấn', at: '07/11 09:40', note: '', exported: '20261107_DAN_Bao-cao-PMO.xlsx', stats: { rows: 37, hand: 9, ai: 111 }, changes: [] },
];
