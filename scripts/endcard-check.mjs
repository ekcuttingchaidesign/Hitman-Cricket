/**
 * The end of an innings as UI v1 draws it (the handover's section 05), in
 * every mode: the Blast's band and over-by-over chart, the Marathon's worm and
 * batting card, Test Survival's photograph, chips and injury ring — each with
 * the player card under it, the career key, and the keys along the foot.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/endcard-check.mjs http://127.0.0.1:5201
 *
 * The innings are written ball by ball through the debug hooks
 * (`__cricket.blast`, `__cricket.marathon`, `__cricket.finish`) rather than
 * batted, so the check is about the card and not the batting. Pictures land in
 * test-results/endcard/.
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

await mkdir('test-results/endcard', { recursive: true });
const browser = await chromium.launch({ executablePath });

/** A Blast that adds up: thirty balls, two wickets, plenty of boundaries. */
const BLAST = [1, 4, 6, 2, 6, 1, 6, 'W', 4, 1, 6, 0, 6, 6, 'W', 1, 4, 6, 4, 1, 6, 2, 6, 4, 6, 4, 1, 6, 4, 1];
const MARATHON = [...Array(40).fill(1), 4, 6, 'W', ...Array(30).fill(2), 6, 6, 'W', ...Array(20).fill(1), 'W'];

/** A page in the given mode, for a named player or nobody, at the batting crease. */
async function crease(mode, named) {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(who => {
    try {
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-marathon-intro', 'done');
      localStorage.setItem('hitman-profile', '1');
      if (who) localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 1 }));
    } catch { /* Then the screens it skips stand in the way. */ }
  }, named ? `Card${Math.random().toString(36).slice(2, 7)}` : null);
  // Chosen on Choose a mode, the way a player does: a link naming the mode
  // hides the way back to the picker, and with it the MODE key.
  await page.goto(`${base}/?debug=1&seed=4242`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
  // The debug readout `?debug=1` brings stands over the card; it is not the card.
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) {
    const done = page.locator('#whatsnew-done');
    if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
    const pick = page.locator(`#mode-${mode}`);
    if (await pick.isVisible().catch(() => false)) await pick.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
  return { context, page, errors, snap };
}

const visible = (page, ids) => Promise.all(ids.map(id => page.locator(id).isVisible()));
const settle = async (page, done) => { for (let i = 0; i < 30 && !(await done()); i++) await page.waitForTimeout(400); await page.waitForTimeout(800); };

