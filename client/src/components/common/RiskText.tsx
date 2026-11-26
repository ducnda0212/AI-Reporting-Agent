/* Tô đỏ nội dung rủi ro (prototype riskLine / riskHtml / textHasRisk / lvlPill L6596-6624). */
import { Fragment, type ReactNode } from 'react';

const RISK_WORDS = ['rủi ro', 'risk', 'nguy cơ', 'chậm', 'trễ', 'delay', 'quá hạn', 'overdue', 'vướng', 'blocker', 'blocked', 'block', 'tắc', 'kẹt', 'thiếu', 'chưa có', 'chưa được', 'chờ', 'pending', 'phụ thuộc', 'lỗi', 'bug', 'sự cố', 'escalate', 'không kịp', 'không đạt', 'nghiêm trọng', 'critical', 'gấp', 'khẩn'];
const RISK_RE = new RegExp('(' + RISK_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'giu');
const NO_RISK = /^(•\s*)?(không có|không phát sinh)(\s*(vấn đề|rủi ro|vướng mắc))?(\s*phát sinh)?(\s*trong tuần)?\.?$/i;
/** Các cột "Vấn đề, rủi ro…" được tô đỏ. */
export const RISK_F: readonly string[] = ['vd', 'w1vd', 'w2vd', 'w4vd'];

type Kind = 'none' | 'risk' | 'prop' | 'plain';
function riskLine(line: string): { kind: Kind; parts: ReactNode[] } {
  const t = line.trim();
  if (NO_RISK.test(t)) return { kind: 'none', parts: [line] };
  const kind: Kind = /^(•\s*)?(risk|rủi ro|vướng|vấn đề|issue)\s*:/i.test(t) ? 'risk' : /^(•\s*)?(→|đề xuất|giải pháp|kiến nghị|xin ý kiến)/i.test(t) ? 'prop' : 'plain';
  const parts: ReactNode[] = [];
  let last = 0, hit = false, m: RegExpExecArray | null;
  const re = new RegExp(RISK_RE);
  while ((m = re.exec(line))) {
    if (/không\s*(có\s*)?$/i.test(line.slice(Math.max(0, m.index - 9), m.index))) continue;
    parts.push(line.slice(last, m.index), <b key={m.index} className="rk">{m[0]}</b>);
    last = m.index + m[0].length; hit = true;
  }
  parts.push(line.slice(last));
  return { kind: kind === 'plain' && hit ? 'risk' : kind, parts };
}

export const textHasRisk = (text: string | null | undefined): boolean => String(text || '').split('\n').some((l) => riskLine(l).kind === 'risk');

/** `oneLine`: trong ô bảng (một dòng, nối bằng ·); còn lại từng dòng, dòng rủi ro nền đỏ nhạt. */
export function RiskText({ text, oneLine = false }: { text: string | null | undefined; oneLine?: boolean }): JSX.Element {
  const ls = String(text || '').split('\n').map(riskLine);
  if (oneLine) return <>{ls.map((l, k) => (
    <Fragment key={k}>{k > 0 && <> <span className="lsep">·</span> </>}{l.kind === 'risk' ? <span className="rl1">{l.parts}</span> : l.parts}</Fragment>
  ))}</>;
  return <>{ls.map((l, k) => <div key={k} className={'pl ' + l.kind}>{l.parts.some((p) => p !== '') ? l.parts : ' '}</div>)}</>;
}

/** Mức rủi ro dạng nhãn (Cao / Trung bình / Thấp). */
export function LvlPill({ v }: { v: string }): JSX.Element {
  const c = v === 'Cao' ? 'h' : v === 'Trung bình' ? 'm' : v === 'Thấp' ? 'l' : '';
  return c ? <span className={'lvl ' + c}>{v}</span> : <>{v}</>;
}
