/* "AI đã soạn xong N ô nháp" (prototype modalAiDone L4426): mở sau khi bấm "Nhờ AI soạn". Chỉ vẽ khi state.modal === 'aiDone'. */
import { AI_IDS } from '@/data/constants';
import { rowsOf, useAppState } from '@/store';
import { byProject, pendingList, startReview } from '@/store/actions/ai';
import { setModal } from '@/store/actions/flow';

export function AiDoneModal(): JSX.Element | null {
  const s = useAppState((x) => x);
  if (s.modal !== 'aiDone') return null;
  const p = pendingList(s).length, np = rowsOf(s).filter((r) => AI_IDS.some((k) => r.ai[k] && !r.ai[k]!.ok)).length;
  return (
    <div className="ov" data-act="closeModal" onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}>
      <div className="modal" style={{ width: 'min(460px,100%)' }} data-stop="1" role="dialog" aria-modal="true" aria-label="AI đã soạn xong">
        <div className="aidone">
          <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--aiBg)', border: '1px solid var(--aiLine)', color: 'var(--ai)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', font: '700 15px var(--font)' }}>AI</div>
          <div style={{ fontSize: 16, fontWeight: 650, marginTop: 12 }}>{'AI đã soạn xong ' + p + ' ô nháp'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--mut)', marginTop: 6, lineHeight: 1.55 }}>{'cho ' + np + ' dự án: Mức độ rủi ro (AC), Kế hoạch tuần sau (AS), Vấn đề & đề xuất (AT). Nháp chỉ vào báo cáo sau khi được duyệt.'}</div>
          <button className="btn pri big" data-act="review" onClick={() => startReview()}>Duyệt từng ô ngay →</button>
          <div style={{ fontSize: 11.5, color: 'var(--mut2)', marginTop: 6 }}>Đi lần lượt từng ô, xem căn cứ AI dùng, sửa nếu cần · Enter để duyệt</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn" data-act="byProject" style={{ flex: '1 1 0' }} onClick={byProject}>Duyệt theo dự án trên bảng</button>
            <button className="btn" data-act="closeModal" style={{ flex: '1 1 0' }} onClick={() => setModal(null)}>Để sau</button>
          </div>
        </div>
      </div>
    </div>
  );
}
