import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';
import { getRendererWindowMode } from './window-mode';

// Suppress harmless xterm.js 'dimensions' error thrown async during terminal disposal
window.addEventListener('error', (e) => {
  if (e.message?.includes('dimensions')) {
    e.preventDefault();
  }
});

const container = document.getElementById('root')!;
const root = createRoot(container);

const windowMode = getRendererWindowMode(window.location.search);

if (windowMode.kind === 'terminal') {
  // Detached terminal window — load minimal UI
  import('./DetachedApp').then(({ default: DetachedApp }) => {
    root.render(<DetachedApp terminalId={windowMode.terminalId} />);
  });
} else if (windowMode.kind === 'backlog') {
  import('./DetachedBacklogApp').then(({ default: DetachedBacklogApp }) => {
    root.render(<DetachedBacklogApp />);
  });
} else {
  // Main app window
  root.render(<App />);
}
