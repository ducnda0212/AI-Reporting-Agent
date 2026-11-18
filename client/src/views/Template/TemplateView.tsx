import type { ReactNode } from 'react';
import type { Field } from '@/types';
import type { AppState } from '@/store/types';
import { GRP, UNASSIGNED } from '@/data/constants';
import { cellValue, colNum } from '@/lib/cell';
import { blockers } from '@/lib/selectors';
import { useAppState, useRows } from '@/hooks/useDerived';
import { FileTypeIcon } from '@/components/common/Icons';
import { gotoCol, resetDemo, setPanel, setView, toast } from '@/store/actions/flow';
import { tvHiddenNow, tvMatch, tvWeeksOf, useTv } from '@/store/tplVersions';

import { tpKind, tpSearch, tpToggleMiss } from '@/store/actions/templates';

const WHEN: Record<string, [string, string]> = {
  jira: ['Jira', 'Tự điền khi dựng bảng từ CSV (G2). Cột chưa ánh xạ thì sửa tại đầu cột (G3).'],
  calc: ['Tính toán', 'Tự tính từ cột khác, không sửa trực tiếp.'],
  bucket: ['Rổ gom', 'Tự điền khi giá trị Jira đã được gom vào rổ (G4).'],
  tpl: ['Có sẵn trong mẫu', 'Giữ nguyên tên trong mẫu. Dùng tiền tố mã trong Labels để kiểm tra dự án nằm đúng nhóm.'],
  report: ['Progress report', 'Lấy từ trường Progress report trên Jira, tự cắt theo kỳ báo cáo và trải ngang vào từng khối tuần.'],
  cfg: ['Hệ thống', 'Thông tin dự án, đơn vị, nhân sự lưu sẵn trên hệ thống theo Mã DA. Tự hiện ra, người lập báo cáo không sửa; muốn đổi thì gửi yêu cầu, hệ thống cập nhật xong chạy lại báo cáo.'],
  manual: ['Nhập tay', 'Người dùng điền trên bảng (G1). Đề xuất điền sẵn từ bản chốt tuần trước để khỏi gõ lại.'],
  ai: ['AI đánh giá', 'AI đọc Progress report và Multi Tags, soạn nháp; người dùng duyệt hoặc sửa từng ô.'],
  past: ['Đã chốt', 'Khối tuần trước: giữ nguyên, không sửa, không ghi đè khi xuất.'],
  future: ['Chưa tới', 'Khối tuần sau: để trống.'],
  none: ['Không dùng', 'Cột X trong mẫu không có tên: giữ trống.'],
};

type StKind = 'ok' | 'err' | 'ai' | 'opt' | 'mut';
const ST_CLASS: Record<StKind, string> = { ok: 'ok', err: 'e', ai: 'ai', opt: 'opt', mut: 'mut' };

function colStatus(s: AppState, rows: ReturnType<typeof useRows>, f: Field): { k: StKind; t: string; full?: boolean } {
  const N = rows.length;
  if (!s.loaded) return { k: 'mut', t: 'chưa nạp file' };
  if (f.kind === 'none') return { k: 'mut', t: 'không dùng' };
  if (f.kind === 'future') return { k: 'mut', t: 'để trống' };
  if (f.kind === 'past') return { k: 'mut', t: 'giữ nguyên' };
  let filled = 0; let pend = 0;
  rows.forEach((r) => {
    if (f.kind === 'ai') { const d = r.ai[f.id]; if (d && d.ok) filled++; else if (d) pend++; }
    else if (cellValue(s, r, f) !== null) filled++;
  });
  if (filled === N) return { k: 'ok', t: `đủ ${N}/${N}`, full: true };
  if (pend && filled + pend === N) return { k: 'ai', t: `${pend} ô chờ duyệt` };
  if (f.required) return { k: 'err', t: `thiếu ${N - filled}` + (pend ? ` · ${pend} chờ duyệt` : '') };
  return { k: 'opt', t: `${N - filled} ô trống · không bắt buộc` };
}

