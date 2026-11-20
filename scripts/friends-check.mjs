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
check(await a.evaluate(() => document.querySelectorAll('#ko-seats .ko-lseat[data-handle]').length === 1 && document.querySelectorAll('#ko-seats .ko-lseat.is-invite').length === 1
  && document.querySelectorAll('#ko-seats .ko-lseat').length === 2 && document.querySelector('#ko-seats .ko-lseat.is-you .ko-lseat-sub')?.textContent === 'Host'),
  'only who is in is drawn: the host, and one Invite tile after them');
await a.locator('#ko-lobby-around [data-invite]', { hasText: passer }).click();
check(await until('sent', () => a.locator('#ko-lobby-around [data-invite]', { hasText: passer }).evaluate(el => el.classList.contains('is-sent') && el.disabled && el.textContent.includes('✓')), 8000), 'a tap on their chip asks them in, and the chip says it went');
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
check((await text(b, '#ko-lobby-note')) === `${host} is waiting for you to be ready` && await visible(b, '#ko-lobby-ready'), 'the guest is told the host is waiting for them, and has I’M READY', await text(b, '#ko-lobby-note'));
// Everybody ready before the start (Figma section 56): with a friend in who has not said so, START NOW still sleeps, the
// room says who it is waiting for, and the store turns a START away. The owner started one from the computer while the
// phone had not said I'M READY.
const waitingFor = await a.evaluate(() => ({ start: document.getElementById('ko-lobby-start').disabled, line: document.getElementById('ko-lobby-note')?.textContent,
  tag: document.querySelector('#ko-seats .ko-lseat.is-not-ready .ko-lseat-sub')?.textContent, nudge: !document.getElementById('ko-lobby-nudge')?.classList.contains('hidden'),
  bar: !!document.getElementById('ko-lobby-bar') }));
check(waitingFor.start && waitingFor.line === `Waiting for ${guest}` && waitingFor.tag === 'Not ready' && waitingFor.nudge && !waitingFor.bar,
  'a friend in and not ready: START NOW sleeps, Not ready under their name, and the one line names them, with NUDGE', JSON.stringify(waitingFor));
const early = await post('/api/challenge?knockout=1', { action: 'start', code, playerId: hostId, name: host, avatar: 1 });
check(early.status === 409 && early.error === `Waiting for ${guest} to be ready.`, 'and the store turns a START away, saying who it waits for', JSON.stringify(early));
await a.screenshot({ path: `${out}/lobby-waiting.png` });
// A tap on their seat is the host's sheet: NUDGE, and REMOVE FROM MATCH.
await a.locator('#ko-seats .ko-lseat.is-not-ready').first().click();
const sheet = await a.evaluate(() => ({ up: !document.getElementById('ko-seat-sheet').classList.contains('hidden'), title: document.getElementById('ko-sheet-title')?.textContent,
  nudge: document.getElementById('ko-sheet-nudge')?.textContent?.trim(), remove: document.getElementById('ko-sheet-remove')?.textContent?.trim(), line: document.getElementById('ko-sheet-line')?.textContent }));
check(sheet.up && sheet.title === `${guest.toUpperCase()} ISN’T READY` && sheet.nudge === `NUDGE ${guest.toUpperCase()}` && sheet.remove === 'REMOVE FROM MATCH' && /^In the room for \d+:\d\d/.test(sheet.line ?? ''),
  'a tap on their seat opens the host’s sheet: NUDGE and REMOVE FROM MATCH', JSON.stringify(sheet));
await a.screenshot({ path: `${out}/lobby-sheet.png`, animations: 'disabled' });
await a.locator('#ko-sheet-nudge').click();
check(await until('nudged', () => b.evaluate(who => !document.getElementById('ko-nudge').classList.contains('hidden') && document.getElementById('ko-nudge-title').textContent === `${who} is waiting for you`, host), 10_000),
  'the nudge reaches the guest’s phone as a banner');
