/**
 * The update's stories, driven in a real browser.
 *
 *   npx vite --port 5199 &
 *   node scripts/whatsnew-check.mjs                    # that dev server
 *   node scripts/whatsnew-check.mjs http://…:4173      # a preview build
 *
 * Every rule this screen has is about *when* it appears — twice unasked, then
 * never; on demand from the board for ever, without spending either of the two
 * — and none of that is a thing a unit test can watch happen. It is also the
 * one screen in the game that stands between a player and the innings they came
 * for, so the way out of it is worth proving rather than assuming.
 *
 * It writes nothing but this browser's own localStorage, in a throwaway
 * profile, so it is safe to point anywhere.
 *
 * Time is driven by hand throughout. A story holds for seven seconds and then
 * moves on by itself, which is the screen working as intended and a race this
 * script cannot win: driven against the wall clock it taps a card that has
 * already moved on, and on a slow enough server it taps past the end and finds
 * the stories closed. So the page's clock is frozen and wound on where the
 * waiting is the point — which also makes the auto-advance itself something
 * that can be checked rather than something to be dodged.
 */

import { chromium } from '@playwright/test';

/** The update key in `src/game/whats-new.ts`. Bumped there, bumped here. */
const UPDATE = 'marathon-launch';

const base = (process.argv[2] ?? 'http://127.0.0.1:5199').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.clock.install();

/** The page's own clock, wound on, then a beat of real time to draw in. */
const tick = async (ms, draw = 200) => { await page.clock.runFor(ms); await page.waitForTimeout(draw); };
const title = () => page.$eval('.whatsnew-title', node => node.textContent.trim());
/**
 * Stops the page's clock where it stands. Its time can run past the moment
 * asked for between reading it and pausing at it, so it is read again and
 * asked for again until it holds.
 */
async function freeze() {
  for (let tries = 0; ; tries++) {
    try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 250); return; } catch (error) { if (tries > 8) throw error; }
  }
}
const seen = () => page.evaluate(() => localStorage.getItem('hitman-whatsnew'));
async function arrive() {
  await tick(3000, 800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await tick(1500, 400); }
}

await page.goto(`${base}/`, { waitUntil: 'load' });
await arrive();

// ── The first visit ────────────────────────────────────────────────────────
// From here the clock moves only when the check moves it, and it is stopped
// before the stories open rather than after. Left running, it runs on in real
// time while a slow machine draws the first story — a photograph and a blur of
// it across the screen — and a card's seven-second hold can be gone before the
// next line runs, so the check reads the second card where the first should be.
await freeze();
await page.click('#start');
let opened = false;
for (let wound = 0; wound < 6000 && !opened; wound += 100) {
  await page.clock.runFor(100);
  opened = !!(await page.$('.whatsnew-sheet'));
}
check(opened, 'the play key stops at the stories the first time');
if (!opened) { await browser.close(); process.exit(1); }

const first = await title();
// A build that plays one mode has no picker to skip to, so the key says the
// other thing. Either is right; a key that promises the picker in a build
// without one is not.
const says = await page.$eval('#whatsnew-done', key => key.textContent.trim());
check(says === 'SKIP TO MODE SELECTION' || says === 'SKIP AND START BATTING',
  'the way out says where it goes', says);