// — The Blast, for a named player.
{
  const { context, page, errors } = await crease('classic', true);
  await page.evaluate(balls => window.__cricket.blast(balls), BLAST);
  await settle(page, () => page.locator('#card-board').isVisible());
  check(await page.locator('#end').isVisible(), 'a finished Blast ends on the card');
  check((await page.locator('#end-mode').textContent()) === 'THE BLAST' && /OVERS/.test(await page.locator('#end-label').textContent()), 'headed THE BLAST, with its overs');
  check(await page.locator('#final-balls .ec-over').count() === 5, 'five overs on the chart', String(await page.locator('#final-balls .ec-over').count()));
  check(await page.locator('#final-balls .ec-bar.is-out').count() === 2, 'with a red bar for each wicket');
  check((await page.locator('#final-wickets').textContent()) === '2', 'and the wickets among the figures');
  for (let i = 0; i < 20 && !/You are #\d+/.test(await page.locator('#card-board-head').textContent()); i++) await page.waitForTimeout(300);
  check(/You are #\d+ on the leaderboard/.test(await page.locator('#card-board-head').textContent()), 'the player card says where it landed', await page.locator('#card-board-head').textContent());
  check((await page.locator('#claim').innerText()).trim() === 'Leaderboard', 'with the board one door away', await page.locator('#claim').innerText());
  const [mode, again, challenge, mmodes, share] = await visible(page, ['#card-change', '#again', '#challenge-set', '#mcard-modes', '#mcard-share']);
  check(mode && again && challenge && !mmodes && !share, 'MODE, PLAY AGAIN and the challenge along the foot', JSON.stringify({ mode, again, challenge, mmodes, share }));
  await page.screenshot({ path: 'test-results/endcard/blast.png' });
  await page.screenshot({ path: 'test-results/endcard/blast-full.png', fullPage: false, clip: { x: 0, y: 0, width: 402, height: 874 } });
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — The Blast, for a player with no name: the card asks.
{
  const { context, page, errors } = await crease('classic', false);
  await page.evaluate(balls => window.__cricket.blast(balls), BLAST);
  await settle(page, () => page.locator('#claim').isVisible());
  check(await page.locator('#card-board-who').textContent() === 'GUEST', 'a nameless player is a guest on the card');
  const label = (await page.locator('#claim').innerText()).trim();
  check(/REGISTER SCORE ON LEADERBOARD|CLAIM YOUR NAME/.test(label), 'and the card asks rather than points', label);
  await page.screenshot({ path: 'test-results/endcard/blast-guest.png' });
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — The Test Marathon.
{
  const { context, page, errors } = await crease('marathon', true);
  await page.evaluate(balls => window.__cricket.marathon(balls), MARATHON);
  await settle(page, () => page.locator('#card-board').isVisible());
  check((await page.locator('#end-mode').textContent()) === 'TEST MARATHON', 'a Marathon is headed TEST MARATHON');
  check(/all out/i.test(await page.locator('#end-title').textContent()), 'and its band says how it ended', await page.locator('#end-title').textContent());
  check(await page.locator('#mcard-worm .worm-line').count() === 1 && await page.locator('#mcard-worm .worm-fall').count() === 3, 'the worm, with a red ball for each man gone');
  check(await page.locator('#mcard-score tbody tr').count() === 3, 'and the batting card, a row a batter');
  const [mode, again, share, challenge] = await visible(page, ['#mcard-modes', '#again', '#mcard-share', '#challenge-set']);
  check(mode && again && share && !challenge, 'MODE, PLAY AGAIN and SHARE along the foot', JSON.stringify({ mode, again, share, challenge }));
  await page.screenshot({ path: 'test-results/endcard/marathon.png' });
  await page.locator('#end .ec-content').evaluate(el => el.scrollTo({ top: 9999 }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/endcard/marathon-scrolled.png' });
  // Scrolled to the foot, the last of the card clears the keys: they stand
  // still over it, and it scrolls up from under them.
  const clear = await page.evaluate(() => {
    const keys = document.querySelector('#end .ec-keys').getBoundingClientRect();
    const key = document.querySelector('#card-key').getBoundingClientRect();
    return { keyBottom: Math.round(key.bottom), keysTop: Math.round(keys.top), keysBottom: Math.round(keys.bottom), height: innerHeight };
  });
  check(clear.keyBottom <= clear.keysTop && clear.keysBottom <= clear.height + 1,
    'scrolled to the foot, the career key clears the keys, which stay at the bottom', JSON.stringify(clear));
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — Test Survival.
{
  const { context, page, errors } = await crease('survive', true);
  await page.evaluate(() => window.__cricket.finish());
  await settle(page, () => page.locator('#end-survive').isVisible());
  check(await page.locator('#end-survive').isVisible(), 'a Test ends on its own card');
  check(/MATCH (LOST|WON|DRAWN)/.test(await page.locator('#survive-stamp').textContent()), 'headed with the result', await page.locator('#survive-stamp').textContent());
  check(await page.locator('#survive-plate').evaluate(img => img.complete && img.naturalWidth > 0), 'over the result\'s photograph');
  check(/\d+\/\d+/.test(await page.locator('#survive-score').textContent()) && (await page.locator('#survive-overs').textContent()).length > 0, 'with the score and the balls as chips');
  check(await page.locator('#survive-ring .ec-ring').count() === 1 && /^Injury · (Light|High|Severe)$/.test(await page.locator('#survive-health').textContent()), 'and the injury as a ring and a word', await page.locator('#survive-health').textContent());
  const [mode, again] = await visible(page, ['#survive-modes', '#survive-again']);
  check(mode && again, 'MODE and PLAY AGAIN along the foot');
  await page.screenshot({ path: 'test-results/endcard/survival.png' });
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall ok — pictures in test-results/endcard/');
process.exit(failures ? 1 : 0);
