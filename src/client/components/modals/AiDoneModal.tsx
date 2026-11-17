import { AI_IDS } from '@/data/constants';
import { pendingAI } from '@/lib/selectors';
import { useRows } from '@/hooks/useDerived';
import { byProject, setModal, startReview } from '@/store/actions/flow';
import { Modal } from './Modal';

export function AiDoneModal() {
  const rows = useRows();
  const p = pendingAI(rows);
  const np = rows.filter((r) => AI_IDS.some((k) => r.ai[k] && !r.ai[k]!.ok)).length;
  const close = () => setModal(null);
  return (
    <Modal onClose={close} width="min(460px,100%)" label="AI đã soạn xong">
      <div className="aidone">
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--aiBg)', border: '1px solid var(--aiLine)', color: 'var(--ai)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', font: '700 15px var(--font)' }}>AI</div>
        <div style={{ fontSize: 16, fontWeight: 650, marginTop: 12 }}>AI đã soạn xong {p} ô nháp</div>
        <div style={{ fontSize: 12.5, color: 'var(--mut)', marginTop: 6, lineHeight: 1.55 }}>cho {np} dự án: Mức độ rủi ro (AC), Kế hoạch tuần sau (AS), Vấn đề & đề xuất (AT). Nháp chỉ vào báo cáo sau khi được duyệt.</div>
        <button className="btn pri big" onClick={() => startReview()}>Duyệt từng ô ngay →</button>
        <div style={{ fontSize: 11.5, color: 'var(--mut2)', marginTop: 6 }}>Đi lần lượt từng ô, xem căn cứ AI dùng, sửa nếu cần · Enter để duyệt</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={byProject} style={{ flex: '1 1 0' }}>Duyệt theo dự án trên bảng</button>
          <button className="btn" onClick={close} style={{ flex: '1 1 0' }}>Để sau</button>
        </div>
      </div>
    </Modal>
  );
}
