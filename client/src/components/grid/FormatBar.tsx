import { useEffect, useState } from 'react';
import { FIELDS, FILL_COLORS, OVR_RAW, TEXT_COLORS } from '@/data/constants';
import { KIND_NAME, ck, cellValue, fieldOf, isSrc, locked, optsFor, visibleFields } from '@/lib/cell';
import { nFilters, refOf, rowOrder, selKeys } from '@/lib/grid';
import { useAppState, useRows } from '@/hooks/useDerived';
import { aiStart, approveSelectedRows, openBuckets, reviewSelectedRows, setMenu, startReview, toggle } from '@/store/actions/flow';
import * as G from '@/store/actions/grid';
import { mutate } from '@/store';
import { SearchIcon } from '../common/Icons';
import { CellEditor } from './CellEditor';

const Swatches = ({ list, fill, onPick }: { list: (string | null)[]; fill: boolean; onPick: (c: string | null) => void }) => (
  <div className="sw8">
    {list.map((c, k) => (
      <button key={k} className="swc" onClick={() => onPick(c)} title={c || 'Mặc định'} aria-label={c || 'Mặc định'}
        style={c ? (fill ? { background: c } : { background: 'var(--bg)', color: c }) : { background: 'var(--bg)', color: 'var(--mut)' }}>
        {c ? (fill ? '' : 'A') : '⊘'}
      </button>
    ))}
  </div>
);