check(await a.evaluate(() => document.getElementById('ko-seat-sheet').classList.contains('hidden') && document.getElementById('ko-lobby-nudge').textContent === 'NUDGED ✓'), 'and the host’s NUDGE says it went');
await b.screenshot({ path: `${out}/lobby-nudged.png`, animations: 'disabled' });
await b.locator('#ko-lobby-ready').click();
check(await until('tick', () => a.evaluate(() => { const seat = document.querySelector('#ko-seats .ko-lseat.is-ready:not(.is-you)'); return !!seat?.querySelector('.ko-lseat-tick') && seat.querySelector('.ko-lseat-sub')?.textContent === 'Ready'; }), 8000),
  'the host sees the guest’s tick, and Ready under their name');
// The room is clean and fits: no sideways drag, nothing under the keys, and the faces have room (the owner found the first
// cut cluttered and the players cramped, 19 November 2026).
const roomy = await a.evaluate(() => { const s = document.querySelector('#knockout-lobby .ko-scroll'), keys = document.querySelector('#knockout-lobby .ko-keys-pair').getBoundingClientRect();
  const parts = [...document.querySelectorAll('#knockout-lobby .ko-lobby-body > :not(.hidden)')], last = parts[parts.length - 1].getBoundingClientRect();
  const face = document.querySelector('#ko-seats .ko-lseat-face').getBoundingClientRect(), u = document.getElementById('knockout-lobby').getBoundingClientRect().width / 402;
  const box = document.getElementById('knockout-lobby').getBoundingClientRect();
  const wide = Math.max(...parts.map(el => el.getBoundingClientRect().right)) - box.right;
  return { sideways: Math.round(wide), drag: s.scrollHeight - s.clientHeight, clear: Math.round(keys.top - last.bottom), face: Math.round(face.width / u) }; });
check(roomy.sideways <= 0 && roomy.drag <= 0 && roomy.clear >= 0 && roomy.face >= 64, 'the room fits the screen with nothing under the keys, and the faces are big', JSON.stringify(roomy));
check(await until('ready key', () => b.evaluate(() => document.getElementById('ko-lobby-ready').classList.contains('is-ready') && document.getElementById('ko-nudge').classList.contains('hidden')), 8000), 'the guest’s key says READY ✓ and the banner goes');
await b.screenshot({ path: `${out}/lobby-guest.png` });

// 4. START NOW, and the match batted on both phones.
console.log('Batting together');
check(await until('awake', () => a.evaluate(() => !document.getElementById('ko-lobby-start').disabled && document.getElementById('ko-lobby-note')?.textContent.startsWith('Everybody’s ready') && document.getElementById('ko-lobby-note').classList.contains('is-good')), 8000), 'START NOW wakes once everybody is ready, and the line says so in green');
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
let [ka, kb] = [await ko(a), await ko(b)];
check(ka?.left === 12 && kb?.left === 12, 'twelve seats, the empty ten subs');
// Looked at together, and again if one phone was a ball on from the other between the two looks (a slow renderer).
const sameRoom = await until('same room', async () => { [ka, kb] = await Promise.all([ko(a), ko(b)]); return !!ka && ka.table === kb?.table; }, 20_000, 300);
check(sameRoom, 'the same room on both phones at the start', `${ka?.table}\n        ${kb?.table}`);
// Through the first over: somebody waits on the other at its end.
let held = false, outEarly = false, ranAhead = false;
const firstOver = await until('over 1', async () => {
  const [x, y] = [await ko(a), await ko(b)];
  // Remembered by the game (`held`), since two phones can finish the over close enough that a look every 0.4s misses it.
  if (x?.match?.held || y?.match?.held) held = true;
  // A phone bowled to in the second over before the first one's cut has landed did not wait when it had to.
  for (const k of [x, y]) if (k?.match && !k.match.out && k.match.batted > 6 && k.roomBalls < 6) ranAhead = true;
  return x && y && x.roomBalls >= 6 && y.roomBalls >= 6;
}, 240_000, 400);
// (If not: what each phone and the store say, and the guest's own log line with its picture's pace, so a phone starved of
// frames can be told from one that stopped.)
check(firstOver, 'both phones bat the first over and the cut lands on both', firstOver ? '' : JSON.stringify({
  host: await a.evaluate(() => { const k = window.__cricket.knockout(), s = window.__cricket.snapshot(); return { phase: s.phase, roomBalls: k?.roomBalls, match: k?.match, table: k?.table }; }),
  guest: await b.evaluate(() => { const k = window.__cricket.knockout(), s = window.__cricket.snapshot(); return { phase: s.phase, roomBalls: k?.roomBalls, match: k?.match, table: k?.table }; }),
  store: (m => ({ state: m?.state, round: m?.round, members: m?.members.map(x => `${x.name}:${x.card}:quiet ${x.quiet}:idle ${x.idle}`) }))((await (await fetch(`${base}/api/challenge?knockout=1&code=${code}`)).json()).match),
  log: await text(b, '#match-log'), errors: [a.errors, b.errors] }));
