/**
 * The return ticket: a phone that has forgotten who is playing, put right.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/return-check.mjs                  # that dev server
 *   node scripts/return-check.mjs http://…:4173    # a preview build
 *
 * Safari deletes everything a page's script wrote after a week away, so this
 * does to the browser what Safari does: localStorage, sessionStorage, the
 * script's own cookie and IndexedDB, all gone — and leaves the one cookie the
 * server set. The player has to come back as who they were, name and kit
 * included, and `?fresh=1` has to take the ticket too, or a clean slate would
 * put the old player straight back on the next load.
 *
 * What it cannot do is wait a week on a real iPhone. That is still the test of
 * whether Safari keeps the ticket, and the `identity-recovered` count is how
 * the live game answers it.
 *
 * It needs no database — the dev server keeps names in memory, and writes the
 * ticket the way `api/me.ts` does.
 */

import { chromium } from '@playwright/test';
const BASE = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const ID = `ret123-${Array.from({ length: 12 }, () => 'abcdefghijkmnpqrstuvwxyz0123456789'[Math.floor(Math.random() * 34)]).join('')}`;
const WHO = `Back${Array.from({ length: 6 }, () => 'abcdefghijkmnpqrstuvwxyz'[Math.floor(Math.random() * 24)]).join('')}`;
const claimed = await fetch(`${BASE}/api/score`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playerId: ID, name: WHO, avatar: 3, mode: 'classic',
    innings: { runs: 64, sixes: 3, fours: 4, wickets: 2, dots: 8, balls: 30 } }),
}).then(r => r.json());
console.log('claimed:', claimed.ok === false ? claimed : WHO);

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const context = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
/**
 * A headless browser looks private — its storage quota is a private window's —
 * and a private window keeps no ticket, by design. A visit remembered from an
 * earlier day is the one tell the quota does not argue with, so it is written
 * on every load, the eviction below included. That is honest here: a real
 * phone that Safari has cleared is judged by its quota, which is a normal
 * browser's, and is not taken for a private window.
 */
const remembered = () => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  // Every load, not only when missing: the game writes today's visit over it,
  // and today's visit is the one that does not count as remembering.
  try { localStorage.setItem('hitman-seen', day); } catch { /* Then the notice stands. */ }
};
await context.addInitScript(remembered);
const page = await context.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (c, w, d) => { if (!c) bad++; console.log(`${c ? '  ok  ' : ' FAIL '} ${w}${c || d === undefined ? '' : `\n        ${d}`}`); };
const wait = ms => page.waitForTimeout(ms);
const anyway = async () => {
  const button = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await button.count()) { await button.first().click(); await wait(1200); }
};
/**
 * Polled rather than waited out. A headless browser draws the ground in
 * software, which can hold the page's timers for several seconds, so a fixed
 * pause either wastes time or loses a race with the game settling its id.
 */
const until = async (test, ms = 30_000) => {
  const end = Date.now() + ms;
  for (;;) {
    const value = await test().catch(() => null);
    if (value || Date.now() > end) return value;
    await wait(250);
  }
};
const ticket = async () => {
  const held = (await context.cookies()).find(c => c.name === 'hitman-back');
  if (!held) return null;
  try { return { ...JSON.parse(decodeURIComponent(held.value)), cookie: held }; } catch { return { cookie: held }; }
};

// A registered player, set up once by hand: an init script would re-run on
// every navigation and put them back before the reload meant to lose them.
await page.goto(`${BASE}/?debug=1&seed=222`, { waitUntil: 'load' });
await anyway();
// Seeded from the feedback page, which is the same address with no game on
// it: a game still settling its own id writes that id over the seed a moment
// later, and in a headless browser that moment can be seconds.
await until(async () => (await ticket())?.id);
await page.goto(`${BASE}/feedback`, { waitUntil: 'load' });
await page.evaluate(([id, who]) => {
  localStorage.setItem('hitman-player', id);
  localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 3 }));
  localStorage.setItem('hitman-profile', '1');
}, [ID, WHO]);
await page.goto(`${BASE}/?debug=1&seed=222`, { waitUntil: 'load' });
await anyway();

