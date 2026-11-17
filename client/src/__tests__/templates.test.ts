import { beforeEach, describe, expect, it } from 'vitest';
import { getState, mutate } from '@/store';
import { SEED_TPLS } from '@/data/templates';
import { tlArchive, tlDuplicate, tlOpen, tlRestore, tlUse, tpToggleMiss, tpKind } from '@/store/actions/templates';
import { switchWeek } from '@/store/actions/flow';

beforeEach(() => mutate((d) => { d.tpls = JSON.parse(JSON.stringify(SEED_TPLS)); d.view = 'tlib'; d.tlDraft = null; d.menu = null; d.tpK = ''; d.tpMiss = false; }));
const find = (id: string) => getState().tpls.find((t) => t.id === id)!;

describe('thư viện mẫu báo cáo', () => {
  it('mở mẫu: t49 → cấu hình cột, texec → Điều hành, mẫu khác → xem nháp', () => {
    tlOpen('t49'); expect(getState().view).toBe('tpl');
    tlOpen('texec'); expect(getState().view).toBe('exec');
    tlOpen('tred'); expect(getState().view).toBe('tlib'); expect(getState().tlDraft).toBe('tred');
  });
  it('không lưu trữ được mẫu mặc định; lưu trữ rồi khôi phục thành nháp', () => {
    tlArchive('t49'); expect(find('t49').st).toBe('use');
    tlArchive('tred'); expect(find('tred').st).toBe('arch');
    tlRestore('tred'); expect(find('tred').st).toBe('draft');
  });
  it('nhân bản tạo bản nháp mới; dùng cho tuần này đổi trạng thái', () => {
    const n = getState().tpls.length;
    tlDuplicate('t49'); expect(getState().tpls).toHaveLength(n + 1);
    expect(getState().tpls[n].st).toBe('draft');
    tlUse('tred'); expect(find('tred').st).toBe('use'); expect(find('tred').used).toBe('Tuần 3/11');
  });
  it('lọc "cột còn thiếu" bỏ lọc theo cách điền', () => {
    tpKind('jira'); tpToggleMiss();
    expect(getState().tpMiss).toBe(true); expect(getState().tpK).toBe('');
  });
  it('chọn tuần đã chốt mở màn Phiên bản, tuần 3 chỉ đóng menu', () => {
    mutate((d) => { d.menu = 'week'; });
    switchWeek('w3'); expect(getState().menu).toBeNull(); expect(getState().view).toBe('tlib');
    switchWeek('w2'); expect(getState().view).toBe('ver');
  });
});
