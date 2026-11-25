# PMO Reporting Prototype v4 Lite (Clean Rebuild) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xóa bỏ toàn bộ code FE cũ trong `client/src/` và xây dựng lại từ đầu (Clean Rebuild) ứng dụng React + TypeScript + Zustand bám sát 100% phần **Bản gọn (`html.lite` + Vòng góp ý 1–10)** của `docs/superpowers/prototype/PMO Reporting Prototype v4 (Copy).html`.

**Architecture:** React 18.3 + TypeScript 5.6 (strict) + Vite 5.4 + Zustand 4.5 + Immer 10.1 + CSS thuần. Thay thế cơ chế monkey-patch DOM/chuỗi HTML ở phần cuối prototype bằng component React thuần và Zustand actions sạch sẽ; giữ nguyên toàn bộ `field.id`, cấu trúc dữ liệu `GOLD`/`DEMO`, CSS tokens và phím tắt Excel để đạt 1:1 parity không có dead code.

**Tech Stack:** React 18, TypeScript 5.6, Vite 5, Zustand 4.5, Immer 10.1, Vitest 2.1 (`environment: 'node'`), CSS thuần.

**Spec:** `docs/superpowers/specs/2026-11-25-fe-rebuild-prototype-v4-lite-design.md`

**Source Prototype HTML:** `docs/superpowers/prototype/PMO Reporting Prototype v4 (Copy).html`

---

## Global Constraints

- **Không thao tác Git / GitHub trừ thao tác đọc:** Chỉ được phép sử dụng lệnh đọc như `git status`, `git diff`, `git log`. Tuyệt đối KHÔNG chạy `git add`, `git commit`, `git push`, `git checkout`, `git reset`, `gh ...` hoặc bất kỳ thao tác ghi nào lên Git/GitHub.
- **Chỉ dùng `npm run dev` — KHÔNG dùng `npm run build`:** Kiểm tra bằng `npm --prefix client run typecheck`, `npm --prefix client test`, và `npm --prefix client run dev` (truy cập `http://localhost:5173`). Tuyệt đối không chạy `npm run build`.
- **Phạm vi xóa & giữ nguyên:** Xóa toàn bộ các thư mục/file trong `client/src/` trừ `client/src/vite-env.d.ts`. Giữ nguyên `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/public/logo.png` (không cài thêm npm package).
- **Phạm vi Bản gọn (Phương án A + Lựa chọn 1):** KHÔNG viết code cho các phần bị loại/ẩn: `CheckView (check)`, `Điều hành (exec)`, `Rủi ro (rid)`, `Hệ thống (cat)`, `Mẫu BC (tlib/tpl)`, `Cảnh báo (issues)`, `Ghi chú (note)`, `Rổ gom (buckets)`, thanh `AgBar` tím, thanh `"N ô nháp AI chờ duyệt"`, và xuất Word/PDF.
- **Giữ nguyên `field.id` gốc từ prototype:** Sử dụng `ma`, `viec`, `mang`, `tt`, `td`, `buocso`, `ht`, `kh`, `vd`, `rui`... khớp `FIELDS` & `GOLD`.
- **Phạm vi Vitest:** Chạy trên `environment: 'node'` (`client/vite.config.ts`); kiểm thử unit cho `lib/*`, `store/*`, và SSR smoke test qua `react-dom/server` (`renderToString`).

## Review Focus

1. **Zero Dead Views & 3-Step Strict Flow**: Không tồn tại route hay nút điều hướng tới `check`, `exec`, `rid`, `cat`, `tlib`, `issues`, `note`, `buckets`; `goStep` chỉ chấp nhận `1` (`import`), `3` (`grid`), `4` (`export` modal); `HelpDrawer` & `TOURS.all` phản ánh đúng 3 bước.
2. **Real `GOLD` 64DA vs Test Scenarios & Restore**: Nạp mặc định dùng `GOLD` 64 epic (`real: true`); khi bật `enterTest('dirty' | 'risk' | 'perfect' | 'errors' | 'many')` rồi gọi `exitTest()`, toàn bộ `allRows`, `raw` fields và `test` state khôi phục nguyên trạng ban đầu.
3. **Rovo Agent Staged Preview & Undo/Redo**: Lệnh Agent trong `askSend` chỉ tạo bản xem trước trong `state.stages[id]` (KHÔNG ghi đè `allRows` ngay); chỉ khi `stgApply(id)` chạy mới cập nhật `allRows` và ghi vào stack hoàn tác 100 bước (`undo`/`redo`).
4. **1-Touch Picker (`#pkPop`) & `"Theo Jira"` Revert**: Khi chọn `"Theo Jira"` trên cột có nguồn Jira/bucket (`isSrc(f)`), `applyEdit(i, fid, '')` phải xóa `ovr[fid]` để trả về `sourceValue(r, f)` (khác với `"Bỏ giá trị"` trên cột `manual` thuần).
5. **Version Comparison (`vCompare2`) & Edit Older Snapshot (`vlEdit`)**: `vCompare2` bỏ qua các chuỗi giữ chỗ `CX_PH` khi so sánh, đọc được nháp AI chưa duyệt trên `cur` (gắn cờ `draft: true`), và `vlEdit` mở snapshot cũ lên `grid` với `editWk` banner mà không làm biến đổi mảng `versions` lịch sử.

---

### Task 1: Clean Reset `client/src/` & Extract Prototype CSS

**Files:**
- Delete: toàn bộ file/thư mục trong `client/src/` ngoại trừ `client/src/vite-env.d.ts`
- Create: `client/src/styles/pmo-prototype.css`
- Create: `client/src/App.tsx` (placeholder tạm)
- Create: `client/src/main.tsx`
- Test: `client/src/__tests__/reset.test.ts`

**Interfaces:**
- Consumes: Thẻ `<style>` trong `docs/superpowers/prototype/PMO Reporting Prototype v4 (Copy).html` (dòng 5–3139 và các `<style>` inline bổ sung nếu có).
- Produces: `client/src/styles/pmo-prototype.css` chứa đầy đủ design tokens (`:root`, `[data-theme="dark"]`), layout, bảng tính, AI orb/marquee/walkthrough, Linear popout, SVG version chart, Toggl audit log, Help drawer, `#pkPop`.

- [ ] **Step 1: Xóa sạch `client/src/` cũ (giữ lại `vite-env.d.ts`)**

