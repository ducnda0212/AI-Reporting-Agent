/* Thanh định dạng kiểu Excel .fbar (prototype fbar L3994 sau các vòng góp ý: R3 L11376 bỏ câu gợi ý, ô hệ thống chỉ xem
   "col · Jira"; R6 L11670 "hệ thống" → "Jira"; R7 L11690 dải Khối cột chuyển vào menu Cột; lite: không có nút Rổ gom),
   căn lề alignBtn L10261, chip ✦ AI agChip L11398, chip ⚠ Dòng cần sửa fixChip L9565 + R34 L11393, menu Cột. */
import type { CSSProperties } from 'react';
import { FIELDS, GRP } from '@/data/constants';
import { cellValue, ck, fieldById, isSrc, locked, refOf } from '@/lib/cell';
import { needsFix, selKeys, tplColor, visibleFields } from '@/lib/grid';
import { rowsOf, useAppState } from '@/store';
import { setPanel } from '@/store/actions/flow';
import { pendingList, startReview } from '@/store/actions/ai';
import {
  approveSel, colPreset, findOpen, fltClearAll, gotoRef, gridOrder, grpTog, revertCell, setAlign, setFmt, setMenu, sortClear, toggleCol,
  toggleOnlyFix, togglePin, toggleWrap
} from '@/store/actions/grid';
import type { AiFieldId, AppState, CellFormat, FieldGroup } from '@/types';
import { CellEditor } from './CellEditor';

const TEXT_COLORS = [null, '#B91C1C', '#C2410C', '#A16207', '#15803D', '#1D4ED8', '#6D28D9', '#C9276D'];
const FILL_COLORS = [null, '#FEF3C7', '#FEE2E2', '#FFEDD5', '#DCFCE7', '#DBEAFE', '#EDE9FE', '#FCE7F3'];
/* KIND_NAME L3991, "hệ thống" đổi thành "Jira" (R6) */
const KIND_NAME: Record<string, string> = { jira: 'Jira', bucket: 'rổ gom', calc: 'tính toán', manual: 'nhập tay', cfg: 'Jira', ai: 'AI', report: 'progress report', tpl: 'có sẵn trong mẫu', past: 'đã chốt', future: 'chưa tới', none: 'không dùng' };
const OVR_RAW: Record<string, 'rawStatus' | 'rawProgress'> = { tt: 'rawStatus', td: 'rawProgress' };
const GT_LBL: Partial<Record<FieldGroup, string>> = { info: 'Thông tin', prog: 'Tiến độ', org: 'Đơn vị & NS', eval: 'Phân loại', w1: 'T01/11', w2: 'T02/11', w3: 'T3/11', w4: 'T4/11' };
const MUT = { color: 'var(--mut)' };
const NOTE = { fontSize: 10.5, color: 'var(--mut2)', whiteSpace: 'nowrap' } as const;

/** Màu nhận diện của khối cột: màu đầu cột (theo file mẫu) gặp nhiều nhất trong khối. */
function gtColor(g: FieldGroup): string | null {
  const m: Record<string, number> = {};
  let best: string | null = null;
  FIELDS.forEach((f) => { if (f.grp !== g) return; const c = tplColor(f); if (c === 'var(--bg)') return; m[c] = (m[c] || 0) + 1; if (!best || m[c] > m[best]) best = c; });
  return best;
}

export function AgIc({ s = 14 }: { s?: number }): JSX.Element {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg>;
}

const ALG: Record<string, string> = {
  l: 'M4 6h16M4 10h10M4 14h16M4 18h10', c: 'M4 6h16M7 10h10M4 14h16M7 18h10', r: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  t: 'M4 4h16M12 8v12M8 12l4-4 4 4', m: 'M4 12h16M12 3v5M12 16v5M9 6l3 2 3-2M9 18l3-2 3 2', b: 'M4 20h16M12 4v12M8 12l4 4 4-4'
};
const AlgIc = ({ k }: { k: string }): JSX.Element => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ALG[k]} /></svg>;