// Waited for from out here, a beat at a time: the page's own timers are the
// ones standing still.
async function loaded() {
  for (let i = 0; i < 40; i++) {
    if (await page.$eval('.whatsnew-art img', img => img.complete && img.naturalWidth > 0).catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}
/** The film, drawn: Lottie's svg in the story, with its picture of the kit in it. */
async function playing() {
  for (let i = 0; i < 60; i++) {
    if (await page.$eval('#whatsnew-film svg', svg => svg.querySelectorAll('image, path').length > 20).catch(() => false)) return true;
    await page.clock.runFor(100);
    await page.waitForTimeout(250);
  }
  return false;
}
// The Test Marathon first, as a film across the whole story.
check(first === 'Test Marathon', 'it opens on the Test Marathon', first);
check(await playing(), 'with its film on the screen, playing');
check(await page.$eval('#whatsnew-film', film => film.getAttribute('aria-label')?.length > 40),
  'which a screen reader is told about in words');
check(!(await page.$('#whatsnew-keyslot')), 'and no key card on a card that asks for nothing');

// The film runs nine seconds, and the story holds a beat past it before it
// moves on by itself. Wound in half-second steps until it does: the installed
// clock also runs on by itself in real time, and one long wind on a slow
// machine carries a card past its own hold and the next one's too.
let held = 0;
for (; held < 14000 && await title() === first; held += 500) await tick(500, 150);
check(held >= 9000, 'holding for the whole film', `${held}ms`);
const meme = await title();
check(meme === 'Save your career key', 'and moves on by itself to the meme, last', meme);
check(await loaded(), 'the meme is on the screen, loaded', await page.$eval('.whatsnew-art img', img => img.src));
check(!(await page.$('#whatsnew-film')), 'and the film is gone with its story');
// A nameless first visit holds no key, so there is no card to save one.
check(!(await page.$('#whatsnew-keyslot .key-pass')), 'a player with no name is shown no key card');
check(!(await page.$('#whatsnew-key-restore')), 'and no way back either');

// Carrying the key, the story holds still: one that moved itself on would
// take the key away from under a thumb on its way to it.
await tick(9000);
check(!!(await page.$('.whatsnew-sheet')) && await title() === meme, 'the story carrying the key holds still', meme);

// And a tap on the left half goes back.
await page.click('#whatsnew-back');
await tick(400);
check(await title() === 'Test Marathon', 'a tap back goes back a card', await title());

await page.click('#whatsnew-done');
await tick(700);
check(await page.$eval('#whatsnew-overlay', node => node.classList.contains('hidden')),
  'the key puts the stories away');
const picked = await page.$eval('#modes', node => !node.classList.contains('hidden'));
const batting = await page.$eval('#start', node => !node.offsetParent).catch(() => true);
check(says === 'SKIP TO MODE SELECTION' ? picked : batting,
  'and lands where it promised', JSON.stringify({ says, picked, batting }));
check(await seen() === `${UPDATE}:1`, 'the showing is counted', await seen());

// ── Twice, and then never ──────────────────────────────────────────────────
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await tick(800);
check(!!(await page.$('.whatsnew-sheet')), 'it comes back a second time, because once is missed');
await page.click('#whatsnew-done');

await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await tick(800);
check(!(await page.$('.whatsnew-sheet')), 'and never again on its own');
check(await seen() === `${UPDATE}:2`, 'having been counted twice and no more', await seen());

// ── The way in for somebody who went looking ───────────────────────────────
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#cover-board');
await tick(1200, 400);
const key = await page.$('#board-new');
check(!!key, 'the board carries a What\'s new key beside its close key');
if (key) {
  await key.click();
  const back = await page.waitForSelector('.whatsnew-sheet', { timeout: 10_000 })
    .then(() => true).catch(() => false);
  check(back, 'which opens the same stories however many times they have been read');
  check(await page.$eval('#whatsnew-done', one => one.textContent.trim()) === 'CLOSE',
    'and offers to close rather than to go somewhere');
  await page.click('#whatsnew-done');
  await tick(500);
  check(await page.$eval('#board-overlay', node => !node.classList.contains('hidden')),
    'putting the player back on the board they came from');
  check(await seen() === `${UPDATE}:2`, 'without spending one of the two', await seen());
}

// ── A player holding a key ─────────────────────────────────────────────────
// Made up and kept in this throwaway browser only; nothing is sent anywhere.
await page.evaluate(() => {
  localStorage.setItem('hitman-batter', JSON.stringify({ name: 'Story Check', avatar: 0 }));
  localStorage.setItem('hitman-career-key', JSON.stringify({ code: 'brave-otter-lamp-07', saved: false }));
  localStorage.removeItem('hitman-whatsnew');
});
await page.reload({ waitUntil: 'load' });
await arrive();
await page.click('#start');
await tick(800);
// On to the card that carries the key, a tap at a time: the cards before it
// also move on by themselves, so a fixed count of taps can overshoot.
for (let i = 0; i < 3 && !(await page.$('#whatsnew-keyslot')); i++) { await page.click('#whatsnew-next'); await tick(400); }
check(!!(await page.$('#whatsnew-keyslot .key-pass')), 'tapping on reaches the key card', await title());
check(await page.$eval('#whatsnew-keyslot', slot => slot.textContent.includes('brave-otter-lamp-07')).catch(() => false),
  'a player with a key is shown it under the meme');
const order = await page.evaluate(() => {
  const top = sel => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
  return [top('.whatsnew-art img'), top('#whatsnew-keyslot .key-pass'), top('#whatsnew-done')];
});
check(order[0] < order[1] && order[1] < order[2], 'meme, then the key card, then the way out', order.join(' < '));
const save = await page.$('#whatsnew-key-save');
check(!!save && (await save.textContent()).trim() === 'SAVE YOUR KEY', 'with a key that says SAVE YOUR KEY');
if (save) {
  await save.click();
  await tick(500);
  const over = await page.evaluate(() => {
    const sheet = document.querySelector('#key-overlay .key-modal');
    if (!sheet) return false;
    const box = sheet.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + 40)?.closest('.key-modal') === sheet;
  });
  check(over, 'which opens the save sheet over the story rather than under it');
  await page.click('#key-modal-close');
  await tick(400);
  check(!!(await page.$('.whatsnew-sheet')), 'and closing it leaves the story where it was');
}

check(errors.length === 0, 'nothing threw on the way', errors.join(' ;; '));
await browser.close();
console.log(`\n${failures ? `${failures} failed` : 'all good'}\n`);
if (failures) process.exitCode = 1;
