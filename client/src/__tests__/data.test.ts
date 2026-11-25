import { describe, expect, it } from 'vitest';
import demoData from '@/data/demo.json';
import { FIELDS, AI_IDS, WEEKS, SEED_VERSIONS, HELP, TOURS } from '@/data/constants';

describe('Types & Core Data Dictionary', () => {
  it('đủ 49 cột báo cáo và 3 cột AI theo mẫu DAN PMO', () => {
    expect(FIELDS.length).toBe(49);
    expect(FIELDS[0].id).toBe('ma');
    expect(FIELDS[1].id).toBe('viec');
    expect(AI_IDS).toEqual(['rui', 'kh', 'vd']);
  });

  it('chứa bộ GOLD Clean 64DA (56 dòng dự án có mã) và GOLD_CSV cùng bộ DEMO giả lập', () => {
    expect(demoData.gold.rows.length).toBe(56);
    expect(demoData.gold.stats.epics).toBe(64);
    expect(demoData.gold.file).toBe('20261125_DAN_Jira-Export-Clean-Dataset_64DA.csv');
    expect(demoData.goldCsv.length).toBeGreaterThan(1000);
    expect(WEEKS.length).toBe(3);
    expect(SEED_VERSIONS.length).toBe(3);
  });

  it('Help & Tours phản ánh đúng luồng 3 bước gọn, không trỏ tới CheckView', () => {
    const allTourTargets = TOURS.all.map((t) => t.id || '');
    expect(allTourTargets.join(',')).not.toContain('check');
    expect(HELP.every((h) => h.k !== 'check')).toBe(true);
    expect(HELP.length).toBe(6);
  });
});
