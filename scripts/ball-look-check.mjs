/**
 * Pro Cam and Close going after the ball off the bat (`src/scene/ballLook.ts`),
 * in a real browser: cover drives on the keys at `?cover=1`'s ball, with no
 * replay or catch camera to film over it, under Pro Cam, under Close (lifting)
 * and under Close on `?closecam=pan`. Each followed ball is read as it flies —
 * the look turned towards the off side, Close lifted, the hold and the way
 * back, and under Pro Cam the bat and gloves out of the way — and photographed into `test-results/ball-look-*.png`; then the look
 * is back down the pitch by the next ball's release.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/ball-look-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function run(cam, extra, label) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    try {
      for (const key of ['hitman-shots-intro', 'hitman-field-intro', 'hitman-marathon-intro']) localStorage.setItem(key, 'done');
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-whatsnew', 'rivals:9');
    } catch { /* The notices stand. */ }
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/board**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }) }));
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  await page.clock.install();
  await page.goto(`${base}/?debug=1&seed=2718&cover=1&replay=0&catchcam=0&lights=day&ground=stadium&cam=${cam}${extra}`, { waitUntil: 'load' });
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
  const nextBall = async () => {
    let seen = await snap();
    for (let i = 0; i < 200 && seen.phase !== 'BALL_IN_FLIGHT'; i++) { if (seen.phase === 'INNINGS_END') return null; await advance(100); seen = await snap(); }
    return seen.phase === 'BALL_IN_FLIGHT' ? seen : null;
  };
  let found = null;
  for (let ball = 0; ball < 10 && !found; ball++) {
    const seen = await nextBall();
    if (!seen) break;
    await advance(seen.contactAt - seen.elapsed);
    await press('w', 'd');
    // Through the flight, reading the look every 100ms.
    const trace = [];
    let shot = 0;
    for (let i = 0; i < 60; i++) {
      await advance(100);
      const now = await snap();
      trace.push({ ...now.ballLook, game: now.phase, outcome: now.outcome, bat: now.proBat?.shown });
      if (now.ballLook.followed && [3, 7, 12].includes(i)) await page.screenshot({ path: `test-results/ball-look-${label}-${++shot}.png` });
      if (now.phase === 'BALL_IN_FLIGHT' && i > 5) break;
    }
    const followedTrace = trace.filter(t => t.followed);
    console.log(`        ball ${ball + 1}: ${trace.at(-1)?.outcome} followed=${followedTrace.length > 0}`);
    if (followedTrace.length) found = trace;
  }
  check(!!found, `${label}: a cover drive is followed`);
  if (found) {
    const yaws = found.map(t => t.yaw), lifts = found.map(t => t.lift);
    console.log(`        yaw ${yaws.join(' ')}\n        lift ${lifts.join(' ')}\n        phase ${found.map(t => t.phase?.[0] ?? '-').join('')}`);
    const most = Math.max(...yaws.map(Math.abs));
    check(most > 20, `${label}: the look turns after it (${most}°)`);
    check(found.some(t => t.phase === 'hold') && found.some(t => t.phase === 'back'), `${label}: holds, then comes back`);
    const atNext = found.at(-1);
    check(Math.abs(atNext.yaw) < 4, `${label}: back down the pitch by the next ball (${atNext.yaw}°)`, JSON.stringify(atNext));
    if (label === 'pro') check(found.some(t => t.phase === 'follow' && t.bat === false), 'pro: the bat and gloves out of the picture while he watches it', found.map(t => t.bat).join(' '));
    if (label === 'close-lift') check(Math.max(...lifts) > .9 && atNext.lift < .1, 'close-lift: lifts up and back, and down again');
    if (label === 'close-pan') check(Math.max(...lifts) === 0, 'close-pan: stays where it stands');
  }
  check(!errors.length, `${label}: no errors`, errors.join('\n'));
  await page.close();
}

await run('pro', '', 'pro');
await run('close', '', 'close-lift');
await run('close', '&closecam=pan', 'close-pan');
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall good');
process.exit(failures ? 1 : 0);
