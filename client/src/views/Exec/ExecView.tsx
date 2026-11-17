import type { ReactNode } from 'react';
import type { Row } from '@/types';
import type { ExDraft } from '@/store/types';
import { cellValue, fieldOf } from '@/lib/cell';
import { aiText, exOf, exPct, exPending, exRunning, exSorted, exStatus, exWhy, hasIssues } from '@/lib/exec';
import { changedSinceLock, lastCur } from '@/lib/versions';
import { useAppState } from '@/hooks/useDerived';
import { addExDirective, approveExDraft, exGo, runExAiDraft, setExDraft, setExHl, setView } from '@/store/actions/flow';
import { exportPdf, exportWord } from '@/store/actions/exportReport';

type Col = [string, string];
const STATUS_CLASS: Record<string, string> = { 'Chậm tiến độ': 'e', 'Có nguy cơ chậm': 'w', 'Đúng tiến độ': 'o' };

function Table({ cols, empty, children, hasRows }: { cols: Col[]; empty: string; children: ReactNode; hasRows: boolean }) {
  return (
    <table className="pt">
      <colgroup>{cols.map((c, k) => <col key={k} style={{ width: c[1] }} />)}</colgroup>
      <thead><tr>{cols.map((c, k) => <th key={k}>{c[0]}</th>)}</tr></thead>
      <tbody>{hasRows ? children : <tr><td colSpan={cols.length} className="pe">{empty}</td></tr>}</tbody>
    </table>
  );
}
const Bar = ({ t }: { t: string }) => <div className="pbar">{t}</div>;
const Draft = ({ d }: { d?: ExDraft }) => (d && !d.ok ? <> <span className="pdm" title="Nháp AI chưa duyệt — chưa vào file">nháp</span></> : null);

/** Ô sửa được ngay trên trang giấy, có nút duyệt khi là nháp AI. */
function Editor({ k, code, d, ph }: { k: 'kpiResult' | 'directive' | 'note'; code: string | null; d?: ExDraft | null; ph: string }) {
  const draft = !!d && !d.ok;
  return (
    <div className={'ped' + (draft ? ' ai' : '')}>
      <textarea className="pta" key={d ? d.text : ''} defaultValue={d ? d.text : ''} placeholder={ph} aria-label={ph}
        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (d ? d.text : '') || draft) setExDraft(k, code, v); }} />
      {draft && <button className="pok" onClick={(e) => approveExDraft(k, code, (e.currentTarget.parentElement!.querySelector('textarea') as HTMLTextAreaElement).value)} title={`Duyệt nháp AI · căn cứ: ${d!.why || ''}`}>✓ Duyệt</button>}
    </div>
  );
}

