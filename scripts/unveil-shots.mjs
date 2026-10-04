/**
 * The covers' two photographs, taken again: the same ball at the same moment
 * on the ground before and the ground after, for a phone held upright and for
 * a wide screen, written straight over `src/assets/unveil/`.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/unveil-shots.mjs
 *
 * The two only line up under the slider if nothing but the ground differs
 * between them, so both are taken on one build, on one seed, on a clock wound
 * by hand to the same millisecond: the old ground is the one `?ground=` still
 * builds, which is why it is kept. Change `BEFORE` when the ground being
 * pulled off is a different one, and bump `REVEAL` in `src/game/unveil.ts` so
 * the covers go up again for everybody who has seen the last pair.
 *
 * Needs `ffmpeg` with libwebp for the conversion. Look at the four pictures
 * before committing them: this takes them, it does not judge them.
 */

import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
/** The ground under the covers, and the one they come off. */
const BEFORE = 'bowl';
const AFTER = 'stadium';
/** The ball: a length ball on off stump from this seed, caught this long before it reaches the bat. */
const SEED = 222;
const BEFORE_CONTACT_MS = 260;

const SHOTS = [
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['wide', { viewport: { width: 1920, height: 1080 } }],
];

const scratch = await mkdtemp(join(tmpdir(), 'unveil-'));
const browser = await chromium.launch({ executablePath });

async function photograph(ground, options, png) {
  const page = await browser.newPage(options);
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    localStorage.setItem('hitman-seen', day);
    localStorage.setItem('hitman-whatsnew', 'marathon-launch:9');
    // Past the covers: these are the pictures that go on them.
    localStorage.setItem('hitman-unveiled', 'ground-stadium');
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  // Stopped before the page is, so the two runs start from the same instant
  // and every step after it is one this script took.
  await page.clock.install({ time: new Date('2026-07-01T11:00:00Z') });
  await page.clock.pauseAt(new Date('2026-07-01T11:00:01Z'));
  await page.goto(`${base}/?debug=1&seed=${SEED}&ground=${ground}&lights=day`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 100 && !(await page.evaluate(() => !!window.__cricket)); i++) { await advance(100); await page.waitForTimeout(50); }
  await advance(2500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await advance(1200); }
  await page.locator('#start').click({ force: true, timeout: 15_000 });
  await advance(600);
  for (let i = 0; i < 8; i++) {
    const done = page.locator('#whatsnew-done');
    if (!(await done.count()) || !(await done.isVisible())) break;
    await done.click({ force: true });
    await advance(400);
  }
  await page.locator('#mode-classic').click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  const stamp = what => process.env.VERBOSE && console.log(`    ${ground}: ${what}`);
  stamp('batting');
  let seen = await snap();
  for (let i = 0; i < 400 && seen.phase !== 'BALL_IN_FLIGHT'; i++) { await advance(25); seen = await snap(); }
  if (seen.phase !== 'BALL_IN_FLIGHT') throw new Error(`${ground}: no ball came (${seen.phase})`);
  await advance(seen.contactAt - seen.elapsed - BEFORE_CONTACT_MS);
  await page.screenshot({ path: png });
  await page.close();
}

for (const [shape, options] of SHOTS) {
  for (const [ground, name] of [[BEFORE, 'old'], [AFTER, 'new']]) {
    const png = join(scratch, `${name}-${shape}.png`);
    await photograph(ground, options, png);
    const out = `src/assets/unveil/${name}-${shape}.webp`;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '82', out]);
    console.log(`  ${out}  (${ground})`);
  }
}
await browser.close();
