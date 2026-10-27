/**
 * The walk-on before the first ball (`src/game/IntroReel.ts`), in a real
 * browser: under `?intro=1` a Blast opens on one of its two films, the
 * scoreboard and every key put out of sight between two black bars, the
 * bowler held at his mark; it ends by itself on the game's view and the first
 * ball follows; the next visit opens on the other film; PLAY AGAIN goes
 * straight to the ball, and another mode's first innings that visit has one
 * of its own; a tap skips it at once; and without the switch an
 * innings opens as it always did. It photographs both films at their beats,
 * pinned on their own clocks (`__cricket.introAt`), into
 * test-results/intro-*.png.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/intro-check.mjs
 *
 * Waited on what the game says (`walkingOn`, `snapshot().phase`), on a clock
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

/** A phone's page past the notices, on a clock wound by hand. */
async function phone() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-shots-intro', 'done'); localStorage.setItem('hitman-seen', day);
      localStorage.setItem('hitman-whatsnew', 'player-profiles:9');
    } catch { /* Then the notices stand. */ }
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  await page.clock.install();
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  return {
    page, errors, advance,
    snap: () => page.evaluate(() => window.__cricket.snapshot()),
    walking: () => page.evaluate(() => window.__cricket.walkingOn()),
    /** A visit: the page loaded with `query`, and a Blast chosen from the picker, the film pinned at its start if `pin`. */
    async visit(query, pin = false) {
      await page.goto(`${base}/?debug=1&seed=222${query}`, { waitUntil: 'load' });
      await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 3000);
      await advance(2500);
      await page.waitForTimeout(800);
      await page.locator('#start').click({ force: true, timeout: 15_000 });
      await advance(600);
      if (pin) await page.evaluate(() => window.__cricket.introAt(0));
      await page.locator('#mode-classic').click({ force: true, timeout: 15_000 });
      await advance(100);
    },
    /** Until the first ball is on its way, or the bowler has not gone in `ms`. */
    async bowled(ms = 3000) {
      let phase = '';
      for (let i = 0; i < ms / 100 && phase !== 'BOWLER_RUNUP' && phase !== 'BALL_IN_FLIGHT'; i++) {
        await advance(100); phase = (await page.evaluate(() => window.__cricket.snapshot())).phase;
      }
      return phase === 'BOWLER_RUNUP' || phase === 'BALL_IN_FLIGHT';
    },
  };
}
const hidden = page => page.evaluate(() => {
  const viewport = document.getElementById('viewport');
  const score = [...viewport.children].find(el => el.tagName !== 'CANVAS' && el.offsetParent !== null);
  return { on: viewport.classList.contains('intro-on'), visible: score ? getComputedStyle(score).visibility : 'none' };
});

