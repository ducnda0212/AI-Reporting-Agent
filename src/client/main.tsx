import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/flow.css';
import './styles/spotlight-versions.css';
import './styles/steps-export-catalog.css';
import './styles/panels.css';
import './styles/search-edit-test.css';
import './styles/excel.css';
import './styles/import-check.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
