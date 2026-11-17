import type { Tpl } from '@/store/types';
import { TPL_STATUS } from '@/data/templates';
import { useAppState } from '@/hooks/useDerived';
import { FileTag } from '@/components/common/Icons';
import { setMenu, setView } from '@/store/actions/flow';
import { tlArchive, tlDuplicate, tlFilter, tlOpen, tlRestore, tlSearch, tlUpload, tlUse } from '@/store/actions/templates';

/** Hình thu nhỏ của mẫu: bảng cột (mẫu chi tiết) hoặc trang tóm tắt (báo cáo điều hành). */
function Thumb({ t }: { t: Tpl }) {
  const frame = <rect x=".5" y=".5" width="63" height="43" rx="4" fill="var(--bg)" stroke="var(--line)" />;
  if (t.id === 'texec') {
    return (
      <svg viewBox="0 0 64 44" width="64" height="44" aria-hidden="true">{frame}
        <rect x="8" y="7" width="30" height="4" rx="2" fill="var(--ink2)" /><rect x="8" y="15" width="48" height="2.5" rx="1.25" fill="var(--line)" /><rect x="8" y="21" width="44" height="2.5" rx="1.25" fill="var(--line)" />
        <rect x="8" y="29" width="22" height="9" rx="1.5" fill="var(--accentSoft)" /><rect x="34" y="29" width="22" height="9" rx="1.5" fill="var(--okBg)" />
      </svg>
    );
  }
  const cells = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) cells.push(<rect key={r + '-' + c} x={6 + c * 7.6} y={8 + r * 6.6} width="6.4" height="5.2" rx="1" fill={r === 0 ? 'var(--ink2)' : c >= 5 ? 'var(--accentSoft)' : 'var(--line2)'} />);
  return <svg viewBox="0 0 64 44" width="64" height="44" aria-hidden="true">{frame}{cells}</svg>;
}

function RowMenu({ t }: { t: Tpl }) {
  const s = useAppState();
  if (s.menu !== 'tl-' + t.id) return null;
  return (
    <div className="menu r tlmn" data-stop="1">
      <button className="mi" onClick={() => tlOpen(t.id)}>Mở mẫu</button>
      <button className="mi" onClick={() => tlDuplicate(t.id)}>Nhân bản</button>
      {t.st === 'draft' && <button className="mi" onClick={() => tlUse(t.id)}>Dùng cho tuần này</button>}
      {t.st === 'arch' ? <button className="mi" onClick={() => tlRestore(t.id)}>Khôi phục</button> : <button className="mi" onClick={() => tlArchive(t.id)} disabled={t.main}>Lưu trữ</button>}
    </div>
  );
}

function NewMenu() {
  const s = useAppState();
  if (s.menu !== 'tlnew') return null;
  return (
    <div className="menu r" data-stop="1" style={{ width: 330, top: 'calc(100% + 6px)' }}>
      <button className="tsc" onClick={() => tlDuplicate()}><b>Nhân bản mẫu đang dùng</b><small>Bắt đầu từ mẫu 49 cột rồi bỏ hoặc thêm cột</small></button>
      <button className="tsc" onClick={tlUpload}><b>Tải file Excel mẫu lên</b><small>Hệ thống đọc dòng tiêu đề và gợi ý cách điền từng cột</small></button>
      <button className="tsc" disabled><b>Tả bằng lời để AI dựng <span className="tlsoon">Sắp có</span></b><small>Ví dụ: “chỉ dự án đỏ, cột PIC, tiến độ, rủi ro”</small></button>
    </div>
  );
}

/** Xem cấu trúc của mẫu nháp / lưu trữ. */
function Draft({ t }: { t: Tpl }) {
  const st = TPL_STATUS[t.st];
  return (
    <div className="gridwrap gut tlw"><div className="tlin">
      <nav className="tlbc"><button className="alink" onClick={() => setView('tlib')}>Mẫu báo cáo</button> / {t.name}</nav>
      <header className="tlhd">
        <div><h1>{t.name} <span className={'tls ' + st[0]}>{st[1]}</span></h1><p>{t.desc}</p></div>
        {t.st === 'draft' ? <button className="btn abtn" onClick={() => tlUse(t.id)}>Dùng cho tuần này</button> : <button className="btn" onClick={() => tlRestore(t.id)}>Khôi phục</button>}
      </header>
      <h2 className="ah2">Các cột trong mẫu</h2>
      <ol className="tldc">{(t.cols || ['Giống mẫu 49 cột hiện tại']).map((c, k) => <li key={c}><code>{String.fromCharCode(65 + k)}</code>{c}</li>)}</ol>
      <p className="lnote">Trình chỉnh sửa cột kéo thả cho mẫu tự dựng đang được thiết kế. Hiện mẫu nháp chỉ xem được cấu trúc.</p>
    </div></div>
  );
}

