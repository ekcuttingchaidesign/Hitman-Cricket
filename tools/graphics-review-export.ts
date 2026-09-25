import { Vector2 } from 'three';
import type { WebGLRenderer } from 'three';

export function exportDimensions(width: number, height: number, longEdge: number) {
  const scale = longEdge / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Render new pixels at the export resolution, keeping camera and CSS untouched.
 * Restore the lightweight preview even if allocation, rendering or copying fails. */
export function atExportResolution<T>(
  renderer: WebGLRenderer,
  size: { width: number; height: number },
  capture: () => T,
): T {
  const gl = renderer.getContext();
  const maxBuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  if (size.width > Math.min(maxBuffer, maxViewport[0]) || size.height > Math.min(maxBuffer, maxViewport[1])) {
    throw new Error('This device cannot render that image size. Choose a smaller export size.');
  }
  if (gl.isContextLost()) throw new Error('The graphics context was lost. Reload the page before exporting.');
  const previousSize = renderer.getSize(new Vector2());
  const previousRatio = renderer.getPixelRatio();
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(size.width, size.height, false);
    // Some mobile drivers clamp their drawing buffer without throwing.
    if (gl.drawingBufferWidth !== size.width || gl.drawingBufferHeight !== size.height) {
      throw new Error('The device could not allocate the full image. Choose a smaller export size.');
    }
    return capture();
  } finally {
    // Shrink first: restoring DPR while still at 4K would briefly allocate an
    // even bigger buffer, precisely when a phone is under memory pressure.
    renderer.setSize(previousSize.x, previousSize.y, false);
    renderer.setPixelRatio(previousRatio);
  }
}
