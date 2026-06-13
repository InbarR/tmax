// Recovery sequences for a pane left in a broken terminal state by an inline
// (Ink-based) TUI - Copilot CLI, Claude Code, fzf inline mode - that enabled
// terminal features and then died (Ctrl+C / crash) before restoring them.
// GH #117, TASK-162/163.

// Turns off every DEC mouse-tracking protocol (?1000 / ?1002 / ?1003 / ?1006 /
// ?1015). Without it, xterm keeps forwarding wheel + drag to the dead child,
// so drag-select and click-selection stay broken on that pane.
export const MOUSE_RESET_SEQUENCE =
  '\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l\x1b[?1015l';

// Full recovery: mouse reset PLUS exit the alternate-screen buffer
// (?1049 / ?1047 / ?47) and reset SGR attributes (\x1b[0m).
//
// A TUI that dies without sending ?1049l leaves the pane stuck on the alt
// buffer. The alt buffer has no scrollback, so the mouse wheel has nothing to
// scroll ("scroll doesn't work"), and it still shows the TUI's last paint -
// often a solid background fill that renders as a black slab above the prompt
// (TASK-163). Exiting alt-screen restores the normal buffer and its
// scrollback: wheel scroll works again and the black fill disappears. The SGR
// reset clears any leftover background/foreground attribute so subsequent
// output isn't painted in the dead TUI's colors.
//
// All three alt-screen variants are reset because different TUIs use different
// ones; the extra ?...l resets are harmless no-ops once the buffer is normal.
export const TERMINAL_RECOVER_SEQUENCE =
  MOUSE_RESET_SEQUENCE + '\x1b[?1049l\x1b[?1047l\x1b[?47l\x1b[0m';
