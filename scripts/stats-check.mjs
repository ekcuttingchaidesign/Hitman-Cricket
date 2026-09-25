/**
 * The career card's own screen, checked in a real browser.
 *
 *   npx vite --port 5199 &
 *   node scripts/stats-check.mjs                    # that dev server
 *   node scripts/stats-check.mjs http://…:4173      # a preview build
 *
 * Everything on this screen is either painted into a canvas or wired up by
 * hand, and neither of those is something a unit test can see. Both bugs this
 * script was written after were invisible to 930 passing tests and obvious in
 * a browser within a second: a sheet that threw on the way to focusing a key
 * that is no longer drawn, leaving the card stuck on "Drawing your card…", and
 * a one-mode build that took every way back off the row once you were standing
 * on My Stats.
 *
 * It reads only — no innings is played and nothing is posted, so it is safe to
 * point at anything.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5199').replace(/\/$/, '');
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

await page.goto(`${base}/`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
// The cover offers the board without an innings being played, which is the
// shortest way to the card and the one a new player takes.
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(2000); }
await page.click('#cover-board');
await page.waitForTimeout(1000);

// The board people already know is the one it opens on. Every other ladder is
// a pill away, and none of them is ever what greets somebody who taps the
// leaderboard — including after they have been looking at one of the others.
const live = () => page.$eval('.ladder-tab.is-on', tab => tab.textContent.trim()).catch(() => '');
check(await live() === 'Top score', 'the board opens on the one that was already there', await live());
const runs = await page.$('#board-ladder-runs');
if (runs) {
  await runs.click();
  await page.waitForTimeout(900);
  check(await live() === 'Runs', 'a pill switches ladder');
  await page.click('#board-close');
  await page.waitForTimeout(500);
  await page.click('#cover-board');
  await page.waitForTimeout(1000);
  check(await live() === 'Top score', 'and the next open is back on it', await live());
}

const mine = await page.$('#board-tab-mine');
check(!!mine, 'the board carries a My Stats tab');
if (mine) await mine.click();

// The picture, which is the thing the two bugs above both stopped arriving.
const drew = await page.waitForSelector('.stats-shot', { timeout: 20_000 }).then(() => true).catch(() => false);
check(drew, 'the card is painted rather than left drawing', await page.$eval('.stats-stage', n => n.textContent.trim()).catch(() => ''));

const tabs = await page.$$eval('.board-tabs button', keys => keys.map(key => key.textContent.trim()));
check(tabs.length >= 2, 'the card keeps a way back to the board on the tab row', tabs.join(' | '));

// The rail: two cards where the build plays two games, the Blast in front, and
// the next one showing at the edge so there is something to swipe towards.
const slides = await page.$$eval('.stats-slide', all => all.map(one => one.dataset.mode));
if (slides.length > 1) {
  check(slides[0] === 'classic', 'the rail opens on the Blast', slides.join(' | '));
  const rail = await page.evaluate(() => {
    const track = document.getElementById('stats-rail');
    const cards = [...track.querySelectorAll('.stats-slide')];
    const box = track.getBoundingClientRect();
    return {
      peek: Math.round(box.right - cards[1].getBoundingClientRect().left),
      inside: cards.every(card => card.getBoundingClientRect().width <= box.width + 1),
      scroll: Math.round(track.scrollLeft),
    };
  });
  check(rail.peek > 12 && rail.peek < 80, 'the card behind shows at the edge', JSON.stringify(rail));
  check(rail.inside && rail.scroll === 0, 'and the front one is whole and at the front', JSON.stringify(rail));

  // A swipe, and what the share keys would send after it.
  await page.evaluate(() => {
    const track = document.getElementById('stats-rail');
    const cards = [...track.querySelectorAll('.stats-slide')];
    track.scrollTo({ left: cards[1].offsetLeft - track.offsetLeft, behavior: 'instant' });
  });
  await page.waitForTimeout(700);
  const now = await page.$eval('.stats-dot.is-on', dot => dot.textContent.trim());
  check(now === 'Test Survival', 'swiping moves which card is in front', now);
  await page.click('.stats-dot[data-slide="0"]');
  await page.waitForTimeout(900);
  check(await page.$eval('.stats-dot.is-on', dot => dot.textContent.trim()) === 'The Blast',
    'and the dots take you back without a swipe');
}

const taps = await page.$$('.stats-tap');
const figures = await page.$$eval('.stats-tap', keys => keys.map(key => key.dataset.stat));
check(taps.length > 0, 'every figure on the picture carries a key to press', figures.join(', '));

if (taps.length) {
  await taps[0].click();
  await page.waitForTimeout(500);
  const said = await page.$eval('#stats-toast', toast => ({
    up: toast.classList.contains('is-up'), text: toast.textContent.trim(),
  }));
  check(said.up && said.text.length > 20, 'pressing a figure says what it counts', JSON.stringify(said));
  await page.waitForTimeout(5200);
  const gone = await page.$eval('#stats-toast', toast => !toast.classList.contains('is-up'));
  check(gone, 'and the toast takes itself away again');
}

check(errors.length === 0, 'nothing threw on the way', errors.join(' ;; '));
await browser.close();
console.log(`\n${failures ? `${failures} failed` : 'all good'}\n`);
if (failures) process.exitCode = 1;
