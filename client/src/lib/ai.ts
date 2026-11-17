import type { Row } from '@/types';
import type { AppState } from '@/store/types';
import { cellValue, fieldOf } from './cell';
import { blockersOf, bullets, mapNorm } from './text';

/** Giả lập AI soạn nháp 3 ô (AC rủi ro, AS kế hoạch, AT vấn đề) từ Progress Report + Comment. Ghi thẳng vào `rows` (dùng trong recipe immer). */
export function draftAi(s: AppState, rows: Row[]): number {
  let n = 0;
  rows.forEach((r) => {
    const cw = r.prw && r.prw.w3;
    const last = r.pr && r.pr.length ? r.pr[r.pr.length - 1] : null;
    const late = mapNorm(s.progMap, r.rawProgress) === 'Chậm tiến độ' || cellValue(s, r, fieldOf(s, 'statusAlt')) === 'Đang thực hiện Chậm tiến độ';
    const blk = cw ? blockersOf(cw.done) : [];
    const risk = /risk/i.test(r.comment || '') ? r.comment : '';
    let srcTxt = cw
      ? `Progress Report ${cw.date}\n${cw.done}${cw.plan ? '\n—\n' + cw.plan : ''}`
      : last
        ? `Không có dòng nào trong tuần 15–22/11.\nLần cập nhật gần nhất ${last.date}:\n${last.done}${last.plan ? '\n—\n' + last.plan : ''}`
        : 'Progress Report trống.';
    if (risk) srcTxt += '\n\nComment:\n' + risk;
    if (!r.ai.riskLevel) {
      const lv = late ? 'Cao' : blk.length || risk || !cw ? 'Trung bình' : 'Thấp';
      const why = [late ? 'chậm tiến độ hoặc quá Due date' : 'đúng tiến độ', blk.length ? 'có blocker trong report' : '', risk ? 'Comment có ghi risk' : '', !cw ? 'không có cập nhật tuần này' : '']
        .filter(Boolean).join(' · ');
      r.ai.riskLevel = { text: lv, why, src: srcTxt, ok: false }; n++;
    }
    if (!r.ai.w3Plan) {
      const pl = cw ? bullets(cw.plan, 2) : [];
      const txt = pl.length ? pl.join('; ')
        : last ? `Chưa có cập nhật tuần này. Theo report ${last.date!.slice(8, 10)}/${last.date!.slice(5, 7)}: ${bullets(last.plan, 2).join('; ') || bullets(last.done, 1).join('')}`
          : 'Chưa có Progress Report — cần PM cập nhật.';
      r.ai.w3Plan = { text: txt, why: 'Progress Report · cột Công việc sẽ làm' + (cw ? ' · ' + cw.date : ''), src: srcTxt, ok: false }; n++;
    }
    if (!r.ai.w3Issues) {
      const parts: string[] = [];
      if (blk.length) parts.push('Vướng: ' + blk.join('; ') + '.');
      if (risk) parts.push('Rủi ro: ' + bullets(risk.replace(/^[\s\S]*?Risk:\s*/i, ''), 1).join('') + '.');
      if (late) parts.push('Chậm so với kế hoạch.\n→ Đề xuất chốt lại mốc và bổ sung nguồn lực.');
      if (!cw) parts.push('Chưa có Progress Report tuần này — đề nghị PM cập nhật trước họp.');
      r.ai.w3Issues = { text: parts.join('\n') || 'Không có vấn đề phát sinh trong tuần.', why: 'Progress Report' + (risk ? ' + Comment' : ''), src: srcTxt, ok: false }; n++;
    }
  });
  return n;
}
