import { useEffect } from 'react';
import { useStore } from '@/store';
import { clearToast } from '@/store/actions/flow';

/** Thông báo nổi tự tắt sau 2,2 giây. Đổi nội dung thì tính lại giờ. */
export function Toast() {
  const msg = useStore((s) => s.toast);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(clearToast, 2200);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast tin" key={msg}>{msg}</div> : null;
}

export function AiRunBar() {
  const run = useStore((s) => s.aiRun);
  if (!run) return null;
  const pct = Math.round((run.n / run.total) * 100);
  return (
    <div className="airun" role="status">
      <span className="aispark" aria-hidden="true">✦</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="airunt">AI đang đọc Progress Report và Comment</div>
        <div className="xbar airunbar"><i style={{ width: pct + '%' }} /></div>
      </div>
      <span className="airunn">{run.n}/{run.total} dự án</span>
    </div>
  );
}