/** Thư viện mẫu báo cáo: mẫu đang dùng, nháp, lưu trữ. */
export function TemplateLibView() {
  const s = useAppState();
  const draft = s.tlDraft ? s.tpls.find((t) => t.id === s.tlDraft) : null;
  if (draft) return <Draft t={draft} />;
  const q = s.tlQ.toLowerCase();
  const list = s.tpls.filter((t) => (s.tlFlt === 'all' || t.st === s.tlFlt) && (!q || (t.name + ' ' + t.desc).toLowerCase().includes(q)));
  const cnt = (k: string) => s.tpls.filter((t) => k === 'all' || t.st === k).length;
  const cur = s.tpls.filter((t) => t.st === 'use');
  const chip = (k: 'all' | Tpl['st'], l: string) => (
    <button className={'rf' + (s.tlFlt === k ? ' on' : '')} onClick={() => tlFilter(k)} aria-pressed={s.tlFlt === k}>{l} <b>{cnt(k)}</b></button>
  );
  return (
    <div className="gridwrap gut tlw"><div className="tlin">
      <header className="tlhd">
        <div><h1>Mẫu báo cáo</h1><p>Mỗi mẫu là một cách trình bày dữ liệu Jira đã kiểm tra. Tuần 3/11 đang xuất ra {cur.length} mẫu.</p></div>
        <span className="mwrap"><button className="btn abtn" onClick={() => setMenu('tlnew')} aria-haspopup="true" aria-expanded={s.menu === 'tlnew'}>+ Tạo mẫu mới</button><NewMenu /></span>
      </header>
      <h2 className="ah2">Đang dùng cho tuần 3/11</h2>
      <div className="tlcur">
        {cur.map((t) => (
          <button key={t.id} className="tlc" onClick={() => tlOpen(t.id)}>
            <span className="tlth"><Thumb t={t} /></span><span className="tlct"><b>{t.name}</b><small>{t.size}</small></span><span className="achev" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      <div className="tlbar"><h2 className="ah2">Tất cả mẫu</h2>
        <div className="tlf">{chip('all', 'Tất cả')}{chip('use', 'Đang dùng')}{chip('draft', 'Nháp')}{chip('arch', 'Lưu trữ')}</div>
        <label className="tlq"><span className="sr">Tìm mẫu</span><input type="search" placeholder="Tìm mẫu…" value={s.tlQ} onChange={(e) => tlSearch(e.target.value)} /></label></div>
      <div className="tltb"><table>
        <thead><tr><th>Tên mẫu</th><th>Cấu trúc</th><th>Dùng gần nhất</th><th>Người tạo</th><th>Trạng thái</th><th><span className="sr">Thao tác</span></th></tr></thead>
        <tbody>
          {list.length ? list.map((t) => {
            const st = TPL_STATUS[t.st];
            return (
              <tr key={t.id} className={'tlr' + (t.st === 'arch' ? ' arch' : '')}>
                <td><button className="tlname" onClick={() => tlOpen(t.id)}><FileTag kind={t.fmt} /><span><b>{t.name}{t.main && <> <span className="tlmain">Mặc định</span></>}</b><small>{t.desc}</small></span></button></td>
                <td className="tlm">{t.size}</td>
                <td className="tlm">{t.used || <span className="mut">Chưa dùng</span>}</td>
                <td className="tlm">{t.by}<small>{t.at}</small></td>
                <td><span className={'tls ' + st[0]}>{st[1]}</span></td>
                <td className="tla"><span className="mwrap"><button className="ticon sm" onClick={() => setMenu('tl-' + t.id)} aria-haspopup="true" aria-expanded={s.menu === 'tl-' + t.id} aria-label={'Thao tác với mẫu ' + t.name}>⋯</button><RowMenu t={t} /></span></td>
              </tr>
            );
          }) : <tr><td colSpan={6} className="tlempty">Không có mẫu nào khớp.</td></tr>}
        </tbody>
      </table></div>
    </div></div>
  );
}
