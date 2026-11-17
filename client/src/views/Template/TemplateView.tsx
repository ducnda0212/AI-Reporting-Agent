import type { Field } from '@/types';
import type { AppState } from '@/store/types';
import { GRP, UNASSIGNED } from '@/data/constants';
import { cellValue, colNum } from '@/lib/cell';
import { blockers } from '@/lib/selectors';
import { useAppState, useRows } from '@/hooks/useDerived';
import { gotoCol, resetDemo, setView, toast } from '@/store/actions/flow';

const WHEN: Record<string, [string, string]> = {
  jira: ['Jira', 'Tự điền khi dựng bảng từ CSV (G2). Cột chưa ánh xạ thì sửa tại đầu cột (G3).'],
  calc: ['Tính toán', 'Tự tính từ cột khác, không sửa trực tiếp.'],
  bucket: ['Rổ gom', 'Tự điền khi giá trị Jira đã được gom vào rổ (G4).'],
  tpl: ['Có sẵn trong mẫu', 'Giữ nguyên tên trong mẫu. Dùng tiền tố mã trong Labels để kiểm tra dự án nằm đúng nhóm.'],
  report: ['Progress report', 'Lấy từ trường Progress report trên Jira, tự cắt theo kỳ báo cáo và trải ngang vào từng khối tuần.'],
  cfg: ['Hệ thống', 'Thông tin dự án, đơn vị, nhân sự lưu sẵn trên hệ thống theo Mã DA. Tự hiện ra, người lập báo cáo không sửa; muốn đổi thì gửi yêu cầu, hệ thống cập nhật xong chạy lại báo cáo.'],
  manual: ['Nhập tay', 'Người dùng điền trên bảng (G1). Đề xuất điền sẵn từ bản chốt tuần trước để khỏi gõ lại.'],
  ai: ['AI đánh giá', 'AI đọc Progress report và Multi Tags, soạn nháp; người dùng duyệt hoặc sửa từng ô.'],
  past: ['Đã chốt', 'Khối tuần trước: giữ nguyên, không sửa, không ghi đè khi xuất.'],
  future: ['Chưa tới', 'Khối tuần sau: để trống.'],
  none: ['Không dùng', 'Cột X trong mẫu không có tên: giữ trống.'],
};

type StKind = 'ok' | 'err' | 'ai' | 'opt' | 'mut';
const PAL: Record<StKind, [string, string, string]> = {
  ok: ['var(--okBg)', 'var(--okLine)', 'var(--ok)'], err: ['var(--errBg)', 'var(--errLine)', 'var(--err)'],
  ai: ['var(--aiBg)', 'var(--aiLine)', 'var(--ai)'], opt: ['var(--bg)', 'var(--line)', 'var(--mut)'], mut: ['var(--row)', 'var(--line2)', 'var(--mut2)'],
};

function colStatus(s: AppState, rows: ReturnType<typeof useRows>, f: Field): { k: StKind; t: string; full?: boolean } {
  const N = rows.length;
  if (!s.loaded) return { k: 'mut', t: 'chưa nạp file' };
  if (f.kind === 'none') return { k: 'mut', t: 'không dùng' };
  if (f.kind === 'future') return { k: 'mut', t: 'để trống' };
  if (f.kind === 'past') return { k: 'mut', t: 'giữ nguyên' };
  let filled = 0; let pend = 0;
  rows.forEach((r) => {
    if (f.kind === 'ai') { const d = r.ai[f.id]; if (d && d.ok) filled++; else if (d) pend++; }
    else if (cellValue(s, r, f) !== null) filled++;
  });
  if (filled === N) return { k: 'ok', t: `đủ ${N}/${N}`, full: true };
  if (pend && filled + pend === N) return { k: 'ai', t: `${pend} ô chờ duyệt` };
  if (f.required) return { k: 'err', t: `thiếu ${N - filled}` + (pend ? ` · ${pend} chờ duyệt` : '') };
  return { k: 'opt', t: `${N - filled} ô trống · không bắt buộc` };
}

