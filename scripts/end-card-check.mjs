/**
 * The end of a Test innings, and the two ways off it, in a real browser.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/end-card-check.mjs                  # that dev server
 *   node scripts/end-card-check.mjs http://…:4173    # a preview build
 *
 * Written after two bugs that every other check was blind to, for two reasons
 * worth stating so the blindness is not repeated:
 *
 * The other browser checks open the board from the cover, because that is the
 * shortest way to the card. Nothing reached the card the way most players do —
 * off the end of an innings — so the keys that live only on the end card had
 * no cover at all. One of them put the mode picker up, and backing out of the
 * picker left the ground on its own: the innings was over, so every key was
 * dead, the final score sat there, and the cover's music played over it.
 *
 * And they run the dev server with no `VITE_SHOW_SURVIVE`, which is a build
 * that plays one game. A rail of two cards cannot appear in a build that has
 * one card, so the carousel was never once drawn by a check. This one sets the
 * flag, and a run without it is a run that proves nothing.
 *
 * It needs no database: the innings is played, not claimed, and the career it
 * draws is the one this browser just wrote for itself.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
/** Where this machine keeps its browser, for images that ship one ready-made. */
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const snap = () => page.evaluate(() => window.__cricket.snapshot());
/** The game's own clock, wound on by hand so an innings does not take one. */
const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
const until = async phase => {
  for (let i = 0; i < 60; i++) {
    const seen = await snap();
    if (seen.phase === phase) return seen;
    await advance(300);
  }
  throw new Error(`Never reached ${phase}: ${JSON.stringify(await snap())}`);
};

// A headless browser looks private — its storage quota is a private window's —
// and a private window counts no career, so the widget this checks would not be
// drawn at all. A visit remembered from an earlier day is the one tell no quota
// figure argues with, and writing one is honest: the end card belongs to a
// player who has been here before, which is exactly what this pretends to be.
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try { localStorage.setItem('hitman-seen', day); } catch { /* Then the notice stands. */ }
});

/**
 * An empty board, so the strip on the end card is the one that asks.
 *
 * Reached and empty are different things, which is why this answers rather
 * than being left to fail: a board nobody can fetch offers nothing, and a
 * board nobody has batted on offers first place. The second is the state the
 * register key and the footnote under it live in, and it has no other way of
 * being reached without a database behind the server.
 */
await page.route('**/api/board**', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
}));

await page.clock.install();
await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
await advance(2500);
await page.waitForTimeout(800);
// Belt and braces: where the guess still lands on private, the notice offers an
// innings that will not count rather than refusing one.
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await advance(1200); await page.waitForTimeout(300); }

await page.locator('#start').click({ force: true });
await advance(400);
await page.waitForTimeout(300);
// The update introduces itself before the picker on the first two visits.
for (let i = 0; i < 8; i++) {
  const done = page.locator('#whatsnew-done');
  if (!(await done.count()) || !(await done.isVisible())) break;
  await done.click({ force: true });
  await advance(400);
  await page.waitForTimeout(200);
}

check(await page.locator('#modes').isVisible(), 'the play key opens the picker');
await page.locator('#mode-survive').click({ force: true });
await advance(600);
await page.waitForTimeout(400);

// Enough balls to have a career worth opening a card on, and then one blow
// from the floor — far quicker than batting out a chase, and the end of the
// innings is the whole of what this checks.
for (let i = 0; i < 3; i++) {
  const ball = await until('BALL_IN_FLIGHT');
  const key = ball.effectiveLine === 'MIDDLE' ? 'w' : Number(ball.finalX) < 0 ? 'a' : 'd';
  await advance(ball.contactAt - ball.elapsed - 65);
  await page.keyboard.press(key);
  await advance(2600);
}
await page.evaluate(() => window.__cricket.hurt());
for (let i = 0; i < 40; i++) {
  if ((await snap()).phase === 'INNINGS_END') break;
  await advance(1500);
}
check((await snap()).phase === 'INNINGS_END', 'the innings ends', JSON.stringify(await snap()));
check(await page.locator('#end-survive').isVisible(), 'on the Test card');

// The strip that asks for a name, and the line under it saying what saying yes
// is worth. Checked here because this is the only screen it exists on, and the
// only way to it is the one a player takes: an innings that ended.
const board = page.locator('#card-board');
const why = page.locator('#claim-why');
check(await board.isVisible(), 'carrying the strip that asks for a name');
check(await page.locator('#claim').innerText() === 'REGISTER SCORE ON LEADERBOARD',
  'with the key asking rather than pointing', await page.locator('#claim').innerText());
check(await why.isVisible(), 'and the reason to say yes under it');
check((await why.innerText()).includes('survives a new phone'),
  'which is the one a career key is for', await why.innerText());

// The form takes the key's place, and the footnote goes with the key: it is
// the key's line, not the strip's, and a sentence about registering standing
// over the field that does the registering is a sentence in the way.
await page.locator('#claim').click({ force: true });
await advance(400);
await page.waitForTimeout(300);
check(!(await why.isVisible()), 'which steps aside with the key when the form opens');
await page.locator('#claim-cancel').click({ force: true });
await advance(400);
await page.waitForTimeout(300);
check(await why.isVisible(), 'and comes back when the form is backed out of');

// Two ways to the card, one of them a page rather than a tab. A player who can
// swipe on one and not the other has found a bug, not a second design.
const widget = page.locator('#card-career');
check(await widget.isVisible(), 'the card carries the career widget');
if (await widget.isVisible()) {
  await widget.click({ force: true });
  await page.waitForTimeout(2500);
  const slides = await page.locator('#stats-overlay .stats-slide').count();
  check(slides === 2, 'which opens both cards', `${slides} of them`);
  check(await page.locator('#stats-overlay #stats-rail.is-rail').count() === 1, 'on a rail to swipe');
  const at = await page.evaluate(() =>
    [...document.querySelectorAll('#stats-overlay .stats-dot')].findIndex(dot => dot.classList.contains('is-on')));
  check(at === 1, 'standing on the game just played', `card ${at + 1}`);
  await page.locator('#stats-back').click({ force: true });
  await advance(400);
  await page.waitForTimeout(400);
  check(await page.locator('#end-survive').isVisible(), 'and the back key returns to the card');
}

// The picker is a screen rather than a card, so it takes the card off the
// screen on the way in. Backing out has to put it back — there is nothing
// underneath it but a finished innings that answers no key.
await page.locator('#survive-modes').click({ force: true });
await advance(500);
await page.waitForTimeout(300);
check(await page.locator('#modes').isVisible(), 'CHANGE MODE opens the picker');
await page.locator('#modes-cancel').click({ force: true });
await advance(500);
await page.waitForTimeout(300);
check(!(await page.locator('#modes').isVisible()), 'and backing out closes it');
check(await page.locator('#end-survive').isVisible(), 'onto the card it was opened from, not the bare ground');
check(await page.locator('#survive-again').isVisible(), 'with a key to press');

check(!errors.length, 'nothing threw on the way', errors.join('\n        '));
console.log(failures ? `\n${failures} failed` : '\nall good');
await browser.close();
process.exit(failures ? 1 : 0);
