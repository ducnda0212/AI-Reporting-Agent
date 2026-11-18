import { useEffect } from 'react';
import { useAppState } from '@/hooks/useDerived';
import { useGridKeyboard } from '@/hooks/useGridKeyboard';
import { closeMenu } from '@/store/actions/flow';
import { rerunReport, setCatTab } from '@/store/actions/catalog';
import { TopBar } from '@/components/layout/TopBar';
import { Rail } from '@/components/layout/Rail';
import { StatusBar } from '@/components/layout/StatusBar';
import { TestBanner } from '@/components/layout/TestBanner';
import { AiRunBar, Toast } from '@/components/layout/Toast';
import { FormatBar, SelBar } from '@/components/grid/FormatBar';
import { Grid } from '@/components/grid/Grid';
import { FillHandle } from '@/components/grid/FillHandle';
import { HubPanel } from '@/components/panels/HubPanel';
import { TplConfigPanel } from '@/components/panels/TplConfigPanel';
import { ProjectPanel } from '@/components/panels/ProjectPanel';
import { AiDoneModal } from '@/components/modals/AiDoneModal';
import { BucketsModal } from '@/components/modals/BucketsModal';
import { ExportModal } from '@/components/modals/ExportModal';
import { MappingPop } from '@/components/modals/MappingPop';
import { ReqModal } from '@/components/modals/ReqModal';
import { ContextMenu } from '@/components/layers/ContextMenu';
import { FilterPopup } from '@/components/layers/FilterPopup';
import { FindCard } from '@/components/layers/FindCard';
import { PECard } from '@/components/layers/PECard';
import { Spotlight } from '@/components/layers/Spotlight';
import { CatalogView } from '@/views/Catalog/CatalogView';
import { CheckView } from '@/views/Check/CheckView';
import { ExecView } from '@/views/Exec/ExecView';
import { ImportView } from '@/views/Import/ImportView';
import { LogView } from '@/views/Log/LogView';
import { RiskView } from '@/views/Risk/RiskView';
import { TemplateLibView } from '@/views/TemplateLib/TemplateLibView';
import { TemplateView } from '@/views/Template/TemplateView';
import { VersionsView } from '@/views/Versions/VersionsView';

function MainView() {
  const view = useAppState().view;
  switch (view) {
    case 'import': return <ImportView />;
    case 'check': return <CheckView />;
    case 'exec': return <ExecView />;
    case 'cat': return <CatalogView />;
    case 'log': return <LogView />;
    case 'tpl': return <TemplateView />;
    case 'tlib': return <TemplateLibView />;
    case 'ver': return <VersionsView />;
    case 'rid': return <RiskView />;
    default: return <Grid />;
  }
}

/** Thanh báo "hệ thống đã cập nhật" — nhắc chạy lại báo cáo. */
function RerunBar() {
  const s = useAppState();
  return (
    <div className="selbar gut" style={{ background: '#eef4fd', borderBottomColor: '#bcd2f3' }}>
      <span style={{ fontWeight: 600, color: '#2a5db0' }}>Hệ thống đã cập nhật {s.catPend} thông tin</span>
      <span style={{ color: 'var(--mut)' }}>Báo cáo đang dùng dữ liệu lần chạy {s.catRunAt || ''}. Chạy lại để lấy thông tin mới.</span>
      <div style={{ flex: '1 1 10px' }} />
      <button className="btn sm" onClick={() => setCatTab('req')}>Xem thay đổi</button>
      <button className="btn sm pri" onClick={rerunReport}>Chạy lại báo cáo</button>
    </div>
  );
}

export function App() {
  const s = useAppState();
  useGridKeyboard();

  /* bấm ra ngoài thì đóng menu nổi */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.menu') && !t.closest('.mwrap')) closeMenu();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const flow = s.view === 'import' || s.view === 'check';
  const grid = s.view === 'grid' && s.loaded;
  const panel = s.panel === 'issues' || s.panel === 'ai' || s.panel === 'rev' || s.panel === 'ask' || s.panel === 'note' ? <HubPanel /> : s.panel === 'project' ? <ProjectPanel /> : s.panel === 'tvcfg' ? <TplConfigPanel /> : null;
  const inner = (
    <>
      {s.loaded && s.catPend > 0 && (s.view === 'grid' || s.view === 'check') && <RerunBar />}
      {grid && <><FormatBar /><SelBar /></>}
      <main><MainView />{panel}</main>
      {grid && <StatusBar />}
    </>
  );

  return (
    <div id="app">
      <TopBar />
      <TestBanner />
      {flow ? inner : <div className="shell"><Rail /><div className="scol">{inner}</div></div>}

      {/* lớp nổi */}
      {s.modal === 'buckets' && <BucketsModal />}
      {s.modal === 'export' && <ExportModal />}
      {s.modal === 'aiDone' && <AiDoneModal />}
      {s.modal === 'req' && s.reqForm && <ReqModal />}
      {s.pop && <MappingPop />}
      <AiRunBar />
      <FindCard />
      <PECard />
      <FilterPopup />
      <ContextMenu />
      <FillHandle />
      <Toast />
      <Spotlight />
    </div>
  );
}