// Out, a phone waits for nobody at the crease: its end screen comes at once. Nobody swings and the balls are the same on
// both phones, so both are often out on the same one; with only subs left the room is then played to its end there and
// then, so the end screen is all there is to see of it (no rings: nobody is left to watch).
const through = !held && !(await Promise.all([a, b].map(p => p.evaluate(() => !!window.__cricket.knockout()?.match?.out)))).some(Boolean);
if (!held && !through) outEarly = await until('end screen', async () => (await Promise.all([a, b].map(p => p.evaluate(() => !!document.getElementById('ko-moment') && !!window.__cricket.knockout()?.match?.out)))).some(Boolean), 240_000, 400);
// (Minutes, not seconds: the end screen comes when the wicket's ball is done with on the game's clock, and two pages drawn in
// software at a frame a second each take most of a minute over that.)
// Nobody swings, so which it is goes by the bowling: through the over not out, the pill; out in it, the end screen.
// Or neither: both through the over inside one answer of the store's, so nobody was first and nobody had to wait. Then
// what is held is that neither was bowled to again before the cut.
check(held || outEarly || (through && !ranAhead), `the phone through first waited at the over’s end with the pill up, or was out and went to its end screen (${held ? 'the pill' : outEarly ? 'out' : 'both through together'})`, JSON.stringify({ held, outEarly, through, ranAhead,
  phones: await Promise.all([a, b].map(p => p.evaluate(() => { const k = window.__cricket.knockout(), s = window.__cricket.snapshot(); return { phase: s.phase, roomBalls: k?.roomBalls, pending: k?.pending, finished: k?.finished, done: k?.done, match: k?.match, you: k?.you && { out: k.you.out, place: k.you.place, played: k.you.played },
    moment: !!document.getElementById('ko-moment'), anyMoment: document.querySelector('.ko-moment')?.id ?? null, results: !!document.getElementById('ko-results'), table: k?.table }; }))) }));
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
// (The count says MATCH ON while the match is still being played under the room, as it is when subs are still batting it.)
check((await text(a, '#ko-lobby-code')).replace(/\s/g, '') === code && await a.evaluate(() => document.querySelectorAll('#ko-seats .ko-lseat[data-handle]').length) === 2
  && /^(2 OF 12 IN|MATCH ON)/.test(await text(a, '#ko-lobby-count')), 'the same room: its code, and both still in it', `${await text(a, '#ko-lobby-code')} · ${await text(a, '#ko-lobby-count')}`);
