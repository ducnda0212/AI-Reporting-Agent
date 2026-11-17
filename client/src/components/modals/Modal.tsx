import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/** Khung modal: bấm nền mờ thì đóng; nội dung chặn lan sự kiện. */
export function Modal({ onClose, width, label, children, style }: { onClose: () => void; width?: string; label?: string; children: ReactNode; style?: CSSProperties }) {
  const [min, setMin] = useState(true); // hiệu ứng mở
  useEffect(() => { const t = requestAnimationFrame(() => setMin(false)); return () => cancelAnimationFrame(t); }, []);
  return (
    <div className={'ov' + (min ? ' min' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ ...(width ? { width } : {}), ...style }} data-stop="1" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}
