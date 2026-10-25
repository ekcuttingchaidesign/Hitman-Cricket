/**
 * A Super10 innings on Super10's own board and career, in a real browser.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/super10-post-check.mjs               # that dev server
 *
 * A named player's Super10 innings, written through `__cricket.blast` to five
 * wickets, is posted once by itself as `mode: 'super10'` and counted once
 * toward the Super10 career — never the Blast's: its board, its career and
 * this browser's own Blast best are left as they were. The card says where it
 * landed, the store answers the same place when asked, the career holds the
 * team total and counts it a hundred and a double, and the board opens on its
 * own Super10 tab with the player's row on it.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

/** 240 for 5 off 45 balls: a hundred and a double as a team total, and Super10's end. */
const INNINGS = [...Array(40).fill(6), 'W', 'W', 'W', 'W', 'W'];
const name = `Ten${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6)}`;

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const posts = [];
page.on('response', response => {
  const path = new URL(response.url()).pathname;
  if (response.request().method() !== 'POST' || !/^\/api\/(score|innings)$/.test(path)) return;
  posts.push({ path, status: response.status(), sent: JSON.parse(response.request().postData() ?? '{}') });
});
await page.addInitScript(held => {
  try {
    localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
    localStorage.setItem('hitman-shots-intro', 'done');
    localStorage.setItem('hitman-field-intro', 'done');
    localStorage.setItem('hitman-whatsnew', 'player-profiles:9');
    localStorage.setItem('hitman-profile', '1');
    localStorage.setItem('hitman-best', '77');
    if (!localStorage.getItem('hitman-batter')) localStorage.setItem('hitman-batter', JSON.stringify({ name: held, avatar: 3 }));
  } catch { /* Then the screens it skips stand in the way, and the check says so. */ }
}, name);

const snap = () => page.evaluate(() => window.__cricket.snapshot());
await page.goto(`${base}/?debug=1&mode=super10&seed=5150&private=0`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
await page.locator('#start').click({ force: true });
for (let i = 0; i < 30 && (await snap()).phase !== 'READY'; i++) {
  const done = page.locator('#whatsnew-done');
  if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
}
const first = await snap();
check(first.phase === 'READY' && first.super10 && first.super10.practising === false, 'a named player walks out in Super10, and it is not practice',
  `${first.phase} practising ${first.super10?.practising}`);

await page.evaluate(balls => window.__cricket.blast(balls), INNINGS);
for (let i = 0; i < 30 && (await snap()).phase !== 'INNINGS_END'; i++) await page.waitForTimeout(300);
const ended = await snap();
const made = await page.locator('#final-score').textContent().catch(() => '');
check(ended.phase === 'INNINGS_END' && /240/.test(made ?? ''), 'and makes 240 for 5', `${ended.phase} ${made}`);
for (let i = 0; i < 40; i++) {
  const head = await page.locator('#card-board-head').textContent().catch(() => '');
  if (/on the leaderboard/.test(head ?? '') && (await snap()).standing) break;
  await page.waitForTimeout(500);
}
await page.waitForTimeout(1500);

const scores = posts.filter(one => one.path === '/api/score'), counted = posts.filter(one => one.path === '/api/innings');
check(scores.length === 1 && scores[0].sent.mode === 'super10' && scores[0].status === 200, 'the innings is posted to Super10\'s board by itself, once',
  JSON.stringify(scores.map(one => [one.sent.mode, one.status])));
check(counted.length === 1 && counted[0].sent.mode === 'super10' && counted[0].status === 200, 'and counted toward the Super10 career, once',
  JSON.stringify(counted.map(one => [one.sent.mode, one.status])));
const head = await page.locator('#card-board-head').textContent();
check(/You are #\d+ on the leaderboard/.test(head ?? ''), 'the card says where it landed', head);

const player = await page.evaluate(() => localStorage.getItem('hitman-player') || localStorage.getItem('hitman-player-id'));
const asked = await page.evaluate(async () => {
  const id = window.__cricket.player() ?? null;
  const get = async url => (await fetch(url)).json();
  return {
    id,
    board: await get('/api/board?mode=super10'),
    blast: await get('/api/board'),
    career: id ? await get(`/api/career?mode=super10&player=${encodeURIComponent(id)}`) : null,
    blastCareer: id ? await get(`/api/career?player=${encodeURIComponent(id)}`) : null,
  };
});
const row = asked.board.rows?.find(one => one.name === name);
check(row?.runs === 240 && row.wickets === 5, 'Super10\'s board holds the total with its wickets', JSON.stringify(row));
check(!asked.blast.rows?.some(one => one.name === name), 'and the Blast\'s board does not');
const career = asked.career?.career;
check(career?.innings === 1 && career.runs === 240 && career.hundreds === 1 && career.doubles === 1 && career.highest === 240,
  'the Super10 career counts it, a team hundred and a double', JSON.stringify(asked.career));
check(!(asked.blastCareer?.career?.innings > 0), 'and the Blast career is untouched', JSON.stringify(asked.blastCareer));
check(await page.evaluate(() => localStorage.getItem('hitman-best')) === '77', 'nor is this browser\'s Blast best');
check(Number(await page.evaluate(() => localStorage.getItem('hitman-best-super10'))) === 240, 'Super10 keeps a best of its own');

for (let i = 0; i < 40 && await page.evaluate(() => window.__cricket.topSpotOpen()); i++) await page.waitForTimeout(200);
await page.addStyleTag({ content: '.debug{display:none!important}' });
await page.evaluate(() => document.querySelector('#claim').click());
await page.waitForTimeout(1500);
const board = await page.evaluate(() => {
  const overlay = document.querySelector('#board-overlay');
  return { open: !!overlay && !overlay.classList.contains('hidden'), text: overlay?.textContent ?? '' };
});
check(board.open && /Super10/.test(board.text) && /You entered the board at #\d+/.test(board.text), "the board opens on Super10, on the player's own row", board.text.slice(0, 200));
await page.screenshot({ path: 'test-results/super10-board.png' }).catch(() => {});
check(errors.length === 0, 'with nothing thrown', errors.join('\n'));
void player;

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
