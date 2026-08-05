import { describe, expect, test } from 'vitest';
import { PS_INTEGRATION_CONTENT } from '../../../src/main/powershell-integration';

describe('PowerShell integration (TASK-278)', () => {
  test('constructs OSC 7 with control characters supported by Windows PowerShell 5.1', () => {
    expect(PS_INTEGRATION_CONTENT).toContain('$esc = [char]27');
    expect(PS_INTEGRATION_CONTENT).toContain('$bel = [char]7');
    expect(PS_INTEGRATION_CONTENT).toContain(
      '[Console]::Write("${esc}]7;${u}${bel}")',
    );
    expect(PS_INTEGRATION_CONTENT).not.toContain('`e');
  });

  test('preserves the current-directory file URI payload', () => {
    expect(PS_INTEGRATION_CONTENT).toContain(
      '$u = "file:///" + ($d -replace "\\\\","/")',
    );
  });
});
