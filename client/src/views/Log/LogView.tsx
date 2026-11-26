/* Màn Nhật ký kiểu Toggl "Audit log" (prototype vòng 7 L11846-11895): lọc loại / người / tìm #akQ, bảng gom theo ngày,
   cột Người (avatar) · Hoạt động (+ / − / ↻, từ → thành) · Lúc. */
import { LG_CAT } from '@/data/constants';
import { now, useAppState } from '@/store';
import { lgReset, lgSetF, lgSetQ, lgSetW } from '@/store/actions/flow';
import type { AppState, LogEntry } from '@/types';
import { IcSearch } from '@/components/common/Icons';

const lgCat = (e: LogEntry): string => (LG_CAT.find((c) => c[2].test(e.a)) || LG_CAT[3])[0];
const lgRes = (r: string): string => (r === 'Lỗi' ? 'err' : r === 'Cảnh báo' ? 'wrn' : r === 'Thành công' ? 'ok' : 'mut');
function lgWho(e: LogEntry, lockBy: string): string {
  if (lgCat(e) === 'ai') return 'Trợ lý AI';
  if (/^Tự |^Nhập file|Đọc file/i.test(e.a)) return 'Tự động';
  return lockBy || 'Khuê';
}
const lgSign = (e: LogEntry): [string, string] => (/Xoá|Bỏ|Huỷ|Hủy/i.test(e.a) ? ['del', '−'] : /Thêm|Nhập|Tạo|Chốt|Lưu|Gọi/i.test(e.a) ? ['add', '+'] : ['chg', '↻']);

function Avatar({ w }: { w: string }): JSX.Element {
  if (w === 'Trợ lý AI') return <span className="lgav ai" aria-hidden="true">✦</span>;
  if (w === 'Tự động') return <span className="lgav sys" aria-hidden="true">⟳</span>;
  return <span className="lgav" aria-hidden="true">{(w.trim().split(/\s+/).pop() || '').charAt(0).toUpperCase()}</span>;
}

const DETAIL_RE = /^(.*?)(?:“|")?([^“”"→]*?)(?:”|")?\s*→\s*(?:“|")?([^“”"]*?)(?:”|")?(\s*·.*)?$/;
/** Chi tiết có mũi tên tách thành pill "từ → thành". */
function Detail({ d }: { d: string }): JSX.Element | null {
  if (!d) return null;
  const m = DETAIL_RE.exec(d);
  if (m && (m[2] || m[3])) return (
    <div className="lxd">
      {m[1] && <span className="lgdx">{m[1].replace(/[:\s]+$/, '')}</span>}
      <span className="lgfrom">{m[2] || 'trống'}</span><span className="lgar">→</span><span className="lgto">{m[3] || 'trống'}</span>
      {m[4] && <span className="lgdx">{m[4].replace(/^\s*·\s*/, '')}</span>}
    </div>
  );
  return <div className="lxd"><span className="lgdx">{d}</span></div>;
}

const CATS: [string, string][] = [['all', 'Mọi hoạt động'], ['edit', 'Chỉnh sửa ô'], ['data', 'Dữ liệu & nhập file'], ['ai', 'AI'], ['ver', 'Chốt & xuất'], ['warn', 'Có cảnh báo']];
const p2 = (n: number): string => String(n).padStart(2, '0');

function Body({ s }: { s: AppState }): JSX.Element {
  const f = s.lgF || 'all', w = s.lgW, q = s.lgQ.trim().toLowerCase(), t = now();
  const today = p2(t.getDate()) + '/' + p2(t.getMonth() + 1) + '/' + t.getFullYear();
  const L = s.log.filter((e) => {
    const rc = lgRes(e.r);
    if (f !== 'all' && (f === 'warn' ? !(rc === 'err' || rc === 'wrn') : lgCat(e) !== f)) return false;
    if (w && lgWho(e, s.lockBy) !== w) return false;
    return !q || (e.a + ' ' + (e.o || '') + ' ' + (e.d || '')).toLowerCase().includes(q);
  });
  if (!L.length) return <div className="vhnone">{'Không có hoạt động nào' + (q || f !== 'all' || w ? ' khớp bộ lọc' : '') + '.'}</div>;
  const groups: { d: string; L: LogEntry[] }[] = [];
  L.forEach((e) => { const d = e.day || today, g = groups[groups.length - 1]; if (g && g.d === d) g.L.push(e); else groups.push({ d, L: [e] }); });
  return <>{groups.map((g) => [
    <div key={g.d} className="lgday"><b>{g.d === today ? 'Hôm nay' : 'Ngày'}</b><span>{g.d}</span></div>,
    ...g.L.map((e, j) => {
      const who = lgWho(e, s.lockBy), [sc, sg] = lgSign(e), rc = lgRes(e.r);
      return (
        <div key={g.d + (e.seq ?? j)} className="lgrow">
          <div className="lgwho"><Avatar w={who} /><span>{who}</span></div>
          <div className="lgev"><span className={'lgsg ' + sc} aria-hidden="true">{sg}</span><div>
            <div className="lxt">{e.a}{e.o && <> <b>{e.o}</b></>}{(rc === 'wrn' || rc === 'err') && <> <em className={'lxw ' + rc}>{e.r}</em></>}</div>
            <Detail d={e.d} />
          </div></div>
          <time className="lgtm">{e.t}</time>
        </div>
      );
    })
  ])}</>;
}

export function LogView(): JSX.Element {
  const s = useAppState((x) => x), f = s.lgF || 'all';
  const who = [...new Set(s.log.map((e) => lgWho(e, s.lockBy)))];
  return (
    <div className="gridwrap gut lxwrap">
      <div className="lxh"><h2>Nhật ký</h2><span>Ai đã làm gì trên báo cáo, mới nhất ở trên</span></div>
      <div className="lgbar"><span className="lgfl">Lọc</span>
        <select className="sel sm" aria-label="Loại hoạt động" value={f} onChange={(e) => lgSetF(e.target.value)}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="sel sm" aria-label="Người làm" value={s.lgW} onChange={(e) => lgSetW(e.target.value)}><option value="">Mọi người</option>{who.map((w) => <option key={w}>{w}</option>)}</select>
        {(f !== 'all' || s.lgW) && <button className="alink" onClick={lgReset}>Bỏ lọc</button>}
        <span className="v2sp" />
        {/* ô không điều khiển + luôn cùng vị trí trong cây: gõ tiếng Việt (Telex/VNI) không mất focus hay con trỏ */}
        <label className="akq"><IcSearch /><input id="akQ" placeholder="Tìm theo việc, mã DA…" defaultValue={s.lgQ} aria-label="Tìm trong nhật ký" onChange={(e) => lgSetQ(e.target.value)} /></label>
      </div>
      <div className="lgtbl"><div className="lgrow lghd"><span>Người</span><span>Hoạt động</span><span>Lúc</span></div><div className="akbox"><Body s={s} /></div></div>
    </div>
  );
}