/** "Cấu hình cột": 49 cột của mẫu, cách điền, tình trạng tuần này. */
export function TemplateView() {
  const s = useAppState();
  const rows = useRows();
  const cols = s.fields.slice().sort((a, b) => colNum(a.col) - colNum(b.col));
  const req = cols.filter((f) => f.required);
  const reqOk = req.filter((f) => colStatus(s, rows, f).full).length;
  const counts: Record<string, number> = {};
  cols.forEach((f) => { counts[f.kind] = (counts[f.kind] || 0) + 1; });
  const nb = blockers(s, rows).length;
  const done = reqOk === req.length && !nb;
  return (
    <div className="gridwrap gut" style={{ paddingBlock: 18 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 14 }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px' }}>Cấu hình cột · mẫu 49 cột</h1>
            <p style={{ fontSize: 12.5, color: 'var(--mut)', margin: 0, maxWidth: '72ch' }}>Đây là file đích khi xuất. Bảng dữ liệu (G1) có đúng 49 cột này; mỗi cột được điền theo một cách khác nhau. Bấm một dòng để nhảy tới cột đó trên bảng.</p>
          </div>
          <button className="btn" onClick={() => setView('grid')}>← Về bảng dữ liệu</button>
          <button className="btn" onClick={() => toast('Bản thử chưa đổi được file mẫu — bản thật cho chọn file .xlsx khác và báo cột nào thay đổi')}>Đổi file mẫu…</button>
          <button className="btn" onClick={resetDemo}>Đặt lại bản thử</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div className="card" style={{ flex: '1 1 300px', minWidth: 0, padding: '13px 15px' }}>
            <div className="lbl">File mẫu đang dùng</div>
            <div style={{ fontSize: 13, fontWeight: 600, margin: '6px 0 8px', wordBreak: 'break-all' }}>20261111_DAN_Mau-bao-cao-PMO.xlsx</div>
            <div className="kv"><span style={{ color: 'var(--mut)' }}>Số cột</span><b>49 · A → AW</b></div>
            <div className="kv"><span style={{ color: 'var(--mut)' }}>Khối tuần</span><b>4 khối · AL → AW</b></div>
            <div className="kv"><span style={{ color: 'var(--mut)' }}>Dữ liệu bắt đầu từ</span><b>dòng 3</b></div>
            <div className="kv" style={{ borderBottom: 0 }}><span style={{ color: 'var(--mut)' }}>Danh sách chọn có sẵn</span><b>cột I, cột J</b></div>
          </div>
          <div className="card" style={{ flex: '1 1 300px', minWidth: 0, padding: '13px 15px', ...(done ? { borderColor: 'var(--okLine)', background: 'var(--okBg)' } : {}) }}>
            <div className="lbl">Tuần 3/11 · đã đủ chưa</div>
            <div style={{ fontSize: 22, fontWeight: 700, margin: '6px 0 2px', color: done ? 'var(--ok)' : 'var(--ink)' }}>{reqOk}/{req.length} cột bắt buộc đã đủ</div>
            <div style={{ fontSize: 12, color: 'var(--mut)', lineHeight: 1.55 }}>
              {done ? 'Đủ để xuất. Các cột không bắt buộc còn trống sẽ để trống trong file.'
                : `Còn ${req.length - reqOk} cột bắt buộc chưa đủ (dòng đỏ bên dưới)${nb ? ` và ${nb} lỗi chặn` : ''}. Xử lý xong thì nút Xuất mới mở.`}
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: '12px 15px', marginBottom: 14 }}>
          <div className="lbl" style={{ marginBottom: 6 }}>Mỗi loại cột được điền lúc nào</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '4px 18px' }}>
            {['cfg', 'jira', 'tpl', 'bucket', 'calc', 'report', 'ai', 'manual', 'past', 'future'].map((k) => (
              <div key={k} style={{ fontSize: 12, padding: '5px 0', lineHeight: 1.5 }}>
                <b>{WHEN[k][0]}</b> <span style={{ color: 'var(--mut2)' }}>· {counts[k] || 0} cột</span><br />
                <span style={{ color: 'var(--mut)' }}>{WHEN[k][1]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="tb">
            <thead><tr><th>Cột</th><th>Tên trong mẫu</th><th>Nhóm</th><th>Cách điền</th><th>Nguồn</th><th>Bắt buộc</th><th>Tuần 3/11</th></tr></thead>
            <tbody>
              {cols.map((f) => {
                const st = colStatus(s, rows, f);
                const c = PAL[st.k];
                return (
                  <tr key={f.id} className="tplrow" tabIndex={0} onClick={() => gotoCol(f.id)} onKeyDown={(e) => { if (e.key === 'Enter') gotoCol(f.id); }}>
                    <td style={{ font: '600 11.5px var(--mono)' }}>{f.col}</td>
                    <td style={{ color: 'var(--ink)', fontWeight: 500 }}>{f.name}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{(GRP[f.grp] || 'Thông tin dự án').split(' · ')[0]}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{WHEN[f.kind][0]}</td>
                    <td style={{ font: '400 11px var(--mono)', color: f.src === UNASSIGNED ? 'var(--err)' : 'var(--mut)' }}>{f.src}</td>
                    <td>{f.required ? <b style={{ color: 'var(--ink)' }}>có</b> : <span style={{ color: 'var(--mut2)' }}>—</span>}</td>
                    <td><span className="pill" style={{ background: c[0], borderColor: c[1], color: c[2] }}>{st.t}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--mut2)', lineHeight: 1.6, margin: '12px 0 0', maxWidth: '90ch' }}>Ghi chú về file mẫu: tiêu đề dòng 1 đang ghi nhầm ngày ở hai khối tuần (khối 2 ghi “từ07/10”, khối 4 ghi “Tuần 03/11”). Cột L và AJ cùng lấy từ trường Phase trên Jira. Tên thứ 3 trong Assignee (Tech Lead) không có cột riêng trong mẫu.</p>
        <p style={{ fontSize: 11.5, color: 'var(--wrn)', lineHeight: 1.6, margin: '6px 0 0', maxWidth: '90ch' }}><b>Chờ xác nhận:</b> Status “Monitoring” và Progress “Not tracking” quy về giá trị nào (đang để trong rổ gom) · cột Q Trưởng phòng có trường riêng trên Jira không · cột S PO lấy Assignee thứ 2 hay trường Custom field (PO) có sẵn trong file.</p>
      </div>
    </div>
  );
}
