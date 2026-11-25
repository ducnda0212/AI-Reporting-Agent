/* Thanh trạng thái dưới bảng (prototype statusBar L4098 sau các vòng R3/R7: bỏ đếm ô trống, AI chờ duyệt, "Đã chốt", .ftcell),
   kèm selInfo L7498, zoomCtl L10269 và legendBtn/legendPop L10006. */
import { AI_IDS, FIELDS } from '@/data/constants';
import { displayText, fieldById } from '@/lib/cell';
import { selKeys, visibleFields } from '@/lib/grid';
import { rowsOf, useAppState } from '@/store';
import { trOpen } from '@/store/actions/ai';
import { gridOrder, setMenu, setZoom } from '@/store/actions/grid';
import type { AppState, Field } from '@/types';
import { SrcIcon } from '@/components/common/Icons';

/* Một ô AI đang chọn (không vùng): lối vào khung "AI soạn ra sao" (prototype cellInfo L9978). */
function AiTraceLink({ s }: { s: AppState }): JSX.Element | null {
  const sel = s.sel;
  if (!sel || s.range || s.panel === 'aitrace' || !(AI_IDS as readonly string[]).includes(sel.f)) return null;
  return <span className="selinfo"><i>·</i><button className="link ai" data-act="aiTrace" onClick={() => trOpen(sel.i, sel.f)}>Xem AI soạn ra sao ›</button></span>;
}

function SelInfo({ s }: { s: AppState }): JSX.Element | null {
  if (!s.sel || !s.range) return null;
  const ks = selKeys(s.sel, s.range, gridOrder(s), visibleFields(s.hidden).map((f) => f.id));
  const n = ks.filter((x) => { const [i, f] = x.split('|'); return displayText(s.allRows[+i], fieldById(f)!, s).trim(); }).length;
  return <span className="selinfo">Đã chọn <b>{ks.length}</b>{' ô · ' + n + ' có nội dung · ' + (ks.length - n) + ' trống'}</span>;
}

const LG_SRC: [f: Pick<Field, 'key' | 'kind' | 'opts'>, t: string][] = [
  [{ key: true, kind: 'jira' }, 'Khoá ghép dòng (Mã DA)'], [{ kind: 'cfg' }, 'Lấy từ Jira, chỉ xem'], [{ kind: 'jira' }, 'Lấy thẳng từ Jira'],
  [{ kind: 'bucket' }, 'Từ Jira, quy đổi theo rổ gom'], [{ kind: 'calc' }, 'Code tự tính'], [{ kind: 'report' }, 'Đọc từ Progress Report'],
  [{ kind: 'ai' }, 'AI soạn nháp'], [{ kind: 'manual', opts: ['a'] }, 'Chọn từ danh sách'], [{ kind: 'manual' }, 'Nhập tay']
];
function LegendPop(): JSX.Element {
  return (
    <div className="menu lgpop" role="dialog" aria-label="Chú thích" data-stop="1">
      <div className="lgh">Ô trên bảng</div>
      <div className="lgr"><span className="lgs err" />Lỗi: thiếu ô bắt buộc hoặc giá trị không hợp lệ</div>
      <div className="lgr"><span className="lgs man" />Đã sửa tay (khác dữ liệu nguồn)</div>
      <div className="lgr"><span className="lgs ai">Aa</span>AI nháp, chờ duyệt</div>
      <div className="lgr"><span className="lgs agt" />Agent đã tự đổi lúc nhập file</div>
      <div className="lgh">Nhãn trạng thái</div>
      <div className="lgr lgw"><span className="spill o">Đúng tiến độ</span><span className="spill e">Chậm tiến độ</span><span className="spill b">Đang thực hiện</span><span className="spill w">Tạm dừng</span><span className="spill n">Chưa thực hiện</span></div>
      <div className="lgh">Icon dưới tên cột: nguồn dữ liệu</div>
      {LG_SRC.map(([f, t]) => <div key={t} className="lgr"><span className="lgi"><SrcIcon f={f} /></span>{t}</div>)}
      <div className="lgh">Màu nhóm cột</div>
      <div className="lgr">{['--tK', '--tO', '--tY', '--tW'].map((c) => <span key={c} className="lgs tp" style={{ background: 'var(' + c + ')' }} />)}Giống màu tiêu đề trong file mẫu báo cáo</div>
    </div>
  );
}

export function StatusBar(): JSX.Element | null {
  const s = useAppState((x) => x);
  if (!s.loaded || s.view !== 'grid') return null;
  const open = s.menu === 'legend';
  return (
    <footer className="status gut">
      <span>{rowsOf(s).length + ' dòng · ' + FIELDS.length + ' cột'}</span>
      <SelInfo s={s} />
      <AiTraceLink s={s} />
      <div style={{ flex: '1 1 20px' }} />
      <span className="zctl" title="Phóng to / thu nhỏ bảng (Ctrl + lăn chuột)">
        <button onClick={() => setZoom(-10)} aria-label="Thu nhỏ">−</button>
        <button className="zv" onClick={() => setZoom(0)} title="Về 100%">{s.gx.zoom + '%'}</button>
        <button onClick={() => setZoom(10)} aria-label="Phóng to">+</button>
      </span>
      <span className="mwrap lgwrap">
        <button className="lgbtn" onClick={() => setMenu('legend')} aria-haspopup="true" aria-expanded={open}><span className="lgs err" /><span className="lgs man" /><span className="lgs ai">Aa</span>Chú thích</button>
        {open && <LegendPop />}
      </span>
    </footer>
  );
}