const before = { key: await againKey(b), ko: await ko(b), store: (await (await fetch(`${base}/api/challenge?knockout=1&code=${code}`)).json()).match };
await pressAgain(b);
const guestBack = await until('guest room', () => visible(b, '#knockout-lobby'), 20_000);
check(guestBack, 'the guest is back in the room', guestBack ? '' : JSON.stringify({
  key: before.key, was: { pending: before.ko?.pending, finished: before.ko?.finished, done: before.ko?.done, ending: before.ko?.ending, results: before.ko?.results, match: before.ko?.match },
  store: { state: before.store?.state, round: before.store?.round, over: before.store?.over, busy: before.store?.busy, members: before.store?.members.map(m => `${m.name}:${m.playing ? 'playing' : m.back ? 'back' : 'in'}:${m.card.length}`) },
  now: await ko(b), phase: await phase(b), waiting: await text(b, '#ko-waiting'), keyNow: await againKey(b), errors: b.errors,
  screens: await b.evaluate(() => ['ko-moment', 'ko-results', 'knockout-lobby', 'knockout-friends', 'knockout-home', 'modes', 'end'].map(id => { const el = document.getElementById(id); return `${id}:${!el ? 'none' : el.classList.contains('hidden') ? 'hidden' : 'up'}`; }).join(' ')),
  notice: await b.evaluate(() => [...document.querySelectorAll('.notice, #notice, .toast, [role="status"]')].map(el => el.textContent?.trim()).filter(Boolean).join(' | ').slice(0, 300)) }));
// Every match asks again: the guest says I'M READY for the next one, and only then does START NOW wake.
check(await until('asked again', () => b.evaluate(() => { const key = document.getElementById('ko-lobby-ready'); return !key.classList.contains('hidden') && !key.disabled && !key.classList.contains('is-ready'); }), 30_000),
  'with the match over the guest is not ready again, and has I’M READY');
check(await a.evaluate(() => document.getElementById('ko-lobby-start').disabled), 'and START NOW sleeps until they say so');
await b.locator('#ko-lobby-ready').click();
check(await until('lobby again', async () => !(await a.evaluate(() => document.getElementById('ko-lobby-start').disabled)) && !(await a.evaluate(() => !!document.querySelector('#ko-seats .is-playing'))), 20_000),
  'ready again, nobody is tagged PLAYING and START NOW is awake');
await a.screenshot({ path: `${out}/room-again.png` });
await a.locator('#ko-lobby-start').click();
const again = await Promise.all([a, b].map(p => until('round two', async () => (await ko(p))?.match?.round === 2, 30_000)));
check(again.every(Boolean), 'START NOW walks both out into the room’s second match');
const [ra, rb] = [await ko(a), await ko(b)];
check(ra?.table === rb?.table && ra?.roomBalls === 0, 'a fresh match, the same on both phones', `${ra?.roomBalls} · ${ra?.table === rb?.table}`);

