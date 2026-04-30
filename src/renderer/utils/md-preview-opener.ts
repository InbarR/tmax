import { useTerminalStore } from '../state/terminal-store';

export async function readMarkdownFile(fullPath: string, wslDistro?: string): Promise<{ filePath: string; content: string; fileName: string } | null> {
  const content = await (window.terminalAPI as any).fileRead(fullPath, wslDistro);
  if (content == null) return null;
  const fileName = fullPath.split(/[/\\]/).pop() || fullPath;
  return { filePath: fullPath, content, fileName };
}

export async function openMarkdownPreview(fullPath: string, wslDistro?: string): Promise<boolean> {
  const preview = await readMarkdownFile(fullPath, wslDistro);
  if (!preview) return false;
  useTerminalStore.setState({ markdownPreview: preview });
  return true;
}