// ── It plays, holds the ball, ends by itself; the next visit, the other ──
console.log('ends by itself, and takes turns');
{
  const { page, errors, advance, snap, walking, visit, bowled } = await phone();
  await visit('&intro=1');
  const first = await walking();
  check(first === 'bat' || first === 'duel', 'a Blast chosen under ?intro=1 opens on a walk-on', first);
  const cover = await hidden(page);
  check(cover.on && cover.visible === 'hidden', 'the scoreboard and keys are out of sight', JSON.stringify(cover));
  await advance(1500);
  check((await snap()).phase === 'READY', 'the bowler waits at his mark while it plays', (await snap()).phase);
  for (let i = 0; i < 40 && await walking(); i++) await advance(250);
  check(!(await walking()), 'it ends by itself');
  check(!(await hidden(page)).on, 'and puts the scoreboard back');
  check(await bowled(), 'and the first ball follows');

  // The innings over, PLAY AGAIN goes straight to the ball.
  await page.evaluate(() => window.__cricket.finish());
  const again = page.locator('#again');
  for (let i = 0; i < 60 && !(await again.isVisible().catch(() => false)); i++) await advance(250);
  await again.click({ force: true });
  await advance(300);
  check(!(await walking()), 'PLAY AGAIN goes straight to the ball, with no walk-on');
  check(await bowled(), 'and the bowler runs in');

  // Another mode, the same visit: its first innings has one too.
  await page.evaluate(() => window.__cricket.finish());
  const change = page.locator('#card-change');
  for (let i = 0; i < 60 && !(await change.isVisible().catch(() => false)); i++) await advance(250);
  await change.click({ force: true });
  await advance(600);
  await page.locator('#mode-survive').click({ force: true, timeout: 15_000 });
  await advance(100);
  check(!!(await walking()), 'a mode not yet played this visit opens on a walk-on', await walking());
  // Seen out to its end in the Blast above; here a tap, as software rendering
  // spends minutes of the wall's clock on every second of a film.
  await page.locator('#viewport canvas').first().tap({ force: true });
  await advance(50);
  check(await bowled(), 'and its first ball follows');
  // Survival's end is a screen of its own, with its own PLAY AGAIN.
  await page.evaluate(() => window.__cricket.finish());
  const surviveAgain = page.locator('#survive-again');
  for (let i = 0; i < 60 && !(await surviveAgain.isVisible().catch(() => false)); i++) await advance(250);
  await surviveAgain.click({ force: true });
  await advance(300);
  check(!(await walking()), 'and its PLAY AGAIN goes straight to the ball');

  // The next visit, in the same browser, opens on the other film.
  await visit('&intro=1');
  const second = await walking();
  check(second && second !== first, 'the next visit opens on the other film', `${first} then ${second}`);
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

// ── The player card ──────────────────────────────────────────────────────
console.log('the player card');
for (const [who, seeded] of [['a player with a Blast career', true], ['a debutant', false]]) {
  const { page, errors, advance, visit } = await phone();
  if (seeded) await page.addInitScript(() => {
    try {
      localStorage.setItem('hitman-batter', JSON.stringify({ name: 'Kabir', avatar: 2 }));
      localStorage.setItem('hitman-career', JSON.stringify({ classic: { innings: 23, runs: 1204, highest: 181, sixes: 77 } }));
    } catch { /* Then the card is a debutant's. */ }
  });
  await visit('&intro=duel', true);
  await page.evaluate(() => window.__cricket.introAt(1000));
  await advance(40);
  check(!(await page.locator('#walkon-card').count()), `${who}: no card over the pitch from above`);
  await page.evaluate(() => window.__cricket.introAt(4500));
  await advance(40); await page.waitForTimeout(900);
  const card = page.locator('#walkon-card');
  check(await card.isVisible(), `${who}: the card is up through the bowler's eyes`);
  const text = (await card.innerText()).replace(/\s+/g, ' ');
  if (seeded) check(/KABIR/i.test(text) && /1,204/.test(text) && /181/.test(text) && /77/.test(text) && /The Blast/i.test(text),
    'with their name, the mode, and their Blast figures', text);
  else check(/Debutant/i.test(text) && !(await page.locator('.woc-figure').count()), 'saying DEBUTANT, with no figures', text);
  await page.screenshot({ path: `test-results/intro-card-${seeded ? 'career' : 'debut'}.png` });
  await page.evaluate(() => window.__cricket.introAt(6500));
  await advance(40); await page.waitForTimeout(600);
  check(!(await page.locator('#walkon-card').count()), `${who}: and gone before the cut to the game`);
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

// ── A tap skips it ───────────────────────────────────────────────────────
console.log('a tap skips it');
for (const film of ['bat', 'duel']) {
  const { page, errors, advance, snap, walking, visit, bowled } = await phone();
  await visit(`&intro=${film}`);
  check(await walking() === film, `?intro=${film} asks for that film`, await walking());
  await advance(400);
  await page.locator('#viewport canvas').first().tap({ force: true });
  await advance(50);
  check(!(await walking()), 'a tap puts it away at once');
  // The bowler may already have set off: he goes the moment it is put away.
  const after = await snap();
  check(['READY', 'BOWLER_RUNUP'].includes(after.phase), 'and plays no stroke', after.phase);
  check(await bowled(), 'the bowler goes without waiting out the film');
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

// ── Their beats, photographed ────────────────────────────────────────────
console.log('their beats');
for (const [film, beats] of [
  ['bat', [['bat', 1300], ['scuff', 3300], ['shoulder', 4400], ['bowler', 5000], ['landing', 6200]]],
  ['duel', [['aerial', 1200], ['scuff', 3400], ['looks-up', 4900], ['guard', 6000], ['tap', 6300]]],
]) {
  const { page, errors, advance, visit } = await phone();
  await visit(`&intro=${film}&lights=day`, true);
  await page.evaluate(() => window.__cricket.dress('home', 'roar'));
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  await page.waitForTimeout(1200);
  for (const [name, t] of beats) {
    await page.evaluate(t => window.__cricket.introAt(t), t);
    await advance(40); await page.waitForTimeout(120);
    await page.screenshot({ path: `test-results/intro-${film}-${name}.png` });
  }
  console.log(`        photographed test-results/intro-${film}-{${beats.map(([name]) => name).join(',')}}.png`);
  check(!errors.length, `no errors in ${film}`, errors.join('\n'));
  await page.close();
}

// ── Not asked for, not there ─────────────────────────────────────────────
console.log('without the switch');
{
  const { page, errors, walking, visit, bowled } = await phone();
  await visit('');
  check(!(await walking()), 'an innings opens on the game\'s view as it always did');
  check(await bowled(), 'and the first ball comes as it did');
  check(!errors.length, 'no errors', errors.join('\n'));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
