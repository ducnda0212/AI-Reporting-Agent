import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const;

export const Logo = () => <img src="/logo.png" alt="" width="28" height="28" />;
export const Calendar = () => (
  <svg className="ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const Chevron = () => (
  <svg className="cv" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);
export const Help = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6" /><circle cx="12" cy="17.3" r=".6" fill="currentColor" />
  </svg>
);
export const Sparkle = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" /></svg>
);
export const SparkleOne = (p: P) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /></svg>
);
export const EyeOff = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5" /><path d="M6.3 6.3C4.3 7.6 2.8 9.6 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </svg>
);
export const FilterIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 4h18l-7 8.5V20l-4-2v-5.5z" /></svg>
);
export const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);

/** Biểu tượng thanh trái (rail). */
export const RailIcon = ({ name }: { name: 'grid' | 'exec' | 'rid' | 'ver' | 'log' | 'cat' | 'iss' | 'ai' | 'note' | 'tlib' }) => {
  switch (name) {
    case 'grid': return <svg viewBox="0 0 24 24" {...base}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M9 9.5v10" /></svg>;
    case 'exec': return <svg viewBox="0 0 24 24" {...base}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M9 12h6M9 15.5h6" /></svg>;
    case 'rid': return <svg viewBox="0 0 24 24" {...base}><path d="M12 3.5l7.5 3v5.5c0 4.3-3.2 7.6-7.5 8.5-4.3-.9-7.5-4.2-7.5-8.5V6.5z" /><path d="M12 8.5v4.5M12 15.8v.4" /></svg>;
    case 'ver': return <svg viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case 'log': return <svg viewBox="0 0 24 24" {...base}><path d="M5 6h14M5 12h14M5 18h9" /></svg>;
    case 'cat': return <svg viewBox="0 0 24 24" {...base}><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>;
    case 'iss': return <svg viewBox="0 0 24 24" {...base}><path d="M12 3.5 21 19.5H3z" /><path d="M12 10v4M12 16.8v.4" /></svg>;
    case 'ai': return <Sparkle />;
    case 'note': return <svg viewBox="0 0 24 24" {...base}><path d="M5 4.5h14v11l-4 4H5z" /><path d="M15 19.5v-4h4M8.5 9h7M8.5 12.5h4" /></svg>;
    case 'tlib': return <svg viewBox="0 0 24 24" {...base} strokeLinejoin="round"><rect x="4" y="6.5" width="12" height="14" rx="2" /><path d="M8 3.5h10a2 2 0 0 1 2 2V17" /><path d="M7 11h6M7 14.5h6" /></svg>;
  }
};

export const Sun = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
);
export const Moon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);

const FILE_TAG = { xls: ['XLSX', '#1E7B45'], csv: ['CSV', '#1E7B45'], ver: ['XLSX', '#1E7B45'] } as const;

/** Biểu tượng loại file (XLSX/CSV) hoặc loại tài nguyên (db/cfg) cho danh sách "Đã sẵn sàng". */
export const FileTypeIcon = ({ kind }: { kind: 'xls' | 'csv' | 'ver' | 'db' | 'cfg' }) => {
  if (kind === 'xls' || kind === 'csv' || kind === 'ver') {
    const [label, color] = FILE_TAG[kind];
    return (
      <span className="fico" aria-hidden="true">
        <svg viewBox="-2 0 30 34" width="28" height="32">
          <path d="M3 1.5h15l8.5 8.5v21a2 2 0 0 1-2 2h-21.5a2 2 0 0 1-2-2v-27.5a2 2 0 0 1 2-2z" fill="var(--bg)" stroke="var(--line)" />
          <path d="M18 1.5v6.5a2 2 0 0 0 2 2h6.5" fill="none" stroke="var(--line)" />
          {kind !== 'csv' ? <path d="M7 13h14M7 17h14M7 21h14M12 13v8" stroke="#9CC9AE" strokeWidth="1" /> : <path d="M7 14h11M7 18h14" stroke="#C8C6CC" strokeWidth="1.4" />}
          <rect x="-1" y="23" width={label.length * 5.6 + 6} height="9" rx="2" fill={color} />
          <text x="2" y="30" fontSize="7" fontWeight="700" fill="#fff" fontFamily="var(--font)">{label}</text>
        </svg>
      </span>
    );
  }
  return (
    <span className={'fico t ' + kind} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {kind === 'db'
          ? <><ellipse cx="10" cy="5" rx="7" ry="2.6" /><path d="M3 5v10c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V5M3 10c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" /></>
          : <><path d="M3 5h8M15 5h2M3 10h2M9 10h8M3 15h10M17 15h0" /><circle cx="13" cy="5" r="2" /><circle cx="7" cy="10" r="2" /><circle cx="15" cy="15" r="2" /></>}
      </svg>
    </span>
  );
};

