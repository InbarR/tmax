import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Suppress harmless xterm.js 'dimensions' error thrown async during terminal disposal
window.addEventListener('error', (e) => {
  if (e.message?.includes('dimensions')) {
    e.preventDefault();
  }
});

const container = document.getElementById('root')!;
const root = createRoot(container);

const params = new URLSearchParams(window.location.search);
const detachedTerminalId = params.get('detachedTerminalId');

if (detachedTerminalId) {
  // Detached terminal window — load minimal UI
  import('./DetachedApp').then(({ default: DetachedApp }) => {
    root.render(<DetachedApp terminalId={detachedTerminalId} />);
  });
} else {
  // Main app window
  root.render(<App />);
}
