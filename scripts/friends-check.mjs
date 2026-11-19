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
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
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

// `ONLY=room` walks the last two parts alone (back to the room mid-match, and the invite), which need nothing from the first six.
if (process.env.ONLY !== 'room') {
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
// Pasted: INVITE's whole line on the clipboard (the code, then a link longer than the boxes ever held), read for its code and joined.
await a.locator('#ko-join-code').fill('');
check(await visible(a, '#ko-join-paste'), 'a PASTE key beside JOIN A FRIEND’S MATCH');
await a.evaluate(() => navigator.clipboard.writeText('Bat with me in Super Knockout. Code WXYZ https://hitman-cricket-git-claude-a-long-branch-name-ek.vercel.app/?k=WXYZ'));
await a.locator('#ko-join-paste').click();
check(await until('pasted', async () => (await text(a, '#ko-join-line')).includes('No match with code WXYZ'), 8000), 'PASTE reads the code out of INVITE’s whole line and tries it', await text(a, '#ko-join-line'));
await a.locator('#ko-join-code').fill('');
await a.evaluate(() => {
  const data = new DataTransfer();
  data.setData('text', 'Code XYZW · https://hitmancricket.in/?k=XYZW');
  document.getElementById('ko-join-code').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
});
check(await until('paste event', async () => (await text(a, '#ko-join-line')).includes('No match with code XYZW'), 8000), 'pasted into the boxes, the same', await text(a, '#ko-join-line'));
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
await until('listed', async () => (await (await fetch(`${base}/api/challenge?knockout=1&invites=${passerId}`)).json()).invites?.length > 0, 8000);
const invited = await (await fetch(`${base}/api/challenge?knockout=1&invites=${passerId}`)).json();
check(invited.invites?.some(i => i.code === code && i.by === host), 'the match is in the invited player’s list', JSON.stringify(invited));
await a.screenshot({ path: `${out}/lobby-host.png` });

// 3. A friend opens the link.
console.log('A friend with the link');
const b = await as(guestId, guest, 2, `&k=${code}&matchlog=1`);
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
// The guest's first ball is turned away by the store: it used to be dropped for good, every ball after it refused as out of
// order, and the room held at the over's end on a player whose card never moved. It is sent again from the store's card.
let turnedAway = 0;
await b.route(url => url.pathname === '/api/challenge' && url.searchParams.has('knockout'), async route => {
  const request = route.request();
  if (request.method() === 'POST' && !turnedAway && JSON.parse(request.postData() ?? '{}').action === 'ball') {
    turnedAway++;
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Turned away by the check.', retry: false, status: 409 }) });
  }
  return route.continue();
});
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
  // Remembered by the game (`held`), since two phones can finish the over close enough that a look every 0.4s misses it.
  if (x?.match?.held || y?.match?.held) held = true;
  return x && y && x.roomBalls >= 6 && y.roomBalls >= 6;
}, 240_000, 400);
check(firstOver, 'both phones bat the first over and the cut lands on both');
check(held, 'the phone through first waited at the over’s end with the pill up');
check(turnedAway === 1, 'the guest’s first ball was turned away once');
const guestCard = (await (await fetch(`${base}/api/challenge?knockout=1&code=${code}`)).json()).match.members.find(m => m.name === guest)?.card ?? '';
check(guestCard.length >= 6 || guestCard.includes('W'), 'and sent again: the guest’s card has no gap', guestCard);
check((await text(b, '#match-log')).includes(code), '?matchlog=1 says where the match stands on this phone', await text(b, '#match-log'));
await b.screenshot({ path: `${out}/matchlog.png` });
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

