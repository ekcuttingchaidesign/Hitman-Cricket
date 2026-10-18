/**
 * Player profiles in a browser (section 14, lane A): a named row on a board
 * opens that player's profile, risen over the board, with the figures the
 * store answers; a mode they have never batted says so and offers no chase;
 * the sheet puts itself away by its X, by Escape and by the scrim; the
 * player's own row opens My profile; and CHASE starts that mode with the
 * chase held for the post.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/profile-check.mjs http://127.0.0.1:5201
 *
 * It seeds its own players through the dev server's store, each run under new
 * names (a name with a number on the end is a sibling of the last run's for a
 * day), and photographs each state into test-results/profile.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const out = 'test-results/profile';

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

/** Letters only, new every run. */
const letters = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const run = letters(4);
const idOf = name => `${name.toLowerCase().slice(0, 10).padEnd(6, 'x')}-${letters(12)}`;
const innings = runs => {
  const sixes = Math.floor(runs / 6), singles = runs % 6;
  return { runs, sixes, fours: 0, wickets: 1, dots: 30 - sixes - singles - 1, balls: 30 };
};
const post = async (path, body) => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return response.json();
};

/** A player on the Blast board with a career behind them, and a line about themselves. */
async function seed(name, runs, avatar, bio) {
  const playerId = idOf(name);
  const tally = { ...innings(runs), individual: runs, hundreds: runs >= 100 ? 1 : 0 };
  await post('/api/innings', { playerId, name, avatar, nonce: letters(16), mode: 'classic', innings: tally });
  const scored = await post('/api/score', { playerId, name, avatar, mode: 'classic', innings: innings(runs) });
  if (!scored.ok) throw new Error(`${name} was not taken: ${scored.error}`);
  if (bio) await post('/api/profile', { playerId, name, bio });
  return playerId;
}

const top = `Ptop${run}`;
await seed(top, 174, 3, 'Leg-side bully. Pulls everything short.');
const secondId = await seed(`Psec${run}`, 168, 1);

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(who => {
  try {
    localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
    localStorage.setItem('hitman-shots-intro', 'done');
    localStorage.setItem('hitman-marathon-intro', 'done');
    localStorage.setItem('hitman-profile', '1');
    localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 2 }));
  } catch { /* The screens it skips stand in the way. */ }
}, `Plook${run}`);
await page.goto(`${base}/?debug=1`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
await page.addStyleTag({ content: '#debug{display:none!important}' });

await page.evaluate(() => document.getElementById('cover-board')?.click());
await page.waitForSelector('#board-overlay .lb-screen');
await page.waitForTimeout(900);

// Found by name: a dev server that has run this before has players above them.
const step = page.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: top }).first();
check(await step.count() === 1, 'their row opens a profile');
check(await page.locator('.lb-step.is-1[data-handle]').count() === 1, 'so does the top of the podium');
check(await page.locator('.lb-row[data-handle] .lb-go').count() > 0, 'named rows carry a chevron');

await step.click();
await page.waitForSelector('#player-sheet');
const firstName = await page.locator('#player-name').textContent();
check(firstName === top, 'the sheet opens on their name at once, off the row', firstName);
await page.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/a2-blast.png` });
const sheet = page.locator('#player-sheet');
check(await page.locator('.ps-bio').textContent().then(t => t.includes('Leg-side bully')), 'their bio stands under the name');
check(/^#\d+$/.test((await page.locator('.ps-glance-one.is-place b').textContent()).trim()), 'their place on the Blast board is at a glance');
check(await page.locator('.ps-tile.is-target b').textContent() === '174', 'the figure a chase aims at is their best');
const chaseWords = (await page.locator('#player-chase').textContent()).trim();
check(chaseWords.includes(`${top.toUpperCase()}’S 174`), 'CHASE names them and their best', chaseWords);
check((await sheet.getAttribute('class')).includes('tier-'), 'the sheet wears a rung');

await page.locator('.ps-tab[data-mode="survive"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/a4a-empty.png` });
check(await page.locator('.ps-message h3').textContent().then(t => /No Survival innings yet/.test(t)), 'a mode never batted says so');
check(await page.locator('#player-chase').count() === 0, 'and offers nothing to chase');

await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(await page.locator('#player-sheet').count() === 0, 'Escape puts the sheet away');
check(await page.locator('#board-overlay .lb-screen').count() === 1, 'and leaves the board up');

