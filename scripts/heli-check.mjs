/**
 * The helicopter in a real browser, on `?heli=1`: every ball a pace yorker or
 * the fuller ball in turn, played on a clock wound by hand as hook-check winds
 * it. Straight swipes (W) on time at the yorkers and at the fuller balls on
 * middle or leg, until a helicopter goes for six; then one late, which is out.
 * It photographs the stroke through, and checks the innings is practice.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/heli-check.mjs
 *
 * `SHOTS=dir` saves the photographs there.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const shots = process.env.SHOTS ?? 'test-results/heli';
let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try {
    localStorage.setItem('hitman-shots-intro', 'done');
    localStorage.setItem('hitman-seen', day);
    localStorage.setItem('hitman-whatsnew', 'rivals:9');
  } catch { /* Then the notices stand. */ }
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
await page.route('**/api/board**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }) }));
const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
const snap = () => page.evaluate(() => window.__cricket.snapshot());
await page.clock.install();
await page.goto(`${base}/?debug=1&seed=314&heli=1&replay=0&catchcam=0&lights=day`, { waitUntil: 'load' });
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 3000);
await advance(2500);
await page.waitForTimeout(800);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await advance(1200); }
await page.locator('#start').click({ force: true, timeout: 15_000 });
await advance(600);
await page.locator('#mode-classic').click({ force: true, timeout: 15_000 });
await advance(600);
await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });

const press = (...keys) => page.evaluate(keys => {
  for (const type of ['keydown', 'keyup']) for (const key of keys) {
    const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'timeStamp', { value: performance.now() });
    window.dispatchEvent(event);
  }
}, keys);
async function nextBall() {
  let seen = await snap();
  for (let i = 0; i < 160 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
    if (seen.phase === 'INNINGS_END') return null;
    await advance(100); seen = await snap();
  }
  return seen.phase === 'BALL_IN_FLIGHT' ? seen : null;
}
async function playedOut(photo) {
  let struck = null;
  for (let i = 0; i < 80; i++) {
    await advance(photo ? 40 : 60);
    if (photo && i < 14) await page.screenshot({ path: `${shots}/${photo}-${String(i).padStart(2, '0')}.png` });
    const now = await snap();
    if (!struck && now.phase === 'SHOT_RESOLVE') struck = now;
    if (now.phase === 'RESULT' || now.phase === 'READY' || now.phase === 'INNINGS_END') return now;
  }
  return struck ?? await snap();
}

/** Late by this much: past every grade's window but POOR's, which is out. */
const LATE = 115;
const seenStyles = new Set(), plays = [];
let six = null, late = null;
for (let ball = 0; ball < 24 && !(six && late); ball++) {
  const seen = await nextBall();
  if (!seen) break;
  seenStyles.add(`${seen.style}${seen.full ? ':full' : ''}`);
  const yorker = seen.style === 'YORKER';
  const heliLine = ['MIDDLE', 'LEG', 'OUTSIDE_LEG'].includes(seen.line);
  const lateOne = six && (yorker || heliLine);
  await advance(seen.contactAt - seen.elapsed + (lateOne ? LATE : 0));
  await press('w');
  const result = await playedOut(!six && yorker ? 'yorker' : null);
  const o = result.heli;
  plays.push(`${seen.style}${seen.full ? ' (fuller)' : ''} on ${seen.effectiveLine}: ${result.outcome}`);
  if (o && o.runs === 6 && !six) six = o;
  else if (o && lateOne && !late) late = o;
}
console.log(plays.map(p => `        ${p}`).join('\n'));
check([...seenStyles].some(s => s.startsWith('YORKER')) && [...seenStyles].some(s => s.endsWith(':full')), 'bowls yorkers and the fuller ball in turn', [...seenStyles].join(', '));
check(!!six, 'a yorker swiped straight on time is the helicopter for six', plays.join(' | '));
check(!!late && late.out, 'swiped late, it is out', JSON.stringify(late));
const end = await snap();
check(errors.length === 0, 'no errors on the page', errors.join('\n'));
await browser.close();
process.exit(failures ? 1 : 0);
