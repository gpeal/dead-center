import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { cloudInit } from './lib/store';
import { watchUpdates } from './lib/updates';
import { IN_FRAME } from './lib/util';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
cloudInit();
if (import.meta.env.PROD && !IN_FRAME && 'serviceWorker' in navigator && /^https?:/.test(location.protocol)) watchUpdates();
