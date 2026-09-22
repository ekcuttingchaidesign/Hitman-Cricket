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
const ID = 'kck123-keycheckplay1';
const WHO = `Keyed${Math.floor(Math.random() * 9000) + 1000}`;

// Register the name against the same store the browser talks to, with an
// innings the plausibility floor accepts. This is the state the report starts
// from: somebody who has registered and holds a key.
const claimed = await fetch(`${BASE}/api/score`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ playerId: ID, name: WHO, avatar: 1, mode: 'classic',
    innings: { runs: 70, sixes: 3, fours: 5, wickets: 1, dots: 9, balls: 30 } }),
}).then(r => r.json());
console.log('claimed:', claimed.ok === true, '| key:', claimed.key);

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const errs = []; page.on('pageerror', e => errs.push(`PAGEERROR ${e.message}`));
let bad = 0;
const ok = (c, w, d) => (c || bad++, console.log(`${c ? '  ok  ' : ' FAIL '} ${w}${c || d === undefined ? '' : `\n        ${d}`}`));
const wait = ms => page.waitForTimeout(ms);
await page.addInitScript(([id, who, key]) => {
  const day = new Date(Date.now() - 172800000).toISOString().slice(0, 10);
  try {
    localStorage.setItem('hitman-seen', day);
    localStorage.setItem('hitman-player', id);
    localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 1 }));
    localStorage.setItem('hitman-career-key', JSON.stringify({ code: key, saved: false }));
  } catch { /* then the check proves nothing */ }
}, [ID, WHO, claimed.key]);
await page.goto(`${BASE}/?debug=1&seed=222`, { waitUntil: 'load' });
await wait(3000);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await wait(1500); }
await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '#debug{display:none!important}'; document.head.append(st); });

// The report: open the board and switch to My Stats, having registered and
// never since finished an innings or opened the picker.
await page.locator('#cover-board').click({ force: true });
await wait(2500);
await page.locator('#board-tab-mine').click({ force: true });
await wait(3000);
const onStats = await page.locator('.key-pass').count();
ok(onStats === 1, 'My Stats carries the key card for a registered player', `${onStats} of them`);
await page.locator('.stats-sheet-inner').evaluate(el => { el.scrollTop = el.scrollHeight; }).catch(() => {});
await wait(400);
if (onStats) {
  await page.locator('#key-save').click({ force: true });
  await wait(900);
  ok(!((await page.locator('#key-overlay').getAttribute('class')) ?? '').includes('hidden'),
    'and its key opens the save sheet');
}
console.log(errs.length ? `\n${errs.join('\n')}` : '\nnothing threw');
console.log(bad ? `\n${bad} failed` : '\nall good');
await b.close();
process.exit(bad ? 1 : 0);
