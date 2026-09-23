/**
 * The career key on the screens a registered player actually reaches it from.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/key-check.mjs                  # that dev server
 *   node scripts/key-check.mjs http://…:4173    # a preview build
 *
 * Written after a report that the key card was missing from My Stats and that
 * its key did nothing. Both were one bug: the view was a field on the HUD,
 * written only where a key was drawn — the picker and the end of an innings —
 * so a player who registered and went straight to the board found it still
 * holding the null from before they had a name. The card was left out, and the
 * key that opens the save sheet returned silently on the same null.
 *
 * Which is why this one does not play an innings to get there. It registers
 * against the store the way a player does, then opens the board from the cover
 * — the shortest path, and the one every earlier check happened not to take.
 *
 * It needs no database: the dev server keeps names and keys in memory, running
 * the same endpoints the deployed ones run. The key is minted, never a fixture.
 *
 * Its subject is a player who has a name. What a player without one sees is
 * `restore-check.mjs`, which starts as one — a check that registers and then
 * deletes its way back to nameless is testing its own teardown.
 */

import { chromium } from '@playwright/test';
const BASE = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const WHO = `Keyed${Math.floor(Math.random() * 9000) + 1000}`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errs = []; page.on('pageerror', e => errs.push(`PAGEERROR ${e.message}`));
let bad = 0;
const ok = (c, w, d) => (c || bad++, console.log(`${c ? '  ok  ' : ' FAIL '} ${w}${c || d === undefined ? '' : `\n        ${d}`}`));
const wait = ms => page.waitForTimeout(ms);
// Only the visit. The name and the key are given after the game has settled on
// who it is, because who it is cannot be decided from out here — see below.
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172800000).toISOString().slice(0, 10);
  try { localStorage.setItem('hitman-seen', day); } catch { /* then the notice stands */ }
});
await page.goto(`${BASE}/?debug=1&seed=222`, { waitUntil: 'load' });
await wait(3000);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await wait(1500); }

/*
 * The name is claimed under the id the game chose, rather than the game being
 * handed an id and expected to keep it.
 *
 * It will not keep one. The id is resolved from three stores raced against a
 * one-second fuse that mints a fresh one, and a headless browser opening a cold
 * IndexedDB loses that race on every load — so a planted id is overwritten by a
 * stranger before the first screen is drawn, and localStorage still holding
 * what was planted proves only that the init script ran.
 *
 * It cost an afternoon to see, because it hides everywhere but here. A key card
 * needs a name and the name is read straight out of localStorage. A *new* key
 * needs the id that holds the name, because handing one to anybody else would
 * be handing over somebody's record — so the store refused, correctly, and from
 * out here that looked like a sheet that would not open.
 */
const ID = await page.evaluate(() => window.__cricket?.player() ?? null);
ok(typeof ID === 'string' && ID.length > 0, 'the game says which player it settled on', String(ID));
if (!ID) { console.log('\nNo id, so nothing below would mean anything.\n'); await b.close(); process.exit(1); }

const claimed = await fetch(`${BASE}/api/score`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playerId: ID, name: WHO, avatar: 1, mode: 'classic',
    innings: { runs: 70, sixes: 3, fours: 5, wickets: 1, dots: 9, balls: 30 } }),
}).then(r => r.json());
ok(claimed.ok === true && typeof claimed.key === 'string', 'and registering under it mints a key', JSON.stringify(claimed));

// Handed over the way the game would have written them itself, and without a
// reload: a second load is a second roll of that same fuse.
await page.evaluate(([who, key]) => {
  try {
    localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 1 }));
    localStorage.setItem('hitman-career-key', JSON.stringify({ code: key, saved: false }));
  } catch { /* then the check proves nothing */ }
}, [WHO, claimed.key]);
await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '#debug{display:none!important}'; document.head.append(st); });

// The report: open the board and switch to My Stats, having registered and
// never since finished an innings or opened the picker.
await page.locator('#cover-board').click({ force: true });
await wait(2500);
await page.locator('#board-tab-mine').click({ force: true });
await wait(3000);
const onStats = await page.locator('.key-pass').count();
ok(onStats === 1, 'My Stats carries the key card for a registered player', `${onStats} of them`);
// And not the way back, which is for somebody who has no name. It was offered
// to everybody: the flag behind it was set true at startup and never asked
// again, so a player with a name and a record in front of them was invited to
// go and bring one back.
ok(await page.locator('#stats-restore').count() === 0,
  'and does not offer to restore a record they are looking at');
await page.locator('.stats-sheet-inner').evaluate(el => { el.scrollTop = el.scrollHeight; }).catch(() => {});
await wait(400);
if (onStats) {
  await page.locator('#key-save').click({ force: true });
  await wait(900);
  ok(!((await page.locator('#key-overlay').getAttribute('class')) ?? '').includes('hidden'),
    'and its key opens the save sheet');
  ok(await page.locator('#key-whatsapp').count() === 1, 'carrying a key that sends it to WhatsApp');
  ok((await page.locator('.key-fine').innerText()).toLowerCase().includes('screenshot'),
    'and the one thing every phone can do, said in the sheet');
  await page.locator('#key-modal-close').click({ force: true });
  await wait(600);
}

// ── The card behind the sheet, after the sheet has changed what is true ────
// A key made inside a modal changed the store and left the card that asked for
// it reading "make a new key" over a browser that now held one. The bug is not
// the making; it is that nothing behind the modal was redrawn, so this presses
// the key and then looks at what it was pressed on.
await page.evaluate(() => { try { localStorage.removeItem('hitman-career-key'); } catch { /* then nothing is proved */ } });
await page.locator('#board-tab-classic').click({ force: true });
await wait(1200);
await page.locator('#board-tab-mine').click({ force: true });
await wait(2500);
await page.locator('.stats-sheet-inner').evaluate(el => { el.scrollTop = el.scrollHeight; }).catch(() => {});
await wait(400);
const lost = await page.locator('.key-pass.is-lost').count();
ok(lost === 1, 'a name with no key on this phone is told so, and offered another', `${lost} of them`);
if (lost) {
  await page.locator('#key-save').click({ force: true });
  await wait(2500);
  ok(!((await page.locator('#key-overlay').getAttribute('class')) ?? '').includes('hidden'),
    'and making one opens the sheet on it');
  await page.locator('#key-modal-close').click({ force: true });
  await wait(900);
  await page.locator('.stats-sheet-inner').evaluate(el => { el.scrollTop = el.scrollHeight; }).catch(() => {});
  await wait(400);
  ok(await page.locator('.key-pass.is-lost').count() === 0,
    'and the card underneath stops asking for a key this browser now holds');
  ok(await page.locator('.key-pass .key-serial').count() === 1,
    'showing the one it was just given instead');
}
console.log(errs.length ? `\n${errs.join('\n')}` : '\nnothing threw');
console.log(bad ? `\n${bad} failed` : '\nall good');
await b.close();
process.exit(bad ? 1 : 0);
