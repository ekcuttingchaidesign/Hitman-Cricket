import { describe, expect, it } from 'vitest';
import type { WebGLRenderer } from 'three';
import { Vector2 } from 'three';
import { atExportResolution, exportDimensions } from '../tools/graphics-review-export';

function rendererFixture(ratio = 1.5, limit = 8192, clamp = false) {
  let width = 390, height = 660, pixelRatio = ratio;
  const changes: [number, number, boolean][] = [];
  const gl = {
    MAX_RENDERBUFFER_SIZE: 1, MAX_VIEWPORT_DIMS: 2,
    getParameter: (key: number) => key === 1 ? limit : new Int32Array([limit, limit]),
    isContextLost: () => false,
    get drawingBufferWidth() { return clamp ? 585 : Math.floor(width * pixelRatio); },
    get drawingBufferHeight() { return clamp ? 990 : Math.floor(height * pixelRatio); },
  };
  const renderer = {
    getContext: () => gl,
    getSize: (v: Vector2) => v.set(width, height),
    getPixelRatio: () => pixelRatio,
    setPixelRatio: (v: number) => { pixelRatio = v; },
    setSize: (w: number, h: number, css: boolean) => { width = w; height = h; changes.push([w, h, css]); },
  } as unknown as WebGLRenderer;
  return { renderer, changes };
}

describe('high resolution review export', () => {
  it('keeps the chosen aspect and generates 4K pixels independently of screen DPR', () => {
    expect(exportDimensions(390, 660, 3840)).toEqual({ width: 2269, height: 3840 });
    expect(exportDimensions(390, 844, 3840)).toEqual({ width: 1774, height: 3840 });
    expect(exportDimensions(1280, 720, 3840)).toEqual({ width: 3840, height: 2160 });
    expect(exportDimensions(390, 660, 2560)).toEqual({ width: 1513, height: 2560 });
  });
  it.each([1, 1.5, 2, 3])('renders at native export resolution and restores a %s× preview', ratio => {
    const { renderer, changes } = rendererFixture(ratio);
    const size = exportDimensions(390, 660, 3840);
    const result = atExportResolution(renderer, size, () => {
      expect(renderer.getPixelRatio()).toBe(1);
      expect(renderer.getSize(new Vector2()).toArray()).toEqual([2269, 3840]);
      return 'captured';
    });
    expect(result).toBe('captured');
    expect(renderer.getPixelRatio()).toBe(ratio);
    expect(renderer.getSize(new Vector2()).toArray()).toEqual([390, 660]);
    expect(changes).toEqual([[2269, 3840, false], [390, 660, false]]);
  });
  it('restores the preview if capturing the high-resolution canvas fails', () => {
    const { renderer } = rendererFixture();
    expect(() => atExportResolution(renderer, { width: 2269, height: 3840 }, () => {
      throw new Error('copy failed');
    })).toThrow('copy failed');
    expect(renderer.getSize(new Vector2()).toArray()).toEqual([390, 660]);
    expect(renderer.getPixelRatio()).toBe(1.5);
  });
  it('rejects unsupported or silently clamped sizes instead of saving a low-res file', () => {
    for (const { renderer } of [rendererFixture(1.5, 2048), rendererFixture(1.5, 8192, true)]) {
      expect(() => atExportResolution(renderer, { width: 2269, height: 3840 }, () => {
        throw new Error('should never capture');
      })).toThrow(/Choose a smaller/);
      expect(renderer.getSize(new Vector2()).toArray()).toEqual([390, 660]);
      expect(renderer.getPixelRatio()).toBe(1.5);
    }
  });
});
