/* Nút AI nổi: mở khung trợ lý ở mọi màn (trừ màn Trợ lý, nơi AI đã toàn trang, và khi khung đang mở). */
import { useAppState } from '@/store';
import { setPanel } from '@/store/actions/flow';

export function AiFab(): JSX.Element | null {
  const hidden = useAppState((s) => s.view === 'ai' || s.panel === 'ai' || s.modal !== null);
  if (hidden) return null;
  return (
    <button type="button" className="aifab" onClick={() => setPanel('ai')} aria-label="Hỏi trợ lý AI" title="Hỏi trợ lý AI">
      <span className="aifab-i" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
        </svg>
      </span>
      <span className="aifab-t">Hỏi AI</span>
    </button>
  );
}