/** Báo cáo điều hành: xem trước đúng như file PDF, sửa ngay trên trang. */
export function ExecView() {
  const s = useAppState();
  if (!s.loaded) {
    return (
      <div className="gridwrap gut" style={{ paddingBlock: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Chưa có dữ liệu tuần này</div>
        <button className="btn pri" onClick={() => setView('import')}>Tới bước Nhập file</button>
      </div>
    );
  }
  const run = exSorted(s, exRunning(s));
  const N = run.length;
  const cnt: Record<string, number> = { 'Chậm tiến độ': 0, 'Có nguy cơ chậm': 0, 'Đúng tiến độ': 0 };
  run.forEach((r) => { cnt[exStatus(s, r)]++; });
  const V = (r: Row, id: string) => cellValue(s, r, fieldOf(s, id)) || '';
  const ProjectCode = ({ r }: { r: Row }) => <button className="pma" onClick={() => exGo(r.i)} title="Mở dòng này trên bảng 49 cột">{r.code}</button>;
  const Tt = ({ r }: { r: Row }) => { const t = exStatus(s, r); return <span className={'ptt ' + STATUS_CLASS[t]} title={exWhy(s, r)}>{t}</span>; };
  const kpiRows = run.filter((r) => V(r, 'kpi'));
  const iss = run.filter(hasIssues);
  const nx = run.filter((r) => aiText(r, 'w3Plan'));
  const directives = run.filter((r) => { const e = exOf(s, r); return e.directive && (e.directive.text || !e.directive.ok); });
  const addable = run.filter((r) => !directives.includes(r));
  const pend = exPending(s);
  const lc = lastCur(s);
  const ch = changedSinceLock(s);
  let kpiResult = 0;

  return (
    <div className="gridwrap pdesk">
      <div className="ptool">
        <div className="ptool-l"><b>Báo cáo điều hành</b></div>
        {pend > 0 && <span className="chip" style={{ color: 'var(--ai)', borderColor: 'var(--aiLine)' }}>{pend} nháp chờ duyệt</span>}
        <button className="btn" onClick={runExAiDraft}>Nhờ AI soạn</button>
        <button className="btn" onClick={exportWord}>Tải Word</button>
        <button className="btn pri" onClick={exportPdf}>Tải PDF</button>
      </div>
      <div className="pscroll"><article className="paper">
        <h1 className="ph1">PMO BÁO CÁO ĐIỀU HÀNH – TRUNG TÂM AI</h1>
        <p className="pky"><b>Kỳ báo cáo</b><span className="pkyv">Tuần 3 tháng 11 năm 2026 (15–22/11)</span><i>(Chỉ tính các dự án đang thực hiện)</i>
          <em>{lc ? `Bản v${lc.v}` + (ch && ch.length ? ' · có thay đổi chưa chốt' : ' · đã chốt') : 'Chưa chốt'}</em></p>
        <Bar t="1. THÔNG TIN TỔNG QUAN TRUNG TÂM" />
        <table className="ps"><colgroup><col style={{ width: '22%' }} /><col /></colgroup><tbody>
          <tr><td className="k">Số dự án đang chạy</td><td><b>{N}</b></td></tr>
          <tr><td className="k">Đúng tiến độ</td><td>{cnt['Đúng tiến độ']}</td></tr>
          <tr><td className="k">Có nguy cơ chậm</td><td>{cnt['Có nguy cơ chậm']}</td></tr>
          <tr><td className="k">Chậm tiến độ</td><td>{cnt['Chậm tiến độ']}</td></tr>
          <tr><td className="k">Tỉ lệ đúng tiến độ</td><td>{N ? Math.round((cnt['Đúng tiến độ'] / N) * 100) + ' %' : ''}</td></tr>
          <tr><td className="k">Nhận xét chung</td><td className="pin"><Editor k="note" code={null} d={s.exNote} ph="1–2 câu nhận xét chung" /></td></tr>
        </tbody></table>
        <Bar t="2. CÁC CHỈ SỐ NỔI BẬT (KPI)" />
        <Table cols={[['STT', '6%'], ['Mã DA', '9%'], ['Công việc', '24%'], ['Đầu mối chịu trách nhiệm', '13%'], ['KPI (mục tiêu)', '19%'], ['Kết quả đạt được', '29%']]} empty="Không có" hasRows={kpiRows.length > 0}>
          {kpiRows.map((r) => {
            const e = exOf(s, r);
            if (e.hl) kpiResult++;
            return (
              <tr key={r.i} className={e.hl ? undefined : 'poff'}>
                <td className="c"><label className="phl" title={e.hl ? 'Bỏ tick để không đưa vào báo cáo' : 'Tick để đưa vào báo cáo'}>
                  <input type="checkbox" checked={e.hl} onChange={(ev) => setExHl(r.code, ev.target.checked)} aria-label={'Nêu ' + r.code} /><span>{e.hl ? kpiResult : ''}</span></label></td>
                <td><ProjectCode r={r} /></td><td>{V(r, 'task')}</td><td>{V(r, 'pic')}</td><td>{V(r, 'kpi')}</td>
                <td className="pin">{e.hl ? <Editor k="kpiResult" code={r.code} d={e.kpiResult} ph="Kết quả đạt được" /> : <span className="pmut">không đưa vào báo cáo</span>}</td>
              </tr>
            );
          })}
        </Table>
        <Bar t="3. TIẾN ĐỘ CÁC DỰ ÁN" />
        <Table cols={[['STT', '5%'], ['Mã DA', '9%'], ['Công việc', '23%'], ['Tiến độ', '8%'], ['Hạn', '9%'], ['Tình trạng', '12%'], ['Việc hoàn thành trong tuần', '34%']]} empty="Không có" hasRows={run.length > 0}>
          {run.map((r, k) => <tr key={r.i}><td className="c">{k + 1}</td><td><ProjectCode r={r} /></td><td>{V(r, 'task')}</td><td className="c">{exPct(r)} %</td><td className="c">{V(r, 'end')}</td><td><Tt r={r} /></td><td className="pre">{V(r, 'w3Done')}</td></tr>)}
        </Table>
        <Bar t="4. CÁC VẤN ĐỀ ĐANG GẶP PHẢI (RỦI RO, ISSUE…)" />
        <Table cols={[['STT', '5%'], ['Mã DA', '9%'], ['Công việc', '23%'], ['Tình trạng', '12%'], ['Vấn đề, rủi ro & đề xuất', '51%']]} empty="Không có · cột AT trống hoặc ghi “Không có”" hasRows={iss.length > 0}>
          {iss.map((r, k) => <tr key={r.i}><td className="c">{k + 1}</td><td><ProjectCode r={r} /></td><td>{V(r, 'task')}</td><td><Tt r={r} /></td><td className="pre">{hasIssues(r)}<Draft d={r.ai.w3Issues} /></td></tr>)}
        </Table>
        <Bar t="5. CÔNG VIỆC TUẦN KẾ TIẾP" />
        <Table cols={[['STT', '5%'], ['Mã DA', '9%'], ['Công việc', '27%'], ['Kế hoạch tuần sau', '59%']]} empty="Không có · cột AS chưa soạn" hasRows={nx.length > 0}>
          {nx.map((r, k) => <tr key={r.i}><td className="c">{k + 1}</td><td><ProjectCode r={r} /></td><td>{V(r, 'task')}</td><td className="pre">{aiText(r, 'w3Plan')}<Draft d={r.ai.w3Plan} /></td></tr>)}
        </Table>
        <Bar t="6. Ý KIẾN CẦN CHỈ ĐẠO CỦA BAN GIÁM ĐỐC" />
        <Table cols={[['STT', '5%'], ['Mã DA', '9%'], ['Công việc', '27%'], ['Nội dung cần chỉ đạo', '59%']]} empty="Không có" hasRows={directives.length > 0}>
          {directives.map((r, k) => <tr key={r.i}><td className="c">{k + 1}</td><td><ProjectCode r={r} /></td><td>{V(r, 'task')}</td><td className="pin"><Editor k="directive" code={r.code} d={exOf(s, r).directive} ph="Nội dung cần BGĐ chỉ đạo" /></td></tr>)}
        </Table>
        <div className="padd">
          <select className="sel" aria-label="Thêm ý kiến cho dự án" value="" onChange={(e) => e.target.value !== '' && addExDirective(s.allRows[+e.target.value].code)}>
            <option value="">+ Thêm ý kiến cần chỉ đạo cho dự án…</option>
            {addable.map((r) => <option key={r.i} value={r.i}>{r.code + ' · ' + V(r, 'task')}</option>)}
          </select>
        </div>
      </article></div>
    </div>
  );
}
