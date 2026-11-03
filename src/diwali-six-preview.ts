// The Diwali six on its own, for looking at it before it goes on the screen:
// built into one page by scripts/diwali-six-artifact.mjs. The screen's
// canvases are the game's: 1024 by 384 laid out, painted at fifteen frames a
// second, and a copy at half that, the canopy's own size, shown small.
import { DIWALI_SIX_MS, paintDiwaliSix } from './scene/diwaliSix';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const big = $<HTMLCanvasElement>('six-big');
const small = $<HTMLCanvasElement>('six-small');
const scrub = $<HTMLInputElement>('six-scrub');
const time = $('six-time');
const playKey = $<HTMLButtonElement>('six-play');
const replayKey = $<HTMLButtonElement>('six-replay');
const fpsBox = $<HTMLInputElement>('six-fps');
const stillBox = $<HTMLInputElement>('six-still');
const speedPick = $<HTMLSelectElement>('six-speed');

/** Between sixes the screen goes back to the score for a moment, as it does in the game. */
const REST_MS = 900;
const FRAME_MS = 1000 / 15;

let at = 0;
let playing = true;
let last = performance.now();

function size(canvas: HTMLCanvasElement, width: number) {
  canvas.width = width; canvas.height = Math.round(width * 384 / 1024);
}
size(big, 1024 * Math.min(2, window.devicePixelRatio || 1));
size(small, 512);

/** The game's own screen between moments: the score on its navy. */
function rest(ctx: CanvasRenderingContext2D) {
  const W = 1024, H = 384;
  const ground = ctx.createLinearGradient(0, 0, 0, H);
  ground.addColorStop(0, '#1d3d58'); ground.addColorStop(1, '#0c1c2a');
  ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 34px Satoshi, Arial, sans-serif'; ctx.fillStyle = '#f5b83d';
  ctx.fillText('THE BLAST', 790, H * .22);
  ctx.font = '150px Jaro, Impact, sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('86/1', 790, H * .52);
  ctx.font = '800 32px Satoshi, Arial, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.72)';
  ctx.fillText('3.2 OVERS', 790, H * .82);
  ctx.font = '96px Jaro, Impact, sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('HITMAN', 270, H / 2);
}

function paint(canvas: HTMLCanvasElement, since: number) {
  const ctx = canvas.getContext('2d')!;
  const S = canvas.width / 1024;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  if (since >= DIWALI_SIX_MS) rest(ctx);
  else paintDiwaliSix(ctx, since, stillBox.checked);
}

function draw() {
  // The game paints the screen fifteen times a second; ticked off, every refresh.
  const shown = fpsBox.checked ? Math.floor(at / FRAME_MS) * FRAME_MS : at;
  paint(big, shown);
  paint(small, shown);
  const s = Math.min(at, DIWALI_SIX_MS) / 1000;
  time.textContent = at >= DIWALI_SIX_MS ? 'Back to the score' : `${s.toFixed(2)} s`;
  scrub.value = String(Math.min(at, DIWALI_SIX_MS));
}

function tick(now: number) {
  const step = (now - last) * Number(speedPick.value);
  last = now;
  if (playing) {
    at += step;
    if (at > DIWALI_SIX_MS + REST_MS) at = 0;
  }
  draw();
  requestAnimationFrame(tick);
}

function setPlaying(on: boolean) {
  playing = on;
  playKey.textContent = on ? 'Pause' : 'Play';
  playKey.setAttribute('aria-pressed', String(!on));
}

playKey.addEventListener('click', () => setPlaying(!playing));
replayKey.addEventListener('click', () => { at = 0; setPlaying(true); });
scrub.max = String(DIWALI_SIX_MS);
scrub.addEventListener('input', () => { at = Number(scrub.value); setPlaying(false); });
for (const beat of document.querySelectorAll<HTMLButtonElement>('[data-at]')) {
  beat.addEventListener('click', () => { at = Number(beat.dataset.at); setPlaying(false); });
}
fpsBox.addEventListener('change', draw);
stillBox.addEventListener('change', draw);

if (matchMedia('(prefers-reduced-motion: reduce)').matches) { stillBox.checked = true; setPlaying(false); at = 1300; }

void Promise.all([
  document.fonts.load('128px Jaro'),
  document.fonts.load('800 34px Satoshi'),
]).finally(() => { last = performance.now(); requestAnimationFrame(tick); });
