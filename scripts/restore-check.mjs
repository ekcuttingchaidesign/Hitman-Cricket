/**
 * Bringing a record back, in a real browser.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/restore-check.mjs                  # that dev server
 *   node scripts/restore-check.mjs http://…:4173    # a preview build
 *
 * This screen is three screens wearing one name — asking, refused, done — and
 * they are drawn whole each time rather than patched, so the way they can go
 * wrong is that one of them forgets something the last one held. The name
 * surviving a refusal is the case that matters: somebody who has just been
 * told their key is wrong is one keystroke from right, and a form that clears
 * itself sends them back to the beginning for a typo.
 *
 * What is not here is whether the offer appears on a card that has figures on
 * it — it used to not, which is the bug this screen was reported with. That is
 * a decision `statsSheetMarkup` makes about a view object and nothing about it
 * needs a browser, so it is a unit test in `tests/stats-sheet.test.ts` where it
 * runs in milliseconds and cannot be flaky.
 *
 * The screen asks for a password first — the name typed in part, the player
 * picked from the list it brings up — and a career key one link below it. Both
 * are walked: the key's refusals and the board's offer with a key, My Stats'
 * with the password.
 *
 * It needs no database: the dev server keeps names and keys in memory, running
 * the same `restore` and `keyOnClaim` the deployed endpoints run. So the key
 * this uses is not a fixture — it is minted by claiming a name, exactly as a
 * player's is, and carried back from the answer.
 *
 * One consequence worth knowing when a run fails oddly: the rate limit is real
 * here and every request from a dev server counts as one address, so a check
 * run over and over inside the hour will eventually be told to wait.
 */

import { chromium } from '@playwright/test';
const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const S = process.env.SHOTS ?? null;
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
// Past how to hit, the coachmark before a first innings: `shots-check.mjs` is the one that looks at it.
await page.addInitScript(() => { try { localStorage.setItem('hitman-shots-intro', 'done'); } catch { /* Then it shows. */ } });
// Past the update's stories too: they are 3D renders, seconds apiece in software,
// and a tap on SKIP waits behind them. `whatsnew-check.mjs` is the one that reads them.
await page.addInitScript(() => { try { const d = new Date(); localStorage.setItem('hitman-whatsnew', 'new-shots:9'); localStorage.setItem('hitman-whatsnew-day', `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`); } catch { /* Then they show. */ } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
let bad = 0;
const ok = (c, what, d) => { if (!c) bad++; console.log(`${c ? '  ok  ' : ' FAIL '} ${what}${c || d === undefined ? '' : `\n        ${d}`}`); };
const wait = ms => page.waitForTimeout(ms);
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172800000).toISOString().slice(0, 10);
  try { localStorage.setItem('hitman-seen', day); } catch {}
});
await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
await wait(3000);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await wait(1500); }
await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '#debug{display:none!important}'; document.head.append(st); });
await page.locator('#start').click({ force: true });
await wait(900);
// The update's stories come up before the picker on a first visit: wait for the picker itself.
for (let i = 0; i < 20 && !(await page.locator('#modes-cancel').isVisible()); i++) {
  const d = page.locator('#whatsnew-done');
  if (await d.isVisible().catch(() => false)) await d.click({ force: true, timeout: 3000 }).catch(() => {});
  await wait(500);
}
await page.locator('#modes-cancel').click({ force: true });
await wait(800);
await page.locator('#cover-profile').click({ force: true });
await wait(3000);

