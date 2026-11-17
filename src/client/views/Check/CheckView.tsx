import type { ReactNode } from 'react';
import { DEMO } from '@/data/constants';
import { chkCols, chkCounts } from '@/lib/check';
import { cleanStats } from '@/lib/cleanStats';
import { jiraDiffs } from '@/lib/catalog';
import { useAppState, useRows } from '@/hooks/useDerived';
import { setChk, toggle } from '@/store/actions/flow';
import { ColFoot, ColTab, DoneFoot, DoneTab, FmtFoot, FmtTab, PrjFoot, PrjTab, ValFoot, ValTab } from './CheckTabs';

type TabId = 'col' | 'val' | 'fmt' | 'prj' | 'done';

function NavItem({ id, tab, n, t, cnt, sev, sub }: { id: TabId; tab: string; n: number; t: string; cnt: number; sev: string; sub: string }) {
  const ok = !cnt;
  return (
    <button className={'cknav' + (tab === id ? ' on' : '')} data-t={id} onClick={() => setChk('chkTab', id)}>
      <span className={'ckn ' + (ok ? 'ok' : sev)}>{ok ? '✓' : n}</span>
      <span className="ckt"><b>{t}</b><small>{sub}</small></span>
      {cnt ? <span className={'ckc2 ' + sev}>{cnt}</span> : null}
    </button>
  );
}

/** Bước 2 · Kiểm tra dữ liệu: khớp cột, quy đổi giá trị, làm sạch nội dung, ghép dự án. */
export function CheckView() {
  const s = useAppState();
  const rows = useRows();
  const C = chkCounts(s);
  const tab: TabId = ((s.chkTab as TabId) || (C.col ? 'col' : C.val ? 'val' : C.prj.length ? 'prj' : 'done'));
  const block = C.col + C.prjE;
  const warn = C.val + C.prjW;
  const S = cleanStats(s);
  const info = [
    'Multi Tags không có trong file · không bắt buộc',
    '2 issue thật chỉ có Assignee Id · PIC lấy theo hệ thống',
    `${DEMO.tempCodes.length} dòng mã tạm trong mẫu · giữ nguyên khi xuất`,
    `${jiraDiffs(s, rows).length} ô Jira ghi khác hệ thống · báo cáo theo hệ thống`,
  ];
  const props = { s, rows, C };
  let body: ReactNode; let foot: ReactNode;
  if (tab === 'fmt') { body = <FmtTab {...props} />; foot = <FmtFoot />; }
  else if (tab === 'col') { body = <ColTab {...props} />; foot = <ColFoot C={C} />; }
  else if (tab === 'val') { body = <ValTab {...props} />; foot = <ValFoot C={C} />; }
  else if (tab === 'prj') { body = <PrjTab {...props} />; foot = <PrjFoot C={C} />; }
  else { body = <DoneTab {...props} />; foot = <DoneFoot C={C} />; }
  const doneAll = (C.col ? 0 : 1) + (C.val ? 0 : 1) + (C.prj.length ? 0 : 1);

  return (
    <div className="gridwrap ckwrap">
      <div className="ckshell">
        <header className="cktop">
          <div><div className="lbl">Bước 2 · Kiểm tra dữ liệu</div><h1>{block + warn ? `Còn ${block + warn} việc cần bạn quyết định` : 'Dữ liệu đã sẵn sàng'}</h1></div>
          <div className="cktopr">
            <div className="ckbadges">
              {block > 0 && <span className="sev2 e">{block} chặn xuất</span>}
              {warn > 0 && <span className="sev2 w">{warn} nên xử lý</span>}
              {!block && !warn && <span className="sev2 o">✓ Sẵn sàng</span>}
            </div>
            <div className="cksegs" aria-label={`${doneAll}/3 bước con đã xong`}>{[C.col, C.val, C.prj.length].map((n, k) => <i key={k} className={n ? '' : 'on'} />)}</div>
          </div>
        </header>
        <div className="ckframe">
          <div className="ckbody">
            <aside className="ckside">
              <div className="ckgrp">{block + warn ? `${block + warn} việc còn lại${block ? `, ${block} chặn xuất` : ''}` : 'Đã xong cả 4 mục'}</div>
              <div className="ckrail">
                <NavItem id="col" tab={tab} n={1} t="Khớp cột" cnt={C.col} sev="e" sub={C.col ? `${C.col} cột chưa có nguồn` : `${chkCols(s).length} cột Jira đã khớp`} />
                <NavItem id="val" tab={tab} n={2} t="Quy đổi giá trị" cnt={C.val} sev="w" sub={C.val ? `${C.val} giá trị lạ` : 'Mọi giá trị có luật'} />
                <NavItem id="fmt" tab={tab} n={3} t="Làm sạch nội dung" cnt={0} sev="o" sub={S.all ? `${S.all} chỗ đã làm gọn` : 'Không có lỗi định dạng'} />
                <NavItem id="prj" tab={tab} n={4} t="Ghép dự án" cnt={C.prj.length} sev={C.prjE ? 'e' : 'w'} sub={C.prj.length ? `${C.prjE ? C.prjE + ' chặn · ' : ''}${C.prjW} nên xử lý` : `${rows.length} dự án đã ghép`} />
              </div>
              <button className="ckinfo" onClick={() => toggle('infoOpen')} aria-expanded={s.infoOpen}>Để biết · {info.length} {s.infoOpen ? '▾' : '▸'}</button>
              {s.infoOpen && <ul className="ckinfol">{info.map((x) => <li key={x}>{x}</li>)}</ul>}
            </aside>
            {body}
          </div>
          <footer className="ckfoot">{foot}</footer>
        </div>
      </div>
    </div>
  );
}