// 4b. BACK TO ROOM: the key under the end screens goes to the room under the same code, and the host starts the next match there.
console.log('Back to the room');
const againKey = page => page.evaluate(() => {
  const key = [...document.querySelectorAll('#ko-res-again, #ko-again')].find(el => el.getBoundingClientRect().height > 0);
  return key?.textContent?.trim() ?? '';
});
const pressAgain = page => page.evaluate(() => [...document.querySelectorAll('#ko-res-again, #ko-again')].find(el => el.getBoundingClientRect().height > 0)?.click());
check(await until('keys', async () => (await againKey(a)) === 'BACK TO ROOM' && (await againKey(b)) === 'BACK TO ROOM', 60_000), 'the key under the end screens is BACK TO ROOM on both', `${await againKey(a)} / ${await againKey(b)}`);
await pressAgain(a);
check(await until('host room', () => visible(a, '#knockout-lobby'), 20_000), 'the host is back in the room');
check((await text(a, '#ko-lobby-code')).replace(/\s/g, '') === code && (await text(a, '#ko-lobby-count')) === '2 OF 12 IN', 'the same room: its code, and both still in it', `${await text(a, '#ko-lobby-code')} · ${await text(a, '#ko-lobby-count')}`);
await pressAgain(b);
check(await until('guest room', () => visible(b, '#knockout-lobby'), 20_000), 'the guest is back in the room');
check(await until('lobby again', async () => !(await a.evaluate(() => document.getElementById('ko-lobby-start').disabled)) && !(await a.evaluate(() => !!document.querySelector('#ko-seats .is-playing'))), 20_000),
  'with the match over nobody is tagged PLAYING and START NOW is awake');
await a.screenshot({ path: `${out}/room-again.png` });
await a.locator('#ko-lobby-start').click();
const again = await Promise.all([a, b].map(p => until('round two', async () => (await ko(p))?.match?.round === 2, 30_000)));
check(again.every(Boolean), 'START NOW walks both out into the room’s second match');
const [ra, rb] = [await ko(a), await ko(b)];
check(ra?.table === rb?.table && ra?.roomBalls === 0, 'a fresh match, the same on both phones', `${ra?.roomBalls} · ${ra?.table === rb?.table}`);

// 5. A phone that goes away. The first match's two pages are put away first: three renderers in software starve the one batting.
console.log('A phone that goes away');
await a.close(); await b.close();
const answer = await post('/api/challenge?knockout=1', { action: 'host', playerId: hostId, name: host, avatar: 1 });
const second = answer.match.code;
await post('/api/challenge?knockout=1', { action: 'join', code: second, playerId: goneId, name: gone, avatar: 4 });
const c = await as(hostId, host, 1, `&k=${second}`);
check(await until('lobby again', () => visible(c, '#knockout-lobby'), 15_000), 'the host back in a second match’s lobby');
await post('/api/challenge?knockout=1', { action: 'start', code: second, playerId: hostId, name: host, avatar: 1 });
check(await until('walk again', async () => !!(await ko(c))?.match, 15_000), 'the host walks out; the other phone never does');
const movedOn = await until('subbed', async () => ((await ko(c))?.roomBalls ?? 0) >= 6 || !!(await ko(c))?.done, 300_000, 1000);
check(movedOn, 'a sub bats out the quiet player’s over and the room moves on');
const after = await (await fetch(`${base}/api/challenge?knockout=1&code=${second}`)).json();
check(after.match.members.find(m => m.name === gone)?.card.startsWith('SSSSSS'), 'the store holds the sub’s balls in their seat', after.match.members.find(m => m.name === gone)?.card);

// 6. The host goes quiet: seat 0, the player's own seat in a practice room, which no sub ever batted there. The room on the
// other phone threw on the sub's first ball and stood still for good (the owner's phone and computer, 18 November 2026).
console.log('A host who goes away');
await c.close();
const third = (await post('/api/challenge?knockout=1', { action: 'host', playerId: goneId, name: gone, avatar: 4 })).match.code;
const d = await as(guestId, guest, 2, `&k=${third}&matchlog=1`);
check(await until('lobby three', () => visible(d, '#knockout-lobby'), 30_000), 'a guest in the quiet host’s lobby');
await post('/api/challenge?knockout=1', { action: 'start', code: third, playerId: goneId, name: gone, avatar: 4 });
check(await until('walk three', async () => !!(await ko(d))?.match, 15_000), 'the guest walks out; the host never does');
const pastHost = await until('host subbed', async () => ((await ko(d))?.roomBalls ?? 0) >= 6 || !!(await ko(d))?.done, 300_000, 1000);
check(pastHost, 'a sub bats the host’s over and the guest’s room moves on', await text(d, '#match-log'));
check(!(await text(d, '#match-log')).includes('ERROR'), 'and nothing threw on the way', await text(d, '#match-log'));
await d.screenshot({ path: `${out}/host-away.png` });

await d.close();
}