if (process.env.ONLY === 'match') { await browser.close(); console.log(failures ? `\n${failures} failed` : '\nall passed'); process.exit(failures ? 1 : 0); }
// 5. A phone that goes away. The first match's two pages are put away first: three renderers in software starve the one batting.
console.log('A phone that goes away');
await a.close(); await b.close();
const answer = await post('/api/challenge?knockout=1', { action: 'host', playerId: hostId, name: host, avatar: 1 });
const second = answer.match.code;
await post('/api/challenge?knockout=1', { action: 'join', code: second, playerId: goneId, name: gone, avatar: 4 });
await post('/api/challenge?knockout=1', { action: 'ready', code: second, ready: true, playerId: goneId, name: gone, avatar: 4 });
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
await post('/api/challenge?knockout=1', { action: 'ready', code: third, ready: true, playerId: guestId, name: guest, avatar: 2 });
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
await api('ready', guestId, guest, 2, { code: fourth, ready: true });
await api('start', goneId, gone, 4, { code: fourth });
check(await until('walk four', async () => !!(await ko(e))?.match, 15_000), 'the guest walks out');
// The host bats on, by the script: a six every eighteen seconds (slower than the guest is bowled to, so a guest out in an over is out before its cut), so the match is still being played when the guest is out of it.
// (Heard from at once, and its first ball with it: the script is no phone, so nothing checks in for the host but this.)
let hostBall = 0;
const hostBat = () => api('ball', goneId, gone, 4, { code: fourth, ball: hostBall, value: '6', round: 1 }).then(sent => { if (sent.match) hostBall = sent.match.members.find(m => m.name === gone)?.card.length ?? hostBall; }).catch(() => {});
await api('beat', goneId, gone, 4, { code: fourth });
await hostBat();
const hostBats = setInterval(() => { void hostBat(); }, 18_000);
// Nobody swings: the guest is knocked out sooner or later. The way back to the room is on the end screen, and only there:
// never over the game while they wait on a cut.
let inPlay = false, early = null, pill = '';
const wayBack = () => e.evaluate(() => [...document.querySelectorAll('#ko-res-again, #ko-again')].find(el => el.getBoundingClientRect().height > 0)?.id ?? null);
const offered = await until('way back', async () => {
  if (await e.evaluate(() => [...document.querySelectorAll('button')].some(key => key.textContent?.trim() === 'BACK TO ROOM' && key.getBoundingClientRect().height > 0 && !key.closest('.ko-moment, #ko-results')))) inPlay = true;
  // Out, the waiting pill never says so over the pitch: the end screen is what comes.
  const waiting = await visible(e, '#ko-waiting') ? await text(e, '#ko-waiting') : '';
  if (/^OUT ON/.test(waiting)) pill = waiting;
  const back = await wayBack();
  // Out before the cut has fallen: the end screen is up with the room not yet done with them, stamped OUT. (Read as the
  // screen goes up, before its keys have landed: a cut can fall in those three seconds.)
  if (early === null && await e.evaluate(() => !!document.getElementById('ko-moment'))) { const now = await ko(e); early = { pending: now.pending, finished: now.finished, out: now.match?.out, batted: now.match?.batted, roomBalls: now.roomBalls, table: now.table, stamp: await e.evaluate(() => document.getElementById('ko-moment')?.dataset.pending ?? null) }; }
  return !!back;
}, 480_000, 500);
check(offered, 'out, the end screen has BACK TO ROOM', await text(e, '#ko-waiting'));
check(!inPlay, 'and it was never over the game while they waited');
check(!pill, 'out, nothing waits at the crease: no OUT ON pill over the pitch', pill);
// Bowled before the over's cut (nobody swings, so nearly always), the glass and the end screen come at once and the place lands on it
// with the cut; cut without being out, the end screen comes with its place as ever.
if (early?.out && early.pending) {
  check(early.stamp === '1' && !early.finished, 'out before the cut, the end screen is up at once, stamped OUT', JSON.stringify(early));
  // The cut waits for everybody through the over, and the script's host is a ball every eighteen seconds: a guest who lasted
  // into a later over was out a hundred balls' wait ahead of it, and the place did not land inside the check's patience.
  // The host is batted to the end of the over the guest went in, then left to its pace.
  for (const upTo = Math.min(30, Math.ceil(Math.max(1, early.batted ?? 1) / 6) * 6); hostBall < upTo;) { const was = hostBall; await hostBat(); if (hostBall === was) break; }
  const landed = await until('place', () => e.evaluate(() => { const m = document.getElementById('ko-moment'); return !m || (m.dataset.pending === '0' && Number(m.dataset.place) > 1); }), 240_000, 500);
  const after = await ko(e);
  check(landed && after.finished && !after.pending, 'and the cut stamps the place on it', JSON.stringify({ place: await e.evaluate(() => document.getElementById('ko-moment')?.dataset.place ?? null), finished: after.finished, you: after.you.place }));
  check(await e.evaluate(place => { const m = document.getElementById('ko-moment'); return !!m && Number(m.dataset.place) === place && (m.getAttribute('aria-label') ?? '').startsWith('Knocked out'); }, after.you.place), 'the place it says is the room’s', await e.evaluate(() => document.getElementById('ko-moment')?.getAttribute('aria-label')));
  await e.screenshot({ path: `${out}/match-out-settled.png` });
} else console.log(`  (the guest was ${early?.out ? 'out and placed by the same answer' : 'cut without being out'}: the early end screen was not walked) ${JSON.stringify(early)}`);
// The host is still batting, as far as the room knows: heard from, and not back. And the match is not over for one
// player being out of it: a knocked-out phone once told the store it was, which ended it under everybody still batting.
await api('beat', goneId, gone, 4, { code: fourth });
const beats = setInterval(() => { void api('beat', goneId, gone, 4, { code: fourth }).catch(() => {}); }, 4000);
const mid = (await (await fetch(`${base}/api/challenge?knockout=1&code=${fourth}`)).json()).match;
check(mid.state === 'live' && mid.over === false && mid.round === 1, 'the match is still on for the host: nobody has called it over', JSON.stringify({ state: mid.state, over: mid.over, round: mid.round }));
// The room plays on, and can be watched as stories from the end screen, as a practice room's can (section 51).
const rung = await until('rings', () => e.evaluate(() => !document.getElementById('ko-rings')?.hidden && document.querySelectorAll('#ko-rings .ko-ring').length > 3
  && document.querySelector('#ko-card')?.textContent?.trim() === 'LEADERBOARD'), 30_000);
