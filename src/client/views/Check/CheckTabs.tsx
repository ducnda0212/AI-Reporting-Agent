import { BASE_PHASE_BUCKET, JIRA_COLS, STAGES, UNASSIGNED } from '@/data/constants';
import type { Row } from '@/types';
import type { AppState } from '@/store/types';
import { cellValue, fieldOf, labelBad, labelGroup } from '@/lib/cell';
import { SUG_ORPH, chkCols, chkValGroups, sugVal, type PrjItem } from '@/lib/check';
import { cleanStats } from '@/lib/cleanStats';
import { missingCat, orphansLeft } from '@/lib/selectors';
import { CLEAN_RULES, RAW_LABEL } from '@/lib/text';
import { RiskText } from '@/components/common/RiskText';
import * as F from '@/store/actions/flow';
import * as C from '@/store/actions/catalog';

type Cnt = { col: number; val: number; prjE: number; prjW: number; prj: PrjItem[] };
interface TabProps { s: AppState; rows: Row[]; C: Cnt }

/* ---------- 1 · Khớp cột ---------- */
export function ColTab({ s, rows, C: c }: TabProps) {
  const cols = chkCols(s);
  const flt = s.chkFlt || 'all';
  const sample = (f: (typeof cols)[number]) => {
    const seen: string[] = [];
    rows.some((r) => { const v = cellValue(s, r, f); if (v && !seen.includes(String(v))) seen.push(String(v).replace(/\s+/g, ' ').slice(0, 34)); return seen.length >= 3; });
    return seen;
  };
  const list = cols.filter((f) => { const un = f.src === UNASSIGNED; return flt === 'all' || (flt === 'todo' ? un : !un); })
    .sort((x, y) => Number(y.src === UNASSIGNED) - Number(x.src === UNASSIGNED));
  const chip = (id: string, t: string, n: number) => <button className={'chip ckchip' + (flt === id ? ' on' : '')} onClick={() => F.setChk('chkFlt', id)}>{t} <span>{n}</span></button>;
  return (
    <>
      <section className="ckmain">
        <div className="cktool">
          <b className="ckh2">Khớp cột của mẫu với trường trên Jira</b><div className="sp" />
          {chip('all', 'Tất cả', cols.length)}{chip('todo', 'Chưa khớp', c.col)}{chip('ok', 'Đã khớp', cols.length - c.col)}
          {c.col > 0 && <button className="btn sm pri" onClick={F.autoMapCols}>✦ Tự khớp theo gợi ý</button>}
        </div>
        <div className="ckscroll">
          <table className="cktb">
            <thead><tr><th style={{ width: 52 }}>Cột</th><th>Tên trong mẫu</th><th style={{ width: 260 }}>Trường trên Jira</th><th>Giá trị mẫu từ file</th><th style={{ width: 96, textAlign: 'right' }}>Trạng thái</th></tr></thead>
            <tbody>
              {list.length ? list.map((f) => {
                const un = f.src === UNASSIGNED;
                const smp = un ? ['On-track', 'Off-track', 'Not tracking'] : sample(f);
                return (
                  <tr key={f.id} className={un ? 'ckbad' : undefined}>
                    <td className="mono">{f.col}</td>
                    <td><b>{f.name}</b>{un && <div className="ckwhy">Trường cũ “Custom field (Progress %)” không còn trong file — có thể Jira đã đổi tên</div>}</td>
                    <td>
                      <select className="sel cksel" aria-label={'Trường Jira cho cột ' + f.name} value={un ? '' : f.src} onChange={(e) => e.target.value && F.setFieldSrc(f.id, e.target.value)}>
                        {un && <option value="">Chọn trường Jira…</option>}
                        {JIRA_COLS.slice(1).map((o) => <option key={o}>{o}</option>)}
                      </select>
                      {un && <button className="link cksug" onClick={() => F.setFieldSrc(f.id, 'Custom field (Progress)')}>Dùng gợi ý: Custom field (Progress)</button>}
                    </td>
                    <td className="ckprev">{smp.map((x) => <span className="cksmp" key={x}>{x}</span>)}</td>
                    <td style={{ textAlign: 'right' }}>{un ? <span className="sev2 e">Chưa khớp</span> : <span className="sev2 o">✓ Đã khớp</span>}</td>
                  </tr>
                );
              }) : <tr><td colSpan={5} className="ckempty">Không có cột nào ở mục này.</td></tr>}
            </tbody>
          </table>
          <p className="cknote">Cột A–H và O–W lấy từ Dữ liệu hệ thống nên không cần khớp ở đây. Lựa chọn được nhớ cho các tuần sau.</p>
        </div>
      </section>
    </>
  );
}
export const ColFoot = ({ C: c }: { C: Cnt }) => (
  <>
    <span className="ckfmsg">{c.col ? <><b className="e">{c.col} cột chưa khớp</b> sẽ để trống khi xuất</> : <b className="o">Mọi cột đã có nguồn</b>}</span>
    <button className="btn" onClick={() => F.goStep(1)}>← Nhập file</button>
    <button className="btn pri" onClick={() => F.setChk('chkTab', 'val')}>Tiếp: Quy đổi giá trị →</button>
  </>
);

