/**
 * Super Knockout with friends, in real browsers against the dev server
 * (Figma Battle Royale page, sections 53 and 54):
 *
 *   1. Play with friends off the Knockout home: JOIN A FRIEND'S MATCH, a code
 *      that is no match said plainly, the people around now, HOST A MATCH.
 *   2. The lobby: the code, 1 OF 12 IN, START NOW asleep until a friend is in,
 *      somebody around asked in with one tap (SENT, and the match in their list).
 *   3. A friend opening the match's link (`?k=`) lands in the lobby as a guest,
 *      says I'M READY, and the host sees the tick.
 *   4. START NOW: both phones count the same walk-out and bat the same match,
 *      each at its own pace, the bowler held at the over's end until the
 *      other is through it, and the cuts and the end the same on both phones.
 *   5. A third match where one player's phone goes away after the walk-out: a
 *      sub bats out their over and the room moves on without them.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/friends-check.mjs http://127.0.0.1:5201
 *
 * Nobody swings: every ball is left alone, in real time, so the balls are the
 * match's and what the batters make of them is up to the bowling. It seeds
 * its own players under new letters each run.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const out = 'test-results/friends';
let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};
const letters = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const run = letters(3);
const idOf = name => `${name.toLowerCase().slice(0, 10).padEnd(6, 'x')}-${letters(12)}`;
const post = async (path, body) => (await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
/** A named player the store knows by handle (a name is claimed, which keeps handle → id). */
async function seed(name, avatar) {
  const playerId = idOf(name);
  const claimed = await post('/api/name', { playerId, name, avatar });
  if (claimed.error) throw new Error(`${name}: ${claimed.error}`);
  return playerId;
}

