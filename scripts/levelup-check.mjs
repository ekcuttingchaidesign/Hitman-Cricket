/**
 * Level Up: the full screen an innings ends on when it carried a career onto a
 * new rung, before the innings card.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/levelup-check.mjs http://127.0.0.1:5201
 *
 * First the way a player reaches it: two Blasts written ball by ball for a
 * named player, a hundred and eighty apiece — the first leaves the career a
 * DEBUTANT and puts nothing up, the second carries it over EMERGING PLAYER's
 * 350, and the store's answer puts Level Up over the card. Then each rung by
 * name (`__cricket.levelUp('star', 'marathon')`): the phases in order, the old
 * card turned into the new rung's, the figure counted on, the keys, a tap
 * skipping to them, Escape and GO TO SCORECARD back to the card under it.
 *
 * Judged by the classes and the pieces in the page, not by frames: a headless
 * browser rendering in software can hold a CSS animation on its first frame.
 * Pictures land in test-results/levelup/.
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

await mkdir('test-results/levelup', { recursive: true });
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// Letters only, and new each run: a name with a number on it is a sibling of the last run's.
const who = `Lvl${Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;
await page.addInitScript(name => {
  try {
    localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
    localStorage.setItem('hitman-shots-intro', 'done');
    localStorage.setItem('hitman-marathon-intro', 'done');
    localStorage.setItem('hitman-hurt-seen', '1');
    localStorage.setItem('hitman-profile', '1');
    localStorage.setItem('hitman-batter', JSON.stringify({ name, avatar: 1 }));
  } catch { /* Then the screens it skips stand in the way. */ }
}, who);
await page.goto(`${base}/?debug=1&seed=4242`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
await page.addStyleTag({ content: '#debug{display:none!important}' });
const snap = () => page.evaluate(() => window.__cricket.snapshot());
const levelling = () => page.evaluate(() => window.__cricket.levelingUp());
const overlay = page.locator('#levelup-overlay');

/** To the crease for a Blast: from the cover the first time, PLAY AGAIN after. */
async function crease(first) {
  if (first) await page.locator('#start').click({ force: true });
  else await page.locator('#again').click({ force: true });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) {
    const done = page.locator('#whatsnew-done');
    if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
    const pick = page.locator('#mode-classic');
    if (await pick.isVisible().catch(() => false)) await pick.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
}
/** Waits for Level Up to reach a phase, or for the wait to run out. */
async function reach(phase, tries = 40) {
  for (let i = 0; i < tries; i++) { if ((await levelling()) === phase) return true; await page.waitForTimeout(250); }
  return false;
}

// — The real way: the innings that tips the career over.
const SIXES = Array(30).fill(6);
await crease(true);
await page.evaluate(balls => window.__cricket.blast(balls), SIXES);
await page.waitForTimeout(3500);
check((await snap()).phase === 'INNINGS_END' && await page.locator('#end').isVisible(), 'a first Blast of 180 ends on the card');
check((await levelling()) === null && await overlay.count() === 0, 'with no Level Up: 180 is still a DEBUTANT');
await crease(false);
await page.evaluate(balls => window.__cricket.blast(balls), SIXES);
let up = false;
for (let i = 0; i < 40 && !up; i++) { up = (await overlay.count()) > 0; if (!up) await page.waitForTimeout(250); }
check(up, 'a second, taking the career to 360, puts Level Up over the card');
check(await overlay.getAttribute('data-tier') === 'emerging', 'for EMERGING PLAYER', await overlay.getAttribute('data-tier'));
check(await page.locator('#end').isVisible(), 'with the innings card waiting under it');
await page.waitForTimeout(500);
await page.screenshot({ path: 'test-results/levelup/real-rush.png' });
check(await reach('ready'), 'and it plays through to its keys');
check(await page.locator('.lu-face.is-new .st-card.tier-emerging').count() === 1 && await page.locator('.lu-face.is-old .st-card.tier-debutant').count() === 1,
  'turning the DEBUTANT card into the EMERGING PLAYER one');
check(await page.locator('.lu-face.is-old').evaluate(el => getComputedStyle(el).visibility) === 'hidden', 'the old card gone once it has turned');
await page.waitForTimeout(1200);
check((await page.locator('.lu-face.is-new .st-card-figure b').textContent()).replace(/,/g, '') === '360', 'the figure counted on to the career as it stands',
  await page.locator('.lu-face.is-new .st-card-figure b').textContent());
await page.screenshot({ path: 'test-results/levelup/real-ready.png' });
check(await page.locator('#levelup-share').isVisible() && await page.locator('#levelup-scorecard').isVisible(), 'SHARE STATS CARD and GO TO SCORECARD');
check(await page.evaluate(() => document.activeElement?.id) === 'levelup-share', 'with the focus on SHARE STATS CARD');
await page.locator('#levelup-scorecard').click();
await page.waitForTimeout(400);
check(await overlay.count() === 0 && (await snap()).phase === 'INNINGS_END' && await page.locator('#end').isVisible(),
  'GO TO SCORECARD puts it away and leaves the innings card');

// — Each rung, by name, as the preview puts it up.
for (const [tier, mode] of [['emerging', 'classic'], ['star', 'classic'], ['hitman', 'classic'], ['star', 'marathon'], ['hitman', 'survive']]) {
  await page.evaluate(([t, m]) => window.__cricket.levelUp(t, m), [tier, mode]);
  const seen = [];
  for (let i = 0; i < 60; i++) {
    const at = await levelling();
    if (at && seen[seen.length - 1] !== at) seen.push(at);
    if (at === 'turn' && !seen.includes('shot')) { seen.push('shot'); await page.screenshot({ path: `test-results/levelup/${tier}-${mode}-turn.png` }); }
    if (at === 'ready') break;
    await page.waitForTimeout(120);
  }
  const order = ['rush', 'word', 'card', 'turn', 'turned', 'named', 'ready'];
  const phases = seen.filter(one => one !== 'shot');
  check(phases.every((one, i) => i === 0 || order.indexOf(one) > order.indexOf(phases[i - 1])) && phases.at(-1) === 'ready',
    `${tier} in ${mode}: its phases in order, ending on the keys`, phases.join(' → '));
  check(await overlay.getAttribute('data-tier') === tier && await page.locator(`.lu-face.is-new .st-card.tier-${tier}.is-${mode}`).count() === 1,
    `${tier} in ${mode}: the new card in the rung's material`);
  check(await page.locator('.lu-title').textContent() === { emerging: 'EMERGING PLAYER', star: 'STAR', hitman: 'HITMAN' }[tier], `${tier} in ${mode}: the rung named`);
  const shake = await overlay.evaluate(el => getComputedStyle(el).getPropertyValue('--lu-shake').trim());
  check(tier === 'hitman' ? Number(shake) > 0 : Number(shake) === 0, `${tier} in ${mode}: the ground shakes for HITMAN alone`, shake);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `test-results/levelup/${tier}-${mode}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(await overlay.count() === 0, `${tier} in ${mode}: Escape goes to the scorecard`);
}

// — A tap before the keys skips to them.
await page.evaluate(() => window.__cricket.levelUp('hitman', 'classic'));
await page.waitForTimeout(300);
await page.locator('#levelup-overlay').click({ position: { x: 200, y: 300 } });
await page.waitForTimeout(500);
check((await levelling()) === 'ready' && await page.locator('#levelup-share').isVisible(), 'a tap before the keys skips straight to them');
await page.locator('#levelup-scorecard').click();
await page.waitForTimeout(300);
check(await overlay.count() === 0, 'and GO TO SCORECARD still puts it away');

// — Reduced motion: the turned card and the keys, still.
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.evaluate(() => window.__cricket.levelUp('star', 'classic'));
await page.waitForTimeout(300);
check((await levelling()) === 'ready' && await overlay.evaluate(el => el.classList.contains('is-still')), 'under reduced motion it stands still with its keys up');
await page.screenshot({ path: 'test-results/levelup/still.png' });
await page.keyboard.press('Escape');
await page.emulateMedia({ reducedMotion: 'no-preference' });

check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