function AlignBtn({ s, dis }: { s: AppState; dis: boolean }): JSX.Element {
  const open = s.menu === 'align', cur: CellFormat = s.sel ? s.fmt[ck(s.sel.i, s.sel.f)] || {} : {};
  const it = (p: 'ha' | 'va', v: string, k: string, t: string): JSX.Element => {
    const on = (p === 'ha' ? cur.ha || 'left' : cur.va || 'middle') === v;
    return <button key={v} className={'albtn' + (on ? ' on' : '')} data-act="fmtAlign" data-p={p} data-v={v} title={t} aria-label={t} onClick={() => setAlign(p, v)}><AlgIc k={k} /></button>;
  };
  return (
    <span className="mwrap">
      <button className="tbtn" data-act="menu" data-m="align" title="Căn lề trong ô" aria-label="Căn lề trong ô" disabled={dis} aria-expanded={open} onClick={() => setMenu('align')}>
        <AlgIc k={cur.ha === 'center' ? 'c' : cur.ha === 'right' ? 'r' : 'l'} /><span style={{ fontSize: 9, color: 'var(--mut2)' }}>▾</span>
      </button>
      {open && (
        <div className="menu almenu" data-stop="1">
          <div className="allbl">Căn ngang</div><div className="alrow">{it('ha', 'left', 'l', 'Căn trái')}{it('ha', 'center', 'c', 'Căn giữa')}{it('ha', 'right', 'r', 'Căn phải')}</div>
          <div className="allbl">Căn dọc</div><div className="alrow">{it('va', 'top', 't', 'Căn trên')}{it('va', 'middle', 'm', 'Căn giữa')}{it('va', 'bottom', 'b', 'Căn dưới')}</div>
        </div>
      )}
    </span>
  );
}

function Swatches({ list, prop }: { list: (string | null)[]; prop: 'color' | 'fill' }): JSX.Element {
  return (
    <div className="sw8">
      {list.map((c) => (
        <button key={c || '0'} className="swc" data-act={prop === 'fill' ? 'fmtFill' : 'fmtColor'} data-v={c || ''} title={c || 'Mặc định'} aria-label={c || 'Mặc định'}
          style={c ? (prop === 'fill' ? { background: c } : { background: 'var(--bg)', color: c }) : { background: 'var(--bg)', color: 'var(--mut)' }}
          onClick={() => { setFmt(prop, c); setMenu(null); }}>
          {c ? (prop === 'fill' ? '' : 'A') : '⊘'}
        </button>
      ))}
    </div>
  );
}

