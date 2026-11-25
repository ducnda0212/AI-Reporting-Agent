/* Khung soạn ô bật ra #pe (prototype peCard L6792, pePreview L6820, peSync L6827, peFormat L6833, peSave L6848,
   phím trong #peText L7043, vị trí placeLayers L7059). Mở khi nhấp đúp / F2 / gõ chữ vào ô chữ. Lớp nổi ngoài .gridwrap. */
import { useEffect, useRef, useState } from 'react';
import { fieldById, isSrc, refOf } from '@/lib/cell';
import { CLEAN_RULES, cleanText, ruleCounts } from '@/lib/clean';
import { useAppState } from '@/store';
import { peClose, peSave, peSetAuto, peToggleRaw } from '@/store/actions/grid';
import type { AiFieldId } from '@/types';
import { LvlPill, RISK_F, RiskText } from '@/components/common/RiskText';

const KIND_NAME: Record<string, string> = { jira: 'Jira', bucket: 'rổ gom', calc: 'tính toán', report: 'progress report', tpl: 'có sẵn trong mẫu' };
type Fmt = 'bul' | 'num' | 'sub' | 'risk' | 'prop' | 'clean';
const sv = (d: JSX.Element): JSX.Element => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const IC: Record<Fmt, JSX.Element> = {
  bul: sv(<><circle cx="4.5" cy="6" r="1.3" fill="currentColor" /><circle cx="4.5" cy="12" r="1.3" fill="currentColor" /><circle cx="4.5" cy="18" r="1.3" fill="currentColor" /><path d="M9 6h11M9 12h11M9 18h11" /></>),
  num: sv(<><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 4.5h1.5V9M4 9h3" strokeWidth="1.5" /><path d="M3.8 14.2c.3-.6.9-.9 1.5-.9.8 0 1.4.5 1.4 1.2 0 1.2-2.9 1.9-2.9 3.5h3" strokeWidth="1.5" /></>),
  sub: sv(<><path d="M3 5h18M11 10h10M11 14h10M3 19h18" /><path d="M3 9.5l3.5 2.5L3 14.5" /></>),
  risk: sv(<><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></>),
  prop: sv(<path d="M5 12h13M13 6l6 6-6 6" />),
  clean: sv(<><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" /></>)
};

/** Gạch đầu dòng / đánh số / thụt ý con / nhãn Rủi ro / Đề xuất cho các dòng đang chọn (bấm lại thì bỏ). */
function peFormat(kind: Exclude<Fmt, 'clean'>, v: string, s: number, e: number): { v: string; a: number; b: number } {
  const ls = v.lastIndexOf('\n', s - 1) + 1; let le = v.indexOf('\n', e); if (le < 0) le = v.length;
  const block = v.slice(ls, le).split('\n');
  const pre = { bul: () => '• ', num: (k: number) => k + 1 + '. ', sub: () => '   – ', risk: () => 'Rủi ro: ', prop: () => '→ Đề xuất: ' }[kind];
  const strip = (l: string): string => l.replace(/^\s*(•|–|-|\*|\d{1,2}[.)]|→\s*đề xuất:|→|rủi ro:)\s*/i, '');
  const all = block.every((l) => !l.trim() || l.indexOf(pre(0).trim()) === 0 || (kind === 'num' && /^\d{1,2}\.\s/.test(l)) || (kind === 'sub' && /^\s+–\s/.test(l)));
  let k = 0, nb = block.map((l) => (!l.trim() ? l : all ? strip(l) : pre(k++) + strip(l))).join('\n');
  if (kind === 'prop' && block.length === 1 && !block[0].trim()) nb = '→ Đề xuất: ';
  return { v: v.slice(0, ls) + nb + v.slice(le), a: ls, b: ls + nb.length };
}

export function PECard(): JSX.Element | null {
  const key = useAppState((x) => (x.pe && x.view === 'grid' ? x.pe.i + '|' + x.pe.f : null));
  return key ? <PEBody key={key} /> : null;
}

function PEBody(): JSX.Element {
  const s = useAppState((x) => x), P = s.pe!, r = s.allRows[P.i], f = fieldById(P.f)!, d = f.kind === 'ai' ? r.ai[f.id as AiFieldId] : undefined;
  const [val, setVal] = useState(P.val), ref = useRef<HTMLDivElement>(null), ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = ta.current; if (!t) return;
    t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  }, []);
  useEffect(() => {
    const pe = ref.current; if (!pe) return;
    const cell = document.querySelector('.cell.sel'), W = pe.offsetWidth, H = pe.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let x = (vw - W) / 2, y = Math.max(60, (vh - H) / 2);
    if (cell) {
      const c = cell.getBoundingClientRect();
      x = Math.min(Math.max(12, c.left), vw - W - 12);
      y = c.bottom + 6 + H > vh - 8 ? Math.max(56, c.top - H - 6) : c.bottom + 6;
      if (y < 56) y = Math.max(56, vh - H - 12);
    }
    pe.style.left = x + 'px'; pe.style.top = y + 'px';
  }, [P.raw]);

  const raw = r.raw?.[P.f], rc = raw ? ruleCounts(raw) : {}, cnt = raw ? CLEAN_RULES.reduce((n, x) => n + (rc[x.k] || 0), 0) : 0;
  const risky = RISK_F.includes(f.id), lines = val.split('\n').filter((x) => x.trim()).length, willChange = P.auto && cleanText(val) !== val.trim();
  const pv = P.auto ? cleanText(val) : val;
  const fmt = (k: Fmt): void => {
    const t = ta.current; if (!t) return;
    if (k === 'clean') { setVal(cleanText(t.value)); return; }
    const o = peFormat(k, t.value, t.selectionStart, t.selectionEnd);
    setVal(o.v);
    requestAnimationFrame(() => { t.focus(); t.setSelectionRange(o.a, o.b); });
  };
  const tb = (k: Fmt, tip: string, label = ''): JSX.Element => (
    <button className={'ptb' + (k === 'clean' ? ' cl' : '')} data-act="peFmt" data-k={k} title={tip} aria-label={tip} onMouseDown={(e) => e.preventDefault()} onClick={() => fmt(k)}>{IC[k]}{label}</button>
  );
  const chip = f.kind === 'ai' ? <span className="pchip ai">{d ? (d.ok ? 'AI · đã duyệt' : 'AI · nháp chờ duyệt') : 'AI · chưa soạn'}</span>
    : <span className="pchip">{isSrc(f) ? (r.ovr[f.id] ? 'Đã sửa tay' : 'Từ ' + KIND_NAME[f.kind]) : 'Nhập tay'}</span>;

  return (
    <div className="pe" id="pe" role="dialog" aria-label={'Soạn ô ' + f.name} data-stop="1" ref={ref}>
      <div className="peh">
        <span className="peref">{refOf(r, f)}</span>
        <div className="pet"><b>{f.name}</b><small>{r.ma + ' · ' + r.viec}</small></div>
        {chip}
        <button className="fbtn x" data-act="peClose" aria-label="Đóng (Esc)" title="Đóng (Esc)" onClick={peClose}>×</button>
      </div>
      {raw && <>
        <div className="peraw"><span>✦ Đã làm sạch <b>{cnt + ' chỗ'}</b> so với bản gốc trên Jira</span><button className="flink" data-act="peRaw" onClick={() => peToggleRaw(val)}>{P.raw ? 'Ẩn bản gốc' : 'Xem bản gốc'}</button></div>
        {P.raw && <pre className="perawt">{raw}</pre>}
      </>}
      {d && d.why && <div className="pewhy">{'Căn cứ: ' + d.why}</div>}
      <div className="petb">
        {tb('bul', 'Gạch đầu dòng (Ctrl+B)')}{tb('num', 'Đánh số 1, 2, 3')}{tb('sub', 'Thụt vào thành ý con')}<span className="tbsep" />
        {risky && <>{tb('risk', 'Thêm nhãn Rủi ro cho dòng', 'Rủi ro')}{tb('prop', 'Thêm dòng đề xuất', 'Đề xuất')}</>}
        <span className="sp" />{tb('clean', 'Chuẩn hoá ngay: gạch đầu dòng, khoảng trắng, ký hiệu wiki', 'Làm gọn')}
      </div>
      <textarea id="peText" ref={ta} className="peta" rows={Math.min(12, Math.max(4, lines + 2))} spellCheck={false} aria-label="Nội dung ô" value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (e.key === 'Enter' && mod) { e.preventDefault(); peSave(val); }
          else if (e.key === 'Escape') { e.preventDefault(); peClose(); }
          else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); fmt('bul'); }
        }} />
      <div className="pepv">
        <div className="pepvh"><span>Xem trước khi vào báo cáo</span>{risky && <span className="pelg"><i className="rdot" />chữ đỏ = có rủi ro</span>}</div>
        <div className="pepvb" id="pePrev">
          {!pv.trim() ? <div className="pl none" style={{ color: 'var(--mut2)' }}>(ô trống)</div>
            : f.id === 'rui' ? <LvlPill v={pv.trim()} />
              : risky ? <RiskText text={pv} /> : pv.split('\n').map((l, k) => <div key={k} className="pl">{l || '\u00a0'}</div>)}
        </div>
      </div>
      <div className="pef">
        <label className="fopt"><input type="checkbox" data-act="peAuto" checked={P.auto} onChange={(e) => peSetAuto(e.target.checked)} />Tự làm gọn khi lưu</label>
        <span className="pecnt" id="peCnt">{lines + ' dòng · ' + val.length + ' ký tự' + (willChange ? ' · sẽ làm gọn' : '')}</span><span className="sp" />
        <button className="btn sm" data-act="peClose" title="Esc" onClick={peClose}>Huỷ</button>
        <button className={'btn sm ' + (d && !d.ok ? 'ai' : 'pri')} data-act="peSave" title="Ctrl+Enter" onClick={() => peSave(val)}>{d && !d.ok ? 'Lưu & duyệt' : 'Lưu'} <span className="pek2">⌃↵</span></button>
      </div>
    </div>
  );
}
