/**
 * Notifications, in a browser (Figma section 23, lane E): the bell on Choose
 * a mode counting what is new and what waits on the player, the screen it
 * opens with a challenge in NEEDS YOU and a pass under TODAY, the filters,
 * ANSWER opening the invite over it, a row opening the profile over it, the
 * empty screen for a player with nothing yet, and My profile's Rank down
 * opening it on Board.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/notices-check.mjs http://127.0.0.1:5201
 *
 * It seeds its own players under new letters each run, the challenge and the
 * pass through the API, and photographs each state into test-results/notices.
 */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const out = 'test-results/notices';

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};
const letters = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const run = letters(4);
const idOf = name => `${name.toLowerCase().slice(0, 10).padEnd(6, 'x')}-${letters(12)}`;
const handleOf = id => createHash('sha256').update(`hitman-handle:${id}`).digest('hex').slice(0, 16);
const innings = runs => { const sixes = Math.floor(runs / 6), singles = runs % 6; return { runs, sixes, fours: 0, wickets: 1, dots: 30 - sixes - singles - 1, balls: 30 }; };
const post = async (path, body) => (await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
async function seed(name, runs, avatar) {
  const playerId = idOf(name);
  await post('/api/innings', { playerId, name, avatar, nonce: letters(16), mode: 'classic', innings: { ...innings(runs), individual: runs, hundreds: runs >= 100 ? 1 : 0 } });
  const scored = await post('/api/score', { playerId, name, avatar, mode: 'classic', innings: innings(runs) });
  if (!scored.ok) throw new Error(`${name} was not taken: ${scored.error}`);
  return playerId;
}

// Kabir is the one told: challenged by Zoya, and passed on the Blast by Tara.
const zoya = `Nzoya${run}`, kabir = `Nkabir${run}`, tara = `Ntara${run}`, empty = `Nnew${run}`;
const zoyaId = await seed(zoya, 96, 2);
// A score of this run's own, with Tara one above it: the store tells the nearest few it passed.
const kabirRuns = 100 + Math.floor(Math.random() * 50);
const kabirId = await seed(kabir, kabirRuns, 3);
// A first row passes nobody: Tara is on the board below Kabir, then climbs over him.
const taraId = await seed(tara, 6, 1);
await new Promise(resolve => setTimeout(resolve, 11_000));
const climbed = await post('/api/score', { playerId: taraId, name: tara, avatar: 1, mode: 'classic', innings: innings(kabirRuns + 1) });
if (!climbed.ok) throw new Error(`Tara's climb was not taken: ${climbed.error}`);
// The store notes a handle just after it answers the post, so the first try can beat it.
let made = null;
for (let i = 0; i < 10 && !made?.ok; i++) {
  if (i) await new Promise(resolve => setTimeout(resolve, 500));
  made = await post('/api/challenge', { action: 'create', playerId: zoyaId, name: zoya, avatar: 2, to: handleOf(kabirId), toName: kabir, toAvatar: 3, mode: 'classic' });
}
check(made.ok, 'a challenge is sent to the player through the store', JSON.stringify(made).slice(0, 200));
const card = ('6'.repeat(10) + '4').padEnd(30, '0');
const set = await post('/api/challenge', { action: 'ball', code: made.code, playerId: zoyaId, name: zoya, avatar: 2, card });
check(set.ok && set.challenge?.invite?.state === 'waiting', 'and its total set, so it waits on them');

const told = await (await fetch(`${base}/api/profile?player=${kabirId}`)).json();
check(told.events?.some(one => one.kind === 'passed' && one.name === tara), 'the pass is on their activity', JSON.stringify(told.events ?? told).slice(0, 200));

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath });
async function as(playerId, name, avatar) {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.addInitScript(([id, who, kit]) => {
    try {
      localStorage.setItem('hitman-player', id);
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-marathon-intro', 'done');
      localStorage.setItem('hitman-profile', '1');
      localStorage.setItem('hitman-whatsnew', 'rivals:9');
      localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: kit }));
    } catch { /* The screens it skips stand in the way. */ }
  }, [playerId, name, avatar]);
  await page.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  return page;
}
const onTop = (page, selector) => page.evaluate(sel => {
  const el = document.querySelector(sel);
  const box = el?.getBoundingClientRect();
  return !!box && !!document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest(sel);
}, selector);
const toModes = async page => {
  await page.evaluate(() => document.getElementById('start')?.click());
  await page.waitForSelector('#modes:not(.hidden)', { timeout: 15000 });
};

