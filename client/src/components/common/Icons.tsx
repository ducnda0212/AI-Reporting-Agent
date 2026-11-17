import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 } as const;

export const Logo = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
    <rect width="26" height="26" rx="7" fill="var(--accent)" />
    <path d="M7.5 18.5v-5M13 18.5v-11M18.5 18.5v-7.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
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
export const RailIcon = ({ name }: { name: 'grid' | 'exec' | 'ver' | 'log' | 'cat' | 'iss' | 'ai' | 'note' | 'cfg' }) => {
  switch (name) {
    case 'grid': return <svg viewBox="0 0 24 24" {...base}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M9 9.5v10" /></svg>;
    case 'exec': return <svg viewBox="0 0 24 24" {...base}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M9 12h6M9 15.5h6" /></svg>;
    case 'ver': return <svg viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case 'log': return <svg viewBox="0 0 24 24" {...base}><path d="M5 6h14M5 12h14M5 18h9" /></svg>;
    case 'cat': return <svg viewBox="0 0 24 24" {...base}><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>;
    case 'iss': return <svg viewBox="0 0 24 24" {...base}><path d="M12 3.5 21 19.5H3z" /><path d="M12 10v4M12 16.8v.4" /></svg>;
    case 'ai': return <Sparkle />;
    case 'note': return <svg viewBox="0 0 24 24" {...base}><path d="M5 4.5h14v11l-4 4H5z" /><path d="M15 19.5v-4h4M8.5 9h7M8.5 12.5h4" /></svg>;
    case 'cfg': return <svg viewBox="0 0 24 24" {...base}><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></svg>;
  }
};
