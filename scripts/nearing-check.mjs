/**
 * The wait for a moment, in a real browser: the card under the score bar
 * that goes up ten short of a fifty or a hundred and on the third six running, and
 * how it moves, runs hotter, and comes off.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/nearing-check.mjs
 *   node scripts/nearing-check.mjs http://…:4173    # a preview build
 *
 * Nobody bats to 96 in a headless browser, so the innings is written out ball
 * by ball through the debug hook, one call a ball, and the card is asked to do
 * exactly what it would have done — with the real innings paused underneath,
 * so a ball of its own cannot come through and move the card mid-check. The
 * pause card is hidden, since it is not what is being looked at.
 *
 * A card coming off holds its last look for a second and a half. Software
 * rendering can spend that between two steps of a script, so while a card is
 * being photographed on its way off the page's timers are slowed down —
 * `__timerScale` — and put back for the checks that it does go.
 *
 * Screenshots land in test-results/, for a person to look at: a check can say
 * the heat went up, not that it looks like tension.
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

const sixes = n => Array(n).fill(6);

for (const [name, options] of [
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['desktop', { viewport: { width: 1280, height: 720 } }],
]) {
  console.log(name);
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-seen', day);
      localStorage.setItem('hitman-whatsnew', 'rivals-launch:9');
      localStorage.setItem('hitman-unveiled', 'ground-pavilion');
    } catch { /* Then the notices stand. */ }
    const later = window.setTimeout;
    window.__timerScale = 1;
    window.setTimeout = (fn, ms, ...rest) => later(fn, (ms ?? 0) * window.__timerScale, ...rest);
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click({ force: true }); await page.waitForTimeout(800); }
  await page.locator('#start').click({ force: true });
  await page.waitForTimeout(600);
  await page.locator('#mode-classic').click({ force: true });
  await page.waitForFunction(() => /READY|BOWLER_RUNUP/.test(window.__cricket?.snapshot().phase ?? ''), null, { timeout: 20_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__cricket.snapshot().phase === 'PAUSED', null, { timeout: 5000 });
  await page.addStyleTag({ content: '#pause-overlay,#debug{display:none!important}' });
  check(await page.locator('#nearing').isHidden(), 'no card at the start of an innings');

  /** The innings so far, then one ball more: the card moves as it would have. */
  let balls = [];
  const play = async (...more) => {
    for (const ball of more) {
      balls = [...balls, ball];
      await page.evaluate(b => window.__cricket.nearing(b), balls);
    }
    await page.waitForTimeout(80);
  };
  const fresh = async (...start) => {
    // A new man in, a wicket and a pause for the old card to come off.
    balls = [];
    await page.evaluate(() => window.__cricket.nearing(['W']));
    await page.waitForTimeout(1700);
    await play(...start);
  };
  const card = () => page.$eval('#nearing', node => ({
    hidden: node.classList.contains('hidden'),
    kind: [...node.classList].find(c => c.startsWith('is-') && !['is-in'].includes(c)) ?? '',
    heat: node.dataset.heat,
    say: node.querySelector('.nr-say')?.textContent ?? '',
    runs: node.querySelector('.nr-count')?.textContent ?? '',
    need: node.querySelector('.nr-need')?.textContent ?? '',
    filled: node.querySelectorAll('.nr-slot.is-filled').length,
    crossed: node.classList.contains('is-crossed'),
    reached: node.classList.contains('is-reached'),
    said: node.querySelector('.nr-said')?.textContent ?? '',
    box: node.getBoundingClientRect().toJSON(),
  }));
  /**
   * Lets every one-shot animation reach its end, for a screenshot of where it
   * lands — all but the card's own way out, which would land on nothing.
   * Those run on the page's clock rather than its timers, so slowing the
   * timers does not hold them; they are held here instead.
   */
  const settle = () => page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      // Held where the eye would catch them: crossed out and not yet going,
      // and the burst at its brightest.
      if (animation.animationName === 'nr-gone') { animation.pause(); animation.currentTime = 0; continue; }
      if (animation.animationName === 'nr-burst') { animation.pause(); animation.currentTime = 320; continue; }
      if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish();
    }
  });
  const slow = on => page.evaluate(scale => { window.__timerScale = scale; }, on ? 40 : 1);
  const shot = async what => { await settle(); await page.screenshot({ path: `test-results/nearing-${name}-${what}.png` }); };

  // ── The fifty ────────────────────────────────────────────────────────────
  await play(...sixes(6), 4);                                           // 40
  let seen = await card();
  check(!seen.hidden && seen.kind === 'is-fifty', 'ten short of fifty, the card goes up', JSON.stringify(seen));
  check(seen.runs === '40' && seen.need === '10' && seen.heat === '1', 'on 40, ten to get, running cool', JSON.stringify(seen));
  check(seen.say === 'Fifty in sight', 'fifty in sight', seen.say);
  const bar = await page.$eval('.score-bug', node => node.getBoundingClientRect().toJSON());
  const { height: H } = options.viewport;
  const share = (seen.box.width * seen.box.height) / (bar.width * bar.height);
  check(share > .4 && share < .75, 'smaller than the score bar, but not a speck',
    `${Math.round(seen.box.width)}×${Math.round(seen.box.height)} against ${Math.round(bar.width)}×${Math.round(bar.height)}: ${Math.round(share * 100)}%`);
  check(seen.box.top >= bar.bottom && Math.abs(seen.box.left - bar.left) <= 1, 'hanging under the score bar, square with it',
    `${JSON.stringify(bar)} / ${JSON.stringify(seen.box)}`);
  check(seen.box.bottom < H / 3, 'up out of the way of the pitch', JSON.stringify(seen.box));
  await play(3);                                                         // 43
  seen = await card();
  check(seen.runs === '43' && seen.need === '7', 'a three winds it on to 43', JSON.stringify(seen));
  await shot('fifty-43');
  await play(0);
  check(await page.$eval('.nr-body', node => node.classList.contains('is-stuck')), 'a dot ball makes it flinch');
  await play(1);                                                         // 44
  seen = await card();
  check(seen.heat === '2' && seen.say === 'A six does it', 'six short: warmer, and a six does it', JSON.stringify(seen));
  await play(2);                                                         // 46
  seen = await card();
  check(seen.heat === '3' && seen.say === 'A four does it', 'four short: hot, and a four does it', JSON.stringify(seen));
  await play(3);                                                         // 49
  seen = await card();
  check(seen.say === 'One run away' && seen.need === '1', 'one run away', JSON.stringify(seen));
  check(seen.said === 'On 49, 1 short of fifty.', 'said in full to a screen reader', seen.said);
  await shot('fifty-49');
  await slow(true);
  await play(1);                                                         // 50
  seen = await card();
  check(seen.reached && seen.need === '50' && seen.say === 'Fifty!', 'getting there fills it and bursts it', JSON.stringify(seen));
  await shot('fifty-reached');
  await slow(false);

  // ── The hundred, and out short of it ─────────────────────────────────────
  await fresh(...sixes(15), 0, 2);                                       // 92
  seen = await card();
  check(!seen.hidden && seen.kind === 'is-century' && seen.runs === '92', 'on 92, the hundred card', JSON.stringify(seen));
  check(seen.say === 'Nervous nineties' && seen.heat === '1', 'the nervous nineties', JSON.stringify(seen));
  await shot('century-92');
  await play(4);                                                         // 96
  seen = await card();
  check(seen.heat === '3' && seen.need === '4', 'a four to 96, and it runs hot', JSON.stringify(seen));
  await shot('century-96');
  await slow(true);
  await play('W');
  seen = await card();
  check(seen.crossed && seen.say === 'Out for 96', 'out on 96: scribbled out, out for 96', JSON.stringify(seen));
  await shot('century-out');
  await slow(false);
  // Out again from the top, at the page's own pace: the card goes by itself.
  await fresh(...sixes(16));
  await play('W');
  await page.waitForTimeout(2500);
  check((await card()).hidden, 'and a card crossed out is put away by itself');

  // ── Six sixes ────────────────────────────────────────────────────────────
  await fresh(1, 6, 6);
  check((await card()).hidden, 'two sixes running is nothing yet');
  await play(6);
  seen = await card();
  check(!seen.hidden && seen.kind === 'is-six-sixes' && seen.filled === 3, 'the third six: three slots stamped, three to go', JSON.stringify(seen));
  check(seen.say === 'Six 6s? 3 more', 'asking the question', seen.say);
  await shot('sixes-3');
  await play(6, 6);
  seen = await card();
  check(seen.filled === 5 && seen.heat === '3' && seen.say === 'One more. Yuvi?', 'five stamped, one more for Yuvi', JSON.stringify(seen));
  check(await page.$eval('.nr-slot[data-slot="5"]', node => node.classList.contains('is-next')), 'the sixth slot waiting');
  await shot('sixes-5');
  await slow(true);
  await play(1);
  seen = await card();
  check(seen.crossed && seen.say === 'Streak over', 'anything but a six: streak over', JSON.stringify(seen));
  await shot('sixes-broken');
  await slow(false);

  await fresh(1, ...sixes(5));
  await slow(true);
  await play(6);
  seen = await card();
  check(seen.reached && seen.filled === 6 && seen.say === 'Six 6s!', 'the sixth: all six stamped, and burst', JSON.stringify(seen));
  await slow(false);
  await fresh(1, ...sixes(5));
  await play(6);
  await page.waitForTimeout(2500);
  check((await card()).hidden, 'and a card that got there is gone by itself');

  // ── Both at once: the sixes first ────────────────────────────────────────
  await fresh(...sixes(12), 0, 6, 6, 6);                                // 90, three running
  seen = await card();
  check(seen.kind === 'is-six-sixes', 'in the nineties with three sixes running, the sixes show', JSON.stringify(seen));
  await slow(true);
  await play(4);                                                         // 94, streak over
  seen = await card();
  check(seen.crossed, 'the four ends the streak');
  await slow(false);
  // Wound on by hand: the card the hundred replaces it with was queued at
  // the slow pace.
  await page.evaluate(() => { window.__timerScale = 1; });
  await page.evaluate(b => window.__cricket.nearing(b), balls);
  await page.waitForTimeout(400);
  seen = await card();
  check(!seen.hidden && seen.kind === 'is-century' && seen.runs === '94', 'and the hundred card takes its place', JSON.stringify(seen));

  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
