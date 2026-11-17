import { blockers, emptyCells, pendingAI } from '@/lib/selectors';
import { changedSinceLock, lastCur } from '@/lib/versions';
import { displayText, fieldOf } from '@/lib/cell';
import { selKeys } from '@/lib/grid';
import { useAppState, useRows } from '@/hooks/useDerived';
import { setPanel, setView } from '@/store/actions/flow';

const Dot = ({ bg, border }: { bg: string; border: string }) => <span className="sdot" style={{ background: bg, borderColor: border }} />;

export function StatusBar() {
  const s = useAppState();
  const rows = useRows();
  if (!s.loaded) return <footer className="status gut"><span style={{ color: 'var(--mut)' }}>Chưa nạp dữ liệu — bắt đầu ở bước 1 Nhập file.</span></footer>;
  const b = blockers(s, rows);
  const ai = pendingAI(rows);
  const lc = lastCur(s);
  const ch = changedSinceLock(s);
  let selInfo = null;
  if (s.sel && s.range) {
    const ks = selKeys(s);
    const n = ks.filter((x) => { const p = x.split('|'); return displayText(s, s.allRows[+p[0]], fieldOf(s, p[1])).trim(); }).length;
    selInfo = <span className="selinfo">Đã chọn <b>{ks.length}</b> ô · {n} có nội dung · {ks.length - n} trống</span>;
  }
  return (
    <footer className="status gut">
      <span>{rows.length} dòng · 49 cột</span>
      {b.length
        ? <button className="link" onClick={() => setPanel('issues')} style={{ color: 'var(--err)' }}>{b.length} lỗi chặn</button>
        : <span style={{ color: 'var(--ok)', fontWeight: 600 }}>không còn lỗi chặn</span>}
      <span style={{ color: 'var(--wrn)' }}>{emptyCells(s, rows)} ô bắt buộc còn trống</span>
      {ai ? <span style={{ color: 'var(--ai)', fontWeight: 600 }}>{ai} ô AI chờ duyệt</span> : null}
      {lc && (ch && ch.length
        ? <button className="link" onClick={() => setView('ver')} style={{ color: 'var(--wrn)' }}>Đã chốt v{lc.v} · {ch.length} ô đổi sau khi chốt — cần chốt lại</button>
        : <span style={{ color: 'var(--ok)' }}>Đã chốt v{lc.v}{lc.exported ? ' · đã xuất' : ''}</span>)}
      {selInfo}
      <div style={{ flex: '1 1 20px' }} />
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Dot bg="var(--errBg)" border="var(--errLine)" />lỗi</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Dot bg="linear-gradient(225deg,var(--wrn) 0 6px,var(--bg) 6px)" border="var(--line)" />đã sửa tay</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Dot bg="var(--aiBg)" border="var(--aiLine)" />AI nháp</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--mut)' }}>
        <Dot bg="var(--tK)" border="var(--line)" /><Dot bg="var(--tO)" border="var(--line)" /><Dot bg="var(--tY)" border="var(--line)" /><Dot bg="var(--tW)" border="var(--line)" />&nbsp;màu đầu cột theo file mẫu
      </span>
    </footer>
  );
}
