import type { Row } from '@/types';
import { cleanComment, cleanKpi, cleanText, pad2 } from './text';

/** Chế độ test: sinh dữ liệu giả theo kịch bản. Chỉ thao tác trên `Row[]` (dùng trong recipe immer). */

export const TEST_KEYS = ['w3Done', 'w1Done', 'w1Plan', 'w2Done', 'w2Plan', 'kpi', 'comment', 'rawStatus', 'rawProgress', 'end', 'ai', 'raw', 'reasons', 'ovr', 'note'];

export const SCEN: Record<string, { name: string; d: string }> = {
  dirty: { name: 'Jira bẩn định dạng', d: 'Progress Report có *đậm*, {{ngày}}, gạch đầu dòng lẫn lộn, link wiki, khoảng trắng thừa; Status/Progress viết khác kiểu' },
  risk: { name: 'Nhiều rủi ro', d: '1/3 dự án có Comment “Risk:”, vài dự án quá hạn — xem tô đỏ và mức rủi ro' },
  clean: { name: 'Dữ liệu chuẩn', d: 'Bộ demo gốc, gần như sạch — so sánh với 2 kịch bản trên' },
};

const RISKS = ['Thiếu SA dedicate, chậm review thiết kế 1 tuần', 'Chờ phê duyệt ANBM từ khối Bảo mật, có nguy cơ trễ go-live', 'Dữ liệu nguồn từ 360 bị lỗi schema, chưa có phương án fallback',
  'Phụ thuộc team Platform release API mới, đang blocked', 'Vendor GPU giao trễ, không kịp huấn luyện lại trước 30/11', 'Thiếu nhãn dữ liệu cho tập test, kết quả đánh giá chưa đạt'];
const PROPS = ['Đề xuất BGĐ hỗ trợ ưu tiên nguồn lực SA', 'Đề xuất họp 3 bên chốt lại mốc trong tuần', 'Đề xuất dùng dữ liệu tháng 9 tạm thời', 'Đề xuất escalate lên GĐK QLTT'];

export function rng(seed: number) {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646; };
}

function dirtify(text: string, rnd: () => number): string {
  if (!text) return text;
  const bul = ['* ', '- ', '•', '*  ', '+ '];
  const lines = String(text).split('\n').map((l) => {
    let t = l;
    if (/^•\s/.test(t)) t = bul[Math.floor(rnd() * bul.length)] + t.replace(/^•\s*/, '');
    else if (/:\s*$/.test(t) && rnd() < 0.7) t = (rnd() < 0.3 ? "'" : '') + '*' + t.trim() + '*';
    t = t.replace(/ → /g, rnd() < 0.5 ? ' -> ' : '->').replace(/ – /g, ' - ');
    if (rnd() < 0.35) t = t.replace(/ /, '  ');
    if (rnd() < 0.3) t += '   ';
    if (rnd() < 0.22 && /^•\s/.test(l)) t += ` - [LADP-${300 + Math.floor(rnd() * 200)}|https://xanhsm.atlassian.net/browse/LADP-${300 + Math.floor(rnd() * 200)}]`;
    if (rnd() < 0.15) t = t.replace(/(\d+)\s?%/, '$1 %');
    return t;
  });
  let out = lines.join('\r\n');
  if (rnd() < 0.4) out = out.replace('\r\n', '\r\n\r\n');
  return out;
}

/** chụp các trường bị kịch bản test thay đổi, để khôi phục khi thoát */
export function snapshotRows(rows: Row[]): Array<Record<string, unknown>> {
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    TEST_KEYS.forEach((k) => { o[k] = r[k] === undefined ? undefined : JSON.parse(JSON.stringify(r[k])); });
    return o;
  });
}

export function restoreRows(rows: Row[], snap: Array<Record<string, unknown>>) {
  rows.forEach((r, k) => TEST_KEYS.forEach((key) => {
    if (snap[k][key] === undefined) delete r[key]; else (r as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(snap[k][key]));
  }));
}

export function applyScenario(rows: Row[], sc: string, seed: number) {
  const rnd = rng(seed * 977);
  if (sc === 'dirty') {
    const ST = ['in progress', 'In_Progress', 'IN  PROGRESS ', 'In-Progress'];
    const PG = ['on track', 'ON-TRACK', 'On_track ', 'on-Track'];
    rows.forEach((r, j) => {
      r.raw = {};
      ['w3Done', 'w1Done', 'w1Plan', 'w2Done', 'w2Plan'].forEach((k) => {
        if (r[k]) { const d = dirtify(r[k] as string, rnd); r.raw![k] = d; (r as Record<string, unknown>)[k] = cleanText(d); }
      });
      if (r.kpi) {
        const kr = '||*STT*||*KPI*||*Chỉ số chính*||*Kết quả thực tế*||\r\n'
          + r.kpi.split('\n').map((x, k) => `|${k + 1}|${x.replace(/^\d+\.\s*/, '')} | | |`).join('\r\n') + '\r\n| | | | |';
        r.raw.kpi = kr; r.kpi = cleanKpi(kr);
      }
      if (r.comment) {
        const cr = `${6 + (j % 20)}/Nov/26 ${9 + (j % 8)}:0${j % 6} AM;712020:c8bea68a-${1000 + j};{{2026-11-${pad2(10 + (j % 9))}}} \r\n\r\n` + dirtify(r.comment, rnd);
        r.raw.comment = cr; r.comment = cleanComment(cr);
      }
      if (r.rawStatus === 'IN PROGRESS' && rnd() < 0.5) { r.rawStatus = ST[j % ST.length]; r.raw.rawStatus = r.rawStatus; }
      if (r.rawProgress === 'On-track' && rnd() < 0.5) { r.rawProgress = PG[j % PG.length]; r.raw.rawProgress = r.rawProgress; }
    });
  } else if (sc === 'risk') {
    rows.forEach((r, j) => {
      if (r.isNew) return;
      if (j % 3 === 0) {
        const rk = RISKS[j % RISKS.length];
        const pp = PROPS[j % PROPS.length];
        r.comment = 'Risk: ' + rk + '\n→ ' + pp;
        r.ai.w3Issues = { text: `Rủi ro: ${rk}.\n→ ${pp}.`, why: `Comment ${10 + (j % 9)}/11 có ghi Risk`, src: r.comment, ok: j % 2 === 0 };
        r.ai.riskLevel = { text: j % 2 ? 'Cao' : 'Trung bình', why: 'Comment có ghi risk', src: r.comment, ok: j % 2 === 0 };
        if (j % 6 === 0) r.rawProgress = 'Off-track';
      } else if (j % 3 === 1) {
        r.ai.w3Issues = { text: 'Không có vấn đề phát sinh trong tuần.', why: 'Progress Report', src: '', ok: true };
        r.ai.riskLevel = { text: 'Thấp', why: 'đúng tiến độ', src: '', ok: true };
      }
    });
  }
}