/** Thanh định dạng kiểu Excel: ô địa chỉ, B/I/U/S, màu, xuống dòng, ô sửa giá trị, tìm, lọc, chọn cột. */
export function FormatBar() {
  const s = useAppState();
  const sel = s.sel;
  const f = sel ? fieldOf(s, sel.f) : null;
  const r = sel ? s.allRows[sel.i] : null;
  const dis = !sel;
  const order = rowOrder(s);
  const vf = visibleFields(s);
  const nHidden = s.fields.length - vf.length;

  /* ô địa chỉ: hiện địa chỉ ô đang chọn, gõ để nhảy tới ô khác */
  const refText = (() => {
    if (!sel || !f || !r) return '—';
    if (!s.range) return refOf(r, f);
    const a = s.range.a; const b = s.range.b;
    return `${fieldOf(s, a.f).col}${order.indexOf(a.i) + 3}:${fieldOf(s, b.f).col}${order.indexOf(b.i) + 3} · ${selKeys(s).length} ô`;
  })();
  const [ref, setRef] = useState(refText);
  useEffect(() => setRef(refText), [refText]);

  const fmtOf = (k: string) => (s.fmt[k] || {});
  const allHave = (prop: 'b' | 'i' | 'u' | 's') => { const ks = selKeys(s); return ks.length > 0 && ks.every((x) => fmtOf(x)[prop]); };
  const tb = (prop: 'b' | 'i' | 'u' | 's', label: string, aria: string, style?: React.CSSProperties) => (
    <button className={'tbtn' + (sel && allHave(prop) ? ' on' : '')} onClick={() => G.setFmt(prop)} title={aria} aria-label={aria} disabled={dis} style={style}>{label}</button>
  );
  const cur = sel ? fmtOf(ck(sel.i, sel.f)) : {};

  /* giá trị / chỗ sửa */
  let val: React.ReactNode;
  if (!sel || !f || !r) val = <span style={{ color: 'var(--mut)' }}>Chọn một ô để sửa hoặc định dạng · nhấp đúp để sửa tại ô</span>;
  else if (s.range) {
    const hasPending = selKeys(s).some((x) => { const p = x.split('|'); const d = s.allRows[+p[0]].ai[p[1]]; return d && !d.ok; });
    val = <><span style={{ color: 'var(--mut)' }}>Đang chọn nhiều ô — định dạng sẽ áp cho cả vùng.</span>
      {hasPending && <button className="btn sm" onClick={() => startReview(selKeys(s))}>Duyệt từng ô trong vùng →</button>}</>;
  } else if (f.kind === 'future') val = <span style={{ color: 'var(--mut)' }}>{f.col} · khối tuần chưa tới — để trống khi xuất.</span>;
  else if (f.kind === 'none') val = <span style={{ color: 'var(--mut)' }}>Cột X trong mẫu không có tên — giữ trống.</span>;
  else if (locked(f)) val = <>
    <span className="lbl" style={{ flex: 'none' }}>{f.col + (f.key ? ' · khoá ghép dòng' : ' · đã chốt')}</span>
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cellValue(s, r, f) || ''}</span>
    <span style={{ fontSize: 10.5, color: 'var(--mut2)', whiteSpace: 'nowrap' }}>{f.key ? 'không sửa · bấm để mở chi tiết dự án' : 'giữ nguyên khi xuất, không sửa'}</span>
  </>;
  else {
    const d0 = f.kind === 'ai' ? r.ai[f.id] : null;
    const ov0 = r.ovr[f.id];
    const has = !!optsFor(f);
    val = <>
      <span className="lbl" style={{ flex: 'none', color: f.kind === 'ai' ? 'var(--ai)' : undefined }}>
        {f.col} · {f.kind === 'manual' && f.opts ? 'chọn từ danh sách' : KIND_NAME[f.kind]}{d0 ? (d0.ok ? ' · đã duyệt' : ' · nháp') : ''}{OVR_RAW[f.id] ? ' · Jira: ' + (r[OVR_RAW[f.id]] as string) : ''}
      </span>
      <CellEditor s={s} r={r} f={f} className={has ? 'sel' : 'inp'} style={has ? undefined : { flex: '1 1 auto', minWidth: 80 }} onCommit={(v) => G.setCell(r.i, f.id, v)} />
      {d0 && !d0.ok && <button className="btn sm pri" onClick={G.approveSel}>Duyệt</button>}
      {d0 && d0.why && <span style={{ fontSize: 10.5, color: 'var(--mut2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>Căn cứ: {d0.why}</span>}
      {f.kind === 'ai' && !d0 && <span style={{ fontSize: 10.5, color: 'var(--mut2)', whiteSpace: 'nowrap' }}>tự gõ, hoặc bấm “Nhờ AI soạn”</span>}
      {ov0
        ? <><span style={{ fontSize: 10.5, color: 'var(--wrn)', whiteSpace: 'nowrap' }}>đã sửa tay</span><button className="btn sm" onClick={G.revertSel}>Khôi phục theo nguồn</button></>
        : isSrc(f) && <span style={{ color: 'var(--mut2)', font: '400 10.5px var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{f.src}</span>}
    </>;
  }

  return (
    <div className="fbar gut">
      <input id="refbox" className="refin" value={ref} onChange={(e) => setRef(e.target.value)} spellCheck={false} autoComplete="off" aria-label="Ô địa chỉ"
        title="Gõ địa chỉ ô (AT12) hoặc mã dự án rồi Enter · Ctrl+G"
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (G.gotoRef(ref)) e.currentTarget.blur(); }
          else if (e.key === 'Escape') { setRef(refText); e.currentTarget.blur(); }
          e.stopPropagation();
        }} />
      <span className="vsep" />
      {tb('b', 'B', 'In đậm (Ctrl+B)', { fontWeight: 800 })}
      {tb('i', 'I', 'In nghiêng (Ctrl+I)', { fontStyle: 'italic', fontFamily: 'Georgia,serif' })}
      {tb('u', 'U', 'Gạch chân (Ctrl+U)', { textDecoration: 'underline' })}
      {tb('s', 'S', 'Gạch ngang', { textDecoration: 'line-through' })}
      <span className="mwrap">
        <button className="tbtn" onClick={() => setMenu('color')} title="Màu chữ" aria-label="Màu chữ" disabled={dis}>
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
            <b style={{ fontSize: 13 }}>A</b><span style={{ width: 15, height: 3, borderRadius: 2, marginTop: 2, background: cur.color || 'var(--ink)' }} />
          </span><span style={{ fontSize: 9, color: 'var(--mut2)' }}>▾</span>
        </button>
        {s.menu === 'color' && <div className="menu" data-stop="1"><div className="lbl">Màu chữ</div><Swatches list={TEXT_COLORS} fill={false} onPick={(c) => G.setFmt('color', c)} /></div>}
      </span>
      <span className="mwrap">
        <button className="tbtn" onClick={() => setMenu('fill')} title="Màu nền ô" aria-label="Màu nền ô" disabled={dis}>
          <span style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--line)', background: cur.fill || 'var(--bg)' }} /><span style={{ fontSize: 9, color: 'var(--mut2)' }}>▾</span>
        </button>
        {s.menu === 'fill' && <div className="menu" data-stop="1"><div className="lbl">Màu nền ô</div><Swatches list={FILL_COLORS} fill onPick={(c) => G.setFmt('fill', c)} /></div>}
      </span>
      <button className="tbtn" onClick={() => G.setFmt('clear')} title="Xoá định dạng" aria-label="Xoá định dạng" disabled={dis} style={{ fontSize: 11.5, padding: '0 8px' }}>Xoá ĐD</button>
      <button className={'tbtn' + (sel && s.wrap[sel.f] ? ' on' : '')} onClick={G.toggleWrapCols} title="Xuống dòng trong ô — áp cho cả cột đang chọn" aria-label="Xuống dòng trong ô" disabled={dis} style={{ fontSize: 11.5, padding: '0 8px' }}>↵ Xuống dòng</button>
      <span className="vsep" />
      <div className="fxval">{val}</div>
      <div className="gtools">
        <button className={'gfind' + (s.find.open ? ' on' : '')} onClick={G.openFind} title="Tìm trong bảng (Ctrl+F)"><SearchIcon />{s.find.q ? s.find.q : 'Tìm trong bảng'}<kbd>Ctrl F</kbd></button>
        {nFilters(s) > 0 && <button className="chip sortchip" onClick={G.clearAllFilters} title="Bỏ mọi bộ lọc cột" style={{ borderColor: 'var(--accent)', color: 'var(--accentDk)' }}>Đang lọc {nFilters(s)} cột ×</button>}
        {s.sort && <button className="chip sortchip" onClick={() => G.sortCol('', 0)} title="Bỏ sắp xếp">Sắp xếp {fieldOf(s, s.sort.f).col} {s.sort.dir > 0 ? '↑' : '↓'} ×</button>}
        <button className="chip" onClick={() => toggle('onlyFix')} style={{ cursor: 'pointer', height: 30, ...(s.onlyFix ? { background: 'var(--ink)', color: 'var(--bg)', borderColor: 'var(--ink)' } : {}) }}>Chỉ dòng cần sửa</button>
        <button className="chip" onClick={() => openBuckets(s.bucketCol)} style={{ cursor: 'pointer', height: 30 }}>Rổ gom{s.unsorted.length ? ' · ' + s.unsorted.length : ''}</button>
      </div>
      {nHidden > 0 && <button className="chip" onClick={() => G.colPreset('all')} title={`${nHidden} cột đang ẩn — bấm để hiện lại`} style={{ cursor: 'pointer', height: 30, borderColor: 'var(--accentLine)', color: 'var(--accentDk)' }}>{nHidden} cột ẩn</button>}
      <span className="mwrap">
        <button className="btn sm" onClick={() => setMenu('cols')} aria-haspopup="true" aria-expanded={s.menu === 'cols'}>▦ Cột · {vf.length}/{FIELDS.length}</button>
        {s.menu === 'cols' && <ColsMenu />}
      </span>
    </div>
  );
}

function ColsMenu() {
  const s = useAppState();
  const chip = (p: 'all' | 'week' | 'review' | 'info' | 'jira', t: string) => <button className="chip" onClick={() => G.colPreset(p)} style={{ cursor: 'pointer' }}>{t}</button>;
  return (
    <div className="menu r" data-stop="1" style={{ width: 280 }}>
      <div className="lbl">Xem nhanh</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '7px 0 10px' }}>
        {chip('all', 'Đủ 49 cột')}{chip('week', 'Tuần này')}{chip('review', 'Cột cần rà')}{chip('info', 'Thông tin dự án')}{chip('jira', 'Chỉ cột từ Jira')}
      </div>
      <div className="lbl" style={{ marginBottom: 4 }}>Cột hiển thị</div>
      <div style={{ maxHeight: 'min(420px,55vh)', overflow: 'auto' }}>
        {s.fields.map((c) => {
          const on = c.key || !s.hidden[c.id];
          return (
            <button key={c.id} className="colrow" onClick={() => G.hideCol(c.id, true)} role="checkbox" aria-checked={!!on} disabled={c.key}>
              <span className={'cb' + (on ? ' on' : '')}>{on ? '✓' : ''}</span>
              <span style={{ font: '500 10px var(--mono)', color: 'var(--mut2)', width: 20 }}>{c.col}</span>
              <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--mut2)' }}>{c.key ? 'luôn hiện' : KIND_NAME[c.kind]}</span>
            </button>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--line2)', marginTop: 8, paddingTop: 8 }}>
        <button className="colrow" onClick={G.togglePin} role="checkbox" aria-checked={s.pinTask}>
          <span className={'cb' + (s.pinTask ? ' on' : '')}>{s.pinTask ? '✓' : ''}</span>Ghim cột Công việc khi cuộn ngang
        </button>
      </div>
    </div>
  );
}

/** Thanh chọn dòng / gợi ý AI phía dưới thanh định dạng. */
export function SelBar() {
  const s = useAppState();
  const rows = useRows();
  const sr = rows.filter((r) => s.rowSel[r.i]);
  const pendIn = (list: typeof rows) => list.reduce((n, r) => n + (['riskLevel', 'w3Plan', 'w3Issues'] as const).filter((k) => r.ai[k] && !r.ai[k]!.ok).length, 0);
  if (sr.length) {
    const pend = pendIn(sr);
    const noDraft = sr.filter((r) => (['riskLevel', 'w3Plan', 'w3Issues'] as const).some((k) => !r.ai[k])).length;
    const all = sr.length === rows.length;
    return (
      <div className="selbar pick gut" role="region" aria-label="Dự án đang chọn">
        <b>Đã chọn {all ? 'tất cả ' : ''}{sr.length} dự án</b>
        <span style={{ color: 'var(--ink2)' }}>{pend ? `${pend} ô AI chờ duyệt (AC, AS, AT)` : 'không còn ô AI nào chờ duyệt'}</span>
        <div style={{ flex: '1 1 10px' }} />
        {noDraft > 0 && <button className="btn sm" onClick={aiStart}>Nhờ AI soạn cho {noDraft} dự án chưa có nháp</button>}
        {pend > 0 && <>
          <button className="btn sm" onClick={reviewSelectedRows}>Duyệt từng ô trong {sr.length} dự án →</button>
          <button className="btn sm pri" onClick={approveSelectedRows}>✓ Duyệt {all ? 'tất cả ' : ''}{pend} ô của {sr.length} dự án</button>
        </>}
        <button className="btn sm" onClick={G.clearRowSel}>Bỏ chọn</button>
      </div>
    );
  }
  const p = pendIn(rows);
  if (!p) {
    let n = 0; let rr = 0;
    rows.forEach((r) => { const c = (['riskLevel', 'w3Plan', 'w3Issues'] as const).filter((k) => !r.ai[k] && cellValue(s, r, fieldOf(s, k)) === null).length; n += c; if (c) rr++; });
    if (!s.loaded || !n) return null;
    return (
      <div className="aisug gut" role="status"><span className="ic" aria-hidden="true">✦</span>
        <span style={{ flex: '1 1 300px' }}><b>{n} ô</b> AI soạn nháp được cho {rr} dự án <span style={{ color: 'var(--mut)' }}>· Vấn đề & rủi ro, Kế hoạch tuần sau, Mức độ rủi ro — bạn duyệt trước khi ghi vào báo cáo</span></span>
        <button className="btn aib" onClick={aiStart}>✦ Nhờ AI soạn</button>
      </div>
    );
  }
  return (
    <div className="selbar gut" role="status">
      <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: 6, background: 'var(--ai)', color: '#fff', alignItems: 'center', justifyContent: 'center', font: '700 10px var(--font)' }}>AI</span>
      <b style={{ color: 'var(--ai)' }}>{p} ô nháp AI chờ duyệt</b>
      <span style={{ color: 'var(--ink2)' }}>Chỉ ô đã duyệt mới được ghi vào báo cáo.</span>
      <div style={{ flex: '1 1 10px' }} />
      <span style={{ color: 'var(--mut)', fontSize: 12 }}>hoặc tick ô bên trái để duyệt cả dự án</span>
      <button className="btn" onClick={() => mutate((d) => { d.panel = 'ai'; })}>Xem theo dự án</button>
      <button className="btn pri" onClick={() => startReview()}>Duyệt từng ô →</button>
    </div>
  );
}

