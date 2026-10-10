/**
 * The leaderboard as UI v1 draws it (the handover's section 06): the podium,
 * the list in its sheet, the dock, the mode and ladder menus, the swipe
 * between modes, the podium folding as the list scrolls, and the states —
 * empty, offline, and arriving from an innings with a banner.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/board-ui-check.mjs http://127.0.0.1:5201
 *
 * `?demo=1` fills the boards with made-up players in the browser and saves
 * nothing, so the full board is looked at without writing fifty names; the
 * empty and offline boards are stubbed at the network. Pictures land in
 * test-results/board/.
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

await mkdir('test-results/board', { recursive: true });
const browser = await chromium.launch({ executablePath });

/** A phone on the cover, named or not, with the screens before it seen. */
async function cover(query, named = true, route = null) {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(who => {
    try {
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-marathon-intro', 'done');
      localStorage.setItem('hitman-hurt-seen', '1');
      localStorage.setItem('hitman-profile', '1');
      if (who) localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 2 }));
    } catch { /* Then the screens it skips stand in the way. */ }
  }, named ? `Board${Math.random().toString(36).slice(2, 6)}` : null);
  if (route) await page.route(/\/api\/board(\?.*)?$/, route);
  await page.goto(`${base}/?debug=1${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  return { context, page, errors };
}

const open = async page => {
  await page.evaluate(() => document.getElementById('cover-board')?.click());
  await page.waitForSelector('#board-overlay .lb-screen');
  await page.waitForTimeout(900);
};

// — The Blast board, full, from the cover.
{
  const { context, page, errors } = await cover('&demo=1');
  await open(page);
  check(await page.locator('#board-title').textContent() === 'LEADERBOARD', 'the board is headed LEADERBOARD');
  check((await page.locator('#board-mode').innerText()).includes('The Blast') && (await page.locator('#board-ladder').innerText()).includes('Top score'),
    'with the mode and the ladder as pills');
  check(await page.locator('.lb-step:not(.is-open)').count() === 3 && await page.locator('.lb-crown').count() === 1, 'a podium of three, the crown on the first');
  check(await page.locator('.lb-list .lb-row').count() >= 40, 'and the rest in the list', String(await page.locator('.lb-list .lb-row').count()));
  check(await page.locator('.lb-pager i').count() === 3, 'the pager shows three modes');
  check((await page.locator('#board-play').innerText()).trim() === 'PLAY THE BLAST', 'the key at the foot plays the Blast', await page.locator('#board-play').innerText());
  await page.screenshot({ path: 'test-results/board/blast.png' });

  await page.locator('#board-body').evaluate(el => el.scrollTo({ top: 700 }));
  await page.waitForTimeout(400);
  check(await page.locator('.lb-screen.is-folded').count() === 1, 'scrolled, the podium folds to chips');
  await page.screenshot({ path: 'test-results/board/blast-folded.png' });

  await page.locator('#board-mode').click();
  await page.waitForTimeout(300);
  check(await page.locator('#board-mode-menu .lb-menu-item').count() === 3, 'the mode pill opens a menu of the three');
  await page.screenshot({ path: 'test-results/board/mode-menu.png' });
  await page.locator('[data-mode="marathon"]').click();
  await page.waitForTimeout(900);
  check((await page.locator('#board-mode').innerText()).includes('Test Marathon'), 'and picking one opens its board');
  await page.screenshot({ path: 'test-results/board/marathon.png' });

  await page.locator('#board-ladder').click();
  await page.waitForTimeout(300);
  check(await page.locator('#board-ladder-sheet .lb-pick-item').count() === 3, 'the ladder pill opens the Marathon’s three ladders');
  await page.screenshot({ path: 'test-results/board/ladder-sheet.png' });
  await page.locator('#board-ladder-solo').click();
  await page.waitForTimeout(700);
  check((await page.locator('#board-ladder').innerText()).includes('Batters'), 'and Batters opens the batters’ ladder');
  await page.screenshot({ path: 'test-results/board/marathon-batters.png' });

  // A swipe left goes on to the next mode.
  const box = await page.locator('#board-body').boundingBox();
  await page.mouse.move(box.x + box.width * 0.8, box.y + 300);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.8 - i * 0.07), box.y + 302);
  await page.mouse.up();
  await page.waitForTimeout(900);
  check((await page.locator('#board-mode').innerText()).includes('Test Survival'), 'a swipe goes on to Test Survival');
  check(await page.locator('.lb-result').count() > 10, 'whose rows carry their result', String(await page.locator('.lb-result').count()));
  await page.screenshot({ path: 'test-results/board/survival.png' });

  await page.locator('#board-info').click();
  await page.waitForTimeout(300);
  check(await page.locator('#board-rules').isVisible(), 'the (i) key says how the ladder ranks');
  await page.screenshot({ path: 'test-results/board/rules.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check(!(await page.locator('#board-rules').count()) && await page.locator('#board-close').isVisible(), 'Escape puts the sheet away and leaves the board');
  await page.locator('#board-close').click();
  await page.waitForTimeout(300);
  check(!(await page.locator('#board-overlay').isVisible()), 'and the back key puts the board away');
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — Nobody yet, and the board out of reach.
for (const [what, route] of [
  ['empty', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [] }) })],
  ['offline', r => r.abort()],
]) {
  const { context, page, errors } = await cover('', true, route);
  await open(page);
  // In development a Blast board that cannot be reached stands in invented
  // rows, so the board out of reach is looked at on Test Survival.
  if (what === 'offline') { await page.locator('#board-mode').click(); await page.locator('[data-mode="survive"]').click(); }
  await page.waitForTimeout(800);
  if (what === 'empty') check(await page.locator('.lb-step.is-open').count() === 3 && /WIDE OPEN/.test(await page.locator('.lb-message').innerText()), 'an empty board leaves three open spots and says so');
  else check(/REACH THE BOARD/.test(await page.locator('.lb-message').innerText()) && await page.locator('#board-retry').isVisible(), 'an unreachable board says so, with TRY AGAIN');
  await page.screenshot({ path: `test-results/board/${what}.png` });
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

/** A Blast that adds up, written ball by ball: 105 off thirty, two down. */
const BLAST = [1, 4, 6, 2, 6, 1, 6, 'W', 4, 1, 6, 0, 6, 6, 'W', 1, 4, 6, 4, 1, 6, 2, 6, 4, 6, 4, 1, 6, 4, 1];

/** Batted to the end of a Blast through the debug hook, the card up. */
async function finishBlast(page) {
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) {
    const done = page.locator('#whatsnew-done');
    if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
    const pick = page.locator('#mode-classic');
    if (await pick.isVisible().catch(() => false)) await pick.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.evaluate(balls => window.__cricket.blast(balls), BLAST);
  for (let i = 0; i < 30 && !(await page.locator('#end').isVisible()); i++) await page.waitForTimeout(400);
  await page.waitForTimeout(800);
}

// — From an innings, for a named player: the banner, the row's tag, PLAY AGAIN.
{
  const { context, page, errors } = await cover('');
  await finishBlast(page);
  for (let i = 0; i < 20 && !/You are #\d+/.test(await page.locator('#card-board-head').textContent()); i++) await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('claim')?.click());
  await page.waitForSelector('#board-overlay .lb-screen');
  await page.waitForTimeout(900);
  const banner = await page.locator('.lb-banner').innerText().catch(() => '');
  check(/entered the board|New best|still holds|Top of the board/i.test(banner), 'from an innings, the board says what it did', banner);
  check(await page.locator('.lb-row.is-you .lb-tag, .lb-step.is-you').count() > 0, 'and the player’s row is marked');
  check((await page.locator('#board-again').innerText()).trim() === 'PLAY AGAIN', 'with PLAY AGAIN at the foot');
  await page.screenshot({ path: 'test-results/board/from-innings.png' });
  await page.locator('#board-ladder').click();
  await page.locator('#board-ladder-runs').click();
  await page.waitForTimeout(900);
  check((await page.locator('#board-ladder').innerText()).includes('Runs') && !/entered|New best|still holds/i.test(await page.locator('.lb-banner').innerText().catch(() => '')), 'a career ladder carries no banner for the innings');
  await page.screenshot({ path: 'test-results/board/career-runs.png' });
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — From an innings, for a player with no name: the innings stands where it would, and asks.
{
  const { context, page, errors } = await cover('', false);
  await finishBlast(page);
  await page.keyboard.press('b');
  await page.waitForSelector('#board-overlay .lb-screen');
  await page.waitForTimeout(900);
  check(await page.locator('.lb-row.is-ghost, .lb-step.is-ghost').count() === 1 || /outside the top/.test(await page.locator('#board-you').innerText()),
    'a guest’s innings is drawn where it would stand', await page.locator('#board-you').innerText().catch(() => ''));
  check(await page.locator('#board-claim').isVisible(), 'and the dock asks for a name');
  await page.screenshot({ path: 'test-results/board/guest.png' });
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall ok — pictures in test-results/board/');
process.exit(failures ? 1 : 0);
