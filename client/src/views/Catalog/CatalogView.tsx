import type { ReactNode } from 'react';
import { SYS_PEOPLE } from '@/data/constants';
import { fieldOf } from '@/lib/cell';
import { jiraDiffs, sysVal } from '@/lib/catalog';
import { catPeople, missingCat } from '@/lib/selectors';
import { useAppState, useRows } from '@/hooks/useDerived';
import { setView } from '@/store/actions/flow';
import * as C from '@/store/actions/catalog';

const Ro = ({ v }: { v?: string | null }) => (v ? <>{v}</> : <span style={{ color: 'var(--mut2)' }}>—</span>);
const shortName = (n: string) => n.split(' (')[0];

/** "Dữ liệu hệ thống": tra cứu dự án / đơn vị / nhân sự, yêu cầu sửa, độ lệch với báo cáo. */
export function CatalogView() {
  const s = useAppState();
  const rows = useRows();
  const c = s.cat;
  const tab = s.catTab || 'proj';
  const ppl = catPeople(s);
  const admin = s.catAdmin;
  const q = (s.catQ || '').trim();
  const hit = q && c.projects[q] ? q : null;
  const codeLike = /^[IVX]+\.[A-Z]\.\d+\.\d+$/.test(q);
  const nProj = Object.keys(c.projects).length;
  const nUnit = Object.keys(c.units).length;
  const pr = s.reqs.filter((x) => x.status === 'pending');
  const mc = s.loaded ? missingCat(s, rows) : [];
  const jd = s.loaded ? jiraDiffs(s, rows) : [];
  const roleName = (id: string) => { const f = fieldOf(s, id); return `${f.col} ${f.name}`; };
  const Tab = ({ id, t, n, warn }: { id: string; t: string; n: number; warn?: boolean }) => (
    <button className={'tab' + (tab === id ? ' on' : '')} onClick={() => C.setCatTab(id)}>{t} <span style={{ color: warn && n ? 'var(--wrn)' : 'var(--mut2)' }}>{n}</span></button>
  );

  let result: ReactNode = null;
  if (hit) {
    const groups: Array<[string, string[]]> = [['Thông tin dự án', ['objective', 'kpi', 'pic', 'start', 'end']], ['Đơn vị & nhân sự', ['divisionHead', 'department', 'deptHead', 'businessOwner', 'po', 'aiEngineer', 'aiResearcher', 'mlopsEngineer', 'softwareEngineer']]];
    const rq = s.reqs.filter((x) => x.code === hit && x.status === 'pending');
    result = (
      <div className="cres">
        <div className="creh"><span className="code">{hit}</span>
          <div className="tt"><Ro v={sysVal(s, hit, 'task')} /><div className="sb">Mảng: <Ro v={sysVal(s, hit, 'workstream')} /></div></div>
          {rq.length ? <span className="stpill w">{rq.length} yêu cầu đang chờ</span> : <span className="stpill nd">🔒 Chỉ xem</span>}</div>
        {groups.map((g) => (
          <div className="cgrp" key={g[0]}><div className="gt">{g[0]}</div>
            <div className="cflds">{g[1].map((id) => {
              const f = fieldOf(s, id); const wide = id === 'objective' || id === 'kpi';
              return <div key={id} className={'cfld' + (wide ? ' wide' : '')}><div className="l"><i>{f.col}</i>{shortName(f.name)}</div><div className="v" style={wide ? { fontWeight: 500 } : undefined}><Ro v={sysVal(s, hit, id)} /></div></div>;
            })}</div></div>
        ))}
        <div className="crf"><span style={{ fontSize: 11.5, color: 'var(--mut)', flex: '1 1 240px' }}>Thông tin sai hoặc cần đổi (vd đổi PIC)? Gửi yêu cầu để hệ thống cập nhật, rồi chạy lại báo cáo.</span>
          <button className="btn pri" onClick={() => C.openEditRequest(hit)}>Gửi yêu cầu sửa</button></div>
      </div>
    );
  } else if (q) {
    const sug = Object.keys(c.projects).filter((k) => k.toLowerCase().startsWith(q.toLowerCase())).slice(0, 8);
    result = (
      <div style={{ marginTop: 10, fontSize: 12.5 }}>
        {sug.length > 0 && <><span style={{ color: 'var(--mut)' }}>Mã gần đúng: </span>{sug.map((k) => <button key={k} className="chip" onClick={() => C.pickCatProject(k)} style={{ cursor: 'pointer', height: 27, margin: 2 }}>{k}</button>)}</>}
        {codeLike && !sug.length && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ color: 'var(--wrn)' }}>Mã {q} chưa có trên hệ thống.</span><button className="btn sm pri" onClick={() => C.openNewRequest(q)}>Yêu cầu tạo dự án</button></div>}
      </div>
    );
  }

  let content: ReactNode = null;
  if (tab === 'proj') {
    const gp: Record<string, string[]> = {};
    Object.keys(c.projects).forEach((k) => { (gp[c.projects[k].g] = gp[c.projects[k].g] || []).push(k); });
    const cols = ['task', 'pic', 'start', 'end', 'businessOwner', 'po', 'aiEngineer', 'aiResearcher', 'mlopsEngineer', 'softwareEngineer'];
    content = (
      <div className="card" style={{ overflowX: 'auto' }}><table className="tb catb">
        <thead><tr><th>Mã DA</th>{cols.map((id) => { const f = fieldOf(s, id); return <th key={id}><span style={{ color: 'var(--mut2)' }}>{f.col}</span> {shortName(f.name)}</th>; })}</tr></thead>
        <tbody>{Object.keys(gp).sort().flatMap((g) => {
          const u = c.units[g] || { name: g, divisionHead: '', department: '', deptHead: '' };
          return [
            <tr key={'g' + g}><td colSpan={cols.length + 1} style={{ background: 'var(--row)', fontWeight: 600 }}>{u.name || g} <span style={{ fontWeight: 400, color: 'var(--mut)' }}>· {[u.divisionHead, u.department, u.deptHead ? 'TP ' + u.deptHead : ''].filter(Boolean).join(' · ')}</span></td></tr>,
            ...gp[g].sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })).map((k) => (
              <tr key={k} className={'catrow' + (hit === k ? ' rsel' : '')} tabIndex={0} title={'Xem đủ thông tin ' + k} onClick={() => C.pickCatProject(k)} onKeyDown={(e) => e.key === 'Enter' && C.pickCatProject(k)}>
                <td className="mono" style={{ whiteSpace: 'nowrap' }}>{k}</td>
                {cols.map((id) => <td key={id} style={id === 'task' ? { minWidth: 200, whiteSpace: 'normal' } : { whiteSpace: 'nowrap' }}><Ro v={c.projects[k][id]} /></td>)}
              </tr>
            )),
          ];
        })}</tbody></table></div>
    );
  } else if (tab === 'unit') {
    content = (
      <div className="card" style={{ overflowX: 'auto' }}><table className="tb catb">
        <thead><tr><th>Mã</th><th><span style={{ color: 'var(--mut2)' }}>A</span> Mảng việc</th><th><span style={{ color: 'var(--mut2)' }}>O</span> GĐK QLTT</th><th><span style={{ color: 'var(--mut2)' }}>P</span> Phòng chịu trách nhiệm</th><th><span style={{ color: 'var(--mut2)' }}>Q</span> TP</th><th>Số dự án</th></tr></thead>
        <tbody>{Object.keys(c.units).sort().map((g) => {
          const u = c.units[g];
          return <tr key={g}><td className="mono">{g}</td><td style={{ minWidth: 220, whiteSpace: 'normal' }}>{u.name}</td><td><Ro v={u.divisionHead} /></td><td><Ro v={u.department} /></td><td><Ro v={u.deptHead} /></td><td>{Object.keys(c.projects).filter((k) => c.projects[k].g === g).length}</td></tr>;
        })}</tbody></table></div>
    );
  } else if (tab === 'ppl') {
    const roles: Record<string, string[]> = {};
    Object.keys(c.projects).forEach((k) => SYS_PEOPLE.forEach((id) => { const n = c.projects[k][id]; if (!n || id === 'deptHead') return; (roles[n] = roles[n] || []).push(shortName(fieldOf(s, id).name) + ' ' + k); }));
    Object.keys(c.units).forEach((g) => { const n = c.units[g].deptHead; if (n) (roles[n] = roles[n] || []).push('TP mảng ' + g); });
    content = (
      <div className="card" style={{ overflowX: 'auto' }}><table className="tb">
        <thead><tr><th>Họ tên</th><th>Số vai trò</th><th>Vai trò trong dự án</th></tr></thead>
        <tbody>{ppl.map((n) => { const rl = roles[n] || []; return <tr key={n}><td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{n}</td><td>{rl.length}</td><td style={{ whiteSpace: 'normal' }}>{rl.join(' · ')}</td></tr>; })}</tbody></table></div>
    );
  } else if (tab === 'req') {
    content = (
      <>
        {s.reqs.length ? (
          <div className="card" style={{ overflowX: 'auto' }}><table className="tb">
            <thead><tr><th>Gửi lúc</th><th>Mã DA</th><th>Nội dung</th><th>Lý do</th><th>Trạng thái</th>{admin && <th />}</tr></thead>
            <tbody>{s.reqs.slice().reverse().map((x) => (
              <tr key={x.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{x.at}</td><td className="mono">{x.code}</td>
                <td style={{ whiteSpace: 'normal' }}>{x.type === 'new' ? 'Tạo dự án mới' + (x.task ? ': ' + x.task : '') + (x.g ? ' · mảng ' + x.g : '')
                  : <>{roleName(x.field!)}: <s style={{ color: 'var(--mut)' }}>{x.from || '(trống)'}</s> → <b>{x.to}</b></>}</td>
                <td style={{ whiteSpace: 'normal', color: 'var(--mut)' }}>{x.reason || ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{x.status === 'pending' ? <span style={{ color: 'var(--wrn)' }}>Chờ hệ thống cập nhật</span>
                  : x.status === 'done' ? <span style={{ color: 'var(--ok)' }}>Đã cập nhật{x.run ? ' · đã vào báo cáo' : ' · chờ chạy lại báo cáo'}</span> : <span style={{ color: 'var(--mut)' }}>Từ chối</span>}</td>
                {admin && <td style={{ whiteSpace: 'nowrap' }}>{x.status === 'pending' && <><button className="btn sm pri" onClick={() => C.resolveRequest(x.id, true)}>Cập nhật hệ thống</button> <button className="btn sm" onClick={() => C.resolveRequest(x.id, false)}>Từ chối</button></>}</td>}
              </tr>
            ))}</tbody></table></div>
        ) : <div className="card" style={{ padding: 22, textAlign: 'center', fontSize: 12.5, color: 'var(--mut)' }}>Chưa có yêu cầu nào. Nhập Mã DA ở trên rồi bấm “Gửi yêu cầu sửa”.</div>}
        {!admin && pr.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--mut)' }}>Xem thử phía hệ thống: chuyển sang “Quản trị hệ thống” ở góc trên để cập nhật yêu cầu.</div>}
      </>
    );
  } else if (tab === 'diff') {
    content = (
      <div className="card" style={{ overflowX: 'auto' }}><table className="tb">
        <thead><tr><th>Mã DA</th><th>Lệch</th><th>Báo cáo đang dùng</th><th /></tr></thead>
        <tbody>
          {mc.map((r) => (
            <tr key={r.code}><td className="mono">{r.code}</td><td>Có trên Jira, chưa có trên hệ thống</td><td style={{ color: 'var(--wrn)' }}>Cột A–H, O–W trống (trừ đơn vị nếu khớp mảng)</td>
              <td>{s.reqs.some((x) => x.type === 'new' && x.code === r.code && x.status === 'pending') ? <span style={{ color: 'var(--wrn)' }}>Đã gửi yêu cầu</span> : <button className="btn sm pri" onClick={() => C.openNewRequest(r.code)}>Yêu cầu tạo</button>}</td></tr>
          ))}
          {jd.map((x) => (
            <tr key={x.r.code + x.id}><td className="mono">{x.r.code}</td><td>{roleName(x.id)}: Jira “{x.j}”</td><td>Hệ thống “{x.c}”</td>
              <td><button className="btn sm" onClick={() => C.openEditRequest(x.r.code, x.id, x.j)}>Báo hệ thống sửa theo Jira</button></td></tr>
          ))}
          {!mc.length && !jd.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--mut)' }}>Không có chỗ lệch.</td></tr>}
        </tbody></table></div>
    );
  }

  return (
    <div className="gridwrap gut" style={{ paddingBlock: 18 }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 340px', minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 4px' }}>Dữ liệu hệ thống · dự án, đơn vị, nhân sự</h1>
            <p style={{ fontSize: 12.5, color: 'var(--mut)', margin: 0 }}>Lưu sẵn trên hệ thống theo bảng mẫu (cột A–H, O–W). Nhập Mã DA là toàn bộ thông tin tự hiện ra; người lập báo cáo không sửa được. Muốn đổi (vd đổi PIC) thì gửi yêu cầu → hệ thống cập nhật → chạy lại báo cáo mới ra giá trị mới.</p>
          </div>
          <div className="seg" role="group" aria-label="Vai trò xem thử">
            <button className={!admin ? 'on' : ''} onClick={() => C.setCatAdmin(false)}>Người lập báo cáo</button>
            <button className={admin ? 'on' : ''} onClick={() => C.setCatAdmin(true)}>Quản trị hệ thống</button>
          </div>
          {s.loaded && <button className="btn" onClick={() => setView('grid')}>← Về bảng báo cáo</button>}
        </div>
        {admin && (
          <div className="card" style={{ padding: '11px 15px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', borderColor: '#bcd2f3', background: '#eef4fd', fontSize: 12.5 }}>
            <span style={{ flex: '1 1 300px' }}><b>Chế độ quản trị.</b> Nạp bảng mẫu, duyệt yêu cầu sửa.</span>
            <label className="btn sm" htmlFor="catFile">Nạp bảng mẫu (.xlsx)</label>
            <input id="catFile" type="file" accept=".xlsx" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => e.target.files?.[0] && C.importSysFile(e.target.files[0])} />
          </div>
        )}
        <div className="card" style={{ padding: '13px 15px' }}>
          <label className="lbl" htmlFor="catQ">Tra cứu theo Mã DA</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
            <div className="cq">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input className="inp" id="catQ" value={s.catQ} onChange={(e) => C.setCatQuery(e.target.value)} placeholder="VD I.A.3.1 — gõ đúng mã để hiện toàn bộ thông tin" autoComplete="off" />
            </div>
            {q && <button className="btn" onClick={() => C.setCatQuery('')} style={{ height: 38 }}>Xoá</button>}
          </div>
          {!q && <div style={{ fontSize: 11.5, color: 'var(--mut2)', marginTop: 7 }}>Hoặc bấm một dòng trong bảng bên dưới.</div>}
          {result}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Tab id="proj" t="Dự án" n={nProj} /><Tab id="unit" t="Mảng việc" n={nUnit} /><Tab id="ppl" t="Nhân sự" n={ppl.length} />
          <Tab id="req" t="Yêu cầu sửa" n={pr.length} warn />{s.loaded && <Tab id="diff" t="Lệch với báo cáo tuần" n={mc.length + jd.length} warn />}
        </div>
        {content}
      </div>
    </div>
  );
}