// 7. Out, with the match still going: BACK TO ROOM, where whoever is still batting is tagged PLAYING and the next match waits.
console.log('Out, and back to the room while the match goes on');
const api = (action, playerId, name, avatar, more = {}) => post('/api/challenge?knockout=1', { action, playerId, name, avatar, ...more });
const fourth = (await api('host', goneId, gone, 4)).match.code;
const e = await as(guestId, guest, 2, `&k=${fourth}`);
check(await until('lobby four', () => visible(e, '#knockout-lobby'), 30_000), 'a guest in the lobby');
await api('start', goneId, gone, 4, { code: fourth });
check(await until('walk four', async () => !!(await ko(e))?.match, 15_000), 'the guest walks out');
// The host bats on, by the script: a six every twelve seconds, so the match is still being played when the guest is out of it.
// (Heard from at once, and its first ball with it: a host last heard from in the lobby is away from the first ball, and a sub's.)
let hostBall = 0;
const hostBat = () => api('ball', goneId, gone, 4, { code: fourth, ball: hostBall, value: '6', round: 1 }).then(sent => { if (sent.match) hostBall = sent.match.members.find(m => m.name === gone)?.card.length ?? hostBall; }).catch(() => {});
await api('beat', goneId, gone, 4, { code: fourth });
await hostBat();
const hostBats = setInterval(() => { void hostBat(); }, 12_000);
// Nobody swings: the guest is knocked out sooner or later. The way back to the room is on the end screen, and only there:
// never over the game while they wait on a cut.
let inPlay = false;
const wayBack = () => e.evaluate(() => [...document.querySelectorAll('#ko-res-again, #ko-again')].find(el => el.getBoundingClientRect().height > 0)?.id ?? null);
const offered = await until('way back', async () => {
  if (await e.evaluate(() => [...document.querySelectorAll('button')].some(key => key.textContent?.trim() === 'BACK TO ROOM' && key.getBoundingClientRect().height > 0 && !key.closest('.ko-moment, #ko-results')))) inPlay = true;
  return !!(await wayBack());
}, 480_000, 1000);
check(offered, 'knocked out, the end screen has BACK TO ROOM', await text(e, '#ko-waiting'));
check(!inPlay, 'and it was never over the game while they waited');
// The host is still batting, as far as the room knows: heard from, and not back. And the match is not over for one
// player being out of it: a knocked-out phone once told the store it was, which ended it under everybody still batting.
await api('beat', goneId, gone, 4, { code: fourth });
const beats = setInterval(() => { void api('beat', goneId, gone, 4, { code: fourth }).catch(() => {}); }, 4000);
const mid = (await (await fetch(`${base}/api/challenge?knockout=1&code=${fourth}`)).json()).match;
check(mid.state === 'live' && mid.over === false && mid.round === 1, 'the match is still on for the host: nobody has called it over', JSON.stringify({ state: mid.state, over: mid.over, round: mid.round }));
// The room plays on, and can be watched as stories from the end screen, as a practice room's can (section 51).
const rung = await until('rings', () => e.evaluate(() => !document.getElementById('ko-rings')?.hidden && document.querySelectorAll('#ko-rings .ko-ring').length > 3
  && document.querySelector('#ko-card')?.textContent?.trim() === 'WATCH ON'), 30_000);