/** Tên + màu + biểu tượng cho từng cách điền cột. */
const KIND: Record<string, [string, string, ReactNode]> = {
  cfg: ['Hệ thống', 'k-blue', <><ellipse cx="12" cy="6" rx="7" ry="2.6" /><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" /></>],
  jira: ['Jira', 'k-teal', <><path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" /><path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" /></>],
  bucket: ['Rổ gom', 'k-amber', <><path d="M3.5 12.5h5l1.5 2.5h4l1.5-2.5h5" /><path d="M5.5 6.5h13l2 6v5.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-5.5z" /></>],
  tpl: ['Có sẵn trong mẫu', 'k-gray', <><path d="M7 3.5h7l4 4V20.5H7z" /><path d="M14 3.5v4h4" /></>],
  calc: ['Tính toán', 'k-slate', <path d="M17.5 5.5h-11l6 6.5-6 6.5h11" />],
  report: ['Progress report', 'k-indigo', <><rect x="4.5" y="3.5" width="15" height="17" rx="2" /><path d="M8 8.5h8M8 12h8M8 15.5h5" /></>],
  ai: ['AI đánh giá', 'k-ai', <><path d="M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6z" /><path d="M18 15l.7 1.8 1.8.7-1.8.7L18 20l-.7-1.8-1.8-.7 1.8-.7z" /></>],
  manual: ['Nhập tay', 'k-pink', <><path d="M4.5 19.5l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8.5 18.5z" /><path d="M13.5 7.5l3 3" /></>],
  past: ['Đã chốt', 'k-gray', <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></>],
  future: ['Chưa tới', 'k-gray', <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>],
  none: ['Không dùng', 'k-gray', <><circle cx="12" cy="12" r="8" /><path d="M8.5 12h7" /></>],
};
const KindIcon = ({ k, size = 15 }: { k: string; size?: number }) => {
  const K = KIND[k] || KIND.none;
  return <span className={'kic ' + K[1]} aria-hidden="true"><svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{K[2]}</svg></span>;
};
const KIND_ORDER = ['cfg', 'jira', 'report', 'bucket', 'calc', 'ai', 'manual', 'past', 'future', 'tpl', 'none'];

const Fact = ({ ic, l, v }: { ic: ReactNode; l: string; v: string }) => (
  <div className="tpf"><span className="tpfi" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ic}</svg></span><span><small>{l}</small><b>{v}</b></span></div>
);