Dùng shell xóa toàn bộ thư mục con (`components`, `data`, `hooks`, `lib`, `store`, `styles`, `types`, `views`, `__tests__`) và `App.tsx`, `main.tsx` trong `client/src/`. Xác nhận chỉ còn `client/src/vite-env.d.ts`.

- [ ] **Step 2: Viết test kiểm tra reset và CSS mới**

Tạo `client/src/__tests__/reset.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Clean Reset & CSS Foundation', () => {
  it('chỉ giữ cấu trúc sạch và nạp đủ CSS prototype mới', () => {
    const srcDir = path.resolve(__dirname, '..');
    expect(fs.existsSync(path.join(srcDir, 'vite-env.d.ts'))).toBe(true);
    expect(fs.existsSync(path.join(srcDir, 'views/Check'))).toBe(false);
    expect(fs.existsSync(path.join(srcDir, 'views/Risk'))).toBe(false);
    const css = fs.readFileSync(path.join(srcDir, 'styles/pmo-prototype.css'), 'utf-8');
    expect(css).toContain('--accent:#C9276D');
    expect(css).toContain('.ai9hero');
    expect(css).toContain('.pa-box');
    expect(css).toContain('.vbks');
    expect(css).toContain('.lgrow');
    expect(css).toContain('.hpdr');
    expect(css).toContain('.pkpop');
    expect(css).toContain('#agCur');
  });
});
```

- [ ] **Step 3: Chạy test để xác nhận FAIL**

Run: `npm --prefix client test -- src/__tests__/reset.test.ts`
Expected: FAIL (`styles/pmo-prototype.css` chưa tồn tại).

- [ ] **Step 4: Trích xuất CSS từ prototype HTML và tạo placeholder `App.tsx`, `main.tsx`**

Trích xuất toàn bộ nội dung `<style>` (dòng 5–3139) từ `docs/superpowers/prototype/PMO Reporting Prototype v4 (Copy).html` vào `client/src/styles/pmo-prototype.css`. Kiểm tra đảm bảo `.app` / `#root { height: 100% }` hoạt động đúng với cấu trúc `<div id="root">` của Vite (`#root{height:100%}`).
Tạo `client/src/App.tsx`:
```tsx
export function App() {
  return <div id="app">PMO Reporting Rebuild</div>;
}
```
Tạo `client/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/pmo-prototype.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 5: Chạy `typecheck` và `reset.test.ts` để xác nhận PASS**

Run: `npm --prefix client run typecheck ; npm --prefix client test -- src/__tests__/reset.test.ts`
Expected: 0 lỗi TS, test PASS.

---

### Task 2: TypeScript Types & Core Data Dictionary

**Files:**
- Create: `client/src/types/index.ts`
- Create: `client/src/data/demo.json`
- Create: `client/src/data/constants.ts`
- Test: `client/src/__tests__/data.test.ts`

**Interfaces:**
- Consumes: Dữ liệu `FIELDS`, `AI_IDS`, `DEMO`, `GOLD`, `GOLD_CSV`, `WEEKS`, `SEED_VERSIONS`, `STATUS_MAP`, `PROG_MAP`, `PHASE_BUCKET`, `GROUPS`, `GRP`, `SCEN`, `HELP`, `FAQ`, `KEYS`, `TOURS` từ file prototype HTML.
- Produces: Các kiểu dữ liệu strict (`Field`, `Row`, `CellFormat`, `AgStage`, `AgStageItem`, `PopoutState`, `TraceTarget`, `VersionItem`, `LogEntry`, `ImportFileMeta`, `AppState`) và module `data/`.

- [ ] **Step 1: Viết test cho dữ liệu và types**

Tạo `client/src/__tests__/data.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import demoData from '@/data/demo.json';
import { FIELDS, AI_IDS, WEEKS, SEED_VERSIONS, HELP, TOURS } from '@/data/constants';

