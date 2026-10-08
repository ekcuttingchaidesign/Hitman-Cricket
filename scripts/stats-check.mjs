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
// Past how to hit, the coachmark before a first innings: `shots-check.mjs` is the one that looks at it.
await page.addInitScript(() => { try { localStorage.setItem('hitman-shots-intro', 'done'); } catch { /* Then it shows. */ } });
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

// The rail: a card a game the build plays, the Blast in front, and
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
  const second = { survive: 'Test Survival', marathon: 'Test Marathon' }[slides[1]];
  check(now === second, 'swiping moves which card is in front', `${now}, not ${second}`);
  await page.click('.stats-dot[data-slide="0"]');
  // Waited for rather than slept on: in software rendering a frame can take a
  // second, and the rail eases back over several of them.
  await page.waitForFunction(() => document.querySelector('.stats-dot.is-on')?.textContent.trim() === 'The Blast', null, { timeout: 10_000 }).catch(() => {});
  check(await page.$eval('.stats-dot.is-on', dot => dot.textContent.trim()) === 'The Blast',
    'and the dots take you back without a swipe');
  // Wherever the Test Marathon can be played — every build off production —
  // its card is the second, between the Blast's and Test Survival's.
  if (slides.includes('marathon')) {
    check(slides.join(' | ') === 'classic | marathon | survive', 'the Test Marathon\'s card comes second', slides.join(' | '));
    await page.click(`.stats-dot[data-slide="${slides.indexOf('marathon')}"]`);
    await page.waitForFunction(() => document.querySelector('.stats-dot.is-on')?.textContent.trim() === 'Test Marathon', null, { timeout: 10_000 }).catch(() => {});
    // The figures, as the picture's own words say them: a canvas has no text.
    await page.waitForSelector('.stats-slide[data-mode="marathon"] .stats-shot', { timeout: 20_000 }).catch(() => {});
    const marathon = await page.$eval('.stats-slide[data-mode="marathon"]',
      slide => slide.querySelector('.stats-shot')?.getAttribute('alt') ?? slide.textContent);
    check(await page.$eval('.stats-dot.is-on', dot => dot.textContent.trim()) === 'Test Marathon'
      && /Highest/.test(marathon) && /Best ind/.test(marathon) && /Per inns/.test(marathon),
    'and leads with the highest total and the best individual score, runs per innings under them', marathon.replace(/\s+/g, ' ').slice(0, 160));
    // British Racing Green, with red rising from the foot: read off the
    // picture's own pixels, near the top and near the bottom right.
    const ground = await page.$eval('.stats-slide[data-mode="marathon"] .stats-shot', async img => {
      await img.decode().catch(() => {});
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const pick = (fx, fy) => [...ctx.getImageData(Math.round(img.naturalWidth * fx), Math.round(img.naturalHeight * fy), 1, 1).data].slice(0, 3);
      return { top: pick(0.12, 0.08), foot: pick(0.75, 0.86) };
    }).catch(error => ({ error: String(error) }));
    const [r, g, b] = ground.top ?? [0, 0, 0];
    check(g > r * 1.6 && g > b * 1.2, 'on a green card', JSON.stringify(ground));
    const [fr, fg] = ground.foot ?? [0, 0];
    check(fr > r && fr > fg * 0.6, 'with red coming up through it at the foot', JSON.stringify(ground));
    await page.click('.stats-dot[data-slide="0"]');
    await page.waitForFunction(() => document.querySelector('.stats-dot.is-on')?.textContent.trim() === 'The Blast', null, { timeout: 10_000 }).catch(() => {});
  }
}

const taps = await page.$$('.stats-tap');
const figures = await page.$$eval('.stats-tap', keys => keys.map(key => key.dataset.stat));
check(taps.length > 0, 'every figure on the picture carries a key to press', figures.join(', '));

if (taps.length) {
  // Whether the toast rose is watched for as it happens rather than sampled
  // after a sleep. It stays up four and a half seconds, and in software
  // rendering, where a frame can take a second, Playwright's click alone can
  // spend longer than that waiting for the page to settle: sampled afterwards,
  // a toast that rose and went exactly as it should read as one that never came.
  await page.evaluate(() => {
    const toast = document.getElementById('stats-toast');
    window.__toastRose = false;
    new MutationObserver(() => { if (toast.classList.contains('is-up')) window.__toastRose = true; })
      .observe(toast, { attributes: true, attributeFilter: ['class'] });
  });
  await taps[0].click();
  await page.waitForFunction(() => window.__toastRose, null, { timeout: 10_000 }).catch(() => {});
  const said = await page.$eval('#stats-toast', toast => ({
    up: window.__toastRose, text: toast.textContent.trim(),
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
