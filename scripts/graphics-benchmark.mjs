// Deterministic renderer comparison. No Game, analytics, scores or API writes.
// Run against a Vite dev server: node scripts/graphics-benchmark.mjs URL LABEL
// Software-rendered timings describe this machine, not a real phone's FPS.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const base = process.argv[2] ?? 'http://127.0.0.1:5201';
const label = process.argv[3] ?? 'experiment';
const server = process.env.BENCH_SERVE ? spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5201'], { stdio: 'ignore' }) : null;
if (server) {
  process.on('exit', () => server.kill());
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) break; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
for (const [name, width, height, mobile, night] of [
  ['phone-day', 390, 844, true, false], ['phone-night', 390, 844, true, true],
  ['desktop-day', 1280, 720, false, false],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/graphics-benchmark', r => r.fulfill({ contentType: 'text/html', body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="ground" style="width:100vw;height:100vh"></div></body></html>' }));
  await page.goto(`${base}/graphics-benchmark`);
  await page.evaluate(async night => {
    const { GameScene } = await import('/src/scene/GameScene.ts');
    const s = window.labScene = new GameScene(document.querySelector('#ground'));
    if (night) s.time('night');
    s.render(0);
  }, night);
  await page.waitForTimeout(500);
  const stats = await page.evaluate(async () => {
    const s = window.labScene, samples = [];
    const gl = s.renderer.getContext();
    for (let i = 0; i < 20; i++) {
      await new Promise(requestAnimationFrame);
      const start = performance.now();
      s.render(0); gl.finish();
      if (i >= 5) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const info = s.renderer.info;
    return { calls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures,
      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      medianSubmitMs: samples[7], p95SubmitMs: samples[14], renderer: gl.getParameter(gl.RENDERER) };
  });
  results.push({ name, ...stats, errors });
  console.log(JSON.stringify(results.at(-1)));
  const png = await page.evaluate(() => { window.labScene.render(0); return window.labScene.renderer.domElement.toDataURL('image/png').split(',')[1]; });
  await writeFile(`test-results/graphics-${label}-${name}.png`, Buffer.from(png, 'base64'));
  await page.close();
}
await browser.close();
server?.kill();
await writeFile(`test-results/graphics-${label}.json`, JSON.stringify(results, null, 2));
if (results.some(r => r.errors.length)) process.exitCode = 1;
