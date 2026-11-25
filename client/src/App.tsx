/* Khung ứng dụng (prototype render L5617): thanh trên, `.shell` = Rail + `.scol`, các lớp nổi.
   Màn nhập file không có Rail. Các lớp nổi của bảng nằm ngoài `.gridwrap` (CSS zoom/transform làm hỏng position:fixed). */
import { useEffect } from 'react';
import { getState, useAppState } from '@/store';
import { curStep, initStage1Bootstrap } from '@/store/actions/flow';
import { setMenu } from '@/store/actions/grid';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useGridResize } from '@/hooks/useGridResize';
import { TopBar } from '@/components/layout/TopBar';
import { Rail } from '@/components/layout/Rail';
import { StatusBar } from '@/components/layout/StatusBar';
import { Toast } from '@/components/layout/Toast';
import { EditBanner } from '@/components/layout/EditBanner';
import { FormatBar } from '@/components/grid/FormatBar';
import { SelBar } from '@/components/grid/SelBar';
import { Grid } from '@/components/grid/Grid';
import { PickerPop } from '@/components/grid/PickerPop';
import { FillHandle } from '@/components/grid/FillHandle';
import { AgentCursor } from '@/components/grid/AgentCursor';
import { FindCard } from '@/components/layers/FindCard';
import { PECard } from '@/components/layers/PECard';
import { FilterPopup } from '@/components/layers/FilterPopup';
import { ContextMenu } from '@/components/layers/ContextMenu';
import { Spotlight } from '@/components/layers/Spotlight';
import { ExportModal } from '@/components/modals/ExportModal';
import { AiDoneModal } from '@/components/modals/AiDoneModal';
import { ProjectPopout } from '@/components/modals/ProjectPopout';
import { HelpDrawer } from '@/components/modals/HelpDrawer';
import { AiAssistantPanel } from '@/components/panels/AiAssistantPanel';
import { AiTracePanel } from '@/components/panels/AiTracePanel';
import { TplConfigPanel } from '@/components/panels/TplConfigPanel';
import { ImportView } from '@/views/Import/ImportView';
import { VersionsView } from '@/views/Versions/VersionsView';
import { LogView } from '@/views/Log/LogView';

/** Bấm ra ngoài menu thì đóng menu (prototype L5966); nút mở menu tự bật/tắt nên bỏ qua. */
export function onOutsideClick(ev: MouseEvent): void {
  const t = ev.target as HTMLElement | null;
  if (getState().menu && t && !t.closest('.menu, [aria-haspopup], [data-act="menu"]')) setMenu(null);
}

export function App(): JSX.Element {
  const s = useAppState((x) => x);
  const onImp = !s.loaded || s.view === 'import' || !!s.importing, step = curStep(s);
  useKeyboard();
  useGridResize();

  /* kỳ báo cáo, lịch sử nhập file, cấu hình mapping: lấy từ máy chủ một lần khi mở trang */
  useEffect(() => { void initStage1Bootstrap(); }, []);
  useEffect(() => { document.addEventListener('click', onOutsideClick, true); return () => document.removeEventListener('click', onOutsideClick, true); }, []);
  useEffect(() => { document.body.classList.toggle('onimp', onImp); }, [onImp]);
  useEffect(() => { if (getState().menu) setMenu(null); }, [s.view]);
  /* hiệu ứng vào màn khi đổi màn / bước, tắt sau 400ms (prototype L12496) */
  useEffect(() => {
    document.body.classList.add('vchg');
    const t = setTimeout(() => document.body.classList.remove('vchg'), 400);
    return () => clearTimeout(t);
  }, [s.view, step]);

  const grid = s.view === 'grid' && s.loaded;
  const panel = s.panel === 'ai' ? <AiAssistantPanel /> : s.panel === 'aitrace' ? <AiTracePanel /> : s.panel === 'tvcfg' ? <TplConfigPanel /> : null;
  const main = (
    <main>
      {onImp ? <ImportView /> : s.view === 'ver' ? <VersionsView /> : s.view === 'log' ? <LogView /> : <Grid />}
      {panel}
    </main>
  );
  return (
    <>
      <TopBar />
      {onImp ? main : (
        <div className="shell">
          <Rail />
          <div className="scol">
            <EditBanner />
            {grid && <><FormatBar /><SelBar /></>}
            {main}
            <StatusBar />
          </div>
        </div>
      )}
      <ExportModal /><AiDoneModal /><ProjectPopout /><HelpDrawer />
      <PickerPop /><FilterPopup /><ContextMenu /><FindCard /><PECard /><FillHandle /><AgentCursor />
      <Toast /><Spotlight />
    </>
  );
}