const host = `Fhost${run}`, guest = `Fguest${run}`, passer = `Faround${run}`, gone = `Fgone${run}`;
const hostId = await seed(host, 1), guestId = await seed(guest, 2), passerId = await seed(passer, 3), goneId = await seed(gone, 4);
// Somebody around now, for the host to ask in.
await post('/api/live', { playerId: passerId, name: passer, avatar: 3, state: 'online', mode: null });

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath });
const pages = [];
async function as(playerId, name, avatar, link = '') {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.addInitScript(([id, who, kit]) => {
    try {
      localStorage.setItem('hitman-player', id);
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-keeper-intro', 'done');
      localStorage.setItem('hitman-profile', '1');
      localStorage.setItem('hitman-whatsnew', 'rivals:9,diwali:9,cams:9');
      localStorage.setItem('hitman-knockout-rules', '1');
      localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: kit }));
    } catch { /* The screens it skips stand in the way. */ }
  }, [playerId, name, avatar]);
  await page.goto(`${base}/?debug=1&private=0${link}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(500); }
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  pages.push(page);
  return page;
}
const ko = page => page.evaluate(() => window.__cricket?.knockout?.() ?? null);
const phase = page => page.evaluate(() => window.__cricket?.snapshot?.().phase);
const visible = (page, selector) => page.evaluate(sel => { const el = document.querySelector(sel); return !!el && !el.closest('.hidden') && !el.classList.contains('hidden') && el.getBoundingClientRect().height > 0; }, selector);
const text = (page, selector) => page.evaluate(sel => document.querySelector(sel)?.textContent?.trim() ?? '', selector);
async function until(what, test, ms = 30_000, step = 250) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await test()) return true; await new Promise(r => setTimeout(r, step)); }
  return false;
}

// 1. Play with friends, off the Knockout home.
console.log('Play with friends');
const a = await as(hostId, host, 1);
await a.locator('#start').click({ force: true });
await a.waitForSelector('#modes:not(.hidden)', { timeout: 20_000 });
await a.locator('#mode-knockout').click();
await a.waitForSelector('#knockout-home:not(.hidden)');
check(await a.evaluate(() => !document.getElementById('ko-friends').disabled), 'PLAY WITH FRIENDS is live on the Knockout home');
await a.locator('#ko-friends').click();
await a.waitForSelector('#knockout-friends:not(.hidden)');
check((await text(a, '.ko-join-title')) === 'JOIN A FRIEND’S MATCH' && (await text(a, '#ko-join-line')) === 'Enter the code your friend shared.', 'JOIN A FRIEND’S MATCH, and what the code is');
check(await until('around', async () => (await text(a, '#ko-friends-around')).includes(passer), 8000), 'somebody around now is listed with INVITE', await text(a, '#ko-friends-around'));
await a.locator('#ko-join-code').fill('zzzz');
check((await a.evaluate(() => [...document.querySelectorAll('.ko-code i')].map(i => i.textContent).join(''))) === 'ZZZZ', 'the boxes take the code in capitals');
await a.locator('#ko-join-go').click();
check(await until('wrong', async () => (await text(a, '#ko-join-line')).includes('No match with code ZZZZ'), 8000), 'a code that is no match says so, plainly', await text(a, '#ko-join-line'));
await a.screenshot({ path: `${out}/friends.png` });

// 2. The lobby.
console.log('The lobby');
await a.locator('#ko-host').click();
check(await until('lobby', () => visible(a, '#knockout-lobby'), 8000), 'HOST A MATCH opens the lobby');
const code = (await text(a, '#ko-lobby-code')).replace(/\s/g, '');
check(/^[2-9A-HJ-NP-Z]{4}$/.test(code), 'the match has a four-character code', code);
check((await text(a, '#ko-lobby-count')) === '1 OF 12 IN', 'one of twelve in');
check(await a.evaluate(() => document.getElementById('ko-lobby-start').disabled), 'START NOW waits for a friend');
check(await until('strip', async () => (await text(a, '#ko-lobby-around')).includes(passer), 8000), 'who is around is in the lobby to ask in');
await a.locator('#ko-lobby-around .ko-around-cell', { hasText: passer }).locator('[data-invite]').click();
check(await until('sent', async () => (await a.locator('#ko-lobby-around .ko-around-cell', { hasText: passer }).textContent()).includes('SENT'), 8000), 'INVITE turns SENT');
await until('listed', async () => (await (await fetch(`${base}/api/knockout?invites=${passerId}`)).json()).invites?.length > 0, 8000);
const invited = await (await fetch(`${base}/api/knockout?invites=${passerId}`)).json();
check(invited.invites?.some(i => i.code === code && i.by === host), 'the match is in the invited player’s list', JSON.stringify(invited));
await a.screenshot({ path: `${out}/lobby-host.png` });

// 3. A friend opens the link.
console.log('A friend with the link');
const b = await as(guestId, guest, 2, `&k=${code}`);
const landed = await until('guest lobby', () => visible(b, '#knockout-lobby'), 60_000);
check(landed, 'the link lands a friend in the lobby', landed ? '' : JSON.stringify(await b.evaluate(() => ({ url: location.href, friends: document.getElementById('knockout-friends')?.className ?? null,
  lobby: document.getElementById('knockout-lobby')?.className ?? null, line: document.getElementById('ko-join-line')?.textContent ?? null, phase: window.__cricket?.snapshot?.().phase, player: window.__cricket?.player?.() }))));
if (!landed) await b.screenshot({ path: `${out}/guest-stuck.png` });
check(await until('two', async () => (await text(a, '#ko-lobby-count')) === '2 OF 12 IN', 15_000), 'the host sees them arrive: 2 OF 12 IN');
check((await text(b, '#ko-lobby-note')).startsWith(`Waiting for ${host}`) && await visible(b, '#ko-lobby-ready'), 'the guest is told who starts it, and has I’M READY');
await b.locator('#ko-lobby-ready').click();
check(await until('tick', () => a.evaluate(() => !!document.querySelector('#ko-seats .ko-lseat.is-ready:not(.is-you)')), 8000), 'the host sees the guest’s tick');
await b.screenshot({ path: `${out}/lobby-guest.png` });

// 4. START NOW, and the match batted on both phones.
console.log('Batting together');
check(await a.evaluate(() => !document.getElementById('ko-lobby-start').disabled), 'START NOW wakes with a friend in');
await a.locator('#ko-lobby-start').click();
const counted = await Promise.all([a, b].map(p => until('count', () => visible(p, '#ko-walkout'), 6000, 100)));
// The host's count is the start's own; a page as starved as a headless guest's may only hear of it once it has run out.
check(counted[0], 'the host counts the walk-out', `host ${counted[0]}, guest ${counted[1]}`);
await a.screenshot({ path: `${out}/walkout.png` });
const walked = await Promise.all([a, b].map(p => until('walk', async () => (await ko(p))?.match !== null && (await ko(p))?.match !== undefined, 15_000)));
check(walked.every(Boolean), 'both walk out into the match');
const [ka, kb] = [await ko(a), await ko(b)];
check(ka?.left === 12 && kb?.left === 12, 'twelve seats, the empty ten subs');
check(ka?.table === kb?.table, 'the same room on both phones at the start');
// Through the first over: somebody waits on the other at its end.
let held = false;
const firstOver = await until('over 1', async () => {
  const [x, y] = [await ko(a), await ko(b)];
  if (x?.match?.holding && (await visible(a, '#ko-waiting'))) held = true;
  if (y?.match?.holding && (await visible(b, '#ko-waiting'))) held = true;
  return x && y && x.roomBalls >= 6 && y.roomBalls >= 6;
}, 240_000, 400);
check(firstOver, 'both phones bat the first over and the cut lands on both');
check(held, 'the phone through first waited at the over’s end with the pill up');
// The ladder: 12, then 10 after the first over, 8, 5 and 2. Read once both phones stand on the same over.
const LEFT = { 0: 12, 6: 10, 12: 8, 18: 5, 24: 2 };
let same = null;
await until('same over', async () => { const [x, y] = [await ko(a), await ko(b)]; if (x.roomBalls === y.roomBalls && !x.done) same = [x, y]; return !!same || x.done; }, 60_000, 200);
if (same) check(same[0].left === same[1].left && same[0].left === LEFT[same[0].roomBalls],
  'each cut takes its count, the same on both phones', `${same[0].roomBalls}: ${same[0].left} / ${same[1].left}`);
// To the end: the same room, the same winner.
const ended = await until('end', async () => (await ko(a))?.done && (await ko(b))?.done, 900_000, 1000);
check(ended, 'the match ends on both phones');
const [ea, eb] = [await ko(a), await ko(b)];
check(ea.table === eb.table, 'every seat the same on both phones at the end', `${ea.table}\n        ${eb.table}`);
check(ea.winner && ea.winner === eb.winner, `the same winner on both: ${ea.winner}`);
// Each phone's own end: KNOCKED OUT or WINNER, whenever its innings is settled.
const moments = await Promise.all([a, b].map(p => until('moment', async () => (await phase(p)) === 'INNINGS_END' && await p.evaluate(() => !!document.querySelector('.ko-moment')), 180_000, 1000)));
check(moments.every(Boolean), 'each phone ends on its own KNOCKED OUT or WINNER');
await a.screenshot({ path: `${out}/end-host.png` });
await b.screenshot({ path: `${out}/end-guest.png` });

// 5. A phone that goes away. The first match's two pages are put away first: three renderers in software starve the one batting.
console.log('A phone that goes away');
await a.close(); await b.close();
const answer = await post('/api/knockout', { action: 'host', playerId: hostId, name: host, avatar: 1 });
const second = answer.match.code;
await post('/api/knockout', { action: 'join', code: second, playerId: goneId, name: gone, avatar: 4 });
const c = await as(hostId, host, 1, `&k=${second}`);
check(await until('lobby again', () => visible(c, '#knockout-lobby'), 15_000), 'the host back in a second match’s lobby');
await post('/api/knockout', { action: 'start', code: second, playerId: hostId, name: host, avatar: 1 });
check(await until('walk again', async () => !!(await ko(c))?.match, 15_000), 'the host walks out; the other phone never does');
const movedOn = await until('subbed', async () => ((await ko(c))?.roomBalls ?? 0) >= 6 || !!(await ko(c))?.done, 300_000, 1000);
check(movedOn, 'a sub bats out the quiet player’s over and the room moves on');
const after = await (await fetch(`${base}/api/knockout?code=${second}`)).json();
check(after.match.members.find(m => m.name === gone)?.card.startsWith('SSSSSS'), 'the store holds the sub’s balls in their seat', after.match.members.find(m => m.name === gone)?.card);

for (const page of pages) check(page.errors.length === 0, 'nothing in the console', page.errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