describe('Types & Core Data Dictionary', () => {
  it('đủ 49 cột báo cáo và 3 cột AI theo mẫu DAN PMO', () => {
    expect(FIELDS.length).toBe(49);
    expect(FIELDS[0].id).toBe('ma');
    expect(FIELDS[1].id).toBe('viec');
    expect(AI_IDS).toEqual(['rui', 'kh', 'vd']);
  });

  it('chứa bộ GOLD Clean 64DA (64 epic) và GOLD_CSV cùng bộ DEMO giả lập', () => {
    expect(demoData.gold.rows.length).toBe(64);
    expect(demoData.gold.file).toBe('20261125_DAN_Jira-Export-Clean-Dataset_64DA.csv');
    expect(demoData.goldCsv.length).toBeGreaterThan(1000);
    expect(WEEKS.length).toBe(3);
    expect(SEED_VERSIONS.length).toBe(3);
  });

  it('Help & Tours phản ánh đúng luồng 3 bước gọn, không trỏ tới CheckView', () => {
    const allTourTargets = TOURS.all.map((t) => t.id || '');
    expect(allTourTargets.join(',')).not.toContain('check');
    expect(HELP.every((h) => h.k !== 'check')).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm --prefix client test -- src/__tests__/data.test.ts`
Expected: FAIL.

- [ ] **Step 3: Tạo `client/src/types/index.ts`, `client/src/data/demo.json`, `client/src/data/constants.ts`**

1. Trong `client/src/types/index.ts`, định nghĩa rõ:
   - `ViewType = 'import' | 'grid' | 'ver' | 'log'`
   - `PanelType = 'ai' | 'aitrace' | 'tvcfg' | null`
   - `ModalType = 'export' | 'aiDone' | null`
   - `TestScenario = 'dirty' | 'risk' | 'perfect' | 'errors' | 'many' | null`
   - `Field`, `Row`, `AiCell`, `CellFormat`, `SelectionRange`, `FilterMap`, `FindState`, `AskMessage`, `AgStage`, `AgStageItem`, `PopoutState`, `TraceTarget`, `VersionItem`, `LogEntry`, `PreviewFile`, `NavSnap`, `AppState`.
2. Trích xuất `DEMO`, `GOLD`, `GOLD_CSV`, `IMPORTS`, `ORPHANS` vào `client/src/data/demo.json` trực tiếp từ HTML prototype (sử dụng script Python nhỏ hoặc trích trực tiếp để đảm bảo chính xác 100% từng ký tự UTF-8 tiếng Việt).
3. Tạo `client/src/data/constants.ts` chứa `FIELDS` (49 cột), `AI_IDS`, `GRP`, `GROUPS`, `STAGES`, `MAN3`, `MARKETS`, `DOMAINS`, `TODAY`, `STATUS_VALUES`, `STATUS_MAP`, `PROG_VALUES`, `PROG_MAP`, `PHASE_BUCKET`, `WEEKS`, `SEED_VERSIONS`, `SCEN`, `TR_RULES`, `WK_TXT`, `WK_TXT_N`, `CMP_F`, `CX_PH`, `TT_RK`, `RUI_LV`, `NO_JIRA`, `JIRA_OF`, `PA_LONG`, `LG_CAT`, `HELP`, `FAQ`, `KEYS`, `TOURS` (đồng bộ 3 bước theo Lựa chọn 1, không có bước/liên kết `check`, `buckets`, `cat`, `cfg`).

- [ ] **Step 4: Chạy `typecheck` và `data.test.ts` để xác nhận PASS**

Run: `npm --prefix client run typecheck ; npm --prefix client test -- src/__tests__/data.test.ts`
Expected: 0 lỗi TS, test PASS.

---

### Task 3: Pure Helper Modules (`cell`, `clean`, `grid`, `popout`, `versions`, `theme`)

**Files:**
- Create: `client/src/lib/cell.ts`
- Create: `client/src/lib/clean.ts`
- Create: `client/src/lib/grid.ts`
- Create: `client/src/lib/popout.ts`
- Create: `client/src/lib/versions.ts`
- Create: `client/src/lib/theme.ts`
- Test: `client/src/__tests__/lib-core.test.ts`

**Interfaces:**
- Consumes: `FIELDS`, `STATUS_MAP`, `PROG_MAP`, `PHASE_BUCKET`, `WEEKS`, `PA_LONG`, `CX_PH`, `WK_TXT` từ `constants.ts` và types từ `types/index.ts`.
- Produces: Các hàm thuần tính toán giá trị ô, làm sạch markup Jira, lọc/tìm kiếm bảng, parse milestone timeline, so sánh 2 phiên bản `vCompare2` & `cxNote`, và lưu/đọc theme.

- [ ] **Step 1: Viết unit test cho các hàm thuần cốt lõi (bao gồm Review Focus #5)**

Tạo `client/src/__tests__/lib-core.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import { colNum, colLetter, ck, spillCls, mapNorm } from '@/lib/cell';
import { cleanText, cleanKpi, cleanComment } from '@/lib/clean';
import { parseMilestones } from '@/lib/popout';
import { vCompare2, cxNote } from '@/lib/versions';
import { STATUS_MAP } from '@/data/constants';

describe('Core Pure Helpers', () => {
  it('chuyển đổi tọa độ cột Excel và mã màu pill chuẩn xác', () => {
    expect(colNum('A')).toBe(0);
    expect(colNum('AA')).toBe(26);
    expect(colLetter({ col: 'AT' })).toBe('AT');
    expect(ck(2, 'td')).toBe('2|td');
    expect(spillCls('Chậm tiến độ')).toBe('e');
    expect(spillCls('Đúng tiến độ')).toBe('o');
    expect(mapNorm(STATUS_MAP, 'in_progress')).toBe('Đang thực hiện');
  });

  it('làm sạch wiki markup Jira, bảng KPI và tiền tố Comment', () => {
    expect(cleanText('*Tiến độ:*  [PMO-1|https://x.com]')).toContain('Tiến độ:');
    expect(cleanKpi('||*STT*||*KPI*||\n|1|Đạt 90%|')).toContain('1. Đạt 90%');
    expect(cleanComment('07/Nov/26 5:09 PM;abc123;{{2026-11-10}} Nội dung')).toContain('Nội dung');
  });

  it('parse Milestone thành timeline done/next theo mốc 22/11/2026', () => {
    const ms = parseMilestones('14/11: Pilot\n10/12: Go-Live');
    expect(ms[0].status).toBe('done');
    expect(ms[1].status).toBe('next');
  });

  it('vCompare2 bỏ qua placeholder CX_PH và đọc nháp AI chưa duyệt trên cur', () => {
    const snapA = { 'I.A.3.1|tt': 'Đang thực hiện', 'I.A.3.1|td': 'Đúng tiến độ', 'I.A.3.1|vd': 'Không có.', 'I.A.3.1|rui': 'Thấp' };
    const snapB = { 'I.A.3.1|tt': 'Đang thực hiện', 'I.A.3.1|td': 'Chậm tiến độ', 'I.A.3.1|vd': 'Chờ DPO', 'I.A.3.1|rui': 'Cao' };
    const cmp = vCompare2(
      { key: 'w2|1', wk: 'w2', v: 1, snap: snapA },
      { key: 'w3|1', wk: 'w3', v: 1, snap: snapB },
      [{ ma: 'I.A.3.1', viec: 'Điều phối', ai: {} }] as never
    );
    expect(cmp).not.toBeNull();
    expect(cmp!.A.ok).toBe(1);
    expect(cmp!.B.late).toBe(1);
    expect(cmp!.bad.some((x) => x.k === 'tt')).toBe(true);
    expect(cxNote(cmp!, 'Tuần 02/11 · Bản 1', 'Tuần 3/11 · Bản 1')).toContain('I.A.3.1');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm --prefix client test -- src/__tests__/lib-core.test.ts`
Expected: FAIL.

- [ ] **Step 3: Triển khai các module trong `client/src/lib/`**

1. `cell.ts`: `colNum(c)`, `colLetter(f)`, `ck(i, fid)`, `refOf(r, f, order)`, `locked(f)`, `isSrc(f)`, `optsFor(f)`, `sourceValue(r, f, catRun, phaseBucket)`, `cellValue(r, f, state)`, `displayText(r, f, state)`, `spillCls(t)`, `mapNorm(map, raw)`.
2. `clean.ts`: `CLEAN_RULES`, `cleanText`, `cleanKpi`, `cleanComment`, `ruleCounts`.
3. `grid.ts`: `visibleFields(hidden, tvWeeks)`, `passColFilters(r, filters, state)`, `hitCell(r, f, find, state)`, `findMatches(state, rows)`, `selKeys(range, order, vf)`, `autofitWidth(f, rows, state)`.
4. `popout.ts`: `poWeeks(wkDesc)`, `poHitsCompute(row, q, state)`, `parseMilestones(text)` (mốc `new Date(2026, 10, 22)`).
5. `versions.ts`: `snapshot`, `diffSnap`, `vSnap`, `vStats`, `vCompare2` (kèm xử lý `CX_PH` và đọc nháp AI chưa duyệt trên `cur`), `cxNote`, `vhList`, `verEditList`.
6. `theme.ts`: `getStoredTheme`, `applyTheme`, `toggleTheme` (`pmo-theme`).

- [ ] **Step 4: Chạy `typecheck` và `lib-core.test.ts` để xác nhận PASS**

Run: `npm --prefix client run typecheck ; npm --prefix client test -- src/__tests__/lib-core.test.ts`
Expected: 0 lỗi TS, test PASS.

---

### Task 4: AI Engine (`lib/ai.ts`) & File Parser / OOXML `.xlsx` Export (`lib/xlsx.ts`)

**Files:**
- Create: `client/src/lib/ai.ts`
- Create: `client/src/lib/xlsx.ts`
- Test: `client/src/__tests__/ai-xlsx.test.ts`

**Interfaces:**
- Consumes: `FIELDS`, `AI_IDS`, `TR_RULES`, `GOLD_CSV` từ `data/` và `cellValue`/`displayText` từ `lib/cell.ts`.
- Produces: `aiDrafts`, `trInputs`, `trDraft`, `trText`, `askAnswer` (trả về đáp án HTML + `stagedItems` mà KHÔNG mutate `rows`), `pvReadCsv`, `pvReadXlsx`, `pvParse`, `exXlsx` (sinh `Blob` file Excel 49 cột OOXML chuẩn).

- [ ] **Step 1: Viết test cho AI Engine và CSV/XLSX parser/exporter (bao gồm Review Focus #3)**

Tạo `client/src/__tests__/ai-xlsx.test.ts`:
```typescript
import { describe, expect, it } from 'vitest';
import demoData from '@/data/demo.json';
import { trInputs, trDraft, trText, askAnswer } from '@/lib/ai';
import { pvReadCsv, exXlsx } from '@/lib/xlsx';
import { FIELDS } from '@/data/constants';

describe('AI Engine & File XLSX', () => {
  it('trInputs và trDraft sinh nháp AI có refs trỏ đúng câu nguồn', () => {
    const r = demoData.gold.rows[0] as never;
    const inputs = trInputs(r, {} as never);
    const draft = trDraft(r, 'kh', 'short', inputs);
    expect(inputs.all.length).toBeGreaterThan(0);
    expect(trText(draft).length).toBeGreaterThan(0);
  });

  it('askAnswer với lệnh sửa bảng chỉ trả về stagedItems, không mutate allRows', () => {
    const rows = structuredClone(demoData.gold.rows).map((r, i) => ({ ...r, i, ai: {}, ovr: {} }));
    const before = JSON.stringify(rows[0]);
    const res = askAnswer('Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ', { rows, allRows: rows } as never);
    expect(res.stagedItems.length).toBeGreaterThan(0);
    expect(res.stagedItems[0].to).toBe('Chậm tiến độ');
    expect(JSON.stringify(rows[0])).toBe(before);
  });

  it('pvReadCsv đọc GOLD_CSV và exXlsx tạo file .xlsx có magic bytes ZIP (PK)', async () => {
    const buf = new TextEncoder().encode(demoData.goldCsv).buffer;
    const parsed = pvReadCsv(buf);
    expect(parsed.sheets[0].rows.length).toBeGreaterThan(10);

    const rows = structuredClone(demoData.gold.rows).map((r, i) => ({ ...r, i, ai: {}, ovr: {} }));
    const blob = exXlsx({ rows, visibleFields: FIELDS, tvWeeks: ['w1', 'w2', 'w3', 'w4'] } as never);
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    expect(head[0]).toBe(0x50); // 'P'
    expect(head[1]).toBe(0x4b); // 'K'
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm --prefix client test -- src/__tests__/ai-xlsx.test.ts`
Expected: FAIL.

- [ ] **Step 3: Triển khai `client/src/lib/ai.ts` và `client/src/lib/xlsx.ts`**

1. `ai.ts`: Port nguyên vẹn `aiDrafts`, `trInputs`, `trDraft`, `trText`, `aiNorm`, `aiRow`, `aiField`, `aiOpt`, `aiCanFill`, `agExamples`, và `askAnswer` từ prototype (trả về `{ html, act, stagedItems, aiPend }` thuần — không ghi trực tiếp lên `rows` để store quản lý bản xem trước Rovo).
2. `xlsx.ts`: Port `pvReadCsv`, `pvReadXlsx` (dùng `DecompressionStream('deflate-raw')` thuần trình duyệt, CRC32 & ZIP reader/writer từ prototype), cơ chế fallback nạp động SheetJS CDN cho file `.xls` cũ kèm thông báo lỗi khi offline, và `exXlsx` tạo file Excel 49 cột đầy đủ style (header màu nhóm, wrap text, border).

- [ ] **Step 4: Chạy `typecheck` và `ai-xlsx.test.ts` để xác nhận PASS**

Run: `npm --prefix client run typecheck ; npm --prefix client test -- src/__tests__/ai-xlsx.test.ts`
Expected: 0 lỗi TS, test PASS.

---

### Task 5: Zustand + Immer Root Store & Action Slices

**Files:**
- Create: `client/src/store/index.ts`
- Create: `client/src/store/actions/flow.ts`
- Create: `client/src/store/actions/grid.ts`
- Create: `client/src/store/actions/ai.ts`
- Create: `client/src/store/actions/popout.ts`
- Create: `client/src/store/actions/versions.ts`
- Create: `client/src/store/actions/help.ts`
- Test: `client/src/__tests__/store.test.ts`

**Interfaces:**
- Consumes: Types, Data, `lib/*`.
- Produces: Zustand store hook `useAppState`, `getState`, `mutate`, 100-step `undo`/`redo`, 50-step `navGo`, và các action slices đầy đủ cho mọi thao tác người dùng.

- [ ] **Step 1: Viết test cho toàn bộ state transitions (bao gồm tất cả 5 Review Focus)**

Tạo `client/src/__tests__/store.test.ts`:
```typescript
import { describe, expect, it, beforeEach } from 'vitest';
import { getState, resetStore } from '@/store';
import * as F from '@/store/actions/flow';
import * as G from '@/store/actions/grid';
import * as AI from '@/store/actions/ai';
import * as P from '@/store/actions/popout';
import * as V from '@/store/actions/versions';
import * as H from '@/store/actions/help';

describe('Store Actions & Edge Cases', () => {
  beforeEach(() => { resetStore(); });

  it('luồng 3 bước chỉ cho phép 1 (import), 3 (grid), 4 (export); không có check', () => {
    F.loadFileNow('20261125_DAN_Jira-Export-Clean-Dataset_64DA.csv', true);
    expect(getState().loaded).toBe(true);
    expect(getState().allRows.length).toBe(64);
    F.goStep(3);
    expect(getState().view).toBe('grid');
    F.goStep(4);
    expect(getState().modal).toBe('export');
    F.goStep(1);
    expect(getState().view).toBe('import');
  });

  it('enterTest và exitTest khôi phục sạch dữ liệu GOLD ban đầu', () => {
    F.loadFileNow('x.csv', true);
    F.enterTest('dirty');
    expect(getState().test).toBe('dirty');
    expect(getState().allRows[0].raw).toBeDefined();
    F.exitTest();
    expect(getState().test).toBeNull();
    expect(getState().allRows[0].raw).toBeUndefined();
  });

  it('Agent Preview staged changes không đổi bảng trước khi duyệt, và undo hoàn tác được', () => {
    F.loadFileNow('x.csv', true);
    const prevVal = getState().allRows[0].ovr.td;
    const stageId = AI.askSubmit('Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ');
    expect(stageId).toBeTruthy();
    expect(getState().allRows[0].ovr.td).toBe(prevVal); // chưa áp dụng

    AI.stgApply(stageId!);
    expect(getState().allRows[0].ovr.td).toBe('Chậm tiến độ');
    G.undo();
    expect(getState().allRows[0].ovr.td).toBe(prevVal);
  });

  it('Picker #pkPop "Theo Jira" xoá override và khôi phục giá trị nguồn', () => {
    F.loadFileNow('x.csv', true);
    G.pkPick(0, 'tt', 'Tạm dừng');
    expect(getState().allRows[0].ovr.tt).toBe('Tạm dừng');
    G.pkPick(0, 'tt', ''); // Theo Jira
    expect(getState().allRows[0].ovr.tt).toBeUndefined();
  });

  it('Popout mở dự án, tìm kiếm, điều hướng và Phiên bản mở sửa tiếp bản cũ', () => {
    F.loadFileNow('x.csv', true);
    P.poOpen(0);
    expect(getState().po?.open).toBe(true);
    P.poSetQuery('KPI');
    expect(getState().po!.hits.length).toBeGreaterThan(0);
    P.poClose();
    expect(getState().po).toBeNull();

    V.vlEdit('w2|2');
    expect(getState().view).toBe('grid');
    expect(getState().editWk).toBe('w2');
    H.helpOpenPanel();
    expect(getState().help).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm --prefix client test -- src/__tests__/store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Triển khai `client/src/store/index.ts` và 6 action slices**

1. `store/index.ts`: Khởi tạo `AppState` sạch (bao gồm `nav`, `undoStack`, `redoStack`, `help`, `stages`, `po`, `trace`, `gx` zoom & rowH, `pn` panel width/collapse), helper `log()` ghi ngày/người/chi tiết `từ → thành`, `toast()`, safe `localStorage` wrappers (không crash trên SSR/node).
2. `actions/flow.ts`: `goStep` (chỉ hỗ trợ `1`, `3`, `4`), `curStep`, `loadFile`, `loadFileNow`, `enterTest`, `exitTest`, `setView` (chỉ `'import'|'grid'|'ver'|'log'`), `setPanel`, `setModal`, `navGo`, `pushNav`.
3. `actions/grid.ts`: `selectCell`, `applyEdit`, `pkPick`, `revertCell`, `setFmt`, `toggleWrap`, `setAlign`, `setZoom`, `setRowHeight`, `toggleCol`, `grpTog`, `colPreset`, `fixGo`, `undo`, `redo`, filter/sort/find actions.
4. `actions/ai.ts`: `askSubmit` (tạo stage preview không mutate trực tiếp, kèm mô phỏng typing delay nếu ở browser hoặc chạy ngay khi sync helper), `stgToggle`, `stgApply`, `stgDrop`, `trOpen`, `trVar`, `trOk`, `trEditOk`, `trDrop`, `trNext`, `aiWalk` state trigger.
5. `actions/popout.ts`: `poOpen`, `poClose`, `poSetQuery`, `poNavMatch`, `poNavProject`, `poToggleGroup`, `poToggleWeek`, `poToggleExp`, `poSetFontSize`, `poSetSideW`, `poToggleWkSort`.
6. `actions/versions.ts`: `doLock`, `doExport` (chỉ xuất Excel 49 cột), `vlEdit`, `vlExitEdit`, `vlTogExpand`, `vbSetA`, `vbSetB`, `vbToggleMore`.
7. `actions/help.ts`: `helpOpenPanel`, `helpClose`, `helpToggleTopic`, `helpSetQuery`, `helpTourStart`, `tourGo`, `tourExit`.

- [ ] **Step 4: Chạy `typecheck` và `store.test.ts` để xác nhận PASS**

Run: `npm --prefix client run typecheck ; npm --prefix client test -- src/__tests__/store.test.ts`
Expected: 0 lỗi TS, test PASS.

---

### Task 6: Layout Shell & Views (Import, FilePreview, Versions, Log)

**Files:**
- Create: `client/src/components/common/Icons.tsx`
- Create: `client/src/components/common/RiskText.tsx`
- Create: `client/src/components/layout/TopBar.tsx`
- Create: `client/src/components/layout/Rail.tsx`
- Create: `client/src/components/layout/TestBanner.tsx`
- Create: `client/src/components/layout/EditBanner.tsx`
- Create: `client/src/components/layout/StatusBar.tsx`
- Create: `client/src/components/layout/Toast.tsx`
- Create: `client/src/views/Import/ImportView.tsx`
- Create: `client/src/views/Import/FilePreviewModal.tsx`
- Create: `client/src/views/Versions/VersionsView.tsx`
- Create: `client/src/views/Log/LogView.tsx`
- Test: `client/src/__tests__/views-shell.test.tsx`

**Interfaces:**
- Consumes: `useAppState`, `actions/*`, `lib/*`.
- Produces: Toàn bộ khung giao diện và 3 view ngoài Grid (`Import`, `Versions`, `Log`), tuân thủ `html.lite` (3 bước TopBar, 3 nút Rail, Import gọn 2 cột, Versions có SVG chart + expandable row, Audit Log kiểu Toggl).

- [ ] **Step 1: Viết SSR smoke test cho TopBar, Rail và các Views**

Tạo `client/src/__tests__/views-shell.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { resetStore } from '@/store';
import { loadFileNow } from '@/store/actions/flow';
import { TopBar } from '@/components/layout/TopBar';
import { Rail } from '@/components/layout/Rail';
import { ImportView } from '@/views/Import/ImportView';
import { VersionsView } from '@/views/Versions/VersionsView';
import { LogView } from '@/views/Log/LogView';

describe('Layout Shell & Views SSR', () => {
  it('TopBar hiển thị đúng 3 bước và Rail chỉ có 3 mục Bảng, Phiên bản, Nhật ký', () => {
    resetStore();
    loadFileNow('20261125_DAN_Jira-Export-Clean-Dataset_64DA.csv', true);
    const top = renderToString(<TopBar />);
    expect(top).toContain('Nhập file');
    expect(top).toContain('Bảng · điền &amp; duyệt');
    expect(top).toContain('Chốt &amp; xuất');
    expect(top).not.toContain('Kiểm tra dữ liệu');

    const rail = renderToString(<Rail />);
    expect(rail).toContain('Bảng');
    expect(rail).toContain('Phiên bản');
    expect(rail).toContain('Nhật ký');
    expect(rail).not.toContain('Điều hành');
    expect(rail).not.toContain('Rủi ro');
    expect(rail).not.toContain('Mẫu BC');
  });

  it('ImportView, VersionsView (kèm SVG chart) và LogView render sạch', () => {
    resetStore();
    expect(renderToString(<ImportView />)).toContain('Nhập file Jira');
    loadFileNow('x.csv', true);
    expect(renderToString(<ImportView />)).toContain('Mở bảng báo cáo');
    const verHtml = renderToString(<VersionsView />);
    expect(verHtml).toContain('vbsvg');
    expect(verHtml).toContain('Mở trên bảng');
    const logHtml = renderToString(<LogView />);
    expect(logHtml).toContain('Nhật ký');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm --prefix client test -- src/__tests__/views-shell.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Xây dựng Common, Layout Components & 3 Views**

1. `Icons.tsx`, `RiskText.tsx`.
2. `TopBar.tsx`: Logo + `navBtns` (`Alt+←/→`) + `WeekPicker` (ẩn khi ở import) + **3 steps** (`Nhập file`, `Bảng · điền & duyệt`, `Chốt & xuất`) + `TestMenu` + `ThemeBtn` + nút `?` + nút `Xuất báo cáo`.
3. `Rail.tsx`: Đúng 3 nút (`Bảng`, `Phiên bản`, `Nhật ký`).
4. `StatusBar.tsx`: `X dòng · 49 cột` + `selInfo` + `ZoomCtl` + `LegendBtn` (kèm popover chú thích `.lgpop`, bỏ mọi nhãn thừa đã ẩn trong bản mới).
5. `TestBanner.tsx`, `EditBanner.tsx`, `Toast.tsx`.
6. `ImportView.tsx` & `FilePreviewModal.tsx`: 2 cột pre-import (`pvCard('pre')` full height + `impRecent` + `impSaved`), tiến trình đang đọc, post-import `impStats` (ẩn 7 cột `NO_JIRA`, mapping cố định), và `#pvfs` fullscreen preview có thanh công thức `#pvaddr` / `#pvval`.
7. `VersionsView.tsx`: Khối `vbBlock` (4 delta cards + biểu đồ SVG `.vbsvg` + danh sách đổi trạng thái) + bảng `vlTable3` (bấm hàng xổ 5 chỉ số `vloks` + nút `Mở trên bảng tính →`).
8. `LogView.tsx`: Bộ lọc Loại / Người / Tìm kiếm `#akQ` + bảng gom theo ngày có avatar `lgav`, ký hiệu `+`/`−`/`↻`, pill `từ → thành`.

- [ ] **Step 4: Chạy `typecheck` và `views-shell.test.tsx` để xác nhận PASS**

Run: `npm --prefix client run typecheck ; npm --prefix client test -- src/__tests__/views-shell.test.tsx`
Expected: 0 lỗi TS, test PASS.

---

### Task 7: Spreadsheet Grid, Excel Controls & Interactions

**Files:**
- Create: `client/src/hooks/useKeyboard.ts`
- Create: `client/src/hooks/useGridResize.ts`
- Create: `client/src/components/grid/FormatBar.tsx`
- Create: `client/src/components/grid/SelBar.tsx`
- Create: `client/src/components/grid/Grid.tsx`
- Create: `client/src/components/grid/Cell.tsx`
- Create: `client/src/components/grid/CellEditor.tsx`
- Create: `client/src/components/grid/PickerPop.tsx`
- Create: `client/src/components/grid/FillHandle.tsx`
- Create: `client/src/components/grid/AgentCursor.tsx`
- Create: `client/src/components/layers/ContextMenu.tsx`
- Create: `client/src/components/layers/FilterPopup.tsx`
- Create: `client/src/components/layers/FindCard.tsx`
- Create: `client/src/components/layers/PECard.tsx`
- Test: `client/src/__tests__/grid-ui.test.tsx`

**Interfaces:**
- Consumes: `FIELDS`, `GRP`, store grid/ai/popout actions.
- Produces: Bảng tính 49 cột hoàn chỉnh, thanh công cụ `.fbar` có `✦ AI` & `Khối cột` trong menu Cột, dropdown `#pkPop`, kéo mép ô đổi size, `Ctrl+Z/Y`, `AgentCursor` & `#fxTip`.

- [ ] **Step 1: Viết SSR smoke test cho FormatBar, Grid và PickerPop**

Tạo `client/src/__tests__/grid-ui.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { resetStore, mutate } from '@/store';
import { loadFileNow } from '@/store/actions/flow';
import { FormatBar } from '@/components/grid/FormatBar';
import { Grid } from '@/components/grid/Grid';

describe('Spreadsheet Grid UI SSR', () => {
  it('FormatBar có chip Trợ lý AI ngang, Dòng cần sửa, và không có nút Rổ gom', () => {
    resetStore();
    loadFileNow('x.csv', true);
    mutate((d) => { d.menu = 'cols'; });
    const fb = renderToString(<FormatBar />);
    expect(fb).toContain('aichip');
    expect(fb).toContain('Khối cột');
    expect(fb).not.toContain('Rổ gom');
  });

  it('Grid render đầy đủ 49 cột, link Mã DA popout và placeholder ô bắt buộc', () => {
    resetStore();
    loadFileNow('x.csv', true);
    const g = renderToString(<Grid />);
    expect(g).toContain('Mã DA');
    expect(g).toContain('I.A.3.1');
    expect(g).toContain('fixgo');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm --prefix client test -- src/__tests__/grid-ui.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Xây dựng Hooks, Grid Components & Layers**

1. `useKeyboard.ts` & `useGridResize.ts`: Hỗ trợ phím Excel (`Enter`, `Tab`, `Esc`, mũi tên, `Ctrl+B/I/U`, `Ctrl+Z/Y`, `Ctrl+F`, `Ctrl+G`), `Alt+←/→`, kéo mép ô (`EDGE=5`) đổi rộng cột / cao dòng, kéo chọn vùng `selDrag`.
2. `FormatBar.tsx` & `SelBar.tsx`: `#refbox`, định dạng B/I/U/S/màu chữ/màu nền/wrap/căn lề ngang dọc, `.fxval`, tìm kiếm, chip `✦ AI` ngang (`agChip`), chip `⚠ Dòng cần sửa`, và `ColsMenu` (gồm nút `Cấu hình mẫu`, chip xem nhanh, dải `Khối cột`, 49 cột, ghim `Công việc` — KHÔNG có Rổ gom). `SelBar` chỉ render khi `Object.keys(rowSel).length > 0`.
3. `Grid.tsx`, `Cell.tsx`, `CellEditor.tsx`: Header 2 tầng màu nhóm, group row kèm `grpLate` và nút `fixGo`, sticky columns (`ckc`, `Mã DA` link `.malink`, `Công việc`), pill `.spill`, placeholder `.reqph`, mũi tên `.cdd`, ô đề xuất Agent `.aipend` ghost diff, flash `.svflash` / `.fxpulse` / `.aiflash`.
4. `PickerPop.tsx`: Dropdown `#pkPop` bật ngay khi bấm 1 chạm vào ô danh sách (hiện `Theo Jira`, danh sách pill có `✓`, `Bỏ giá trị`).
5. `FillHandle.tsx`, `AgentCursor.tsx` (`#agCur` trượt tới từng ô khi Agent làm + `#fxTip` lý do), `ContextMenu.tsx`, `FilterPopup.tsx`, `FindCard.tsx`, `PECard.tsx`.

- [ ] **Step 4: Chạy `typecheck` và `grid-ui.test.tsx` để xác nhận PASS**

Run: `npm --prefix client run typecheck ; npm --prefix client test -- src/__tests__/grid-ui.test.tsx`
Expected: 0 lỗi TS, test PASS.

---

### Task 8: Right Panels, Modals & Spotlight

**Files:**
- Create: `client/src/components/panels/AiAssistantPanel.tsx`
- Create: `client/src/components/panels/AiTracePanel.tsx`
- Create: `client/src/components/panels/TplConfigPanel.tsx`
- Create: `client/src/components/modals/ProjectPopout.tsx`
- Create: `client/src/components/modals/ExportModal.tsx`
- Create: `client/src/components/modals/AiDoneModal.tsx`
- Create: `client/src/components/modals/HelpDrawer.tsx`
- Create: `client/src/components/layers/Spotlight.tsx`
- Test: `client/src/__tests__/panels-modals.test.tsx`

**Interfaces:**
- Consumes: `useAppState`, `store/actions/{ai,popout,versions,help}`, `lib/{ai,popout,xlsx}`.
- Produces: Toàn bộ panel trượt phải (có `.pnrz` resize + `.pnexp` zoom + `.pnsh` collapse), modal Chi tiết dự án 2 cột có vách kéo `.pa-split`, modal Xuất Excel 49 cột, Help Drawer và Spotlight tour.

- [ ] **Step 1: Viết SSR smoke test cho các Panel & Modal mới**

Tạo `client/src/__tests__/panels-modals.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { resetStore, mutate } from '@/store';
import { loadFileNow } from '@/store/actions/flow';
import { askSubmit, trOpen } from '@/store/actions/ai';
import { poOpen } from '@/store/actions/popout';
import { helpOpenPanel } from '@/store/actions/help';
import { AiAssistantPanel } from '@/components/panels/AiAssistantPanel';
import { AiTracePanel } from '@/components/panels/AiTracePanel';
import { ProjectPopout } from '@/components/modals/ProjectPopout';
import { ExportModal } from '@/components/modals/ExportModal';
import { HelpDrawer } from '@/components/modals/HelpDrawer';

describe('Panels & Modals SSR', () => {
  it('AiAssistantPanel render màn chào ai9 và bảng xem trước stg khi có lệnh', () => {
    resetStore();
    loadFileNow('x.csv', true);
    expect(renderToString(<AiAssistantPanel />)).toContain('ai9orb');
    askSubmit('Đổi Tiến độ của I.A.3.1 thành Chậm tiến độ');
    expect(renderToString(<AiAssistantPanel />)).toContain('Áp dụng');
  });

  it('AiTracePanel, ProjectPopout (timeline milestone), ExportModal (chỉ Excel) và HelpDrawer (3 bước) render chuẩn', () => {
    resetStore();
    loadFileNow('x.csv', true);
    trOpen(0, 'kh');
    expect(renderToString(<AiTracePanel />)).toContain('AI đọc gì');

    poOpen(0);
    const po = renderToString(<ProjectPopout />);
    expect(po).toContain('pa-split');
    expect(po).toContain('pa-ms');

    mutate((d) => { d.modal = 'export'; });
    const ex = renderToString(<ExportModal />);
    expect(ex).toContain('Chốt &amp; xuất');
    expect(ex).not.toContain('Báo cáo điều hành');

    helpOpenPanel();
    const hp = renderToString(<HelpDrawer />);
    expect(hp).toContain('Mỗi tuần làm 3 bước');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm --prefix client test -- src/__tests__/panels-modals.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Xây dựng Panels, Modals & Spotlight**

1. `AiAssistantPanel.tsx`: Tiêu đề `Trợ lý AI` (không `.seg3`), màn chào `.ai9` (quả cầu `.ai9orb`, 3 stats, 2 dải marquee `.ai9row`), hội thoại có `aityping`, bảng xem trước `stg` với checkbox/Áp dụng/Bỏ, hàng gợi ý gọn `.aisug`, ô nhập `#askIn`.
2. `AiTracePanel.tsx`: 3 phần đánh số (`AI đọc gì`, `Luật viết`, `Nháp AI trả về`), rê chuột highlight nguồn `.trl.hl`, chọn 3 biến thể, sửa/duyệt/bỏ/ô kế, `<details>` JSON V-LLM.
3. `TplConfigPanel.tsx`: Mở khi bấm nút `Cấu hình mẫu` trong `ColsMenu`, chọn tuần hiển thị.
4. `ProjectPopout.tsx`: Cửa sổ Linear `.pa-box` 2 cột với thanh kéo `.pa-split` (`pmo-po-sidew`), nút cỡ chữ `.pa-fz` (`pmo-po-fz`), điều hướng dự án, `#poQ`, thuộc tính gập được bên trái, `Tổng quan` (Mục tiêu/KPI rút gọn + timeline `.pa-ms`) và `Báo cáo tuần` bên phải.
5. `ExportModal.tsx`: 3 bước nội bộ, không lỗi chặn xuất, chỉ xuất Excel 49 cột (`exXlsx`), tên file mặc định `20261121_DAN_Bao-cao-PMO.xlsx`.
6. `AiDoneModal.tsx`, `HelpDrawer.tsx` (3 bước gọn, tìm kiếm `#hpQ`, FAQ, phím tắt), `Spotlight.tsx`.

- [ ] **Step 4: Chạy `typecheck` và `panels-modals.test.tsx` để xác nhận PASS**

Run: `npm --prefix client run typecheck ; npm --prefix client test -- src/__tests__/panels-modals.test.tsx`
Expected: 0 lỗi TS, test PASS.

---

### Task 9: App Integration, Full Test Verification & Dev Server Verification

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/main.tsx`
- Test: `client/src/__tests__/app-integration.test.tsx`

**Interfaces:**
- Consumes: Toàn bộ Views, Components, Hooks, Store từ Tasks 1–8.
- Produces: Ứng dụng hoàn chỉnh, pass `typecheck`, pass 100% test suites, và chạy mượt trên `npm --prefix client run dev`.

- [ ] **Step 1: Viết integration smoke test cho toàn bộ `<App />`**

Tạo `client/src/__tests__/app-integration.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '@/App';
import { resetStore } from '@/store';
import { loadFileNow, setView, setPanel } from '@/store/actions/flow';
import { poOpen } from '@/store/actions/popout';

describe('Full App Integration SSR', () => {
  it('App render mượt qua các view import -> grid -> ver -> log và các panel/modal', () => {
    resetStore();
    expect(renderToString(<App />)).toContain('Nhập file Jira');

    loadFileNow('x.csv', true);
    setView('grid');
    expect(renderToString(<App />)).toContain('I.A.3.1');

    setPanel('ai');
    expect(renderToString(<App />)).toContain('Trợ lý AI');

    poOpen(0);
    expect(renderToString(<App />)).toContain('pa-box');

    setView('ver');
    expect(renderToString(<App />)).toContain('Phiên bản đã chốt');

    setView('log');
    expect(renderToString(<App />)).toContain('Nhật ký');
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `npm --prefix client test -- src/__tests__/app-integration.test.tsx`
Expected: FAIL (vì `App.tsx` hiện đang là placeholder).

- [ ] **Step 3: Hoàn thiện `client/src/App.tsx` và `client/src/main.tsx`**

1. Trong `App.tsx`:
   - Gắn `useKeyboard()` và `useGridResize()`, quản lý class `.onimp` trên `document.body` khi `!loaded || view === 'import' || importing` và class `.vchg` khi đổi màn/bước.
   - Render `TopBar`, `TestBanner`, khung `.shell` chứa `Rail` (khi không ở `import`) + `.scol` (`EditBanner`, `FormatBar`, `SelBar`, `<main>` chứa View hiện tại + Panel phải nếu có, `StatusBar`).
   - Mount các layer/modal nổi: `ExportModal`, `AiDoneModal`, `ProjectPopout`, `HelpDrawer`, `PickerPop`, `FindCard`, `PECard`, `FilterPopup`, `ContextMenu`, `FillHandle`, `AgentCursor`, `Toast`, `Spotlight`.
2. Trong `main.tsx`:
   - Áp `lite` class hoặc đồng bộ style gốc, gọi `applyTheme(getStoredTheme())`, mount `<App />`.

- [ ] **Step 4: Chạy toàn bộ `typecheck` và `vitest` suite**

Run: `npm --prefix client run typecheck ; npm --prefix client test`
Expected: `tsc --noEmit` 0 lỗi, toàn bộ 9 file test (`reset`, `data`, `lib-core`, `ai-xlsx`, `store`, `views-shell`, `grid-ui`, `panels-modals`, `app-integration`) đều PASS 100%.

- [ ] **Step 5: Kiểm tra chạy thực tế bằng `npm run dev` (KHÔNG dùng `npm run build`)**

Khởi động `npm --prefix client run dev` và kiểm tra HTTP response từ `http://localhost:5173` (trả HTTP 200, nội dung Vite React được phục vụ bình thường, không có lỗi compile trong log), sau đó dừng dev server. **Lưu ý: Không chạy `npm run build` và không thực hiện bất kỳ thao tác ghi git/GitHub nào.**

---

## Self-Review Checklist

- [x] **Spec coverage:** Đáp ứng 100% `docs/superpowers/specs/2026-11-25-fe-rebuild-prototype-v4-lite-design.md` — Clean rebuild, bỏ `CheckView` & mọi màn ẩn (`exec`, `rid`, `cat`, `tlib`, `issues`, `note`, `buckets`, Word/PDF), giữ đủ 3 bước Header, 3 nút Rail, bảng 49 cột, `#pkPop`, `Khối cột`, Trợ lý AI (`ai9` + Rovo `stg` + `agWalk` + `AiTrace`), Linear 2-col `ProjectPopout`, `Versions` SVG chart, Audit `Log`, `HelpDrawer` 3 bước, và `ExportModal` Excel.
- [x] **GitHub & Dev Rules:** Quy tắc *"Không thao tác github trừ đọc"* và *"Chỉ dùng `npm run dev`, không dùng `npm run build`"* đã được ghi rõ trong cả Spec lẫn Global Constraints & Task 9 của Plan; không có bất kỳ bước `git add` / `git commit` nào trong Plan.
- [x] **Step scan & Test compatibility:** Mọi file test đều tương thích với `environment: 'node'` của `client/vite.config.ts` (không phụ thuộc `@testing-library/react` hay `jsdom` chưa được cài).
- [x] **Type consistency:** Tên trường (`ma`, `viec`, `tt`, `td`, `ht`, `kh`, `vd`, `rui`...), actions (`goStep`, `loadFileNow`, `askSubmit`, `stgApply`, `pkPick`, `poOpen`, `vlEdit`) thống nhất xuyên suốt các Task 2–9.