// ── The bell ─────────────────────────────────────────────────────────────
const page = await as(kabirId, kabir, 3);
// The page notes the banner the moment it shows: a page busy rendering in
// software can let a poll from here miss the few seconds it stands.
await page.evaluate(() => {
  const alert = document.getElementById('modes-alert');
  new MutationObserver(() => {
    if (window.__banner || alert.classList.contains('hidden')) return;
    const key = document.getElementById('modes-alert-answer');
    const b = key?.getBoundingClientRect();
    const hit = b ? document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) : null;
    window.__banner = { text: alert.innerText, top: !!hit?.closest('#modes-alert-answer'), hit: hit ? `${hit.tagName}#${hit.id}` : null };
  }).observe(alert, { attributes: true, childList: true, subtree: true });
});
await toModes(page);
await page.waitForFunction(() => !!window.__banner, null, { timeout: 30000 }).catch(() => null);
const banner = await page.evaluate(() => window.__banner ?? {});
check(new RegExp(`${zoya} challenged you`).test(banner.text ?? '') , 'the challenge arrives as a banner over the posters, with ANSWER', JSON.stringify(banner));
check(banner.top, 'standing on top of them', JSON.stringify(banner));
await page.screenshot({ path: `${out}/c8-banner.png`, animations: 'disabled' });
await page.waitForSelector('#modes-alert.hidden', { state: 'attached', timeout: 12000 }).catch(() => null);
check(await page.locator('#modes-alert').isHidden(), 'and goes by itself');
await page.waitForFunction(() => Number(document.getElementById('modes-bell-count')?.textContent) >= 2, null, { timeout: 20000 }).catch(() => null);
const count = await page.locator('#modes-bell-count').textContent();
check(await page.locator('#modes-bell').isVisible(), 'Choose a mode has the bell beside the avatar');
check(Number(count) >= 2, 'counting the challenge and the pass', count);

await page.screenshot({ path: `${out}/e1-bell.png` });

// ── The screen ───────────────────────────────────────────────────────────
await page.locator('#modes-bell').click();
await page.waitForSelector('#notices:not(.hidden) .nt-row', { timeout: 8000 });
await page.waitForTimeout(500);
const groups = await page.locator('#notices .nt-group').allTextContents();
check(groups[0] === 'NEEDS YOU', 'Notifications leads with NEEDS YOU', groups.join(', '));
const first = page.locator('#notices .nt-card').first().locator('.nt-row').first();
check(new RegExp(`${zoya} challenged you`).test(await first.innerText()) && await first.locator('.nt-key.is-answer').count() === 1, 'the challenge, with ANSWER', await first.innerText());
const passed = page.locator('#notices .nt-row').filter({ hasText: new RegExp(`${tara} (surpassed you|took #1 from you)`) });
check(await passed.count() === 1 && await passed.locator('.nt-key.is-win').count() === 1, 'the pass, with WIN IT BACK');
check(await page.locator('#notices .nt-row.is-new').count() >= 2, 'both marked new');
check(await onTop(page, '#notices .nt-title'), 'over Choose a mode');
await page.waitForFunction(() => document.getElementById('modes-bell-count')?.textContent === '1', null, { timeout: 5000 }).catch(() => null);
check((await page.locator('#modes-bell-count').textContent()) === '1', 'opening it leaves the bell counting only what waits on you', await page.locator('#modes-bell-count').textContent());
check(!(await page.content()).includes(kabirId) && !(await page.locator('#notices').innerHTML()).includes(zoyaId), 'and no player id on the screen');
await page.screenshot({ path: `${out}/e2-all.png` });

