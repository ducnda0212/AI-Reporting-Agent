/* Dòng chữ của màn "Đang đọc file Jira" (prototype impLoadA), dựng từ số liệu thật của phản hồi máy chủ. */
import type { ImportFound, IngestResponse } from '@/types';

export function foundFromResponse(res: IngestResponse): ImportFound {
  const st = res.file_stats, d = res.diff_summary;
  return {
    issues: st.total_rows, cols: st.total_cols, dupGroups: st.dup_groups, projects: st.matched_projects, orphans: res.orphans.length,
    newCodes: d.has_previous_session ? d.added_projects.length : null
  };
}

/** Kết quả hiện dưới tiêu đề của từng bước sau khi bước đó xong. */
export function importResults(f: ImportFound): [string, string, string, string] {
  return [
    f.cols + ' cột, ' + f.issues + ' issue',
    f.dupGroups ? f.dupGroups + ' nhóm cột đã gộp' : 'Không có cột trùng tên',
    f.projects + ' dự án ghép được' + (f.orphans ? ', ' + f.orphans + ' issue chưa có mã' : ''),
    f.newCodes === null ? 'Chưa có file tuần trước để so' : f.newCodes ? f.newCodes + ' mã mới' : 'Không có mã mới'
  ];
}

/** Cột "Đã tìm thấy": hiện số khi `importing.step > row.step`, chưa tới thì là khung chờ. `cls`: e = đỏ, w = vàng. */
export function importFound(f: ImportFound): { label: string; value: string; step: number; cls: '' | 'e' | 'w' }[] {
  return [
    { label: 'Issue trong file', value: String(f.issues), step: 0, cls: '' },
    { label: 'Cột Jira', value: String(f.cols), step: 0, cls: '' },
    { label: 'Nhóm cột trùng đã gộp', value: String(f.dupGroups), step: 1, cls: '' },
    { label: 'Dự án ghép vào mẫu', value: String(f.projects), step: 2, cls: '' },
    { label: 'Issue chưa có Mã DA', value: String(f.orphans), step: 2, cls: 'e' },
    { label: 'Mã mới so với tuần trước', value: f.newCodes === null ? '—' : String(f.newCodes), step: 3, cls: 'w' }
  ];
}