await page.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: `Psec${run}` }).first().click();
await page.waitForSelector('#player-sheet');
await page.locator('#player-close').click();
await page.waitForTimeout(400);
check(await page.locator('#player-sheet').count() === 0, 'the X puts it away');

await step.click();
await page.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await page.locator('#player-chase').click();
await page.waitForTimeout(1200);
const snap = await page.evaluate(() => window.__cricket?.snapshot?.());
check(snap?.chase?.target === 174 && snap?.chase?.mode === 'classic', 'CHASE holds their best as the target', JSON.stringify(snap?.chase));
check(await page.locator('#board-overlay .lb-screen').count() === 0, 'and the board makes way for the innings');

/** Writes balls once the bowler is at his mark: the debug hook writes only between balls. */
const write = async balls => {
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(b => window.__cricket.snapshot().phase === 'READY' && window.__cricket.blast(b), balls)) return true;
    await page.waitForTimeout(150);
  }
  return false;
};

// Lane B: the chase. The intro stands before the first ball and nothing is bowled under it.
await page.waitForSelector('#chase-intro', { timeout: 6000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/b1-intro.png` });
check((await page.locator('.ch-intro-target b').textContent()) === '174', 'the intro counts up to their best');
await page.waitForTimeout(1500);
check((await page.evaluate(() => window.__cricket.snapshot().phase)) === 'READY', 'and nothing is bowled while it stands');
// LET'S BAT, and ten singles written in the same moment, before the bowler sets off.
await page.evaluate(() => { document.getElementById('chase-bat').click(); window.__cricket.blast(Array(10).fill(1)); });
await page.waitForTimeout(400);
const need = (await page.locator('.ch-chip .ch-need').textContent()).trim();
check(need === '165', 'the chip under the scoreboard says what is wanted', need);
await page.screenshot({ path: `${out}/b2-chip.png` });
await write(['W', 'W', 'W', 'W', 'W']);
await page.waitForSelector('.ch-strip.is-short', { timeout: 8000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/b5-short.png` });
check((await page.locator('.ch-strip-text b').textContent()).startsWith('164 short of'), 'fallen short, the card says by how many');
check((await page.locator('#again').textContent()).includes('CHASE 174 AGAIN'), 'and the key takes it on again');
await page.locator('#again').click();
await page.waitForTimeout(800);
check(await page.locator('#chase-intro').count() === 0, 'again, it goes straight to the crease');
check(await page.locator('.ch-chip').count() === 1, 'with the chip still up');

// Passed: chase the second player's 168, and go past it with a ball to spare.
const second = `Psec${run}`;
await write(['W', 'W', 'W', 'W']);
await page.waitForSelector('#chase-board', { timeout: 8000 });
await page.locator('#chase-board').click();
await page.waitForSelector('#board-overlay .lb-screen');
await page.waitForTimeout(800);
await page.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: second }).first().click();
await page.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await page.locator('#player-chase').click();
await page.waitForSelector('#chase-intro', { timeout: 6000 });
await page.evaluate(() => { document.getElementById('chase-bat').click(); window.__cricket.blast([...Array(28).fill(6), 6]); });
await page.waitForSelector('#chase-passed', { timeout: 4000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/b3-passed.png` });
check(await page.locator('#chase-passed .ch-stamp span').textContent() === second.toUpperCase(), 'going past it stamps PASSED with their name');
check((await page.locator('.ch-chip.is-done').count()) === 1, 'and the chip turns to say so');
await page.waitForTimeout(2000);
await write(['W']);
await page.waitForSelector('.ch-strip.is-beat', { timeout: 8000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/b4-beat.png` });
check((await page.locator('.ch-strip-text b').textContent()) === `You beat ${second} by 6`, 'beaten, the card says by how many');
check(!(await page.locator('#again').textContent()).includes('CHASE'), 'and the key is PLAY AGAIN: a chase won is over');
const events = await (await fetch(`${base}/api/profile?player=${encodeURIComponent(secondId)}`)).json();
check(events.events?.[0]?.kind === 'beat' && events.events[0].runs === 174, 'and the store put the beat on their profile', JSON.stringify(events.events?.[0]));

check(errors.length === 0, 'no page errors', errors.join('\n'));
await browser.close();
console.log(failures ? `\n${failures} failed.` : '\nAll passed.');
process.exit(failures ? 1 : 0);
