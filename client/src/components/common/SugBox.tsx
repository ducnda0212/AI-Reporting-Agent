import { RiskText } from './RiskText';

/** Gợi ý AI cho ô Vấn đề/rủi ro (kiểu này từng nằm trong `@/types`, đã bị bỏ khi dọn; khai báo tại đây để khung còn dùng được). */
export interface AiSuggestion { kind: 'action' | 'full'; text: string; why: string; by: string }

/** Khung "AI gợi ý": tách riêng khỏi nội dung ô, chỉ vào báo cáo khi người rà bấm "Đưa vào báo cáo". */
export function SugBox({ sug, onUse, onDrop }: { sug: AiSuggestion; onUse: () => void; onDrop: () => void }) {
  return (
    <div className="sugbox" role="group" aria-label="Gợi ý AI"
      style={{ marginTop: 10, padding: '8px 10px', border: '1px dashed var(--ai)', borderRadius: 6, background: 'var(--aiBg, rgba(124, 58, 237, .06))' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 12, color: 'var(--ai)', fontWeight: 600 }}>
        <span aria-hidden="true">✦</span>
        <span style={{ flex: '1 1 auto' }}>AI gợi ý · {sug.kind === 'action' ? 'đề xuất cho rủi ro chưa có đề xuất' : 'rủi ro thấy trong Progress Report'}</span>
        <span style={{ fontWeight: 400, color: 'var(--mut)' }}>chưa vào báo cáo</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 13 }}><RiskText text={sug.text} /></div>
      {sug.why && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--mut)' }}>Căn cứ: {sug.why}{sug.by ? ` · ${sug.by}` : ''}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn sm ai" onClick={onUse}>Đưa vào báo cáo</button>
        <button className="btn sm" onClick={onDrop}>Bỏ gợi ý</button>
      </div>
    </div>
  );
}
