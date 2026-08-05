import React, { useEffect, useState } from 'react';
import BacklogBoard from './components/BacklogBoard';
import { applyThemeToChromeVars, useTerminalStore } from './state/terminal-store';
import type { AppConfig } from './state/types';

const DetachedBacklogApp: React.FC = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void window.terminalAPI.getConfig().then((config) => {
      if (cancelled) return;
      const materialActive =
        !!config.backgroundMaterial && config.backgroundMaterial !== 'none';
      const theme = config.theme as Record<string, string> | undefined;
      if (theme) {
        applyThemeToChromeVars(
          theme,
          materialActive ? (config.backgroundOpacity as number | undefined) ?? 0.8 : undefined,
        );
      }
      useTerminalStore.setState({ config: config as unknown as AppConfig, showBacklog: true });
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;
  return <BacklogBoard detached />;
};

export default DetachedBacklogApp;