check(rung, 'the end screen has the rings of who is still in, and LEADERBOARD', `${await e.evaluate(() => `${document.querySelectorAll('#ko-rings .ko-ring').length} rings · ${document.querySelector('#ko-card')?.textContent?.trim()} · ${document.getElementById('ko-rings')?.outerHTML.slice(0, 200)}`)} ${JSON.stringify(await ko(e)).slice(0, 700)}`);
await e.screenshot({ path: `${out}/match-rings.png` });
// LEADERBOARD: the match as it stands, on the boards' own screen, while it is still being played. Out early, there was
// the scorecard and the way back to the room, and no way to see where everybody stood.
await e.locator('#ko-card').click({ force: true });
const stood = await until('standings', () => e.evaluate(() => document.querySelector('#ko-res-title')?.textContent === 'LEADERBOARD' && / leads$/.test(document.querySelector('#ko-results .lb-banner b')?.textContent ?? '')
  && document.querySelectorAll('#ko-results .lb-row, #ko-results .lb-step').length === 12 && document.getElementById('ko-res-again')?.textContent?.trim() === 'BACK TO ROOM'), 10_000);
check(stood, 'LEADERBOARD opens the match as it stands: who leads, all twelve, and BACK TO ROOM', await e.evaluate(() => document.getElementById('ko-results')?.textContent?.replace(/\s+/g, ' ').slice(0, 300)));
await e.screenshot({ path: `${out}/match-standings.png` });
await e.locator('#ko-res-close').click();
check(await until('standings closed', () => e.evaluate(() => !document.getElementById('ko-results') && !!document.getElementById('ko-moment')), 5000), 'and back is the end screen');
// A ring is the way to watch.
await e.locator('#ko-rings .ko-ring:not(.is-out)').first().click({ force: true });
check(await until('story', () => e.evaluate(() => document.body.classList.contains('ko-watch') && window.__cricket.knockout().watching !== null), 10_000), 'a ring opens somebody’s game as a story');
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
// A reaction from the tray goes to the friend watched, by way of the store; and one sent to this player shows on their phone.
// (They only floated where they were sent from: with subs there was nobody to tell, and a friend never saw them.)
await e.evaluate(() => window.__cricket.knockoutWatch(0));
check(await until('on the host', async () => (await ko(e)).watching === 0, 5000), 'the host’s game is watched');
await e.locator('.ko-watch-tray [data-react="🔥"]').click({ force: true });
const matchNow = async () => (await (await fetch(`${base}/api/challenge?knockout=1&code=${fourth}`)).json()).match;
check(await until('reaction stored', async () => { const m = await matchNow(); return m.reactions.some(rx => rx.from === guest && rx.emoji === '🔥' && rx.to === m.host); }, 8000),
  'a reaction from the tray reaches the store for the friend watched', JSON.stringify((await matchNow()).reactions));
