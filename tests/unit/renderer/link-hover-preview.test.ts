import { describe, expect, it } from 'vitest';
import { computeLinkPreviewPosition } from '../../../src/renderer/utils/link-hover-preview';

describe('computeLinkPreviewPosition', () => {
  it('places the preview below and to the right when there is room', () => {
    expect(computeLinkPreviewPosition(
      { x: 100, y: 80 },
      { width: 240, height: 60 },
      { width: 800, height: 600 },
    )).toEqual({ left: 112, top: 92 });
  });

  it('clamps long previews inside the right edge', () => {
    expect(computeLinkPreviewPosition(
      { x: 760, y: 80 },
      { width: 300, height: 60 },
      { width: 800, height: 600 },
    )).toEqual({ left: 492, top: 92 });
  });

  it('moves the preview above the pointer near the bottom edge', () => {
    expect(computeLinkPreviewPosition(
      { x: 100, y: 580 },
      { width: 240, height: 80 },
      { width: 800, height: 600 },
    )).toEqual({ left: 112, top: 488 });
  });
});
