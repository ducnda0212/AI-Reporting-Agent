import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, getStoredTheme } from './lib/theme';
import './styles/pmo-prototype.css';

document.documentElement.classList.add('lite');
const theme = getStoredTheme();
if (theme) applyTheme(theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
