/**
 * Watching a match with friends from the room on a phone that never batted it
 * (`spectate` in `src/Game.ts`), N WATCHING, and Super Knockout on another
 * player's profile.
 *
 * One browser, against the dev server: two players made through the API host
 * a match, start it and bat it ball by ball (a ball is one POST), and the
 * browser's player opens the match's link while it is on. Nobody in the
 * browser bats, so it does not lean on how fast this machine draws.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/spectate-check.mjs http://127.0.0.1:5201
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, ''), out = process.argv[3] ?? 'test-results/spectate';
await mkdir(out, { recursive: true });
let failures = 0;
const check = (ok, what, detail) => { console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`); if (!ok) failures++; };
const letters = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const post = async (path, body) => (await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
const get = async path => (await fetch(`${base}${path}`)).json();
// New letters each run: a name with a number on it is a sibling of the last run's for a day.
const run = letters(3);
const players = [];
for (const [i, n] of ['Kabir', 'Riya', 'Meera'].entries()) {
  const name = `${n}${run}`, playerId = `${name.toLowerCase()}-${letters(12)}`;
  const claimed = await post('/api/name', { playerId, name, avatar: i });
  if (claimed.error) throw new Error(claimed.error);
  players.push({ playerId, name, avatar: i });
}
const [k, r, m] = players;
const api = (action, p, more = {}) => post('/api/challenge?knockout=1', { action, ...p, ...more });
const bat = async (p, code, ball, value, round) => { const a = await api('ball', p, { code, ball, value, round }); if (a.error) console.log(`        (ball ${ball} of ${p.name}'s turned away: ${a.error})`); return a; };

// A match played to its end first, so Kabir has a Knockout career for the profile.
{
  const code = (await api('host', k)).match.code;
  await api('join', r, { code }); await api('ready', r, { code, ready: true });
  await api('start', k, { code });
  for (let b = 0; b < 30; b++) await bat(k, code, b, '6', 1);
  await bat(r, code, 0, 'W', 1);
  const done = await api('done', k, { code, round: 1 });
  check(done.match?.over === true, 'a match batted through the API is over on the store\'s own replay', JSON.stringify(done).slice(0, 200));
}

// The match to be watched: started, an over and a bit batted, both phones still checking in.
const code = (await api('host', k)).match.code;
await api('join', r, { code }); await api('ready', r, { code, ready: true });
const started = await api('start', k, { code });
check(started.ok !== false && started.match?.state === 'live', 'the match to watch is on', JSON.stringify(started).slice(0, 200));
let kb = 0, rb = 0;
for (; kb < 8; kb++) await bat(k, code, kb, '46'[kb % 2], 1);
for (; rb < 7; rb++) await bat(r, code, rb, '21'[rb % 2], 1);
const beat = setInterval(() => { void api('beat', k, { code }); void api('beat', r, { code }); }, 4000);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(([id, who, kit]) => {
  localStorage.setItem('hitman-player', id);
  localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
  localStorage.setItem('hitman-shots-intro', 'done'); localStorage.setItem('hitman-keeper-intro', 'done'); localStorage.setItem('hitman-profile', '1');
  localStorage.setItem('hitman-whatsnew', 'rivals:9,diwali:9,cams:9'); localStorage.setItem('hitman-knockout-rules', '1');
  localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: kit }));
}, [m.playerId, m.name, m.avatar]);
const snap = name => page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled', timeout: 30000 }).catch(e => console.log(`  (no picture of ${name}: ${e.message.split('\n')[0]})`));
const room = () => page.evaluate(() => window.__cricket.knockout?.() ?? null);

// 1. The link while the match is on: the room, with the match kept under it to be watched.
await page.goto(`${base}/?debug=1&private=0&k=${code}`, { waitUntil: 'load' });
await page.waitForSelector('#knockout-lobby:not(.hidden)', { timeout: 120_000 });
await page.addStyleTag({ content: '#debug{display:none!important}' });
await page.waitForFunction(() => window.__cricket.knockout?.()?.roomOn, null, { timeout: 60_000 }).catch(() => {});
let ko = await room();
check(!!ko && ko.you.id === -1 && ko.finished && !ko.done && ko.match?.code === code, 'a phone that joins while the match is on builds its room, with no seat of its own', JSON.stringify(ko).slice(0, 300));
check(!!ko && ko.rings.length >= 8 && /Kabir/.test(ko.table) && /:40\//.test(ko.table), 'the room stands where the store\'s cards put it', ko?.table);
await page.waitForTimeout(1500);
const lobby = await page.evaluate(() => ({
  head: document.querySelector('#knockout-lobby h2, #knockout-lobby .ko-lobby-count, #ko-lobby-count')?.textContent ?? document.getElementById('knockout-lobby').textContent.slice(0, 80),
  note: document.getElementById('ko-lobby-note')?.textContent, watch: document.querySelectorAll('#knockout-lobby .is-watch').length,
  hero: [...document.querySelectorAll('#knockout-lobby .k-cta--primary')].filter(key => !key.classList.contains('hidden') && key.getBoundingClientRect().width > 0).map(key => key.textContent.trim()).join('|'), board: !!document.getElementById('ko-lobby-board'),
  text: document.getElementById('knockout-lobby').textContent.replace(/\s+/g, ' '),
}));
check(/MATCH ON/.test(lobby.text) && /still in · tap a face to watch/.test(lobby.note ?? ''), 'the room says the match is on and how many are still in', JSON.stringify({ note: lobby.note, text: lobby.text.slice(0, 120) }));
check(lobby.watch === 2 && /40\* · batting/.test(lobby.text), 'both friends batting it are in the story ring with their scores', JSON.stringify({ watch: lobby.watch, text: lobby.text.slice(0, 200) }));
check(lobby.hero === 'WATCH' && lobby.board, 'WATCH is the hero key, with LEADERBOARD beside the rings', JSON.stringify(lobby.hero));
check(await page.evaluate(() => window.__cricket.snapshot().phase) !== 'READY', 'nothing is walked out to: the game stays where it was');
await snap('room');

// 2. A face in the ring: their game as a story, the ground put up for it.
await page.locator('#knockout-lobby .is-watch').first().click({ force: true });
await page.waitForFunction(() => window.__cricket.knockout?.()?.watching !== null && document.body.classList.contains('ko-watch'), null, { timeout: 90_000 }).catch(() => {});
ko = await room();
const seat = ko?.watching ?? null;
check(seat === 0 && await page.evaluate(() => document.getElementById('knockout-lobby').classList.contains('hidden')), 'a tap on a friend\'s face opens their game over the room', JSON.stringify({ seat }));
check(await page.evaluate(() => document.body.classList.contains('innings-active') && window.__cricket.snapshot().phase === 'INNINGS_END'), 'the ground is put up for it, with no innings begun');
check(/^Kabir/.test(await page.locator('.ko-watch-name').textContent() ?? ''), 'the story\'s header names who is watched');
check(await page.locator('.ko-watch-n').isHidden(), 'one watcher is not counted on the header');

// 3. N WATCHING: somebody else watching the same seat is counted with this phone; the store says who is watched.
const also = setInterval(() => { void api('watch', r, { code, seat: 0 }); }, 6000);
await api('watch', r, { code, seat: 0 });
for (; kb < 12; kb++) await bat(k, code, kb, '6', 1);
for (; rb < 12; rb++) await bat(r, code, rb, '1', 1);
await page.waitForFunction(() => { const chip = document.querySelector('.ko-watch-n'); return chip && !chip.hidden; }, null, { timeout: 60_000 }).catch(() => {});
check(await page.locator('.ko-watch-n').textContent() === '2 WATCHING', 'two watching the same player are counted on the story\'s header', await page.locator('.ko-watch-n').textContent());
const told = (await get(`/api/challenge?knockout=1&code=${code}`)).match?.watching ?? [];
check(told.some(one => one.seat === 0 && one.n === 2 && one.faces.length === 2) && !JSON.stringify(told).includes(m.playerId), 'the store tells who is watched by seat, with faces and never an id', JSON.stringify(told));
await snap('watching');
// A ball of theirs is played on the ground for the onlooker.
await page.waitForFunction(() => /[1-9]/.test(document.querySelector('.ko-watch-line')?.textContent ?? '') && (window.__cricket.knockout?.()?.watchBall ?? null) !== null, null, { timeout: 120_000 }).catch(() => {});
check((await room())?.watchBall != null || /off (9|1\d)/.test(await page.locator('.ko-watch-line').textContent() ?? ''), 'their balls are played on the ground, from the latest', await page.locator('.ko-watch-line').textContent());
clearInterval(also);

// 4. ✕ is the room; LEADERBOARD there is the standings as they are, with no place of this phone's own.
await page.locator('#ko-watch-close').click({ force: true });
await page.waitForFunction(() => !document.getElementById('knockout-lobby').classList.contains('hidden') && !document.body.classList.contains('ko-watch'), null, { timeout: 60_000 }).catch(() => {});
check(await page.evaluate(() => !document.getElementById('knockout-lobby').classList.contains('hidden') && window.__cricket.knockout()?.watching === null), '✕ comes back to the room, the match still kept');
await page.locator('#ko-lobby-board').click({ force: true });
await page.waitForSelector('.ko-results', { timeout: 30_000 }).catch(() => {});
const dock = await page.evaluate(() => document.querySelector('.ko-results')?.textContent?.replace(/\s+/g, ' ') ?? '');
check(/You are watching this one/.test(dock) && /leads/.test(dock) && /BACK TO ROOM/.test(dock), 'LEADERBOARD in the room is the standings as they are, and says this phone is watching', dock.slice(0, 200));
await snap('standings');
await page.getByRole('button', { name: /BACK TO ROOM/i }).click({ force: true });
await page.waitForFunction(() => !document.querySelector('.ko-results'), null, { timeout: 30_000 }).catch(() => {});

// 5. The match ends while the onlooker sits in the room: the kept match is let go, and the room says who won it.
for (; kb < 30; kb++) await bat(k, code, kb, '6', 1);
await bat(r, code, rb, 'W', 1);
let over = false;
for (let i = 0; i < 20 && !over; i++) { over = (await api('done', k, { code, round: 1 })).match?.over === true; if (!over) await new Promise(done => setTimeout(done, 1500)); }
check(over, 'the match is played to its end');
await api('back', k, { code }); await api('back', r, { code });
await page.waitForFunction(() => !window.__cricket.knockout?.() && document.getElementById('ko-lobby-last') && !document.getElementById('ko-lobby-last').classList.contains('hidden'), null, { timeout: 90_000 }).catch(() => {});
const after = await page.evaluate(() => ({ ko: window.__cricket.knockout?.() ?? null, last: document.getElementById('ko-lobby-last')?.textContent?.replace(/\s+/g, ' ').trim(), parked: document.body.classList.contains('ko-parked'),
  lobby: !document.getElementById('knockout-lobby').classList.contains('hidden') }));
check(after.ko === null && after.lobby && !after.parked, 'over, the kept match is let go and the room is the room again', JSON.stringify(after).slice(0, 200));
check(/WON IT/.test(after.last ?? '') && /Kabir/i.test(after.last ?? ''), 'the room\'s card says who won the match that was watched', after.last);
await snap('after');
clearInterval(beat);

// 6. Super Knockout on another player's profile: its tab, the store's answer by handle, and INVITE TO A MATCH.
await page.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
await page.addStyleTag({ content: '#debug{display:none!important}' });
await page.waitForTimeout(1500);
await page.evaluate(() => document.getElementById('cover-board')?.click());
await page.waitForSelector('#board-overlay:not(.hidden) #board-mode', { timeout: 90_000 });
await page.waitForTimeout(800);
await page.locator('#board-mode').click({ force: true });
await page.locator('[data-also="knockout"]').click({ force: true });
await page.waitForSelector('#ko-board [data-handle]', { timeout: 60_000 });
const kabir = page.locator('#ko-board [data-handle]', { hasText: k.name }).first();
check(await kabir.count() === 1, 'the Knockout board has the player who won', k.name);
await kabir.click({ force: true });
await page.waitForSelector('.ps-switch [data-mode="knockout"]', { timeout: 60_000 }).catch(() => {});
check(await page.locator('.ps-switch [data-mode="knockout"]').count() === 1, 'a profile opened off a row has a Super Knockout tab');
await page.locator('.ps-switch [data-mode="knockout"]').click({ force: true });
await page.waitForSelector('.ps-sheet.is-knockout.is-ready', { timeout: 60_000 }).catch(() => {});
const sheet = await page.evaluate(() => ({ cls: document.querySelector('.ps-sheet')?.className, hero: document.querySelector('.ps-sheet .ps-rung, .ps-sheet .ps-hero')?.textContent?.replace(/\s+/g, ' ').trim(),
  tiles: [...document.querySelectorAll('.ps-sheet .ps-tile')].map(t => t.textContent.replace(/\s+/g, ' ').trim()), invite: !!document.getElementById('player-invite'), text: document.querySelector('.ps-sheet')?.textContent ?? '' }));
check(/is-knockout/.test(sheet.cls ?? '') && sheet.tiles.length === 6 && sheet.tiles.some(t => /^2 ?Matches$/.test(t)) && sheet.tiles.some(t => /^2 ?Wins$/.test(t)),
  'the tab shows their Knockout record as the store holds it', JSON.stringify(sheet.tiles));
check(/2 wins in 2 matches/.test(sheet.text), 'the hero says their wins and matches', sheet.hero);
check(sheet.invite && !sheet.text.includes(k.playerId), 'INVITE TO A MATCH stands at its foot, and nothing on it is an id');
await snap('profile');
const answer = await get(`/api/challenge?knockout=1&career=${'0'.repeat(16)}`);
check(answer.ok !== false && (answer.career?.played ?? 0) === 0, 'a handle nobody holds answers an empty record, not an error', JSON.stringify(answer).slice(0, 160));

check(errors.length === 0, 'no errors thrown in the page', errors.join(' | ').slice(0, 300));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
