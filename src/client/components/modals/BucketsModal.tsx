import { PROG_VALUES, STAGES, STATUS_VALUES } from '@/data/constants';
import { unsortedOf } from '@/lib/selectors';
import { useAppState, useRows } from '@/hooks/useDerived';
import { dropPhase, dropStatus, pickValue, setBucketCol, setModal } from '@/store/actions/flow';
import { Modal } from './Modal';

/** Rổ gom giá trị: kéo thả (hoặc chọn rồi bấm rổ) giá trị Jira lạ vào giá trị chuẩn của mẫu. */
export function BucketsModal() {
  const s = useAppState();
  const rows = useRows();
  const isPhase = s.bucketCol === 'lifecycleStep' || s.bucketCol === 'lifecycleStepNo';
  const isTD = s.bucketCol === 'progress';
  const unsorted = isPhase ? s.unsorted : unsortedOf(s, rows, isTD ? 'progress' : 'status');
  const close = () => setModal(null);
  const tts = isTD ? PROG_VALUES : STATUS_VALUES;
  const bmap = isTD ? s.progMap : s.statusMap;
  const dropTo = (act: () => void) => ({
    onClick: act,
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.currentTarget.classList.add('over'); },
    onDragLeave: (e: React.DragEvent) => e.currentTarget.classList.remove('over'),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); e.currentTarget.classList.remove('over'); const v = e.dataTransfer.getData('text/plain'); if (v) pickValue(v); act(); },
  });
  return (
    <Modal onClose={close}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line2)', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Rổ gom giá trị</div>
          <div style={{ fontSize: 11.5, color: 'var(--mut)', marginTop: 3 }}>Đổi tên giá trị trong báo cáo thì sửa ở đây, không phải sửa code.</div>
        </div>
        <select className="sel" style={{ height: 34 }} value={s.bucketCol} onChange={(e) => setBucketCol(e.target.value)}>
          <option value="buoc">AJ · AI Lifecycle</option><option value="buocso">L · Bước trong AI Lifecycle</option>
          <option value="tt">I · Trạng thái (Status)</option><option value="td">J · Tiến độ (Progress)</option>
        </select>
        <button className="chip" onClick={close} style={{ cursor: 'pointer' }}>Đóng</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: 16 }}>
        <section style={{ flex: '0 0 210px', minWidth: 170 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>Giá trị trong file Jira · chưa gom</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unsorted.length ? unsorted.map((v) => (
              <button key={v} className={'val' + (s.pickedVal === v ? ' on' : '')} draggable onClick={() => pickValue(v)}
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', v); e.dataTransfer.effectAllowed = 'move'; }}>{v}</button>
            )) : <div style={{ fontSize: 12, color: 'var(--ok)' }}>Đã gom hết.</div>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--mut2)', marginTop: 9, lineHeight: 1.5 }}>Kéo một giá trị thả vào rổ bên phải, hoặc bấm giá trị rồi bấm rổ. Giá trị còn sót lại sẽ để ô trống và thành cảnh báo.</div>
        </section>
        {isPhase ? (
          <section style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>12 bước AI Lifecycle · cột AJ, cột L tự tính theo</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 7 }}>
              {STAGES.map((name, k) => {
                const vals = Object.keys(s.phaseBucket).filter((v) => s.phaseBucket[v] === k + 1);
                return (
                  <button key={k} className={'bucket' + (vals.length ? '' : ' empty')} {...dropTo(() => dropPhase(k + 1))}>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{k + 1} · {name}</span>
                    {vals.length ? vals.map((v) => <span className="tag" key={v}>{v}</span>) : <span style={{ fontSize: 10.5, color: 'var(--mut2)' }}>chưa có giá trị</span>}
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <section style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div className="lbl" style={{ marginBottom: 8 }}>{isTD ? 'Cột J Tiến độ' : 'Cột I Trạng thái'} · danh sách chọn trong mẫu</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 7 }}>
              {tts.map((t) => (
                <button key={t} className="bucket" {...dropTo(() => dropStatus(t, unsorted))}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{t}</span>
                  {Object.keys(bmap).filter((k) => bmap[k] === t).map((v) => <span className="tag" key={v}>{v}</span>)}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line2)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--mut)' }}>Áp dụng ngay cho {rows.length} dòng.</span>
        <div style={{ flex: '1 1 10px' }} /><button className="btn pri" onClick={close}>Xong</button>
      </div>
    </Modal>
  );
}