// 1. the empty card offers the way back, and offers no key with it
const link = page.locator('#stats-restore');
ok(await link.count() === 1, 'an empty card offers the way back');
// A record is brought back with a name and a key together, so a key held by
// nobody opens nothing. Four of the seven ways somebody reaches this screen
// have no name yet, and every one of them was being handed a key.
ok(await page.locator('.key-pass').count() === 0, 'and no key to somebody who has not claimed a name');
ok(await page.locator('#mode-key .key-bar').count() === 0, 'nor one on the picker they came through');
// The board is the other screen worth asking on, and the one a returning
// player opens first to find out their record is gone. It carries no PLAY
// AGAIN when it is opened from the cover, so an offer drawn only alongside
// those keys was absent from exactly the board it was added for.
await page.locator('#stats-back').click({ force: true });
await wait(800);
await page.locator('#cover-board').click({ force: true });
await wait(1500);
ok(await page.locator('#board-restore-go').count() === 1, 'the board offers the way back as well, in its dock');
await page.locator('#board-close').click({ force: true });
await wait(600);
await page.locator('#cover-profile').click({ force: true });
await wait(2500);
await page.locator('.stats-sheet-inner').evaluate(el => { el.scrollTop = el.scrollHeight; });
await wait(400);
await link.click({ force: true });
await wait(700);
ok(await page.locator('#restore-form').count() === 1, 'which opens the restore screen');
ok(await page.locator('.restore-losing').count() === 0, 'with nothing said about losing, there being nothing on this phone to lose');

// A real key, minted the way a player's is: claim a name against the same
// store the browser is talking to and read the key out of the answer. A
// fixture would prove the screens and nothing about the store behind them.
/* A new id a run: a player takes a new name once every 30 days, so one fixed id is refused on the second run. */
const CHECK_ID = `chk123-${Array.from({ length: 12 }, () => 'abcdefghijkmnpqrstuvwxyz0123456789'[Math.floor(Math.random() * 34)]).join('')}`;
const WHO = `Check${Array.from({ length: 6 }, () => 'abcdefghijkmnpqrstuvwxyz'[Math.floor(Math.random() * 24)]).join('')}` /* letters: a digit suffix is a sibling of the last run's name */;
const claimed = await fetch(`${base}/api/score`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    playerId: CHECK_ID, name: WHO, avatar: 1, mode: 'classic',
    innings: { runs: 70, sixes: 3, fours: 5, wickets: 1, dots: 9, balls: 30 },
  }),
}).then(r => r.json()).catch(() => null);
ok(typeof claimed?.key === 'string', 'claiming a name mints a key', JSON.stringify(claimed));
const MINE = claimed?.key ?? '';
ok(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/.test(MINE), 'in the shape the wordlist makes', MINE);
// And a password, set the way My Stats sets one: proved by the player id.
const PASS = `Square-Cut-${Math.random().toString(36).slice(2, 8)}`;
const set = await fetch(`${base}/api/restore?password=1`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: WHO, playerId: CHECK_ID, password: PASS }),
}).then(r => r.json()).catch(() => null);
ok(set?.ok === true, 'the player sets a password', JSON.stringify(set));

ok(await page.locator('#restore-password').count() === 1 && await page.locator('#restore-key').count() === 0,
  'the screen asks for a password, not a key');
await page.locator('#restore-by-key').click({ force: true });
await wait(400);
ok(await page.locator('#restore-key').count() === 1, 'and a career key is one link away');

// 2. a key of the wrong shape is told apart from a wrong key
await page.locator('#restore-name').fill(WHO);
await page.locator('#restore-key').fill('not-a-key');
await page.locator('#restore-send').click({ force: true });
await wait(1200);
const shape = await page.locator('#restore-error').textContent();
ok(/three words and two numbers/.test(shape ?? ''), 'a half-typed key says what a key looks like', shape ?? '(none)');
ok((await page.locator('#restore-name').inputValue()) === WHO, 'and the name survives the refusal');

// 3. the right shape, the wrong key
await page.locator('#restore-key').fill('yorker-sprint-cover-48');
await page.locator('#restore-send').click({ force: true });
await wait(1200);
const wrong = await page.locator('#restore-error').textContent();
ok(/do not go together/.test(wrong ?? ''), 'a wrong key says so without saying which half was wrong', wrong ?? '(none)');

// 4. the ground around it closes it. Before the record comes back rather than
// after: restoring answers the offer and takes the link away with it, which is
// the next check down, so a screen opened from that link has to be opened
// while the link is still there to open it.
const modal = page.locator('#restore-overlay .key-modal');
const bb = await modal.boundingBox();
await page.mouse.click(bb.x + 8, bb.y + 8);
await wait(600);
ok(await page.locator('#restore-form').count() === 0, 'a press on the ground around it closes it');

