import '@fontsource-variable/archivo';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './shared/styles/global.css';
import './shared/config/zodLocale';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el elemento #root en index.html.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
