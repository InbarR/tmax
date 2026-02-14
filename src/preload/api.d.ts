import type { TerminalAPI } from './preload';

declare global {
  interface Window {
    terminalAPI: TerminalAPI;
  }
}
