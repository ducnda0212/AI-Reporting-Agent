import { describe, expect, it } from 'vitest';
import { foundFromResponse, importFound, importResults } from '@/lib/importSteps';
import { fixtureResponse } from './fixtures';

const found = { issues: 125, cols: 90, dupGroups: 3, projects: 56, orphans: 12, newCodes: 2 };

describe('importResults / importFound (màn Đang đọc, số liệu thật)', () => {
  it('4 dòng kết quả theo từng bước như prototype', () => {
    expect(importResults(found)).toEqual(['90 cột, 125 issue', '3 nhóm cột đã gộp', '56 dự án ghép được, 12 issue chưa có mã', '2 mã mới']);
  });

  it('không có nhóm trùng / issue chưa mã / mã mới thì dùng câu "không có"', () => {
    expect(importResults({ ...found, dupGroups: 0, orphans: 0, newCodes: 0 }))
      .toEqual(['90 cột, 125 issue', 'Không có cột trùng tên', '56 dự án ghép được', 'Không có mã mới']);
  });

  it('chưa có file tuần trước để so thì không nói "không có mã mới"', () => {
    expect(importResults({ ...found, newCodes: null })[3]).toBe('Chưa có file tuần trước để so');
    const last = importFound({ ...found, newCodes: null }).at(-1)!;
    expect([last.label, last.value]).toEqual(['Mã mới so với tuần trước', '—']);
  });

  it('6 dòng cột "Đã tìm thấy" đúng thứ tự, bước và màu', () => {
    const rows = importFound(found);
    expect(rows.map((r) => r.label)).toEqual(['Issue trong file', 'Cột Jira', 'Nhóm cột trùng đã gộp', 'Dự án ghép vào mẫu', 'Issue chưa có Mã DA', 'Mã mới so với tuần trước']);
    expect(rows.map((r) => r.value)).toEqual(['125', '90', '3', '56', '12', '2']);
    expect(rows.map((r) => r.step)).toEqual([0, 0, 1, 2, 2, 3]);
    expect(rows.map((r) => r.cls)).toEqual(['', '', '', '', 'e', 'w']);
  });

  it('foundFromResponse lấy đúng số từ phản hồi máy chủ; mã mới chỉ khi có phiên trước', () => {
    const res = fixtureResponse('a.csv');
    expect(foundFromResponse(res)).toEqual({
      issues: res.file_stats.total_rows, cols: res.file_stats.total_cols, dupGroups: res.file_stats.dup_groups,
      projects: res.file_stats.matched_projects, orphans: res.orphans.length, newCodes: null
    });
    const withPrev = { ...res, diff_summary: { ...res.diff_summary, has_previous_session: true, added_projects: ['I.A.3.9'] } };
    expect(foundFromResponse(withPrev).newCodes).toBe(1);
  });
});