const guestHandle = (await matchNow()).members.find(m => m.name === guest).handle;
await api('react', goneId, gone, 4, { code: fourth, to: guestHandle, emoji: '😂' });
const floated = await until('reaction shown', () => e.evaluate(who => [...document.querySelectorAll('.ko-rx')].some(el => el.textContent.includes(who) && el.textContent.includes('😂')), gone), 10_000, 100);
check(floated, 'and one sent to this player floats up on their phone, with who sent it');
if (floated) await e.screenshot({ path: `${out}/match-reaction.png` });
// The side in the field keeps its kit through the batter watched: dressed again every ball, it changed shirts between balls.
// (Read once a ball of the host's is staged: that is when the batter is dressed as them.)
await until('a ball of the host’s', async () => { const ball = (await ko(e)).watchBall; return !!ball && ball.seat === 0 && !ball.shown; }, 45_000, 200);
const sideKit = await e.evaluate(() => window.__cricket.snapshot().fieldingKit);
await until('shown', async () => { const ball = (await ko(e)).watchBall; return !!ball && ball.seat === 0 && ball.shown; }, 45_000, 200);
await until('and the one after', async () => { const ball = (await ko(e)).watchBall; return !!ball && ball.seat === 0 && !ball.shown; }, 45_000, 200);
const sideAfter = await e.evaluate(() => ({ kit: window.__cricket.snapshot().fieldingKit, seat: window.__cricket.knockout().watching }));
check(sideAfter.seat !== 0 || sideAfter.kit === sideKit, 'the fielding side wears one kit through the batter watched', JSON.stringify({ sideKit, sideAfter }));
await e.locator('#ko-watch-close').click();
check(await until('closed', () => e.evaluate(() => !document.body.classList.contains('ko-watch') && window.__cricket.knockout().watching === null), 5000), '✕ goes back to the end screen');
await e.evaluate(() => [...document.querySelectorAll('#ko-res-again, #ko-again')].find(el => el.getBoundingClientRect().height > 0)?.click());
check(await until('room four', () => visible(e, '#knockout-lobby'), 20_000), 'BACK TO ROOM opens the room', JSON.stringify({ ko: await ko(e), waiting: await text(e, '#ko-waiting') }).slice(0, 600));
check(await until('playing', () => e.evaluate(() => /batting$/i.test(document.querySelector('#ko-seats .ko-lseat.is-playing .ko-lseat-sub')?.textContent ?? '')), 10_000), 'the host, still batting, is said to be batting');
// Watching from the room (Figma section 57): the match is kept under the room, so the room says how it stands, the host's
// seat wears the story ring with their score, everybody still in is a ring where AROUND NOW was, and the hero key is WATCH.
const roomOn = await e.evaluate(() => ({ count: document.getElementById('ko-lobby-count')?.textContent, line: document.getElementById('ko-lobby-note')?.textContent,
  seat: document.querySelector('#ko-seats .ko-lseat.is-watch .ko-lseat-name')?.textContent?.trim(), score: document.querySelector('#ko-seats .ko-lseat.is-watch .ko-lseat-sub')?.textContent,
  you: document.querySelector('#ko-seats .ko-lseat.is-you .ko-lseat-sub')?.textContent, invite: document.querySelectorAll('#ko-seats .ko-lseat.is-invite').length,
  rings: document.querySelectorAll('#ko-lobby-rings .ko-ring').length, watch: !document.getElementById('ko-lobby-watch').classList.contains('hidden'), ready: document.getElementById('ko-lobby-ready').classList.contains('hidden'),
  around: document.getElementById('ko-lobby-aroundwrap').classList.contains('hidden'), moment: document.getElementById('ko-moment') ? getComputedStyle(document.getElementById('ko-moment')).visibility : 'gone' }));
check(/^MATCH ON · (OVER \d|THE FINAL)$/.test(roomOn.count ?? '') && /^\d+ still in · tap a face to watch$/.test(roomOn.line ?? '') && roomOn.seat === gone && /^\d+\* · batting$/.test(roomOn.score ?? '') && /^Out/.test(roomOn.you ?? '')
  && roomOn.rings > 3 && roomOn.watch && roomOn.ready && roomOn.around && !roomOn.invite && roomOn.moment !== 'visible',
  'the room says the match is on: the host’s face in the story ring with their score, yours Out, the rings and WATCH', JSON.stringify(roomOn));