await page.locator('#notices [data-filter="board"]').click();
await page.waitForTimeout(300);
const boardRows = await page.locator('#notices .nt-row').allInnerTexts();
check(boardRows.length >= 1 && boardRows.every(t => !/challenged you/.test(t)), 'Board shows the board alone', boardRows.join(' | '));
await page.screenshot({ path: `${out}/e3-board.png` });
await page.locator('#notices [data-filter="results"]').click();
await page.waitForTimeout(300);
check(await page.locator('#notices .nt-empty').count() === 1, 'Results with none says so');
await page.locator('#notices [data-filter="all"]').click();
await page.waitForTimeout(300);

// ANSWER: the invite over the screen.
await page.locator('#notices .nt-key.is-answer').first().click();
await page.waitForSelector('#cc-invite .cc-sheet', { timeout: 8000 }).catch(() => null);
await page.waitForTimeout(500);
check(await onTop(page, '#iv-accept'), 'ANSWER opens the invite over it');
await page.screenshot({ path: `${out}/e2-answer.png` });
await page.locator('#iv-later').click();
await page.waitForTimeout(400);

// A row: their profile over it.
await page.locator('#notices .nt-row').filter({ hasText: new RegExp(`${tara} (surpassed you|took #1 from you)`) }).locator('.nt-text').click();
await page.waitForSelector('#notices #player-sheet', { timeout: 8000 }).catch(() => null);
await page.waitForTimeout(600);
check(await page.locator('#notices #player-sheet').count() === 1, 'a row opens the player’s profile over it');
await page.screenshot({ path: `${out}/e2-profile.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(await page.locator('#notices').isHidden(), 'Escape puts the profile away, then the screen');

// My profile's Rank down: Notifications on Board.
await page.locator('#modes-profile').click();
await page.waitForSelector('.mp-news.is-taken', { timeout: 15000 }).catch(() => null);
check(await page.locator('.mp-news.is-taken').count() === 1, 'My profile leads with Rank down');
await page.locator('#mp-activity-open').click();
await page.waitForSelector('#notices:not(.hidden) .nt-row', { timeout: 8000 }).catch(() => null);
check(await page.locator('#notices .nt-filter.is-on[data-filter="board"]').count() === 1 && await onTop(page, '#notices .nt-title'), 'and opens Notifications on Board, over My profile');
await page.screenshot({ path: `${out}/e3-from-profile.png` });

// Accepted from here, the chase is not played under the screen.
await page.locator('#notices [data-filter="all"]').click();
await page.waitForTimeout(300);
await page.locator('#notices .nt-key.is-answer').first().click();
await page.waitForSelector('#iv-accept', { timeout: 8000 });
await page.locator('#iv-accept').click({ noWaitAfter: true });
await page.waitForSelector('#chase-intro .cs-card', { timeout: 90000 }).catch(() => null);
check(await page.locator('#chase-intro .cs-card').isVisible() && await page.locator('#notices').isHidden(), 'ACCEPT AND CHASE leaves Notifications for the chase card');

// ── Nothing yet ──────────────────────────────────────────────────────────
const emptyId = await seed(empty, 6, 4);
const fresh = await as(emptyId, empty, 4);
await toModes(fresh);
await fresh.waitForSelector('#modes-bell:not(.hidden)', { timeout: 15000 }).catch(() => null);
check(await fresh.locator('#modes-bell-count').isHidden(), 'a player with nothing new has a bell with no count');
await fresh.locator('#modes-bell').click();
await fresh.waitForSelector('#notices:not(.hidden) .nt-empty', { timeout: 8000 }).catch(() => null);
await fresh.waitForTimeout(400);
check(/NOTHING HERE YET/.test(await fresh.locator('#notices').innerText()) && await fresh.locator('#notices-board').count() === 1, 'and an empty screen offering the leaderboard');
await fresh.screenshot({ path: `${out}/e4-empty.png` });

check(!page.errors.length && !fresh.errors.length, 'no errors on either page', [...page.errors, ...fresh.errors].join(' | '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
