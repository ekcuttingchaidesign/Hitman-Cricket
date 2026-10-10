/**
 * The way in, as UI v1 draws it: the cover, Choose a mode, and the name screen
 * before a first innings — for a new player and for one coming back.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/entry-check.mjs http://127.0.0.1:5201
 *
 * Reached the way a player reaches them: the cover first, PLAY, a mode, and
 * the name screen it opens on before the first ball. What a unit test cannot
 * see is what this holds: the poster and its layers drawn, the chip saying who
 * is batting, the board widget saying the right thing, the mode posters with
 * the player's best and place on them, the name screen's back key landing on
 * the cover with no way to bat unnamed — and each laid out in the column the
 * design was drawn for. Pictures land in test-results/entry/.
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

await mkdir('test-results/entry', { recursive: true });
const browser = await chromium.launch({ executablePath });

/** A page at the design's own size, past the private-window notice, as `seed` leaves this browser. */
async function open(seed, query = '') {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(held => {
    try {
      // Past how to hit only: the Marathon's cards are a thing a returning
      // browser leaves behind, and the cover reads them as one.
      localStorage.setItem('hitman-shots-intro', 'done');
      for (const [key, value] of Object.entries(held)) localStorage.setItem(key, value);
    } catch { /* Then the screens it skips stand in the way, and the check says so. */ }
  }, seed);
  await page.goto(`${base}/?seed=222${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

const NEW = {};
const BACK = {
  'hitman-seen': new Date(Date.now() - 172_800_000).toISOString().slice(0, 10),
  'hitman-best': '158',
  'hitman-profile': '1',
  'hitman-marathon-intro': 'done',
  'hitman-batter': JSON.stringify({ name: 'Shashank', avatar: 0 }),
  // Two thousand Blast runs, a Marathon of 194 and a drawn Test: an Emerging
  // player with something on every poster.
  'hitman-career': JSON.stringify({
    classic: { innings: 40, runs: 2140, balls: 1100, sixes: 90, fours: 160, wickets: 70, dots: 300, highest: 158, notOut: 60, individual: 158, hundreds: 2 },
    marathon: { innings: 3, runs: 420, balls: 300, fours: 30, sixes: 12, highest: 194, individual: 101, fifties: 2, hundreds: 1, doubles: 0, longest: 150 },
    survive: { innings: 4, runs: 300, balls: 200, sixes: 4, fours: 20, blows: 6, wins: 0, draws: 1, losses: 3 },
  }),
};

/** PLAY on the cover, and Choose a mode once it is up. */
async function toModes(page) {
  await page.locator('#start').click();
  for (let i = 0; i < 20 && !(await page.locator('#modes').isVisible()); i++) {
    const done = page.locator('#whatsnew-done');
    if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);
  return page.locator('#modes').isVisible();
}

/** An element's words as a player reads them, one space between. */
const words = (page, selector) => page.locator(selector).innerText().then(t => t.replace(/\s+/g, ' ').trim());

// — The cover, first visit.
{
  const { context, page, errors } = await open(NEW);
  check(await page.locator('#intro').isVisible(), 'a first visit opens on the cover');
  check((await page.locator('#cover-profile').innerText()).replace(/\s+/g, ' ').trim() === 'GUEST My stats', 'whose chip says GUEST, My stats',
    await page.locator('#cover-profile').textContent());
  check(await page.locator('.cover-motion').isVisible(), 'and whose poster moves: it is a motion poster for everybody');
  const widget = await page.locator('#cover-board').textContent();
  check(/LEADERBOARD · THE BLAST|TOP OF THE BOARD · THE BLAST/.test(widget ?? ''), 'the board widget leads to the board', widget);
  for (const [id, label] of [['#start', 'PLAY'], ['#tutorial', 'HOW TO PLAY']]) {
    const key = page.locator(id);
    check((await key.textContent())?.trim() === label && (await key.boundingBox())?.width >= 360, `${label} spans the column`, JSON.stringify(await key.boundingBox()));
  }
  await page.screenshot({ path: 'test-results/entry/cover-first.png' });
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — The cover, coming back.
{
  const { context, page, errors } = await open(BACK);
  const chip = (await page.locator('#cover-profile').innerText()).replace(/\s+/g, ' ').trim();
  check(chip === 'SHASHANK My stats', 'a returning player\'s chip carries their name', chip);
  check(await page.locator('#cover-profile img').count() === 1, 'and their kit');
  check(await page.locator('.cover-motion').isVisible(), 'and their poster moves');
  check(await page.locator('#start').evaluate(el => getComputedStyle(el).animationName) === 'cover-halo', 'with a halo breathing behind PLAY');
  for (let i = 0; i < 20 && !/YOUR BEST/.test(await page.locator('#cover-board').textContent() ?? ''); i++) await page.waitForTimeout(250);
  const widget = (await page.locator('#cover-board').innerText()).replace(/\s+/g, ' ').trim();
  check(/YOUR BEST · THE BLAST 158 runs/.test(widget ?? ''), 'the widget quotes their best', widget);
  await page.screenshot({ path: 'test-results/entry/cover-returning.png' });
  await page.locator('#cover-profile').click();
  await page.waitForTimeout(1200);
  check(await page.locator('#stats-overlay').isVisible(), 'and the chip opens My Stats');
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — Choose a mode, new player.
{
  const { context, page, errors } = await open(NEW);
  check(await toModes(page), 'PLAY opens Choose a mode');
  check(await words(page, '#modes-title') === 'CHOOSE A MODE', 'under its new title', await words(page, '#modes-title'));
  check(/^not played$/i.test(await words(page, '#mode-marathon-stat')), 'the Marathon poster says not played', await words(page, '#mode-marathon-stat'));
  check(await page.locator('#mode-marathon .ms-tag.is-new').isVisible(), 'and carries NEW');
  check(/60 balls, one wicket/.test(await words(page, '#mode-survive-line')), 'Survival gives its rules', await words(page, '#mode-survive-line'));
  check(await words(page, '#modes-stats-tier') === 'DEBUTANT' && await page.locator('#modes-stats.tier-debutant').count() === 1,
    "My Stats is a Debutant's card", await words(page, '#modes-stats-tier'));
  check(/Same balls/.test(await words(page, '#modes-rivals-line')), 'and Rivals invites', await words(page, '#modes-rivals-line'));
  await page.screenshot({ path: 'test-results/entry/modes-new.png' });
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — Choose a mode, coming back.
{
  const { context, page, errors } = await open(BACK);
  check(await toModes(page), "a returning player's PLAY opens Choose a mode too");
  check(/^best 158/i.test(await words(page, '#mode-classic-stat')), 'the Blast poster carries their best', await words(page, '#mode-classic-stat'));
  check(/^best 194/i.test(await words(page, '#mode-marathon-stat')), "and the Marathon's", await words(page, '#mode-marathon-stat'));
  check(!(await page.locator('#mode-marathon .ms-tag.is-new').isVisible()), 'which is no longer NEW');
  check(/Survived all 60/.test(await words(page, '#mode-survive-line')), 'Survival their best result', await words(page, '#mode-survive-line'));
  check(await words(page, '#modes-stats-runs') === '2,140' && await page.locator('#modes-stats.tier-emerging').count() === 1,
    'My Stats is the Emerging card with their runs', await words(page, '#modes-stats-runs'));
  check(await page.locator('#modes-profile img').count() === 1, 'and the avatar at the top is their kit');
  await page.screenshot({ path: 'test-results/entry/modes-returning.png' });
  await page.locator('#modes-profile').click();
  await page.waitForTimeout(1200);
  check(await page.locator('#stats-overlay').isVisible(), 'which opens My Stats');
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — The name screen, before a new player's first innings.
{
  const { context, page, errors } = await open(NEW);
  await toModes(page);
  await page.locator('#mode-classic').click();
  for (let i = 0; i < 20 && !(await page.locator('.welcome').isVisible()); i++) await page.waitForTimeout(250);
  await page.waitForTimeout(600); // Its fade in.
  check(await page.locator('.welcome.is-gate').isVisible(), 'a new player is asked who is batting before the first ball');
  check(await words(page, '#profile-title') === 'WHO’S WALKING OUT TO BAT?', 'under the handover\'s question', await words(page, '#profile-title'));
  check(await page.locator('#profile-send').isDisabled(), "and LET'S BAT sleeps until there is a name");
  check(await page.locator('#profile-leave').isVisible() && !(await page.locator('#profile-close').count()), 'with a way back to the cover, and none past');
  await page.locator('#profile-name').fill('Shashank');
  await page.locator('.profile-hand-option[data-hand="left"]').click();
  await page.locator('.kit-option').first().click();
  check(await words(page, '#welcome-name') === 'SHASHANK', 'the name over the kit is the one typed', await words(page, '#welcome-name'));
  check(await words(page, '#welcome-hand') === 'LEFT-HANDED', 'and the chip under it the hand chosen', await words(page, '#welcome-hand'));
  check(!(await page.locator('#profile-send').isDisabled()), "LET'S BAT wakes with the name");
  await page.locator('#profile-name').blur();
  await page.waitForTimeout(500); // The keys' own fades.
  await page.screenshot({ path: 'test-results/entry/name.png' });
  await page.locator('#profile-leave').click();
  await page.waitForTimeout(600);
  check(await page.locator('#intro').isVisible() && !(await page.locator('.welcome').count()), 'back goes to the cover');
  check(!(await page.locator('#modes').isVisible()), 'with nothing left open over it');
  const stored = await page.evaluate(() => localStorage.getItem('hitman-batter'));
  check(stored === null, 'and no name kept: nobody bats without one', stored);
  check(errors.length === 0, 'with nothing thrown', errors.join(' | '));
  await context.close();
}

// — A phone's browser, where the window is shorter than the design's frame and
// there is no status bar to clear: the top bar sits near the top, and the title
// clears the batter's helmet.
{
  const context = await browser.newContext({ viewport: { width: 400, height: 680 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(held => { try { for (const [k, v] of Object.entries(held)) localStorage.setItem(k, v); } catch { /* */ } }, BACK);
  await page.goto(`${base}/?seed=222`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const chip = await page.locator('#cover-profile').boundingBox();
  check(chip && chip.y < 24, "in a phone's browser the chip sits near the top, with no status bar to clear", JSON.stringify(chip));
  const title = await page.locator('.cover-title').boundingBox();
  check(title && title.y + title.height <= 680 * 0.25, "and the title clears the batter's helmet, a quarter of the way down", JSON.stringify(title));
  await page.screenshot({ path: 'test-results/entry/cover-browser.png' });
  await toModes(page);
  const back = await page.locator('#modes-cancel').boundingBox();
  check(back && back.y >= 0 && back.y < 24, "and Choose a mode opens at its top, the back key near it", JSON.stringify(back));
  await page.screenshot({ path: 'test-results/entry/modes-browser.png' });
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall ok — pictures in test-results/entry/');
process.exit(failures ? 1 : 0);
