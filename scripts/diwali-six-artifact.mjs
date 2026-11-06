// Builds the Diwali six preview (src/diwali-six-preview.ts, drawing
// src/scene/diwaliSix.ts) into one self-contained page for publishing as an
// artifact, with the game's two faces inlined:
//   node scripts/diwali-six-artifact.mjs [out.html]
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = process.argv[2] ?? 'dist-single/diwali-six.html';
const dir = mkdtempSync(join(tmpdir(), 'diwali-six-'));
await build({
  configFile: false, logLevel: 'warn',
  build: {
    outDir: dir, emptyOutDir: true, target: 'es2020',
    lib: { entry: 'src/diwali-six-preview.ts', formats: ['iife'], name: 'DiwaliSix', fileName: () => 'six.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
const js = readFileSync(join(dir, 'six.js'), 'utf8').replaceAll('</script', '<\\/script');
rmSync(dir, { recursive: true, force: true });
const font = (file) => `data:font/woff2;base64,${readFileSync(file).toString('base64')}`;

const beats = [
  [200, '0.00', 'Rockets go up at the sides; the mandala starts drawing itself'],
  [420, '0.26', 'DIWALI rises in, one gold letter at a time'],
  [560, '0.36', 'Bursts at the sides, a third of a second apart'],
  [700, '0.56', 'Diyas light along the foot from the middle out'],
  [860, '0.64', 'A spark writes "Happy" in over it'],
  [1200, '1.02', 'SIX · MAXIMUM in its pill'],
  [1560, '1.30', 'A shimmer runs across the lockup'],
  [2000, '1.70', 'Late bursts low on either side; gold dust keeps falling'],
  [2550, '2.43', 'Everything lifts away'],
  [2950, '2.90', 'Back to the score'],
];

const page = `<title>Diwali Six Screen</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* One night-screen look, both themes: the page is the dark of a stadium after sunset, so the screen reads as it will. */
:root {
  --night: #0d0920; --panel: #17112e; --edge: rgba(255,255,255,.10);
  --ink: #f6ead2; --muted: #b3a6c9; --gold: #f5b83d; --marigold: #ff8a1c;
  --display: 'Instrument Serif', Georgia, serif;
  --ui: Satoshi, "Segoe UI", system-ui, sans-serif;
  color-scheme: dark;
}
@font-face { font-family: Jaro; src: url(${font('src/assets/jaro-latin.woff2')}) format('woff2'); font-display: block; }
@font-face { font-family: Satoshi; src: url(${font('src/assets/satoshi-latin.woff2')}) format('woff2'); font-weight: 300 900; font-display: block; }
@font-face { font-family: 'Instrument Serif'; font-style: italic; font-weight: 400; src: url(${font('src/assets/instrument-serif-latin-400-italic.woff2')}) format('woff2'); font-display: block; }
@font-face { font-family: Unbounded; font-weight: 800; src: url(${font('src/assets/unbounded-latin-800-normal.woff2')}) format('woff2'); font-display: block; }
html, body { background: var(--night); color: var(--ink); }
body { font: 16px/1.5 var(--ui); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 48px; }
.wrap { max-width: 1080px; margin: 0 auto; display: grid; gap: 22px; }
header { display: grid; gap: 6px; }
.eyebrow { font-weight: 800; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: var(--marigold); }
h1 { font: italic 400 clamp(40px, 7vw, 68px)/1 var(--display); color: var(--gold); margin: 0; text-wrap: balance; }
.lede { color: var(--muted); margin: 0; max-width: 62ch; }
.bezel { background: #050409; border: 1px solid var(--edge); border-radius: 14px; padding: clamp(8px, 1.6vw, 16px); box-shadow: 0 30px 80px -30px rgba(255,138,28,.35); }
.bezel canvas { display: block; width: 100%; height: auto; aspect-ratio: 1024 / 384; border-radius: 4px; }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; }
button, select { font: 800 14px var(--ui); color: var(--ink); background: var(--panel); border: 1px solid var(--edge); border-radius: 999px; padding: 9px 18px; cursor: pointer; }
button:hover, select:hover { border-color: rgba(245,184,61,.6); }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
#six-play { background: var(--gold); color: #2a1206; border-color: var(--gold); min-width: 92px; }
.scrub { display: flex; align-items: center; gap: 10px; flex: 1 1 260px; min-width: 0; }
.scrub input { flex: 1; min-width: 0; accent-color: var(--gold); }
#six-time { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 132px; font-size: 14px; }
label.check { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--muted); cursor: pointer; }
label.check input { accent-color: var(--gold); width: 16px; height: 16px; }
.below { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 22px; }
@media (max-width: 760px) { .below { grid-template-columns: minmax(0, 1fr); } }
.card { background: var(--panel); border: 1px solid var(--edge); border-radius: 14px; padding: 18px 20px; display: grid; gap: 12px; align-content: start; min-width: 0; }
h2 { font: 800 13px var(--ui); letter-spacing: .14em; text-transform: uppercase; color: var(--gold); margin: 0; }
ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
ol button { width: 100%; display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 12px; text-align: left; border-radius: 8px; border-color: transparent; background: transparent; padding: 8px 10px; font-weight: 500; font-size: 15px; }
ol button:hover { background: rgba(255,255,255,.04); }
ol .at { font-weight: 800; color: var(--marigold); font-variant-numeric: tabular-nums; }
.phone { position: relative; width: min(100%, 240px); aspect-ratio: 9 / 16; margin: 4px auto 0; border-radius: 26px; border: 6px solid #050409; overflow: hidden;
  background: linear-gradient(#0b0f24 0%, #141a36 34%, #1b2a3a 47%, #2c5f2e 47.5%, #3f7d34 100%); }
.phone canvas { position: absolute; left: 50%; top: 13%; width: 46%; height: auto; transform: translateX(-50%); border: 2px solid #0a0a0a; outline: 1px solid rgba(255,255,255,.5); }
.phone .stand { position: absolute; left: 0; right: 0; top: 30%; height: 17%; background: repeating-linear-gradient(90deg, rgba(255,255,255,.08) 0 3px, transparent 3px 7px), #222838; }
.phone .pitch { position: absolute; left: 41%; width: 18%; top: 52%; bottom: -2%; background: #d3b683; clip-path: polygon(30% 0, 70% 0, 100% 100%, 0 100%); }
.note { color: var(--muted); font-size: 14px; margin: 0; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }
</style>
<div class="wrap">
  <header>
    <span class="eyebrow">Big screen · every six · till 11 November</span>
    <h1>Happy Diwali, on every six</h1>
    <p class="lede">What the stadium's big screen plays when a batter hits a six during Diwali week, in place of the usual SIX. It is drawn on the screen's own 1024 by 384 canvas and runs the six's full 2.9 seconds, then the screen goes back to the score.</p>
  </header>
  <div class="bezel"><canvas id="six-big" aria-label="The big screen playing the Diwali six: Happy written in an italic serif over DIWALI in wide gold letters, a rangoli mandala and fireworks behind, SIX MAXIMUM in a pill under it and nine small diyas lit along the foot."></canvas></div>
  <div class="controls">
    <button type="button" id="six-play" aria-pressed="false">Pause</button>
    <button type="button" id="six-replay">Replay</button>
    <div class="scrub"><input type="range" id="six-scrub" min="0" max="2900" step="1" value="0" aria-label="Time in the six"><span id="six-time" aria-live="off">0.00 s</span></div>
    <select id="six-speed" aria-label="Speed"><option value="1">1×</option><option value="0.5">½×</option><option value="0.25">¼×</option></select>
    <label class="check"><input type="checkbox" id="six-fps" checked> Game frame rate (15 fps)</label>
    <label class="check"><input type="checkbox" id="six-still"> Reduced motion</label>
  </div>
  <div class="below">
    <section class="card">
      <h2>Beats</h2>
      <ol>${beats.map(([at, s, what]) => `<li><button type="button" data-at="${at}"><span class="at">${s}s</span><span>${what}</span></button></li>`).join('')}</ol>
      <p class="note">Tap a beat to stop on it. Nothing flashes the whole screen, and no two bursts come closer than a third of a second, the screen's no-strobe rule. The type is Instrument Serif Italic over Unbounded, both free to ship (SIL Open Font License).</p>
    </section>
    <section class="card">
      <h2>In a phone's picture</h2>
      <div class="phone" aria-hidden="true"><div class="stand"></div><div class="pitch"></div><canvas id="six-small"></canvas></div>
      <p class="note">The canopy's screen is drawn at half size, 512 by 192, and sits small at the far end of the picture, so the words are big and the shapes are bold.</p>
    </section>
  </div>
</div>
<script>${js}</script>
`;
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
