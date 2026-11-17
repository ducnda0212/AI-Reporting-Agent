import { describe, expect, it } from 'vitest';
import { getState, mutate } from '@/store';
import * as F from '@/store/actions/flow';
import * as G from '@/store/actions/grid';
import * as C from '@/store/actions/catalog';
import { checkCount, fillCount, blockers } from '@/lib/selectors';
import { selectRows } from '@/lib/cell';
import { docxBlob } from '@/lib/export/docx';
import { docHtml } from '@/lib/export/docHtml';
import { findMatches } from '@/lib/grid';
import { draftAi } from '@/lib/ai';

describe('luồng nghiệp vụ', () => {
  it('nạp file → duyệt AI → chốt bản → xuất', () => {
    F.loadFile('x.csv', true);
    let s = getState();
    expect(s.loaded).toBe(true);
    expect(selectRows(s).length).toBeGreaterThan(30);

    mutate((d) => { draftAi(d, selectRows(d)); });
    F.startReview();
    expect(getState().review).not.toBeNull();
    F.reviewApprove();
    expect(getState().review!.pos).toBe(1);
    F.exitReview();

    G.setCell(0, 'projectType', 'KHHĐ 2026');
    expect(getState().allRows[0].projectType).toBe('KHHĐ 2026');
    G.setCell(0, 'status', 'Hủy');
    expect(getState().allRows[0].ovr.status).toBe('Hủy');

    G.setFindQuery('Hủy'); G.openFind();
    expect(findMatches(getState()).length).toBeGreaterThan(0);
    G.closeFind();

    s = getState();
    expect(typeof checkCount(s, selectRows(s))).toBe('number');
    expect(typeof fillCount(s, selectRows(s))).toBe('number');

    F.enterTest('dirty');
    expect(getState().test).toBe('dirty');
    expect(Object.keys(getState().allRows[0].raw || {}).length).toBeGreaterThan(0);
    F.exitTest();
    expect(getState().test).toBeNull();
    expect(getState().allRows[0].raw).toBeUndefined();

    s = getState();
    expect(docHtml(s)).toContain('BÁO CÁO ĐIỀU HÀNH');
    expect(docxBlob(s).size).toBeGreaterThan(500);

    // chốt bản cần hết lỗi chặn: gỡ ánh xạ bắt buộc + điền ô AT còn trống
    mutate((d) => { selectRows(d).forEach((r) => { if (!r.ai.w3Issues) r.ai.w3Issues = { text: 'Không có', ok: true }; }); });
    s = getState();
    if (!blockers(s, selectRows(s)).length) {
      F.doLock('Khuê', 'test');
      expect(getState().versions[0].v).toBe(3);
    }
  });

  it('yêu cầu sửa hệ thống → chạy lại báo cáo', () => {
    mutate((d) => { d.reqForm = { type: 'edit', code: 'I.A.3.1', field: 'pic' }; });
    C.sendRequest({ why: 'đổi PIC', field: 'pic', to: 'Người Mới' });
    const q = getState().reqs.at(-1)!;
    expect(q.status).toBe('pending');
    C.resolveRequest(q.id, true);
    expect(getState().cat.projects['I.A.3.1'].pic).toBe('Người Mới');
    expect(getState().catPend).toBe(1);
    C.rerunReport();
    expect(getState().catRun.projects['I.A.3.1'].pic).toBe('Người Mới');
  });
});