/** Menu "▦ Cột": Cấu hình mẫu, Xem nhanh, Khối cột, 49 cột ẩn/hiện, ghim cột Công việc. */
function ColsMenu({ s }: { s: AppState }): JSX.Element {
  const preset = (p: Parameters<typeof colPreset>[0], t: string): JSX.Element => <button className="chip" data-act="colPreset" data-p={p} style={{ cursor: 'pointer' }} onClick={() => colPreset(p)}>{t}</button>;
  return (
    <div className="menu r" data-stop="1" style={{ width: 280 }}>
      <button className="btn sm" data-act="tvPanel" style={{ width: '100%', marginBottom: 10 }} onClick={() => { setPanel(s.panel === 'tvcfg' ? null : 'tvcfg'); setMenu(null); }}>Cấu hình mẫu: số tuần, cột, phiên bản…</button>
      <div className="lbl">Xem nhanh</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '7px 0 10px' }}>
        {preset('all', 'Đủ 49 cột')}{preset('week', 'Tuần này')}{preset('review', 'Cột cần rà')}{preset('info', 'Thông tin dự án')}{preset('jira', 'Chỉ cột từ Jira')}
      </div>
      <div className="lbl">Khối cột</div>
      <div className="gtgm">
        <div className="gtg" role="group" aria-label="Ẩn hoặc hiện cả khối cột">
          {(Object.keys(GT_LBL) as FieldGroup[]).map((g) => {
            const fs = FIELDS.filter((f) => f.grp === g && !f.key); if (!fs.length) return null;
            const hid = fs.filter((f) => s.hidden[f.id]).length, on = hid < fs.length, part = !!hid && on, col = gtColor(g);
            return (
              <button key={g} className={'gtb' + (col ? ' tc' : '') + (on ? ' on' : '') + (part ? ' part' : '')} style={col ? ({ '--gtc': col } as CSSProperties) : undefined}
                data-act="grpTog" data-g={g} aria-pressed={on} title={GRP[g] + ' · ' + (fs.length - hid) + '/' + fs.length + ' cột đang hiện — bấm để ' + (on ? 'ẩn' : 'hiện') + ' cả khối'} onClick={() => grpTog(g)}>
                {GT_LBL[g]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="lbl" style={{ marginBottom: 4 }}>Cột hiển thị</div>
      <div style={{ maxHeight: 'min(420px,55vh)', overflow: 'auto' }}>
        {FIELDS.map((c) => {
          const on = !!c.key || !s.hidden[c.id];
          return (
            <button key={c.id} className="colrow" data-act="toggleCol" data-f={c.id} role="checkbox" aria-checked={on} disabled={!!c.key} onClick={() => toggleCol(c.id)}>
              <span className={'cb' + (on ? ' on' : '')}>{on ? '✓' : ''}</span>
              <span style={{ font: '500 10px var(--mono)', color: 'var(--mut2)', width: 20 }}>{c.col}</span>
              <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <span style={{ fontSize: 10.5, color: 'var(--mut2)' }}>{c.key ? 'luôn hiện' : KIND_NAME[c.kind]}</span>
            </button>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--line2)', marginTop: 8, paddingTop: 8 }}>
        <button className="colrow" data-act="pin" role="checkbox" aria-checked={s.pinViec} onClick={togglePin}>
          <span className={'cb' + (s.pinViec ? ' on' : '')}>{s.pinViec ? '✓' : ''}</span>Ghim cột Công việc khi cuộn ngang
        </button>
      </div>
    </div>
  );
}

/** Nội dung ô .fxval theo ô đang chọn. */
function FxVal({ s, keys }: { s: AppState; keys: string[] }): JSX.Element | null {
  const c = s.sel; if (!c) return null;
  if (s.range) {
    const pend = keys.some((x) => { const [i, f] = x.split('|'), a = s.allRows[+i].ai[f as AiFieldId]; return a && !a.ok; });
    return <><span style={MUT}>Đang chọn nhiều ô — định dạng sẽ áp cho cả vùng.</span>{pend && <button className="btn sm" data-act="reviewRange" onClick={() => startReview(keys)}>Duyệt từng ô trong vùng →</button>}</>;
  }
  const f = fieldById(c.f)!, r = s.allRows[c.i];
  if (f.kind === 'future') return <span style={MUT}>{f.col + ' · khối tuần chưa tới — để trống khi xuất.'}</span>;
  if (f.kind === 'none') return <span style={MUT}>Cột X trong mẫu không có tên — giữ trống.</span>;
  const val = (t: string): JSX.Element => <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>;
  if (f.kind === 'cfg') return <><span className="lbl" style={{ flex: 'none' }}>{f.col + ' · Jira'}</span>{val(cellValue(r, f, s) || '')}</>;
  if (locked(f)) {
    return <><span className="lbl" style={{ flex: 'none' }}>{f.col + (f.key ? ' · khoá ghép dòng' : ' · đã chốt')}</span>{val(cellValue(r, f, s) || '')}
      <span style={NOTE}>{f.key ? 'không sửa · bấm để mở chi tiết dự án' : 'giữ nguyên khi xuất, không sửa'}</span></>;
  }
  const a = f.kind === 'ai' ? r.ai[f.id as AiFieldId] : undefined, ov = r.ovr[f.id], raw = OVR_RAW[f.id];
  return (
    <>
      <span className="lbl" style={{ flex: 'none', ...(f.kind === 'ai' ? { color: 'var(--ai)' } : {}) }}>
        {f.col + ' · ' + (f.kind === 'manual' && f.opts ? 'chọn từ danh sách' : KIND_NAME[f.kind]) + (a ? (a.ok ? ' đã duyệt' : ' nháp') : '') + (raw ? ' · Jira: ' + r[raw] : '')}
      </span>
      <CellEditor r={r} f={f} ctx={s} />
      {a && !a.ok && <button className="btn sm pri" data-act="approve" onClick={approveSel}>Duyệt</button>}
      {a && a.why && <span style={{ ...NOTE, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{'Căn cứ: ' + a.why}</span>}
      {f.kind === 'ai' && !a && <span style={NOTE}>tự gõ, hoặc bấm “Nhờ AI soạn”</span>}
      {ov ? <><span style={{ ...NOTE, color: 'var(--wrn)' }}>đã sửa tay</span><button className="btn sm" data-act="revert" onClick={revertCell}>Khôi phục theo nguồn</button></>
        : isSrc(f) && <span style={{ color: 'var(--mut2)', font: '400 10.5px var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{f.src}</span>}
    </>
  );
}

export function FormatBar(): JSX.Element {
  const s = useAppState((x) => x), c = s.sel, dis = !c;
  const vf = visibleFields(s.hidden), order = gridOrder(s), keys = selKeys(c, s.range, order, vf.map((f) => f.id));
  const f = c ? fieldById(c.f)! : null, r = c ? s.allRows[c.i] : null;
  const at = (x: { i: number; f: string }): string => fieldById(x.f)!.col + (order.indexOf(x.i) + 3);
  const ref = !c || !f || !r ? '—' : s.range ? at(s.range.a) + ':' + at(s.range.b) + ' · ' + keys.length + ' ô' : refOf(r, f);
  const allHave = (p: keyof CellFormat): boolean => !!keys.length && keys.every((x) => s.fmt[x]?.[p]);
  const tb = (p: 'b' | 'i' | 'u' | 's', label: string, aria: string, style: CSSProperties): JSX.Element => (
    <button className={'tbtn' + (c && allHave(p) ? ' on' : '')} data-act="fmt" data-p={p} title={aria} aria-label={aria} disabled={dis} style={style} onClick={() => setFmt(p)}>{label}</button>
  );
  const cur: CellFormat = c ? s.fmt[ck(c.i, c.f)] || {} : {};
  const rows = rowsOf(s), nFix = rows.filter((x) => needsFix(x, s)).length, nPend = pendingList(s).length, aiOn = s.panel === 'ai';
  const nFilters = Object.keys(s.colFilter).length, nHidden = FIELDS.length - vf.length;

  return (
    <div className="fbar gut">
      <input key={ref} id="refbox" className="refin" defaultValue={ref} title="Gõ địa chỉ ô (AT12) hoặc mã dự án rồi Enter · Ctrl+G" aria-label="Ô địa chỉ" spellCheck={false} autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (gotoRef(e.currentTarget.value)) e.currentTarget.blur(); }
          else if (e.key === 'Escape') { e.currentTarget.value = ref; e.currentTarget.blur(); }
        }} />
      <span className="vsep" />
      {tb('b', 'B', 'In đậm (Ctrl+B)', { fontWeight: 800 })}
      {tb('i', 'I', 'In nghiêng (Ctrl+I)', { fontStyle: 'italic', fontFamily: 'Georgia,serif' })}
      {tb('u', 'U', 'Gạch chân (Ctrl+U)', { textDecoration: 'underline' })}
      {tb('s', 'S', 'Gạch ngang', { textDecoration: 'line-through' })}
      <span className="mwrap">
        <button className="tbtn" data-act="menu" data-m="color" title="Màu chữ" aria-label="Màu chữ" disabled={dis} onClick={() => setMenu('color')}>
          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}><b style={{ fontSize: 13 }}>A</b>
            <span style={{ width: 15, height: 3, borderRadius: 2, marginTop: 2, background: cur.color || 'var(--ink)' }} /></span>
          <span style={{ fontSize: 9, color: 'var(--mut2)' }}>▾</span>
        </button>
        {s.menu === 'color' && <div className="menu" data-stop="1"><div className="lbl">Màu chữ</div><Swatches list={TEXT_COLORS} prop="color" /></div>}
      </span>
      <span className="mwrap">
        <button className="tbtn" data-act="menu" data-m="fill" title="Màu nền ô" aria-label="Màu nền ô" disabled={dis} onClick={() => setMenu('fill')}>
          <span style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--line)', background: cur.fill || 'var(--bg)' }} />
          <span style={{ fontSize: 9, color: 'var(--mut2)' }}>▾</span>
        </button>
        {s.menu === 'fill' && <div className="menu" data-stop="1"><div className="lbl">Màu nền ô</div><Swatches list={FILL_COLORS} prop="fill" /></div>}
      </span>
      <button className={'tbtn' + (c && keys.every((x) => s.wrap[x]) ? ' on' : '')} data-act="wrapCol" title="Xuống dòng (wrap text) — chỉ áp cho ô đang chọn" aria-label="Xuống dòng trong ô" disabled={dis} style={{ fontSize: 15 }} onClick={() => toggleWrap()}>↵</button>
      <AlignBtn s={s} dis={dis} />
      <span className="vsep" />
      <div className="fxval"><FxVal s={s} keys={keys} /></div>
      <div className="gtools">
        <button className={'gfind' + (s.find.open ? ' on' : '')} data-act="findOpen" title="Tìm trong bảng (Ctrl+F)" onClick={findOpen}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          {s.find.q || 'Tìm trong bảng'}<kbd>Ctrl F</kbd>
        </button>
        {nFilters > 0 && <button className="chip sortchip" data-act="fltClearAll" title="Bỏ mọi bộ lọc cột" style={{ borderColor: 'var(--accent)', color: 'var(--accentDk)' }} onClick={fltClearAll}>{'Đang lọc ' + nFilters + ' cột ×'}</button>}
        {s.sort && <button className="chip sortchip" data-act="sortClear" title="Bỏ sắp xếp" onClick={sortClear}>{'Sắp xếp ' + fieldById(s.sort.f)!.col + ' ' + (s.sort.dir === 'asc' ? '↑' : '↓') + ' ×'}</button>}
        <button className={'xgchip aichip' + (aiOn ? ' on' : '')} data-act="panel" data-p={aiOn ? '' : 'ai'} title={'Mở Trợ lý AI · ' + nPend + ' ô nháp chờ duyệt'} onClick={() => setPanel(aiOn ? null : 'ai')}>
          <AgIc s={13} />AI{nPend > 0 && <em>{nPend}</em>}
        </button>
        {s.onlyFix ? <button className="fixchip on" data-act="toggle" data-k="onlyFix" title="Bấm để hiện lại mọi dòng" onClick={toggleOnlyFix}>Đang lọc dòng cần sửa<em>{nFix}</em> ×</button>
          : !nFix ? <span className="fixchip ok" title="Không có dòng nào còn lỗi hay ô bắt buộc trống">✓ Không dòng nào cần sửa</span>
            : <button className="fixchip sm" title="Dòng cần sửa: bấm để chỉ hiện các dòng còn lỗi hoặc ô bắt buộc trống" data-act="toggle" data-k="onlyFix" onClick={toggleOnlyFix}><span aria-hidden="true">⚠</span><span className="sr-only">Dòng cần sửa</span><em>{nFix}</em></button>}
      </div>
      {nHidden > 0 && (
        <button className="chip" data-act="colPreset" data-p="all" title={nHidden + ' cột đang ẩn — bấm để hiện lại'} style={{ cursor: 'pointer', height: 30, borderColor: 'var(--accentLine)', color: 'var(--accentDk)' }} onClick={() => colPreset('all')}>{nHidden + ' cột ẩn'}</button>
      )}
      <span className="mwrap">
        <button className="btn sm" data-act="menu" data-m="cols" aria-haspopup="true" aria-expanded={s.menu === 'cols'} onClick={() => setMenu('cols')}>{'▦ Cột · ' + vf.length + '/' + FIELDS.length}</button>
        {s.menu === 'cols' && <ColsMenu s={s} />}
      </span>
    </div>
  );
}
