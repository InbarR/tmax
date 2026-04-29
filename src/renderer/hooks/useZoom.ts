import { useState, useEffect, useCallback, RefObject } from 'react';
import { hasPrimaryMod } from '../utils/platform';

const ZOOM_STEP = 10;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;

export interface UseZoomOptions {
  /** Element to attach primary-modifier scroll listener to */
  containerRef: RefObject<HTMLElement | null>;
  /** Initial zoom percentage (default 100) */
  initial?: number;
}

export interface UseZoomReturn {
  zoomPercent: number;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  /** Computed font-size string based on a base size (default 14px) */
  fontSize: (basePx?: number) => string;
}

export function useZoom({ containerRef, initial = 100 }: UseZoomOptions): UseZoomReturn {
  const [zoomPercent, setZoomPercent] = useState(initial);

  const zoomIn = useCallback(() => setZoomPercent((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX)), []);
  const zoomOut = useCallback(() => setZoomPercent((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN)), []);
  const zoomReset = useCallback(() => setZoomPercent(100), []);

  // Primary modifier + scroll to zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (!hasPrimaryMod(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY < 0) {
        setZoomPercent((z) => Math.min(z + ZOOM_STEP, ZOOM_MAX));
      } else {
        setZoomPercent((z) => Math.max(z - ZOOM_STEP, ZOOM_MIN));
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [containerRef]);

  const fontSize = useCallback((basePx = 14) => `${basePx * zoomPercent / 100}px`, [zoomPercent]);

  return { zoomPercent, zoomIn, zoomOut, zoomReset, fontSize };
}