// The ticket is written by the server, for the player the phone holds.
const held = await until(async () => { const t = await ticket(); return t?.id === ID && t.name ? t : null; }) ?? await ticket();
ok(!!held, 'the server writes a return ticket on load');
ok(held?.id === ID, 'carrying the player id', JSON.stringify(held));
ok(held?.name === WHO && held?.avatar === 3, 'and the name and kit', JSON.stringify(held));
ok(held?.cookie && !held.cookie.httpOnly, 'readable by the page, so reading it needs no request');
const year = held?.cookie ? (held.cookie.expires * 1000 - Date.now()) / 86_400_000 : 0;
ok(year > 360 && year < 367, 'for a year', `${year.toFixed(1)} days`);
ok(held?.cookie?.path === '/' && held?.cookie?.sameSite === 'Lax', 'for the whole site, never cross-site', JSON.stringify(held?.cookie));

// What Safari does after a week away: everything the script wrote, gone.
// Done from the feedback page too, so no game is there to write anything back.
await page.goto(`${BASE}/feedback`, { waitUntil: 'load' });
await page.evaluate(async () => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = 'hitman-player=;path=/;max-age=0;SameSite=Lax';
  await new Promise(done => {
    const request = indexedDB.deleteDatabase('hitman-cricket');
    request.onsuccess = done; request.onerror = done; request.onblocked = done;
    setTimeout(done, 1500);
  });
});
const leftBehind = await page.evaluate(() => ({ local: Object.keys(localStorage).filter(k => k !== 'hitman-seen').length, cookie: document.cookie }));
ok(leftBehind.local === 0 && !leftBehind.cookie.includes('hitman-player='), 'the page\'s own copies are gone', JSON.stringify(leftBehind));
ok((await context.cookies()).some(c => c.name === 'hitman-back'), 'with only the ticket left behind');
await page.goto(`${BASE}/?debug=1&seed=222`, { waitUntil: 'load' });
await anyway();
await until(() => page.evaluate(() => localStorage.getItem('hitman-player') && document.cookie.includes('hitman-player=')));
const back = await page.evaluate(() => ({
  id: localStorage.getItem('hitman-player'),
  batter: localStorage.getItem('hitman-batter'),
  cookie: document.cookie,
}));
ok(back.id === ID, 'the same player comes back', `${back.id} for ${ID}`);
ok(back.batter && JSON.parse(back.batter).name === WHO && JSON.parse(back.batter).avatar === 3,
  'under the same name and kit', back.batter ?? '(none)');
ok(back.cookie.includes(`hitman-player=${ID}`), 'with the id written back into the script\'s own copies too');

// A new player has no ticket to read, and is not kept waiting for one.
const stranger = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await stranger.addInitScript(remembered);
const fresh = await stranger.newPage();
await fresh.goto(`${BASE}/?debug=1&seed=222`, { waitUntil: 'load' });
await until(async () => (await stranger.cookies()).some(c => c.name === 'hitman-back'));
const theirs = await fresh.evaluate(() => localStorage.getItem('hitman-player'));
ok(!!theirs && theirs !== ID, 'a stranger is somebody new', theirs ?? '(none)');
const theirTicket = (await stranger.cookies()).find(c => c.name === 'hitman-back');
ok(!!theirTicket && decodeURIComponent(theirTicket.value).includes(theirs ?? '-'), 'and gets a ticket of their own');
await stranger.close();

// Starting again as nobody has to take the ticket too.
await page.goto(`${BASE}/?debug=1&seed=222&fresh=1`, { waitUntil: 'load' });
await page.locator('#fresh-go').waitFor({ state: 'attached', timeout: 30_000 });
await page.locator('#fresh-go').click({ force: true });
await anyway();
// The new player the game makes next gets a ticket of their own; the old one must be gone.
const after = await until(async () => { const t = await ticket(); return t && t.id !== ID ? t : null; }) ?? await ticket();
ok(!after || after.id !== ID, 'starting again takes the ticket with everything else', JSON.stringify(after));
await page.reload({ waitUntil: 'load' });
await anyway();
const nowId = await until(() => page.evaluate(() => localStorage.getItem('hitman-player')));
ok(nowId !== ID, 'and the old player does not come back on the next load', nowId ?? '(none)');

console.log(errs.length ? `\n${errs.join('\n')}` : '\nnothing threw');
console.log(bad ? `\n${bad} failed` : '\nall good');
await b.close();
process.exit(bad ? 1 : 0);