// 5. the same thing on the board, which is the screen it was reported from.
//
// Driven from the board's own offer and checked without leaving it, because
// leaving it is what hid the bug: every ladder tab is drawn on the way in, so
// a tab switch recomputes the offer and takes it away whatever happened. The
// board under a player who restored from it is never redrawn at all, and the
// panel sat there asking whether they would like the record back.
//
// The board's offer has no cross since the redraw — it is a line in the dock —
// so there is nothing to un-dismiss; the preference is cleared all the same,
// in case an older card put it away.
await page.evaluate(() => { try { localStorage.removeItem('hitman-restore-offer'); } catch { /* then it stays dismissed */ } });
await page.locator('#stats-back').click({ force: true }).catch(() => {});
await wait(800);
await page.locator('#cover-board').click({ force: true });
await wait(2000);
ok(await page.locator('#board-restore-go').count() === 1, 'the board offers it in its dock');
await page.locator('#board-restore-go').click({ force: true });
await wait(800);
await page.locator('#restore-by-key').click({ force: true });
await wait(400);
await page.locator('#restore-name').fill(WHO);
await page.locator('#restore-key').fill(MINE);
await page.locator('#restore-send').click({ force: true });
await wait(1600);
ok(await page.locator('#restore-done').count() === 1, 'and the key works from there too');
await page.locator('#restore-done').click({ force: true });
await wait(1400);
ok(await page.locator('#board-restore-go').count() === 0,
  'and the offer comes off the board without it being left and come back to');

// 6. by the password, from My Stats: a few letters of the name, the player
// picked from the list they bring up, and the password.
await page.evaluate(() => { try { localStorage.removeItem('hitman-batter'); } catch { /* noop */ } });
await page.locator('#board-close').click({ force: true }).catch(() => {});
await wait(600);
await page.locator('#cover-profile').click({ force: true });
await wait(2000);
await page.locator('.stats-sheet-inner').evaluate(el => { el.scrollTop = el.scrollHeight; }).catch(() => {});
await wait(400);
await page.locator('#stats-restore').click({ force: true });
await wait(800);
await page.locator('#restore-name').pressSequentially(WHO.slice(0, 7), { delay: 30 });
await wait(1500);
const row = page.locator(`.rs-found-row[data-name="${WHO}"]`);
ok(await row.count() === 1, 'a few letters of the name list the player',
  await page.locator('#restore-found').innerText().catch(() => '(no list)'));
ok(/innings/.test(await row.innerText().catch(() => '')), 'with their innings, so they know it is them');
if (S) await page.screenshot({ path: `${S}/restore-list.png` });
await row.click({ force: true });
await wait(300);
ok(await page.locator('#restore-name').inputValue() === WHO, 'picking them fills in the whole name');
ok(await row.getAttribute('aria-selected') === 'true', 'and marks them picked');
await page.locator('#restore-password').fill('Square-Cut-wrong');
await page.locator('#restore-send').click({ force: true });
await wait(1400);
ok(/name and password do not go together/.test(await page.locator('#restore-error').textContent().catch(() => '') ?? ''),
  'a wrong password says so');
ok(await page.locator('#restore-name').inputValue() === WHO
  && await page.locator(`.rs-found-row[data-name="${WHO}"].is-picked`).count() === 1, 'and the pick survives the refusal');
await page.locator('#restore-password').fill(PASS);
await page.locator('#restore-send').click({ force: true });
await wait(1400);
ok(await page.locator('#restore-done').count() === 1, 'the right password brings the record back');
ok(await page.evaluate(() => localStorage.getItem('hitman-password')) === '1', 'and this browser knows it has one');
await page.locator('#restore-done').click({ force: true });
await wait(1400);
ok(await page.locator('#restore-form').count() === 0, 'and the way out leaves the screen');

// The screen it was opened from, once the record is back. The welcome said so
// and the screen behind it did not: the offer stayed exactly where it was,
// inviting somebody to bring back the record they were already looking at.
ok(await page.locator('#stats-restore').count() === 0,
  'and the screen behind it stops offering what has just been done');

console.log(errs.length ? `\nerrors:\n${errs.join('\n')}` : '\nnothing threw');
console.log(bad ? `\n${bad} failed` : '\nall good');
await b.close();
process.exit(bad ? 1 : 0);