check(rung, 'the end screen has the rings of who is still in, and WATCH ON', `${await e.evaluate(() => `${document.querySelectorAll('#ko-rings .ko-ring').length} rings · ${document.querySelector('#ko-card')?.textContent?.trim()} · ${document.getElementById('ko-rings')?.outerHTML.slice(0, 200)}`)} ${JSON.stringify(await ko(e)).slice(0, 700)}`);
await e.screenshot({ path: `${out}/match-rings.png` });
await e.locator('#ko-card').click({ force: true });
check(await until('story', () => e.evaluate(() => document.body.classList.contains('ko-watch') && window.__cricket.knockout().watching !== null), 10_000), 'WATCH ON opens somebody’s game as a story');
// Whoever it opened on, a ball of somebody's is played on the ground: a seat with nothing new yet says it is waiting, and a swipe goes on.
let played = false;
for (let tries = 0; tries < 8 && !played; tries++) {
  played = await until('watched ball', async () => !!(await ko(e))?.watchBall?.shown, 45_000, 400);
  if (!played) await e.evaluate(() => window.__cricket.knockoutStep(1));
}
const story = await e.evaluate(() => ({ name: document.querySelector('.ko-watch-name')?.textContent, line: document.querySelector('.ko-watch-line')?.textContent }));
check(played && /off \d+ · \d+(st|nd|rd|th) of \d+/.test(story.line ?? ''), 'a ball of theirs is played on the ground, their line over it', JSON.stringify(story));
await e.screenshot({ path: `${out}/match-watching.png` });
const seat = (await ko(e)).watching;
await e.evaluate(() => window.__cricket.knockoutStep(1));
check(await until('swiped', async () => (await ko(e)).watching !== seat, 5000), 'a swipe goes to the next one along');
await e.locator('#ko-watch-close').click();
check(await until('closed', () => e.evaluate(() => !document.body.classList.contains('ko-watch') && window.__cricket.knockout().watching === null), 5000), '✕ goes back to the end screen');
await e.evaluate(() => [...document.querySelectorAll('#ko-res-again, #ko-again')].find(el => el.getBoundingClientRect().height > 0)?.click());
check(await until('room four', () => visible(e, '#knockout-lobby'), 20_000), 'BACK TO ROOM opens the room');
check(await until('playing', () => e.evaluate(() => document.querySelector('#ko-seats .ko-lseat.is-playing .ko-lseat-playing')?.textContent === 'PLAYING'), 10_000), 'the host, still batting, is tagged PLAYING');
check(await e.evaluate(() => document.getElementById('ko-lobby-ready').disabled) && (await text(e, '.ko-lobby-line')).includes('still batting'), 'and the next match waits for them', await text(e, '.ko-lobby-line'));
await e.screenshot({ path: `${out}/room-playing.png` });
// The match over, the room is its lobby again and the host starts the next one.
clearInterval(hostBats);
await api('done', goneId, gone, 4, { code: fourth, round: 1 });
check(await until('settled', () => e.evaluate(() => !document.querySelector('#ko-seats .is-playing') && !document.getElementById('ko-lobby-ready').disabled), 20_000), 'the match over, the tag goes and the room is a lobby again');
clearInterval(beats);
await api('back', goneId, gone, 4, { code: fourth });
await api('start', goneId, gone, 4, { code: fourth });
check(await until('round two again', async () => (await ko(e))?.match?.round === 2, 30_000), 'and the host’s next START walks the guest out again');
await e.close();

// 8. An invite reaches a phone wherever it is: here on the cover, where nothing used to ask.
console.log('An invite, off Choose a mode');
const { createHash } = await import('node:crypto');
const f = await as(passerId, passer, 3);
const fifth = (await api('host', goneId, gone, 4)).match.code;
await api('invite', goneId, gone, 4, { code: fifth, handle: createHash('sha256').update(`hitman-handle:${passerId}`).digest('hex').slice(0, 16) });
// (An earlier invite of theirs may still stand, and is told first: the one waited for is this one's.)
check(await until('banner', async () => (await text(f, '#ko-invite')).includes(`${gone} invited you`), 40_000), 'a banner on the cover says who invited them, with JOIN', await text(f, '#ko-invite'));
await f.screenshot({ path: `${out}/invite-banner.png` });
await f.locator('#ko-invite-join').click();
check(await until('joined', () => visible(f, '#knockout-lobby'), 30_000), 'JOIN lands them in the room');
check((await text(f, '#ko-lobby-code')).replace(/\s/g, '') === fifth, 'the room they were asked into', await text(f, '#ko-lobby-code'));
// And one not answered is listed at the head of Play with friends.
const sixth = (await api('host', hostId, host, 1)).match.code;
await api('invite', hostId, host, 1, { code: sixth, handle: createHash('sha256').update(`hitman-handle:${passerId}`).digest('hex').slice(0, 16) });
await f.locator('#ko-lobby-back').click();
check(await until('listed', async () => (await text(f, '#ko-friends-invites')).includes(`${host} invited you`), 20_000), 'an invite is listed on Play with friends, with JOIN', await text(f, '#ko-friends-invites'));
await f.screenshot({ path: `${out}/invite-listed.png` });

for (const page of pages) check(page.errors.length === 0, 'nothing in the console', page.errors.join(' | '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