/* ---------- 2 · Quy đổi giá trị ---------- */
export function ValTab({ s, rows }: TabProps) {
  const G = chkValGroups(s, rows);
  const cur = G.find((g) => g.c === s.chkValCol) || G.find((g) => g.vals.length) || G[0];
  const cnt = (v: string) => rows.filter((r) => r[cur.key] === v);
  const sugN = cur.vals.filter((v) => sugVal(cur.c, v)).length;
  const ruled = cur.c === 'lifecycleStep'
    ? Object.keys(s.phaseBucket).filter((k) => !(k in BASE_PHASE_BUCKET)).concat(Object.keys(s.phaseIgnore || {}))
    : Object.keys(cur.map!).filter((k) => !(k in cur.base!));
  const aff: Array<{ v: string; r: Row }> = [];
  cur.vals.forEach((v) => cnt(v).forEach((r) => aff.push({ v, r })));
  return (
    <>
      <div className="cklist">
        <div className="ckgrp">Cột có giá trị từ Jira</div>
        {G.map((g) => (
          <button key={g.c} className={'ckli' + (g === cur ? ' on' : '')} onClick={() => F.setChk('chkValCol', g.c)}>
            <span className={'dot2 ' + (g.vals.length ? 'w' : 'o')} />
            <span><b>{g.col} · {g.name}</b><small>{g.off ? 'Chưa khớp cột ở bước con 1' : g.vals.length ? g.vals.length + ' giá trị cần quy đổi' : 'Đã có luật cho mọi giá trị'}</small></span>
          </button>
        ))}
      </div>
      <section className="ckmain">
        <div className="cktool">
          <div><b className="ckh2">{cur.col} · {cur.name}</b><span className="ckmut"> · {cur.src}</span></div><div className="sp" />
          {sugN > 0 && <button className="btn sm" onClick={() => F.useAllSuggestions(cur.c)}>✓ Dùng tất cả đề xuất ({sugN})</button>}
          {cur.c === 'lifecycleStep' && <button className="btn sm" onClick={() => F.openBuckets('lifecycleStep')}>Mở rổ gom kéo thả</button>}
        </div>
        <div className="ckscroll">
          <table className="cktb">
            <thead><tr><th>Giá trị trên Jira</th><th style={{ width: 80 }}>Dự án</th><th style={{ width: 24 }} /><th style={{ width: 330 }}>Ghi vào báo cáo</th><th>Thuộc dự án</th></tr></thead>
            <tbody>
              {cur.vals.length ? cur.vals.map((v) => {
                const sg = sugVal(cur.c, v);
                const rs = cnt(v);
                return (
                  <tr key={v}>
                    <td><span className="ckraw">{v}</span></td><td className="ckmut">{rs.length}</td><td className="ckarr">→</td>
                    <td><div className="ckpick">
                      <select className="sel cksel" aria-label={'Quy đổi ' + v} value="" onChange={(e) => e.target.value && F.setValRule(cur.c, v, e.target.value)}>
                        <option value="">Chọn giá trị trong mẫu…</option>{cur.opts.map((o) => <option key={o}>{o}</option>)}
                      </select>
                      {sg && <button className="cksugb" onClick={() => F.useSuggestion(cur.c, v)} title="Dùng đề xuất">Đề xuất: {sg.length > 22 ? sg.slice(0, 22) + '…' : sg}</button>}
                    </div></td>
                    <td className="ckmut ckprj">{rs.slice(0, 3).map((r) => r.code).join(', ') + (rs.length > 3 ? ' +' + (rs.length - 3) : '')}</td>
                  </tr>
                );
              }) : <tr><td colSpan={5} className="ckempty">{cur.off ? 'Cột này chưa khớp trường Jira — xử lý ở bước con “Khớp cột” trước.' : 'Mọi giá trị của cột này đã có luật quy đổi.'}</td></tr>}
            </tbody>
          </table>
          {ruled.length > 0 && <>
            <div className="ckgrp" style={{ margin: '14px 12px 4px' }}>Luật mới thêm tuần này · {ruled.length}</div>
            <table className="cktb"><tbody>
              {ruled.map((k) => {
                const to = cur.c === 'lifecycleStep' ? (s.phaseIgnore && s.phaseIgnore[k] ? 'Không thuộc bước nào' : `${s.phaseBucket[k]}. ${STAGES[s.phaseBucket[k] - 1]}`) : cur.map![k];
                return <tr key={k}><td><span className="ckraw">{k}</span></td><td className="ckarr">→</td><td>{to}</td><td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => F.undoRule(cur.c, k)}>↶ Hoàn tác</button></td></tr>;
              })}
            </tbody></table>
          </>}
          {aff.length > 0 && <>
            <div className="ckgrp" style={{ margin: '16px 12px 4px' }}>Dự án đang có giá trị này · {aff.length}</div>
            <table className="cktb">
              <thead><tr><th style={{ width: 90 }}>Mã DA</th><th>Công việc</th><th style={{ width: 150 }}>PIC</th><th style={{ width: 200 }}>Giá trị trên Jira</th></tr></thead>
              <tbody>{aff.slice(0, 12).map((x, k) => (
                <tr key={k}><td className="mono">{x.r.code}</td><td>{cellValue(s, x.r, fieldOf(s, 'task')) || ''}</td><td className="ckmut">{cellValue(s, x.r, fieldOf(s, 'pic')) || '—'}</td><td><span className="ckraw">{x.v}</span></td></tr>
              ))}</tbody>
            </table>
          </>}
          <p className="cknote">Luật quy đổi được nhớ cho các tuần sau.</p>
        </div>
      </section>
    </>
  );
}
export const ValFoot = ({ C: c }: { C: Cnt }) => (
  <>
    <span className="ckfmsg">{c.val ? <>Còn <b className="w">{c.val} giá trị</b> chưa quy đổi · dự án có giá trị này sẽ để trống ô tương ứng</> : <b className="o">Mọi giá trị đã có luật</b>}</span>
    <button className="btn" onClick={() => F.setChk('chkTab', 'col')}>← Khớp cột</button>
    <button className="btn pri" onClick={() => F.setChk('chkTab', 'fmt')}>Tiếp: Làm sạch nội dung →</button>
  </>
);

