/* SVG nét mảnh của prototype v4 dùng ở khung vỏ và các màn bản gọn (topBar, tabs, fIco, srcIcon, PV_ICON_EXPAND…). */
import type { ReactNode } from 'react';
import type { Field } from '@/types';

type P = { size?: number };
const line = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/* ---------- thanh trên ---------- */
export const IcCal = (): JSX.Element => (
  <svg className="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
export const IcChevDown = (): JSX.Element => (
  <svg className="cv" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);
export const IcWkChev = ({ d }: { d: -1 | 1 }): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...line} strokeWidth="2.2" aria-hidden="true"><path d={d < 0 ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'} /></svg>
);
export const IcNav = ({ d }: { d: -1 | 1 }): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...line} strokeWidth="2.2" aria-hidden="true"><path d={d < 0 ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>
);
export const IcHelp = (): JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" /><circle cx="12" cy="17.3" r=".6" fill="currentColor" /></svg>
);
export const IcFlask = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" /><path d="M7.5 15h9" /></svg>
);
export const IcTheme = ({ dark }: { dark: boolean }): JSX.Element => dark ? (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
) : (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
);

/* ---------- thanh trái ---------- */
const rail = (children: ReactNode): JSX.Element => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{children}</svg>;
export const RAIL_ICONS = {
  grid: rail(<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M9 9.5v10" /></>),
  ai: rail(<><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>),
  ver: rail(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  log: rail(<path d="M5 6h14M5 12h14M5 18h9" />)
};

/* ---------- file ---------- */
/** Nhãn loại file (fIco): CSV / XLSX xanh lá. */
export function FileIcon({ kind }: { kind: 'csv' | 'xls' }): JSX.Element {
  const tag = kind === 'csv' ? 'CSV' : 'XLSX';
  return (
    <span className="fico" aria-hidden="true">
      <svg viewBox="-2 0 30 34" width="28" height="32">
        <path d="M3 1.5h15l8.5 8.5v21a2 2 0 0 1-2 2h-21.5a2 2 0 0 1-2-2v-27.5a2 2 0 0 1 2-2z" fill="var(--bg)" stroke="var(--line)" />
        <path d="M18 1.5v6.5a2 2 0 0 0 2 2h6.5" fill="none" stroke="var(--line)" />
        {kind !== 'csv' ? <path d="M7 13h14M7 17h14M7 21h14M12 13v8" stroke="#9CC9AE" strokeWidth="1" /> : <path d="M7 14h11M7 18h14" stroke="#C8C6CC" strokeWidth="1.4" />}
        <rect x="-1" y="23" width={tag.length * 5.6 + 6} height="9" rx="2" fill="#1E7B45" />
        <text x="2" y="30" fontSize="7" fontWeight="700" fill="#fff" fontFamily="var(--font)">{tag}</text>
      </svg>
    </span>
  );
}
/** Biểu tượng file lớn ở ô kéo thả (ICON_FILE). */
export const IcUpload = (): JSX.Element => (
  <svg width="54" height="54" viewBox="0 0 54 54" fill="none" aria-hidden="true"><rect x="10" y="5" width="30" height="40" rx="5" fill="var(--bg)" stroke="var(--accentLine)" strokeWidth="2" /><path d="M17 16h16M17 23h16M17 30h9" stroke="var(--accentLine)" strokeWidth="2" strokeLinecap="round" /><circle cx="38" cy="38" r="11" fill="var(--accent)" /><path d="M38 43v-9m0 0l-4 4m4-4l4 4" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const IcExpand = (): JSX.Element => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...line} strokeWidth="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
);
export const IcClose = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const IcDoc = ({ size = 12 }: P): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>
);
export const IcSearch = (): JSX.Element => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
);
/** Icon nét của bảng tóm tắt cột (impStats `ic`). */
export const IcStroke = ({ d, size = 16 }: P & { d: 'jira' | 'arrow' }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...line} strokeWidth="2" aria-hidden="true">
    {d === 'jira' ? <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 9h6M9 13h6M9 17h3" /></> : <path d="M5 12h14M13 6l6 6-6 6" />}
  </svg>
);

/* ---------- nguồn dữ liệu của cột (srcIcon) ---------- */
const SRC_P: Record<string, ReactNode> = {
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  jira: <path d="M12 4v10m0 0-4-4m4 4 4-4M5 19h14" />,
  bucket: <path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" />,
  calc: <path d="M18 5H6l6 7-6 7h12" />,
  ai: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />,
  report: <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5M9 13h6M9 17h6" />,
  tpl: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 10h16M10 4v16" /></>,
  past: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  future: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  manual: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
  opts: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 10 4 4 4-4" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8m-3 3 3 3" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></>
};
const KIND_SHORT: Record<string, string> = { cfg: 'hệ thống', jira: 'Jira', bucket: 'Jira · gom nhóm', calc: 'tự tính', ai: 'AI soạn', report: 'Progress Report', tpl: 'theo mẫu', past: 'tuần đã chốt', future: 'tuần chưa tới', none: '' };
/** Nhãn ngắn của loại nguồn (KIND_SHORT). */
export const kindShort = (f: Pick<Field, 'key' | 'kind' | 'opts'>): string =>
  f.key ? 'khoá ghép' : KIND_SHORT[f.kind] || (f.opts ? 'chọn danh sách' : 'nhập tay');

export function SrcIcon({ f, un = false }: { f: Pick<Field, 'key' | 'kind' | 'opts'>; un?: boolean }): JSX.Element | null {
  if (!un && !f.key && f.kind === 'none') return null;
  const k = un ? 'alert' : f.key ? 'key' : f.kind === 'cfg' ? 'lock' : SRC_P[f.kind] && f.kind !== 'manual' ? f.kind : f.opts ? 'opts' : 'manual';
  const color = un ? 'var(--err)' : f.kind === 'ai' ? 'var(--ai)' : '';
  const tip = un ? 'Chưa khớp với trường Jira' : f.kind === 'cfg' ? 'Hệ thống · không sửa trực tiếp trên bảng, gửi yêu cầu để chỉnh' : kindShort(f);
  return (
    <svg className="fsi" width="12" height="12" viewBox="0 0 24 24" {...line} strokeWidth="2" role="img" aria-label={tip} style={color ? { color } : undefined}>
      <title>{tip}</title>{SRC_P[k]}
    </svg>
  );
}
