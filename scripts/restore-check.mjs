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
for (let i = 0; i < 8; i++) {
  const d = page.locator('#whatsnew-done');
  if (!(await d.count()) || !(await d.isVisible())) break;
  await d.click({ force: true }); await wait(500);
}
await page.locator('#modes-cancel').click({ force: true });
await wait(800);
await page.locator('#cover-board').click({ force: true });
await wait(2500);
await page.locator('#board-tab-mine').click({ force: true });
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
await page.locator('#board-tab-classic').click({ force: true });
await wait(1500);
ok(await page.locator('#board-restore-go').count() === 1, 'the board offers the way back as well');
await page.locator('#board-restore-close').click({ force: true });
await wait(600);
ok(await page.locator('#board-restore-go').count() === 0, 'and the cross takes it off the board');
await page.locator('#board-tab-mine').click({ force: true });
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
const WHO = `Check${Math.floor(Math.random() * 9000) + 1000}`;
const claimed = await fetch(`${base}/api/score`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    playerId: 'chk123-checkplayer01', name: WHO, avatar: 1, mode: 'classic',
    innings: { runs: 70, sixes: 3, fours: 5, wickets: 1, dots: 9, balls: 30 },
  }),
}).then(r => r.json()).catch(() => null);
ok(typeof claimed?.key === 'string', 'claiming a name mints a key', JSON.stringify(claimed));
const MINE = claimed?.key ?? '';
ok(/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/.test(MINE), 'in the shape the wordlist makes', MINE);

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
// The cross above put the offer away for good, so the preference it wrote is
// cleared here — that is a setting being reset, not the thing under test.
await page.evaluate(() => { try { localStorage.removeItem('hitman-restore-offer'); } catch { /* then it stays dismissed */ } });
await page.locator('#board-tab-mine').click({ force: true });
await wait(1200);
await page.locator('#board-tab-classic').click({ force: true });
await wait(2000);
ok(await page.locator('#board-restore-go').count() === 1, 'the board offers it again once un-dismissed');
await page.locator('#board-restore-go').click({ force: true });
await wait(800);
await page.locator('#restore-name').fill(WHO);
await page.locator('#restore-key').fill(MINE);
await page.locator('#restore-send').click({ force: true });
await wait(1600);
ok(await page.locator('#restore-done').count() === 1, 'and the key works from there too');
await page.locator('#restore-done').click({ force: true });
await wait(1400);
ok(await page.locator('#board-restore-go').count() === 0,
  'and the offer comes off the board without it being left and come back to');

// 6. the key the store actually minted, from My Stats
await page.evaluate(() => { try { localStorage.removeItem('hitman-batter'); } catch { /* noop */ } });
await page.locator('#board-tab-mine').click({ force: true });
await wait(2000);
await page.locator('.stats-sheet-inner').evaluate(el => { el.scrollTop = el.scrollHeight; }).catch(() => {});
await wait(400);
await page.locator('#stats-restore').click({ force: true });
await wait(800);
await page.locator('#restore-name').fill(WHO);
await page.locator('#restore-key').fill(MINE);
await page.locator('#restore-send').click({ force: true });
await wait(1400);
ok(await page.locator('#restore-done').count() === 1, 'the right key brings the record back');
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