/** Biểu tượng nét mảnh cho mục Kiểm tra (col/val/fmt/prj) và 10 nhóm rủi ro (C1–C10). */
const ICP: Record<string, ReactNode> = {
  col: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9.5 4.5v15M15 4.5v15" /></>,
  val: <path d="M4 8.5h13l-3.5-3.5M20 15.5H7l3.5 3.5" />,
  fmt: <><path d="M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6z" /><path d="M18 15l.7 1.8 1.8.7-1.8.7L18 20l-.7-1.8-1.8-.7 1.8-.7z" /></>,
  prj: <><path d="M10 14l4-4" /><path d="M8.5 11.5l-2 2a3 3 0 0 0 4.2 4.2l2-2M15.5 12.5l2-2a3 3 0 0 0-4.2-4.2l-2 2" /></>,
  C1: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><path d="M16 6.5h4.5M16 10h4.5" /></>,
  C2: <><path d="M7 3.5h7l4 4V20.5H7z" /><path d="M14 3.5v4h4M9.5 16.5c1-1.5 1.8-1.5 2.5 0s1.5 1.5 2.5 0" /></>,
  C3: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2M10 3.5h4" /></>,
  C4: <><circle cx="8.5" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.5" /><path d="M3 19c.5-3 2.6-4.8 5.5-4.8S13.5 16 14 19M15 14.6c2.6-.3 4.6 1.1 5.4 4.4" /></>,
  C5: <><path d="M12 3.5l7 3v5.5c0 4.3-3 7.6-7 8.5-4-.9-7-4.2-7-8.5V6.5z" /><path d="M9 12l2 2 4-4" /></>,
  C6: <><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><path d="M7.5 7h.01M7.5 17h.01" /></>,
  C7: <><path d="M9.5 14.5l5-5" /><path d="M11 6.5l1.5-1.5a3.5 3.5 0 0 1 5 5L16 11.5M13 17.5l-1.5 1.5a3.5 3.5 0 0 1-5-5L8 12.5" /></>,
  C8: <path d="M4 19.5h16M6.5 16V11M11 16V7M15.5 16v-6M19 16V5" />,
  C9: <><path d="M12 3.5l1.6 4.4 4.4 1.6-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6z" /><path d="M5 19.5h14" /></>,
  C10: <><rect x="4.5" y="3.5" width="15" height="17" rx="2" /><path d="M8 8.5h8M8 12h8M8 15.5h5" /></>,
};
export const Ico = ({ k, size = 18 }: { k: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICP[k] || ICP.C10}</svg>
);

/** Nhãn file nhỏ: PDF đỏ, Word xanh dương, Excel xanh lá. */
const TAG = { pdf: ['PDF', '#C4302B'], docx: ['DOC', '#2B5BB8'], xlsx: ['XLS', '#1E7B45'] } as const;
export const FileTag = ({ kind }: { kind: string }) => {
  const [label, color] = TAG[kind as keyof typeof TAG] || (['FILE', '#6B6B72'] as const);
  return (
    <svg viewBox="0 0 20 24" width="16" height="19" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M2.5 1h10l5.5 5.5V21a2 2 0 0 1-2 2H2.5a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="var(--bg)" stroke="var(--line)" />
      <path d="M12.5 1v4.5a1 1 0 0 0 1 1H18" fill="none" stroke="var(--line)" />
      <rect x="0" y="12.5" width="15" height="7" rx="1.5" fill={color} />
      <text x="7.5" y="18" fontSize="5.2" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="var(--font)">{label}</text>
    </svg>
  );
};

export const WeekChevron = ({ dir }: { dir: -1 | 1 }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={dir < 0 ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'} /></svg>
);
