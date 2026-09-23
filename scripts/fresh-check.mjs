/**
 * `?fresh=1`, the way back to being nobody.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/fresh-check.mjs                  # that dev server
 *   node scripts/fresh-check.mjs http://…:4173    # a preview build
 *
 * Both answers are walked, because only one of them can be wrong in a way that
 * costs somebody something. Keeping has to leave every trace alone; clearing
 * has to take all three copies of who you are — localStorage, the cookie and
 * IndexedDB — and leave a browser the game treats as new, which is checked by
 * asking the game rather than by reading storage.
 *
 * What it does not assert is that no `hitman-` key survives. The game boots
 * straight after the clear and writes a fresh visit record, which is exactly
 * what a new player's first load should leave behind. An assertion that
 * counted that as failure was the first thing this check got wrong.
 *
 * The second was seeding the player with `addInitScript`, which re-runs on
 * every navigation: the reload meant to prove the slate was clean was quietly
 * putting the old player back first. The state is set once, by hand, for that
 * reason.
 *
 * It needs no database — the dev server keeps names and keys in memory — and
 * the key it registers with is minted, never a fixture.
 */

import { chromium } from '@playwright/test';
const BASE = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const ID = 'frs123-freshplayer01';
const WHO = `Fresh${Math.floor(Math.random() * 9000) + 1000}`;
const claimed = await fetch(`${BASE}/api/score`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playerId: ID, name: WHO, avatar: 1, mode: 'classic',
    innings: { runs: 70, sixes: 3, fours: 5, wickets: 1, dots: 9, balls: 30 } }),
}).then(r => r.json());
console.log('minted:', claimed.key);

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = []; page.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (c, w, d) => { if (!c) bad++; console.log(`${c ? '  ok  ' : ' FAIL '} ${w}${c || d === undefined ? '' : `\n        ${d}`}`); };
const wait = ms => page.waitForTimeout(ms);
await page.goto(`${BASE}/?debug=1&seed=222`, { waitUntil: 'load' });
await wait(2500);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await wait(1200); }
await page.evaluate(([id, who, key]) => {
  try {
    localStorage.setItem('hitman-seen', new Date(Date.now() - 172800000).toISOString().slice(0, 10));
    localStorage.setItem('hitman-player', id);
    localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 1 }));
    localStorage.setItem('hitman-career-key', JSON.stringify({ code: key, saved: false }));
    localStorage.setItem('hitman-best', '70');
  } catch { /* then this proves nothing */ }
}, [ID, WHO, claimed.key]);
await page.reload({ waitUntil: 'load' });
await wait(2500);
const again0 = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await again0.count()) { await again0.first().click(); await wait(1200); }
ok(await page.evaluate(() => !!localStorage.getItem('hitman-batter')), 'a registered player is set up');

// Keeping leaves everything where it is.
await page.goto(`${BASE}/?debug=1&seed=222&fresh=1`, { waitUntil: 'load' });
await wait(2000);
ok(await page.locator('#fresh-go').count() === 1, 'the flag asks before it does anything');
ok((await page.evaluate(() => location.search)).includes('fresh=1') === false, 'and takes itself off the address');
await page.locator('#fresh-keep').click({ force: true });
await wait(1500);
ok(await page.evaluate(() => !!localStorage.getItem('hitman-batter')), 'keeping leaves the record alone');

// Clearing takes all three copies.
await page.goto(`${BASE}/?debug=1&seed=222&fresh=1`, { waitUntil: 'load' });
await wait(2000);
await page.locator('#fresh-go').click({ force: true });
await wait(2500);
const left = await page.evaluate(() => ({
  who: ['hitman-player', 'hitman-batter', 'hitman-career-key', 'hitman-best']
    .filter(k => localStorage.getItem(k) !== null),
  keys: Object.keys(localStorage).filter(k => k.startsWith('hitman-')),
  cookie: document.cookie,
}));
// Not "no keys at all": the game boots straight afterwards and writes a fresh
// visit record, which is exactly what a new player's first load should leave.
// What has to be gone is every trace of who they were.
ok(left.who.length === 0, 'clearing takes everything that says who they were', JSON.stringify(left.who));
ok(!left.keys.includes('hitman-restore-offer'), 'and the memory of having been asked', JSON.stringify(left.keys));
ok(!left.cookie.includes('hitman-player='), 'and the cookie with it', left.cookie || '(none)');

// And the game now treats them as new.
await page.reload({ waitUntil: 'load' });
await wait(2500);
const again = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await again.count()) { await again.first().click(); await wait(1200); }
await page.locator('#cover-board').click({ force: true });
await wait(2500);
ok(await page.locator('#board-restore-go').count() === 1, 'and the game offers them the way back');
ok(await page.locator('.key-pass, #card-key .key-serial').count() === 0, 'with no key, having none');
console.log(errs.length ? `\n${errs.join('\n')}` : '\nnothing threw');
console.log(bad ? `\n${bad} failed` : '\nall good');
await b.close();
process.exit(bad ? 1 : 0);
