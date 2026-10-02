/** Browser entry. Mounts the app and nothing else. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';
import './debug.css';
import './settings.css';
import './setup.css';
import './sheet.css';
import './styles.css';
import './usage.css';

const container = document.querySelector('#root');
if (!container) throw new Error('index.html is missing #root.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