/** Cấu hình mẫu 49 cột: mỗi cột được điền theo cách nào, tuần này đã đủ chưa. */
export function TemplateView() {
  const s = useAppState();
  const rows = useRows();
  const cols = s.fields.slice().sort((a, b) => colNum(a.col) - colNum(b.col));
  const req = cols.filter((f) => f.required);
  const reqOk = req.filter((f) => colStatus(s, rows, f).full).length;
  const counts: Record<string, number> = {};
  cols.forEach((f) => { counts[f.kind] = (counts[f.kind] || 0) + 1; });
  const bl = blockers(s, rows).length;
  const done = reqOk === req.length && !bl;
  const K = s.tpK; const miss = s.tpMiss; const q = s.tpQ.toLowerCase();
  const show = cols.filter((f) => {
    if (K && f.kind !== K) return false;
    if (miss && !(f.required && !colStatus(s, rows, f).full)) return false;
    if (q && !`${f.col} ${f.name} ${f.src}`.toLowerCase().includes(q)) return false;
    return true;
  });
  useTv((t) => t.list); const hidNow = tvHiddenNow(s.hidden);
  const pct = Math.round((reqOk / req.length) * 100);
  const kinds = KIND_ORDER.filter((k) => counts[k]);
  return (
    <div className="gridwrap gut tlw"><div className="tlin">
      <nav className="tlbc"><button className="alink" onClick={() => setView('tlib')}>Mẫu báo cáo</button> / Báo cáo tuần chi tiết</nav>
      <header className="tphd">
        <FileTypeIcon kind="xls" />
        <div className="tpht"><h1>Báo cáo tuần chi tiết <span className="tlmain">Mặc định</span></h1><p>20261111_DAN_Mau-bao-cao-PMO.xlsx · bấm một dòng để mở cột đó trên bảng</p></div>
        <div className="tphb">
          <button className="btn" onClick={() => setView('grid')}>Về bảng dữ liệu</button>
          <button className="btn" onClick={() => toast('Bản thử chưa đổi được file mẫu — bản thật cho chọn file .xlsx khác và báo cột nào thay đổi')}>Đổi file mẫu…</button>
          <button className="btn" onClick={resetDemo} title="Xoá mọi thay đổi trong bản thử">Đặt lại bản thử</button>
        </div>
      </header>
      <section className={'tpready' + (done ? ' ok' : '')}>
        <svg viewBox="0 0 44 44" width="52" height="52" aria-hidden="true">
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--line2)" strokeWidth="5" />
          <circle cx="22" cy="22" r="18" fill="none" stroke={done ? 'var(--ok)' : 'var(--accent)'} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${((113.1 * pct) / 100).toFixed(1)} 113.1`} transform="rotate(-90 22 22)" />
        </svg>
        <div><b>{reqOk}/{req.length} cột bắt buộc đã đủ cho tuần 3/11</b>
          <p>{done ? 'Đủ để xuất. Cột không bắt buộc còn trống sẽ để trống trong file.' : `Còn ${req.length - reqOk} cột bắt buộc chưa đủ${bl ? ` và ${bl} lỗi chặn` : ''}. Xử lý xong thì mới xuất được.`}</p></div>
        {!done && <button className="btn abtn" onClick={tpToggleMiss}>{miss ? 'Hiện tất cả cột' : 'Xem cột còn thiếu'}</button>}
      </section>
      {s.panel !== 'tvcfg' && <div className="tvreopen"><span>Cấu hình mẫu đang đóng{!tvMatch(s.hidden) && <> · <b>có thay đổi chưa lưu</b></>}</span><button className="btn sm" onClick={() => setPanel('tvcfg')}>Mở cấu hình</button></div>}
      <div className="tpfacts">
        <Fact ic={<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15M15 4.5v15" /></>} l="Số cột đang hiện" v={`${s.fields.length - hidNow.length}/49 · A → AW`} />
        <Fact ic={<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>} l="Khối tuần" v={`${tvWeeksOf(hidNow)} tuần${s.fields.some((f) => f.grp === 'w4' && !hidNow.includes(f.id)) ? ' + tuần sau' : ''}`} />
        <Fact ic={<path d="M4 7h16M4 12h16M4 17h10" />} l="Dữ liệu bắt đầu" v="dòng 3" />
        <Fact ic={<><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>} l="Danh sách chọn" v="cột I, cột J" />
      </div>
      <div className="tptools"><h2 className="ah2">Cách điền từng cột</h2>
        <label className="tlq"><span className="sr">Tìm cột</span><input type="search" placeholder="Tìm cột, tên, nguồn…" value={s.tpQ} onChange={(e) => tpSearch(e.target.value)} /></label></div>
      <div className="kchips">
        <button className={'kch' + (!K ? ' on' : '')} onClick={() => tpKind('')} aria-pressed={!K}>Tất cả <b>{cols.length}</b></button>
        {kinds.map((k) => (
          <button key={k} className={'kch' + (K === k ? ' on' : '')} onClick={() => tpKind(k)} aria-pressed={K === k} title={WHEN[k] ? WHEN[k][1] : ''}><KindIcon k={k} size={13} />{KIND[k][0]} <b>{counts[k]}</b></button>
        ))}
      </div>
      {K && WHEN[K] && <p className="kdesc"><KindIcon k={K} size={14} /><span><b>{KIND[K][0]}:</b> {WHEN[K][1]}</span></p>}
      {miss && <p className="kdesc warn"><span>Đang chỉ hiện cột bắt buộc còn thiếu.</span> <button className="alink" onClick={tpToggleMiss}>Bỏ lọc</button></p>}
      <div className="tltb"><table className="tptb">
        <thead><tr><th>Cột</th><th>Tên trong mẫu</th><th>Cách điền</th><th>Nguồn</th><th>Tuần 3/11</th></tr></thead>
        <tbody>
          {show.length ? show.map((f) => {
            const st = colStatus(s, rows, f);
            return (
              <tr key={f.id} className="tpr" tabIndex={0} title={`Bấm để mở cột ${f.col} trên bảng`} onClick={() => gotoCol(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') gotoCol(f.id); }}>
                <td><span className="tpcol">{f.col}</span></td>
                <td><b className="tpn">{f.name}</b>{f.required && <span className="tpreq">Bắt buộc</span>}<small className="tpg">{(GRP[f.grp] || 'Thông tin dự án').split(' · ')[0]}</small></td>
                <td><span className="tpk"><KindIcon k={f.kind} />{KIND[f.kind] ? KIND[f.kind][0] : f.kind}</span></td>
                <td><span className={'tpsrc' + (f.src === UNASSIGNED ? ' bad' : '')}>{f.src}</span></td>
                <td><span className={'tpst ' + ST_CLASS[st.k]}>{st.t}</span></td>
              </tr>
            );
          }) : <tr><td colSpan={5} className="tlempty">Không có cột nào khớp.</td></tr>}
        </tbody>
      </table></div>
      <aside className="tpwait"><span className="tpwi" aria-hidden="true">?</span><div><b>Chờ xác nhận với PMO</b><ul>
        <li>Status “Monitoring” và Progress “Not tracking” quy về giá trị nào</li>
        <li>Cột Q Trưởng phòng có trường riêng trên Jira không</li>
        <li>Cột S PO lấy Assignee thứ 2 hay trường Custom field (PO)</li>
      </ul></div></aside>
    </div></div>
  );
}
