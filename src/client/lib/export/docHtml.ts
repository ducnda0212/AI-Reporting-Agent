import type { AppState } from '@/store/types';
import { exOf, exPct, exStatus, aiText, hasIssues } from '../exec';
import { reportData } from './reportData';

const esc = (x: unknown) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Báo cáo điều hành dạng HTML (nguồn cho PDF). `word`: thêm khai báo khổ A4 ngang cho Word. */
export function docHtml(s: AppState, word = false): string {
  const D = reportData(s);
  const { run, N, cnt, V, ok } = D;
  const head = (cols: Array<[string, string]>) => '<tr>' + cols.map((c) => `<th style="width:${c[1]}">${c[0]}</th>`).join('') + '</tr>';
  const table = (cols: Array<[string, string]>, body: string) => `<table class="t">${head(cols)}${body || `<tr><td colspan="${cols.length}" class="e">Không có</td></tr>`}</table>`;
  const bar = (t: string) => `<div class="bar">${t}</div>`;
  const tr = (cells: string[]) => '<tr>' + cells.join('') + '</tr>';
  const c = (x: unknown) => `<td class="c">${esc(x)}</td>`;
  const d = (x: unknown) => `<td>${esc(x)}</td>`;
  const css = '@page{size:A4 landscape;margin:12mm}' + (word ? '@page WordSection1{size:841.9pt 595.3pt;mso-page-orientation:landscape;margin:36pt}div.WordSection1{page:WordSection1}' : '')
    + 'body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#000;margin:0}'
    + 'h1{font-size:15pt;color:#1F3864;margin:0 0 8pt}.ky{margin:0 0 12pt}.ky b{display:inline-block;min-width:90pt}.ky span{background:#FFF2CC;padding:1pt 6pt}.ky i{color:#595959;margin-left:8pt}'
    + '.bar{background:#1F3864;color:#fff;font-weight:bold;font-size:11pt;padding:4pt 6pt;margin:14pt 0 0}'
    + 'table{border-collapse:collapse;width:100%;page-break-inside:auto}tr{page-break-inside:avoid}'
    + '.t th{background:#D9E2F3;font-weight:bold;text-align:center;border:0.5pt solid #8EA9DB;padding:3pt 4pt;font-size:9.5pt}'
    + '.t td{border:0.5pt solid #BFBFBF;padding:3pt 4pt;vertical-align:top;font-size:9.5pt;white-space:pre-line}.t td.c{text-align:center}.e{color:#808080;text-align:center}'
    + '.s td{border:0.5pt solid #BFBFBF;padding:3pt 6pt}.s td.k{font-weight:bold;width:160pt}'
    + '.note{font-size:9pt;color:#595959;margin-top:12pt}';
  const sumRow = (k: string, v: unknown) => `<tr><td class="k">${k}</td><td>${esc(v)}</td></tr>`;
  const html = '<h1>PMO BÁO CÁO ĐIỀU HÀNH – TRUNG TÂM AI</h1>'
    + '<p class="ky"><b>Kỳ báo cáo</b> <span>Tuần 3 tháng 11 năm 2026 (15–22/11)</span><i>(Chỉ tính các dự án đang thực hiện)</i></p>'
    + bar('1. THÔNG TIN TỔNG QUAN TRUNG TÂM')
    + '<table class="s">' + sumRow('Số dự án đang chạy', N) + sumRow('Đúng tiến độ', cnt['Đúng tiến độ']) + sumRow('Có nguy cơ chậm', cnt['Có nguy cơ chậm'])
    + sumRow('Chậm tiến độ', cnt['Chậm tiến độ']) + sumRow('Tỉ lệ đúng tiến độ', D.rate) + sumRow('Nhận xét chung', ok(s.exNote)) + '</table>'
    + bar('2. CÁC CHỈ SỐ NỔI BẬT (KPI)')
    + table([['STT', '5%'], ['Mã DA', '9%'], ['Công việc', '26%'], ['Đầu mối chịu trách nhiệm', '14%'], ['KPI (mục tiêu)', '20%'], ['Kết quả đạt được', '26%']],
      D.hl.map((r, k) => tr([c(k + 1), d(r.code), d(V(r, 'task')), d(V(r, 'pic')), d(V(r, 'kpi')), d(ok(exOf(s, r).kpiResult))])).join(''))
    + bar('3. TIẾN ĐỘ CÁC DỰ ÁN')
    + table([['STT', '5%'], ['Mã DA', '9%'], ['Công việc', '24%'], ['Tiến độ', '8%'], ['Hạn', '9%'], ['Tình trạng', '12%'], ['Việc hoàn thành trong tuần', '33%']],
      run.map((r, k) => tr([c(k + 1), d(r.code), d(V(r, 'task')), c(exPct(r) + ' %'), c(V(r, 'end')), d(exStatus(s, r)), d(V(r, 'w3Done'))])).join(''))
    + bar('4. CÁC VẤN ĐỀ ĐANG GẶP PHẢI (RỦI RO, ISSUE…)')
    + table([['STT', '5%'], ['Mã DA', '9%'], ['Công việc', '24%'], ['Tình trạng', '12%'], ['Vấn đề, rủi ro & đề xuất', '50%']],
      D.iss.map((r, k) => tr([c(k + 1), d(r.code), d(V(r, 'task')), d(exStatus(s, r)), d(hasIssues(r))])).join(''))
    + bar('5. CÔNG VIỆC TUẦN KẾ TIẾP')
    + table([['STT', '5%'], ['Mã DA', '9%'], ['Công việc', '28%'], ['Kế hoạch tuần sau', '58%']],
      D.nx.map((r, k) => tr([c(k + 1), d(r.code), d(V(r, 'task')), d(aiText(r, 'w3Plan'))])).join(''))
    + bar('6. Ý KIẾN CẦN CHỈ ĐẠO CỦA BAN GIÁM ĐỐC')
    + table([['STT', '5%'], ['Mã DA', '9%'], ['Công việc', '28%'], ['Nội dung cần chỉ đạo', '58%']],
      D.directives.map((r, k) => tr([c(k + 1), d(r.code), d(V(r, 'task')), d(exOf(s, r).directive!.text)])).join(''))
    + '<p class="note">Báo cáo lấy từ dữ liệu tuần 3/11, chỉ các dự án có Trạng thái = Đang thực hiện. Mục 4 và 6 chỉ hiện dự án có nội dung. Ô nháp AI chưa duyệt để trống.</p>';
  const ns = word ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"' : '';
  return `<!DOCTYPE html><html${ns}><head><meta charset="utf-8"><title>Bao cao dieu hanh PMO tuan 3-11</title><style>${css}</style></head><body>${word ? `<div class="WordSection1">${html}</div>` : html}</body></html>`;
}
