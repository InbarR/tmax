import { describe, expect, test } from 'vitest';
import { getRendererWindowMode } from '../../../src/renderer/window-mode';

describe('renderer window mode (TASK-279)', () => {
  test('routes the Backlog query to the detached Backlog renderer', () => {
    expect(getRendererWindowMode('?detachedBacklog=1')).toEqual({ kind: 'backlog' });
  });

  test('keeps detached terminals and the main window distinct', () => {
    expect(getRendererWindowMode('?detachedTerminalId=term-1')).toEqual({
      kind: 'terminal',
      terminalId: 'term-1',
    });
    expect(getRendererWindowMode('')).toEqual({ kind: 'main' });
  });
});