await e.screenshot({ path: `${out}/room-playing.png` });
check(await e.evaluate(() => document.querySelector('#knockout-lobby .ko-coderow').classList.contains('hidden')), 'and the code steps aside while the match is on');
// A tap on the host's seat opens their game as a story, and ✕ is the room.
await e.locator('#ko-seats .ko-lseat.is-watch').first().click();
check(await until('story from room', () => e.evaluate(() => document.body.classList.contains('ko-watch') && window.__cricket.knockout().watching === 0 && document.getElementById('knockout-lobby').classList.contains('hidden')), 10_000),
  'a tap on their seat opens their game as a story, from the room');
check(await until('a ball from the room', async () => !!(await ko(e)).watchBall, 30_000, 300), 'and a ball of theirs is played on the ground');
await e.screenshot({ path: `${out}/room-watching.png` });
await e.locator('#ko-watch-close').click();
check(await until('room again', () => e.evaluate(() => !document.body.classList.contains('ko-watch') && !document.getElementById('knockout-lobby').classList.contains('hidden') && window.__cricket.knockout().watching === null), 8000),
  '✕ goes back to the room, not the end screen');
// A ring in the strip does the same; and LEADERBOARD is the match as it stands, over the room.
await e.locator('#ko-lobby-rings .ko-ring:not(.is-out)').first().click({ force: true });
check(await until('ring from room', () => e.evaluate(() => document.body.classList.contains('ko-watch') && window.__cricket.knockout().watching !== null), 10_000), 'a ring in the strip opens that player’s game');
await e.locator('#ko-watch-close').click();
await until('room once more', () => visible(e, '#knockout-lobby'), 8000);
await e.locator('#ko-lobby-board').click();
check(await until('board from room', () => e.evaluate(() => document.querySelector('#ko-res-title')?.textContent === 'LEADERBOARD' && document.getElementById('ko-results').classList.contains('is-live')), 8000), 'LEADERBOARD in the room is the match as it stands');
await e.locator('#ko-res-close').click();
check(await until('board closed', () => e.evaluate(() => !document.getElementById('ko-results') && !document.getElementById('knockout-lobby').classList.contains('hidden')), 5000), 'and back is the room');
// The match over, the room is its lobby again and the host starts the next one.
clearInterval(hostBats);
await api('done', goneId, gone, 4, { code: fourth, round: 1 });
check(await until('settled', () => e.evaluate(() => { const key = document.getElementById('ko-lobby-ready'); return !document.querySelector('#ko-seats .is-playing') && !key.classList.contains('hidden') && !key.disabled
  && document.getElementById('ko-lobby-watch').classList.contains('hidden') && /OF 12 IN$/.test(document.getElementById('ko-lobby-count').textContent) && !document.getElementById('ko-moment'); }), 30_000),
  'the match over, the tags and the rings go, the match under the room is let go and the room is a lobby again');
const after = await e.evaluate(() => ({ last: !document.getElementById('ko-lobby-last').classList.contains('hidden'), title: document.getElementById('ko-last-title')?.textContent,
  code: !document.querySelector('#knockout-lobby .ko-coderow').classList.contains('hidden'), around: document.getElementById('ko-lobby-aroundwrap').classList.contains('hidden'),
  sub: document.querySelector('#ko-seats .ko-lseat.is-you .ko-lseat-sub')?.textContent }));
// (The card for the match just ended needs the room's own winner, and the script ends this one by telling the store it is
// over: where the card is up, it has taken Around now's place.)
check(after.code && after.sub === 'Not ready' && (!after.last || (/WON IT$/.test(after.title ?? '') && after.around)), 'the code is back and everybody is not ready again', JSON.stringify(after));
await e.screenshot({ path: `${out}/room-after.png` });
clearInterval(beats);
await api('back', goneId, gone, 4, { code: fourth });
await e.locator('#ko-lobby-ready').click();
await until('ready for two', async () => (await matchNow()).members.find(m => m.name === guest)?.ready === true, 8000);
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
