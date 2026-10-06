import type * as THREE from 'three';

/** Optional on-device measurement, enabled only by ?perf=1. No network traffic.
 * Measures render-loop intervals (including game work), not just JS submission.
 */
export class PerformanceReadout {
  private node: HTMLDivElement;
  private previous = 0;
  private since = 0;
  private samples: number[] = [];
  constructor(container: HTMLElement) {
    this.node = document.createElement('div');
    this.node.dataset.graphicsPerf = '';
    this.node.style.cssText = 'position:absolute;bottom:8px;left:8px;z-index:100;pointer-events:none;background:#102d35e8;color:#fff;padding:7px 10px;border-radius:7px;font:11px/1.5 monospace;white-space:pre';
    this.node.textContent = 'Graphics lab · measuring…';
    container.append(this.node);
  }
  update(renderer: THREE.WebGLRenderer) {
    const now = performance.now(), gap = now - this.previous;
    if (!this.previous || gap > 1000) { this.samples.length = 0; this.since = now; }
    else this.samples.push(gap);
    this.previous = now;
    if (now - this.since < 1000 || !this.samples.length) return;
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples.sort((a, b) => a - b);
    const p95 = this.samples[Math.min(this.samples.length - 1, Math.ceil(this.samples.length * .95) - 1)];
    const info = renderer.info.render;
    this.node.textContent = `Graphics lab · ${Math.round(1000 / mean)} FPS\nP95 ${p95.toFixed(1)} ms · ${info.calls} draws\n${Math.round(info.triangles / 1000)}k triangles · DPR ${renderer.getPixelRatio()}`;
    this.samples.length = 0; this.since = now;
  }
  dispose() { this.node.remove(); }
}
