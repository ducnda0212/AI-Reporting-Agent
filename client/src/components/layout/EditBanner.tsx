/* Banner "Đang sửa tiếp" khi mở bản cũ trên bảng (prototype editBanner L10891). */
import { activeWkOf } from '@/lib/cell';
import { useAppState } from '@/store';
import { vFind, vlExitEdit, wkName } from '@/store/actions/versions';

export function EditBanner(): JSX.Element | null {
  const s = useAppState((x) => x);
  if (!s.editWk || s.editWk === activeWkOf(s) || s.view !== 'grid') return null;
  const v = vFind(s, s.openedVer);
  return (
    <div className="vleb">
      <b>{'Đang sửa tiếp ' + (v ? 'Bản ' + v.v + ' · ' : '') + wkName(s.editWk)}</b>
      <span>Chốt lại sẽ tạo bản mới của tuần đó; bản cũ giữ nguyên.</span><span className="v2sp" />
      <button className="btn sm" onClick={vlExitEdit}>Về tuần này</button>
    </div>
  );
}
