import { useEffect, useLayoutEffect, useRef } from 'react';
import { RISK_F, cleanText } from '@/lib/text';
import { CLEAN_RULES, ruleCounts } from '@/lib/text';
import { KIND_NAME, fieldOf, isSrc } from '@/lib/cell';
import { refOf } from '@/lib/grid';
import { formatLines, type PeKind } from '@/lib/peFormat';
import { useStore } from '@/store';
import * as G from '@/store/actions/grid';
import { LvlPill, RiskText } from '../common/RiskText';

/** Khung soạn ô bật ra cạnh ô đang chọn: gạch đầu dòng, làm gọn, xem trước tô đỏ rủi ro. */
export function PECard() {
  const s = useStore((x) => x);
  const P = s.pe;
  const ta = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const shown = !!P && s.view === 'grid';

  useLayoutEffect(() => {
    if (!shown || !card.current) return;
    const pe = card.current;
    const cell = document.querySelector('.cell.sel');
    const W = pe.offsetWidth; const H = pe.offsetHeight; const vw = window.innerWidth; const vh = window.innerHeight;
    let x = (vw - W) / 2; let y = Math.max(60, (vh - H) / 2);
    if (cell) {
      const c = cell.getBoundingClientRect();
      x = Math.min(Math.max(12, c.left), vw - W - 12);
      y = c.bottom + 6 + H > vh - 8 ? Math.max(56, c.top - H - 6) : c.bottom + 6;
      if (y < 56) y = Math.max(56, vh - H - 12);
    }
    pe.style.left = x + 'px'; pe.style.top = y + 'px';
  }, [shown, P?.i, P?.f]);
  useEffect(() => {
    if (shown && ta.current) { ta.current.focus(); ta.current.setSelectionRange(ta.current.value.length, ta.current.value.length); }
  }, [shown, P?.i, P?.f]);

  if (!P || !shown) return null;
  const r = s.allRows[P.i];
  const f = fieldOf(s, P.f);
  const d = f.kind === 'ai' ? r.ai[f.id] : null;
  const raw = r.raw && r.raw[P.f];
  const cnt = raw ? CLEAN_RULES.reduce((n, x) => n + (ruleCounts(raw)[x.k] || 0), 0) : 0;
  const risky = RISK_F.includes(f.id);
  const lines = (P.val || '').split('\n').filter((x) => x.trim()).length;
  const willChange = P.auto && cleanText(P.val) !== P.val.trim();
  const preview = P.auto ? cleanText(P.val) : P.val;
  const srcChip = f.kind === 'ai'
    ? <span className="pchip ai">{d ? (d.ok ? 'AI · đã duyệt' : 'AI · nháp chờ duyệt') : 'AI · chưa soạn'}</span>
    : isSrc(f) ? <span className="pchip">{r.ovr[f.id] ? 'Đã sửa tay' : 'Từ ' + KIND_NAME[f.kind]}</span> : <span className="pchip">Nhập tay</span>;

  const fmt = (kind: PeKind) => {
    const t = ta.current;
    if (!t) return;
    const out = formatLines(t.value, t.selectionStart, t.selectionEnd, kind);
    G.setPEVal(out.value);
    requestAnimationFrame(() => { t.focus(); t.setSelectionRange(out.start, out.end); });
  };
  const tb = (kind: PeKind, label: string, tip: string) => (
    <button className="ptb" title={tip} aria-label={tip} onMouseDown={(e) => e.preventDefault()} onClick={() => fmt(kind)}>{label}</button>
  );
  return (
    <div className="pe" id="pe" ref={card} role="dialog" aria-label={'Soạn ô ' + f.name} data-stop="1">
      <div className="peh">
        <span className="peref">{refOf(r, f)}</span>
        <div className="pet"><b>{f.name}</b><small>{r.code} · {r.task}</small></div>{srcChip}
        <button className="fbtn x" onClick={G.closePE} aria-label="Đóng (Esc)" title="Đóng (Esc)">×</button>
      </div>
      {raw && <>
        <div className="peraw"><span>✦ Đã làm sạch <b>{cnt} chỗ</b> so với bản gốc trên Jira</span><button className="flink" onClick={G.togglePERaw}>{P.raw ? 'Ẩn bản gốc' : 'Xem bản gốc'}</button></div>
        {P.raw && <pre className="perawt">{raw}</pre>}
      </>}
      {d && d.why && <div className="pewhy">Căn cứ: {d.why}</div>}
      <div className="petb">
        {tb('bul', '• Đầu dòng', 'Gạch đầu dòng cho các dòng đang chọn (Ctrl+B)')}{tb('num', '1. Số', 'Đánh số các dòng đang chọn')}{tb('sub', '– Ý con', 'Thụt vào thành ý con')}
        {risky && <>{tb('risk', 'Rủi ro:', 'Thêm nhãn Rủi ro cho dòng')}{tb('prop', '→ Đề xuất', 'Thêm dòng đề xuất')}</>}
        <span className="sp" />{tb('clean', '✦ Làm gọn', 'Chuẩn hoá ngay: gạch đầu dòng, khoảng trắng, ký hiệu wiki')}
      </div>
      <textarea ref={ta} id="peText" className="peta" rows={Math.min(12, Math.max(4, lines + 2))} spellCheck={false} aria-label="Nội dung ô" value={P.val}
        onChange={(e) => G.setPEVal(e.target.value)}
        onKeyDown={(e) => {
          const mod = e.ctrlKey || e.metaKey;
          if (e.key === 'Enter' && mod) { e.preventDefault(); G.savePE(e.currentTarget.value); }
          else if (e.key === 'Escape') { e.preventDefault(); G.closePE(); }
          else if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); fmt('bul'); }
          e.stopPropagation();
        }} />
      <div className="pepv">
        <div className="pepvh"><span>Xem trước khi vào báo cáo</span>{risky && <span className="pelg"><i className="rdot" />chữ đỏ = có rủi ro</span>}</div>
        <div className="pepvb" id="pePrev">
          {!String(preview).trim() ? <div className="pl none" style={{ color: 'var(--mut2)' }}>(ô trống)</div>
            : f.id === 'riskLevel' ? <LvlPill value={preview.trim()} />
              : risky ? <RiskText text={preview} />
                : String(preview).split('\n').map((l, i) => <div key={i} className="pl">{l || ' '}</div>)}
        </div>
      </div>
      <div className="pef">
        <label className="fopt"><input type="checkbox" checked={P.auto} onChange={(e) => G.setPEAuto(e.target.checked)} />Tự làm gọn khi lưu</label>
        <span className="pecnt" id="peCnt">{lines} dòng · {(P.val || '').length} ký tự{willChange ? ' · sẽ làm gọn' : ''}</span><span className="sp" />
        <button className="btn sm" onClick={G.closePE} title="Esc">Huỷ</button>
        <button className={'btn sm ' + (d && !d.ok ? 'ai' : 'pri')} onClick={() => G.savePE(ta.current?.value ?? P.val)} title="Ctrl+Enter">
          {d && !d.ok ? 'Lưu & duyệt' : 'Lưu'} <span className="pek2">⌃↵</span>
        </button>
      </div>
    </div>
  );
}