/* ---------- 3 · Làm sạch nội dung ---------- */
export function FmtTab({ s }: TabProps) {
  const S = cleanStats(s);
  if (!S.all) {
    return (
      <section className="ckmain">
        <div className="cktool"><b className="ckh2">Làm sạch nội dung lấy từ Jira</b></div>
        <div className="ckscroll">
          <div className="cleanok"><b>File này gần như sạch — không có gì cần làm gọn.</b>
            <p>Khi file Jira có định dạng lộn xộn (wiki markup, gạch đầu dòng lẫn lộn, Status viết khác kiểu…), hệ thống tự chuẩn hoá ở bước này và cho xem trước – sau.</p>
            <button className="btn" onClick={() => F.enterTest('dirty')}>Thử với dữ liệu bẩn (chế độ test)</button></div>
        </div>
      </section>
    );
  }
  const k = Math.min(s.cleanIdx || 0, S.samples.length - 1);
  const sm = S.samples[k];
  const r = sm ? s.allRows[sm.i] : null;
  const after = sm && r ? String(r[sm.k] ?? '') : '';
  return (
    <section className="ckmain">
      <div className="cktool"><b className="ckh2">Làm sạch nội dung lấy từ Jira</b><div className="sp" /><span className="sev2 o">✓ Tự động · {S.all} chỗ</span></div>
      <div className="ckscroll">
        <p className="cknote" style={{ marginTop: 0 }}>Chỉ đổi cách trình bày, không đổi nội dung. Bản gốc vẫn xem được trong khung soạn ô (nút “Xem bản gốc”).</p>
        <table className="cktb">
          <thead><tr><th>Lỗi định dạng trong file Jira</th><th style={{ width: 250 }}>Chuẩn hoá thành</th><th style={{ width: 80, textAlign: 'right' }}>Số chỗ</th></tr></thead>
          <tbody>
            {CLEAN_RULES.map((x) => <tr key={x.k} style={S.tot[x.k] ? undefined : { opacity: 0.5 }}><td>{x.name}</td><td>{x.to}</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{S.tot[x.k]}</td></tr>)}
            <tr style={S.nStatus ? undefined : { opacity: 0.5 }}><td>Status / Progress viết khác kiểu (in_progress, ON-TRACK…)</td><td>khớp luật quy đổi sẵn có</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{S.nStatus}</td></tr>
          </tbody>
        </table>
        {sm && r && (
          <div className="cmp">
            <div className="cmph"><b>Trước – sau</b><span>{r.code} · {RAW_LABEL[sm.k] || sm.k} · {sm.n} chỗ</span><span className="sp" />
              <button className="btn sm" disabled={!k} onClick={() => F.setCleanIdx(-1)}>‹</button><span className="cmpn">{k + 1}/{S.samples.length}</span>
              <button className="btn sm" disabled={k >= S.samples.length - 1} onClick={() => F.setCleanIdx(1)}>›</button></div>
            <div className="cmpb">
              <div><div className="cmpl">Gốc trong file Jira</div><pre className="perawt">{r.raw![sm.k]}</pre></div>
              <div><div className="cmpl">Vào báo cáo</div>
                <div className="cmpo">{sm.k === 'comment' ? <RiskText text={after} /> : after.split('\n').map((l, i) => <div key={i} className="pl">{l}</div>)}</div></div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
export const FmtFoot = () => (
  <>
    <span className="ckfmsg"><b className="o">Không chặn xuất</b> · chạy tự động mỗi lần nhập file</span>
    <button className="btn" onClick={() => F.setChk('chkTab', 'val')}>← Quy đổi giá trị</button>
    <button className="btn pri" onClick={() => F.setChk('chkTab', 'prj')}>Tiếp: Ghép dự án →</button>
  </>
);

/* ---------- 4 · Ghép dự án ---------- */
export function PrjTab({ s, rows, C: c }: TabProps) {
  const items = c.prj;
  const curI = items.find((x) => x.id === s.chkItem) || items[0];
  const codes = [...new Set(rows.map((r) => r.code))];
  const group = (sv: 'e' | 'w') => {
    const g = items.filter((x) => x.sev === sv);
    if (!g.length) return null;
    return (
      <div key={sv}>
        <div className="ckgrp">{sv === 'e' ? 'Chặn xuất' : 'Nên xử lý'} · {g.length}</div>
        {g.map((x) => <button key={x.id} className={'ckli' + (x === curI ? ' on' : '')} onClick={() => F.setChk('chkItem', x.id)}><span className={'dot2 ' + x.sev} /><span><b>{x.t}</b><small>{x.d}</small></span></button>)}
      </div>
    );
  };
  let det: React.ReactNode = null;
  if (!curI) det = <div className="ckempty" style={{ padding: 40 }}>Đã ghép xong {rows.length} dự án.</div>;
  else if (curI.id === 'orph') {
    det = <>
      <p className="ckp">Không ghép được vào dòng nào của mẫu. Chọn dòng cho từng issue, hoặc không đưa vào báo cáo.</p>
      <table className="cktb"><thead><tr><th style={{ width: 90 }}>Issue</th><th>Summary trên Jira</th><th style={{ width: 330 }}>Ghép vào</th></tr></thead>
        <tbody>{orphansLeft(s).map((o) => {
          const sg = SUG_ORPH[o.key];
          return (
            <tr key={o.key}><td className="mono">{o.key}</td><td>{o.sum}</td>
              <td><div className="ckpick">
                <select className="sel cksel" aria-label={'Gán ' + o.key} value="" onChange={(e) => F.assignOrphan(o.key, e.target.value)}>
                  <option value="">Chọn dòng…</option>{codes.concat(['Không đưa vào báo cáo']).map((x) => <option key={x}>{x}</option>)}
                </select>
                {sg && <button className="cksugb" onClick={() => F.useOrphanSuggestion(o.key)}>Đề xuất: {sg}</button>}
              </div></td></tr>
          );
        })}</tbody></table>
      <p className="cknote">Đề xuất dựa trên từ khoá trong Summary.</p>
    </>;
  } else if (curI.id === 'dup') {
    det = <>
      <p className="ckp">Dòng 34 và 35 của mẫu báo cáo cùng mã II.D.2.1. Issue trên Jira chỉ ghép được vào một dòng, dòng còn lại sẽ trống khi xuất.</p>
      <div className="ckopts">
        <button className="ckopt" onClick={() => F.dupFix('merge')}><b>Gộp thành 1 dòng</b><span className="rec2">Đề xuất</span><small>Giữ dòng 34, bỏ dòng 35 khi xuất. Không mất dữ liệu.</small></button>
        <button className="ckopt" onClick={() => F.dupFix('keep')}><b>Giữ cả 2 dòng, để dòng 35 trống</b><small>Giữ nguyên cấu trúc file mẫu.</small></button>
      </div>
    </>;
  } else if (curI.id === 'new') {
    det = <>
      <p className="ckp">Hai mã có trên Jira nhưng file mẫu chưa có dòng: <b>I.A.7.1</b>, <b>II.B.2.1</b>.</p>
      <div className="ckopts">
        <button className="ckopt" onClick={() => F.newCodes('added')}><b>Thêm 2 dòng vào bảng</b><span className="rec2">Đề xuất</span><small>Thông tin dự án lấy từ hệ thống nếu đã có; chưa có thì báo ở mục “chưa có trên hệ thống”.</small></button>
        <button className="ckopt" onClick={() => F.newCodes('skipped')}><b>Bỏ qua tuần này</b><small>Không đưa vào báo cáo tuần 3/11.</small></button>
      </div>
    </>;
  } else if (curI.id === 'sys') {
    det = <>
      <p className="ckp">Các mã này có trên Jira nhưng chưa có trên Dữ liệu hệ thống, nên cột A–H và O–W sẽ trống (trừ đơn vị nếu khớp mảng việc).</p>
      <table className="cktb"><tbody>{missingCat(s, rows).map((r) => (
        <tr key={r.code}><td className="mono" style={{ width: 90 }}>{r.code}</td><td>{r.task}</td>
          <td style={{ textAlign: 'right' }}>{s.reqs.some((q) => q.type === 'new' && q.code === r.code && q.status === 'pending')
            ? <span className="ckmut">Đã gửi yêu cầu</span> : <button className="btn sm pri" onClick={() => C.openNewRequest(r.code)}>Yêu cầu tạo trên hệ thống</button>}</td></tr>
      ))}</tbody></table>
    </>;
  } else if (curI.id === 'label') {
    det = <>
      <p className="ckp">Mã dự án thuộc một nhóm nhưng Labels trên Jira ghi nhóm khác.</p>
      <table className="cktb"><tbody>{rows.filter(labelBad).map((r) => <tr key={r.code}><td className="mono" style={{ width: 90 }}>{r.code}</td><td>mã thuộc <b>{r.g}</b> · Labels ghi <b>{labelGroup(r)}</b></td></tr>)}</tbody></table>
      <div className="ckopts"><button className="ckopt" onClick={F.labelOk}><b>Giữ nhóm theo mã</b><span className="rec2">Đề xuất</span><small>Bỏ qua Labels, xếp theo mã ở đầu Summary.</small></button></div>
    </>;
  }
  return (
    <>
      <div className="cklist">{group('e')}{group('w')}{!items.length && <div className="ckempty">Không còn việc nào.</div>}</div>
      <section className="ckmain">
        {curI && <div className="cktool"><span className={'sev2 ' + curI.sev}>{curI.sev === 'e' ? 'Chặn xuất' : 'Nên xử lý'}</span><b className="ckh2">{curI.t}</b></div>}
        <div className="ckscroll">{det}</div>
      </section>
    </>
  );
}
export const PrjFoot = ({ C: c }: { C: Cnt }) => (
  <>
    <span className="ckfmsg">{c.prjE ? <><b className="e">Còn {c.prjE} việc chặn xuất</b>{c.prjW ? ` · ${c.prjW} việc nên xử lý có thể để sau` : ''}</> : c.prjW ? `${c.prjW} việc nên xử lý có thể để sau` : <b className="o">Đã ghép xong</b>}</span>
    <button className="btn" onClick={() => F.setChk('chkTab', 'fmt')}>← Làm sạch nội dung</button>
    <button className="btn pri" onClick={() => F.setChk('chkTab', 'done')} disabled={!!(c.col || c.prjE)} title={c.col || c.prjE ? 'Còn việc chặn xuất' : undefined}>Xong bước kiểm tra →</button>
  </>
);

/* ---------- 5 · Tổng kết ---------- */
export function DoneTab({ s, rows, C: c }: TabProps) {
  const block = c.col + c.prjE;
  const warn = c.val + c.prjW;
  let aiTodo = 0; let man = 0;
  const noRep = rows.filter((r) => !r.w3Done && !r.ovr.w3Done).length;
  rows.forEach((r) => s.fields.forEach((f) => {
    if (f.kind === 'ai' && f.required && !r.ai[f.id]) aiTodo++;
    if (f.kind !== 'ai' && f.required && f.src !== UNASSIGNED && cellValue(s, r, f) === null) man++;
  }));
  const cols = chkCols(s);
  return (
    <section className="ckmain">
      <div className="ckscroll ckdone">
        <div className={'ckbig ' + (block ? 'e' : 'o')}>{block ? '!' : '✓'}</div>
        <h2>{block ? `Còn ${block} việc chặn xuất` : 'Dữ liệu tuần 3/11 đã sạch'}</h2>
        <p className="ckmut">{rows.length} dự án đã ghép · {cols.length - c.col}/{cols.length} cột Jira có nguồn · luật quy đổi đã lưu cho tuần sau</p>
        {warn > 0 && <div className="ckbox"><div className="lbl">Còn để sau · không chặn xuất</div><ul>
          {c.val > 0 && <li>{c.val} giá trị Jira chưa quy đổi</li>}{c.prj.filter((x) => x.sev === 'w').map((x) => <li key={x.id}>{x.t}</li>)}</ul></div>}
        <div className="ckbox gray"><div className="lbl">Việc tiếp theo ở bước 3</div><p>{aiTodo} ô AI chưa soạn · {man} ô bắt buộc còn trống{noRep ? ` · ${noRep} dự án chưa có Progress report tuần này` : ''}</p></div>
      </div>
    </section>
  );
}
export const DoneFoot = ({ C: c }: { C: Cnt }) => (
  <>
    <span className="ckfmsg" />
    <button className="btn" onClick={() => F.setChk('chkTab', 'prj')}>← Xem lại các quyết định</button>
    <button className="btn pri" onClick={() => F.goStep(3)} disabled={!!(c.col + c.prjE)}>Tiếp: Điền & duyệt →</button>
  </>
);

