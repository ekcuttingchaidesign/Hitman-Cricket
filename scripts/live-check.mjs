/**
 * Who is around, in a browser (Figma section 23, lane A): players checked in
 * through the dev server's store show a green dot (online) or an amber bat
 * badge (batting) on their board rows and podium steps, and nothing at all
 * when they are not around; their profile's photo ring takes the colour with
 * one line under the name; Rival Matches opens with Around now, See all opens
 * the whole list, and a row there opens the profile over Rival Matches. The
 * live list never carries a player id.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/live-check.mjs http://127.0.0.1:5201
 *
 * It seeds its own players under new letters each run, and photographs each
 * state into test-results/live.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const out = 'test-results/live';

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};
const letters = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const run = letters(4);
const idOf = name => `${name.toLowerCase().slice(0, 10).padEnd(6, 'x')}-${letters(12)}`;
const innings = runs => {
  const sixes = Math.floor(runs / 6), singles = runs % 6;
  return { runs, sixes, fours: 0, wickets: 1, dots: 30 - sixes - singles - 1, balls: 30 };
};
const post = async (path, body) => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
};
async function seed(name, runs, avatar) {
  const playerId = idOf(name);
  await post('/api/innings', { playerId, name, avatar, nonce: letters(16), mode: 'classic', innings: { ...innings(runs), individual: runs, hundreds: runs >= 100 ? 1 : 0 } });
  const scored = await post('/api/score', { playerId, name, avatar, mode: 'classic', innings: innings(runs) });
  if (!scored.body.ok) throw new Error(`${name} was not taken: ${scored.body.error}`);
  return playerId;
}

const on = `Lon${run}`, bat = `Lbat${run}`, away = `Laway${run}`;
const onId = await seed(on, 168, 3), batId = await seed(bat, 162, 1), awayId = await seed(away, 156, 2);
check((await post('/api/live', { playerId: onId, name: on, avatar: 3, state: 'online' })).status === 200, 'a named player checks in online');
check((await post('/api/live', { playerId: batId, name: bat, avatar: 1, state: 'batting', mode: 'super10' })).status === 200, 'and another batting Super10');
check((await post('/api/live', { playerId: awayId, name: on, avatar: 2, state: 'online' })).status === 403, 'nobody checks in under somebody else’s name');
const listed = await (await fetch(`${base}/api/live`)).text();
check(!listed.includes(onId) && !listed.includes(batId), 'the live list carries no player id');

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
    localStorage.setItem('hitman-whatsnew', 'super10:9');
    localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 2 }));
  } catch { /* The screens it skips stand in the way. */ }
}, `Llook${run}`);
await page.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
await page.addStyleTag({ content: '#debug{display:none!important}' });

await page.evaluate(() => document.getElementById('cover-board')?.click());
await page.waitForSelector('#board-overlay .lb-screen');
await page.waitForTimeout(1500);
const face = name => page.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: name }).first();
check(await face(on).locator('.live-mark.is-online').count() === 1, 'the online player’s face carries a green dot');
check(await face(bat).locator('.live-mark.is-batting').count() === 1, 'the batting player’s carries the bat badge');
check(await face(away).locator('.live-mark').count() === 0, 'a player who is not around carries nothing');
await page.screenshot({ path: `${out}/a1-board.png` });

await face(on).click();
await page.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await page.waitForTimeout(500);
check(await page.locator('.ps-face.is-live-online').count() === 1, 'their profile’s ring turns green');
check((await page.locator('.ps-live').textContent()) === 'Online', 'and the line under the name says Online');
await page.screenshot({ path: `${out}/a2-profile-online.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await face(bat).click();
await page.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await page.waitForTimeout(500);
check(await page.locator('.ps-face.is-live-batting').count() === 1, 'a batting profile’s ring turns amber');
check((await page.locator('.ps-live').textContent()) === 'Batting now · Super10', 'and says what they are batting', await page.locator('.ps-live').textContent());
await page.screenshot({ path: `${out}/a3-profile-batting.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.evaluate(() => document.getElementById('board-close')?.click());
await page.waitForTimeout(500);

// Rival Matches, the way a player reaches it: Choose a mode, then Rivals.
await page.evaluate(() => document.getElementById('start')?.click());
await page.waitForTimeout(900);
await page.evaluate(() => document.getElementById('modes-challenges')?.click());
await page.waitForSelector('#challenge-list:not(.hidden)', { timeout: 6000 });
await page.waitForSelector('.ar-card', { timeout: 6000 });
await page.waitForTimeout(800);
const cardFaces = await page.locator('.ar-card .ar-face[data-handle]').allTextContents();
check(cardFaces.some(t => t.includes(bat)) && cardFaces.some(t => t.includes(on)), 'Around now shows who is around', cardFaces.join(', '));
check(cardFaces.findIndex(t => t.includes(bat)) < cardFaces.findIndex(t => t.includes(on)), 'batting first');
check(!cardFaces.some(t => t.includes(away)), 'and not who is away');
await page.screenshot({ path: `${out}/a4-rivals.png` });

await page.locator('#around-all').click();
await page.waitForSelector('#rivals-around:not(.hidden) .ar-row');
check(await page.locator('.ar-group').first().textContent().then(t => t.startsWith('PLAYING NOW')), 'See all opens the list, playing first');
await page.screenshot({ path: `${out}/a5-around.png` });
check(await page.locator('.ar-row .ar-challenge').count() >= 2, 'every row offers CHALLENGE');
await page.locator('.ar-row').filter({ hasText: bat }).locator('.ar-challenge').click();
await page.waitForSelector('#cc-confirm .cc-sheet', { timeout: 6000 }).catch(() => null);
await page.waitForTimeout(600);
check(await page.locator('#rivals-around #cc-confirm .cc-sheet').isVisible().catch(() => false), 'and CHALLENGE opens the confirm sheet over the list');
check(await page.evaluate(() => { const b = document.querySelector('#cc-go')?.getBoundingClientRect(); return !!b && document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)?.closest('#cc-go') !== null; }), 'with BAT FIRST on top');
const under = await page.evaluate(() => ({ marks: document.querySelectorAll('#rivals-around .ar-row .live-mark').length, rows: document.querySelectorAll('#rivals-around .ar-row').length, html: document.querySelector('#rivals-around .ar-row')?.outerHTML.slice(0, 400) }));
check(under.marks === under.rows, 'the rows under it keep their marks', JSON.stringify(under));
await page.screenshot({ path: `${out}/a5-around-challenge.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.locator('.ar-row').filter({ hasText: on }).click();
await page.waitForSelector('#player-sheet', { timeout: 6000 });
check(await page.locator('#challenge-list #player-sheet').count() === 1, 'a row opens their profile over Rival Matches');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/a5-profile-from-rivals.png` });
await page.keyboard.press('Escape');

check(!errors.length, 'no errors on the page', errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
