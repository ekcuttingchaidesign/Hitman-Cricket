/**
 * The podium (`src/game/podium.ts`, its stage `src/scene/podium.ts`), in a
 * real browser: a Blast written out to a new best over fifty ends on the
 * stage, the scoreboard and keys out of sight and the card held back, and it
 * comes down by itself onto the card; the next innings, under that best, goes
 * straight to the card; a tap takes it down early; Super10's goes up in its
 * own brand; a chase won by name; and under `?debug=1` without `?podium=1`
 * there is none. It photographs the beats of each, pinned on the stage's own
 * clock (`__cricket.podiumAt`), into test-results/podium-*.png.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/podium-check.mjs
 *
 * Waited on what the game says (`podiumUp`, `snapshot().phase`), on a clock
 * wound by hand, never on how slow the machine is.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath });

/** A phone's page past the notices, on a clock wound by hand, in an innings of `query`'s mode. */
async function phone(query) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-shots-intro', 'done'); localStorage.setItem('hitman-seen', day);
      localStorage.setItem('hitman-whatsnew', 'super10:9'); localStorage.setItem('hitman-field-intro', 'done');
    } catch { /* Then the notices stand. */ }
  });
  await page.clock.install();
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  const up = () => page.evaluate(() => window.__cricket.podiumUp());
  await page.goto(`${base}/?debug=1&seed=222${query.includes("lights=") ? "" : "&lights=night"}${query}`, { waitUntil: 'load' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 3000);
  await advance(2500);
  await page.waitForTimeout(800);
  await page.locator('#start').click({ force: true, timeout: 15_000 });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) {
    const mode = page.locator('#mode-classic');
    if (!query.includes('mode=') && await mode.isVisible().catch(() => false)) await mode.click({ force: true, timeout: 15_000 }).catch(() => {});
    await advance(250);
  }
  return {
    page, errors, advance, snap, up,
    /** Writes the innings out ball by ball through the debug hook. */
    bat: balls => page.evaluate(balls => window.__cricket.blast(balls), balls),
    hidden: () => page.evaluate(() => document.getElementById('viewport').classList.contains('intro-on')),
    card: () => page.evaluate(() => { const end = document.getElementById('end'); return !!end && !end.classList.contains('hidden') && getComputedStyle(end).display !== 'none'; }),
    /** Until it comes down by itself, or `ms` of the game's clock have gone. */
    async down(ms = 9000) { for (let i = 0; i < ms / 200 && await up(); i++) await advance(200); return !(await up()); },
    async shoot(name, beats) {
      for (const [beat, t] of beats) {
        await page.evaluate(t => window.__cricket.podiumAt(t), t);
        await advance(40); await page.waitForTimeout(150);
        await page.screenshot({ path: `test-results/podium-${name}-${beat}.png` });
      }
      await page.evaluate(() => window.__cricket.podiumAt(null));
      console.log(`        photographed test-results/podium-${name}-{${beats.map(([beat]) => beat).join(',')}}.png`);
    },
  };
}
const BEATS = [['wide', 1200], ['round', 3300], ['hero', 6000]];

// ── A new best goes up, holds the card, comes down onto it; under it, none ──
console.log('a new best, and an innings under it');
{
  const { page, errors, advance, snap, up, bat, hidden, card, down, shoot } = await phone('&podium=1');
  // Ninety off thirty balls, over fifty and over a best of nought.
  await bat(Array.from({ length: 30 }, (_, i) => (i % 3 ? 4 : 1)));
  await advance(50);
  check(await up() === 'best', 'a Blast of 90 ends on the podium, for a new best', await up());
  check(await hidden(), 'the scoreboard and keys are out of sight under it');
  check(!(await card()), 'and the card waits');
  await shoot('blast-best', BEATS);
  check(await down(), 'it comes down by itself');
  check(await card(), 'onto the card');
  check(!(await hidden()), 'and the scoreboard is back');
  // The next innings, under ninety: straight to the card.
  await page.locator('#again').click({ force: true });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) await advance(250);
  await bat(Array.from({ length: 30 }, () => 1));
  await advance(50);
  check(!(await up()) && await card(), 'thirty, under the best, goes straight to the card');
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

// ── A tap takes it down ──────────────────────────────────────────────────
console.log('a tap');
{
  const { page, errors, advance, up, bat, card } = await phone('&podium=1');
  await bat(Array.from({ length: 30 }, () => 2));
  await advance(800);
  check(await up() === 'best', 'sixty up');
  await page.locator('#viewport canvas').first().tap({ force: true });
  await advance(50);
  check(!(await up()) && await card(), 'a tap puts it away onto the card');
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

// ── Super10, in its brand; and a chase won, by name ────────────────────
console.log('super10, and a chase');
{
  const { page, errors, advance, up, bat, shoot } = await phone('&podium=1&mode=super10');
  // 128 for 2 off the sixty balls: Super10 has five wickets, so two do not end it.
  await bat(Array.from({ length: 60 }, (_, i) => (i === 10 || i === 30 ? 'W' : i % 5 ? 2 : 4)));
  await advance(50);
  check(await up() === 'best', 'a Super10 total over a hundred ends on the podium', await up());
  await shoot('super10-best', BEATS);
  await page.evaluate(() => window.__cricket.podium('chase'));
  await advance(50);
  check(await up() === 'chase', 'a chase won goes up by name');
  await shoot('super10-chase', [['hero', 6000]]);
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}
{
  const { page, errors, advance, up, shoot } = await phone('&podium=1&lights=day');
  await page.evaluate(() => window.__cricket.podium('chase'));
  await advance(50);
  check(await up() === 'chase', 'the Blast\'s chase won goes up by name');
  await shoot('blast-chase', [['wide', 1200], ['confetti', 5000], ['hero', 6000]]);
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

// ── Not asked for, not there ─────────────────────────────────────────────
console.log('without the switch');
{
  const { page, errors, advance, up, bat, card } = await phone('');
  await bat(Array.from({ length: 30 }, () => 6));
  await advance(50);
  check(!(await up()) && await card(), 'under ?debug=1 a new best goes straight to the card');
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
