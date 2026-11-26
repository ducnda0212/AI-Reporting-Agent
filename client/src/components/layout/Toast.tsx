/* Thông báo nổi và thanh "AI đang đọc" (lớp #layers trong prototype render L5655-5660). */
import { useAppState } from '@/store';

export function Toast(): JSX.Element {
  const toast = useAppState((s) => s.toast), run = useAppState((s) => s.aiRun);
  return (
    <>
      {run && (
        <div className="airun" role="status">
          <span className="aispark" aria-hidden="true">✦</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="airunt">AI đang đọc Progress Report và Comment</div>
            <div className="xbar airunbar"><i id="airunbar" style={{ width: Math.round((run.n / run.total) * 100) + '%' }} /></div>
          </div>
          <span className="airunn" id="airuntxt">{run.n + '/' + run.total + ' dự án'}</span>
        </div>
      )}
      {/* key = nội dung: thông báo mới chạy lại hiệu ứng trượt vào (.tin) */}
      {toast && <div key={toast} className="toast tin">{toast}</div>}
    </>
  );
}
