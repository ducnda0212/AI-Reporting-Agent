import { describe, expect, it } from 'vitest';
import * as constants from '@/data/constants';
import { FIELDS, AI_IDS, WEEKS, HELP, TOURS, STATUS_MAP, PROG_VALUES } from '@/data/constants';

describe('Types & Core Data Dictionary', () => {
  it('đủ 49 cột báo cáo và 3 cột AI theo mẫu DAN PMO', () => {
    expect(FIELDS.length).toBe(49);
    expect(FIELDS[0].id).toBe('ma');
    expect(FIELDS[1].id).toBe('viec');
    expect(AI_IDS).toEqual(['rui', 'kh', 'vd']);
  });

  it('không còn dữ liệu mẫu / chế độ thử trong mã chạy thật; tuần do máy chủ cấp', () => {
    for (const k of ['SCEN', 'IMPORTS', 'SEED_VERSIONS', 'GROUPS', 'PHASE_BUCKET', 'NO_JIRA']) expect(k in constants).toBe(false);
    expect(WEEKS.length).toBe(0);
    expect(PROG_VALUES).toContain('Có rủi ro');
    expect(STATUS_MAP.MONITORING).toBe('Đang thực hiện');
  });

  it('Help & Tours phản ánh đúng luồng 3 bước gọn, không trỏ tới CheckView', () => {
    const allTourTargets = TOURS.all.map((t) => t.id || '');
    expect(allTourTargets.join(',')).not.toContain('check');
    expect(HELP.every((h) => h.k !== 'check')).toBe(true);
    expect(HELP.length).toBe(6);
  });
});
