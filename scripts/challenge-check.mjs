/**
 * Two friends and one link, end to end, in two real browsers.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/challenge-check.mjs                  # that dev server
 *   SHOTS=/tmp/shots node scripts/challenge-check.mjs # and a screenshot of every screen
 *
 * One browser makes a room and sends the link; a second opens it, gives a
 * name, and joins. The first bats thirty balls with every ball written to the
 * room; the second bats against that recorded innings and meets the ghost in
 * the gaps; both end on the same result, one of them live. Then the list, the
 * head-to-head and a rematch. It needs no database: the dev server keeps rooms
 * in memory, running the same rules the deployed endpoint runs.
 *
 * Every screen is reached the way a player reaches it — the picker from the
 * cover, the room from the picker, the innings from the room — because the
 * screens the other checks never reached are where the bugs were.
 *
 * It runs on the real clock, unlike the other checks, and takes a few minutes:
 * two innings are batted at once and the room is polled between them, and a
 * faked clock cannot fake the other browser. Balls are played to the snapshot's
 * own contact time, so most are middled; the ones that are not are still balls.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const shots = process.env.SHOTS || null;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const errors = [];

/** A phone. Its clock is its own: two of them have to agree about the time. */
async function phone(name) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try { localStorage.setItem('hitman-seen', day); } catch { /* Then the notice stands. */ }
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  const advance = ms => page.waitForTimeout(Math.max(16, Math.round(ms)));
  const snap = () => page.evaluate(() => window.__cricket?.snapshot() ?? { phase: 'NONE' });
  const settle = (ms = 600) => page.waitForTimeout(ms);
  const shot = async what => {
    if (!shots) return;
    await page.addStyleTag({ content: '#debug{display:none!important}' }).catch(() => {});
    await page.screenshot({ path: `${shots}/${name}-${what}.png` });
  };
  const until = async (phase, tries = 200) => {
    for (let i = 0; i < tries; i++) {
      const seen = await snap();
      if (seen.phase === phase) return seen;
      if (seen.phase === 'INNINGS_END' && phase !== 'INNINGS_END') throw new Error(`${name}'s innings is over`);
      await page.waitForTimeout(100);
    }
    throw new Error(`${name} never reached ${phase}: ${JSON.stringify(await snap())}`);
  };
  /** Waits, in real time, for something to be on the screen. */
  const appears = async (selector, ms = 12_000) => {
    try { await page.locator(selector).first().waitFor({ state: 'visible', timeout: ms }); return true; } catch { return false; }
  };
  /**
   * One ball, played as near the middle as a headless browser can, which is
   * not very near: a software renderer is slow and a shot pressed to the
   * snapshot's clock lands early or late. That is fine. A miss is a ball, a
   * wicket is a ball, and three wickets is a shorter innings.
   */
  const ball = async () => {
    if ((await snap()).phase === 'INNINGS_END') return false;
    const flight = await until('BALL_IN_FLIGHT').catch(() => null);
    if (!flight) return false;
    const key = flight.effectiveLine === 'MIDDLE' ? 'w' : Number(flight.finalX) < 0 ? 'a' : 'd';
    await page.waitForTimeout(Math.max(0, flight.contactAt - flight.elapsed - 40));
    await page.keyboard.press(key);
    for (let i = 0; i < 80; i++) {
      const phase = (await snap()).phase;
      if (phase === 'RESULT' || phase === 'INNINGS_END' || phase === 'READY') break;
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(200);
    return true;
  };
  const done = async () => (await snap()).phase === 'INNINGS_END';
  /** Presses a key in the room by what it does. */
  const act = async which => { await page.locator(`#room-keys [data-act="${which}"]`).first().click({ force: true }); await settle(); };
  const open = async url => {
    await page.goto(url, { waitUntil: 'load' });
    await settle(2500);
    const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
    if (await anyway.count()) { await anyway.first().click(); await settle(1200); }
  };
  return { page, advance, snap, settle, shot, until, ball, done, act, open, appears, name };
}

// ── Shashank makes a room ───────────────────────────────────────────────────
const a = await phone('shashank');
await a.open(`${base}/?debug=1&seed=222`);
await a.page.locator('#start').click({ force: true });
await a.settle();
for (let i = 0; i < 8; i++) {
  const done = a.page.locator('#whatsnew-done');
  if (!(await done.count()) || !(await done.isVisible())) break;
  await done.click({ force: true });
  await a.settle();
}
check(await a.page.locator('#modes').isVisible(), 'the play key opens the picker');
check(await a.page.locator('#mode-challenge').isVisible(), 'which leads with the one-against-one card');
check(await a.page.locator('#modes-challenges').isVisible(), 'and carries the way to Rival Matches under it');
await a.shot('01-modes');

await a.page.locator('#mode-challenge').click({ force: true });
await a.settle();
check(await a.page.locator('#challenge-join').isVisible(), 'a player with no name is asked for one first');
await a.shot('02-name');
await a.page.locator('#challenge-name').fill('Shashank');
await a.page.locator('#challenge-bat').click({ force: true });
check(await a.appears('#challenge-room'), 'and lands in an empty room', await a.page.locator('#room-lead').innerText().catch(() => '?'));
const link = await a.page.evaluate(() => location.href);
const code = new URL(link).searchParams.get('c');
check(typeof code === 'string' && code.length === 6, 'the room\'s code is on the address bar', link);
check((await a.page.locator('#room-keys [data-act="invite"]').count()) === 1, 'invite leads while nobody has joined');
check(await a.page.locator('.room-face.is-empty').count() === 1, 'and the rival\'s seat stands empty, marked waiting');
await a.shot('03-lobby');

await a.act('invite');
check(await a.appears('#challenge-share', 4000), 'the invite opens the link sheet');
check((await a.page.locator('.rival-steps li').count()) === 3, 'with how it works in three lines');
check((await a.page.locator('#challenge-more').count()) === 1 && (await a.page.locator('#challenge-copy').count()) === 1, 'and share and copy under them');
await a.shot('04-invite');
await a.page.locator('#challenge-share-done').click({ force: true });
await a.settle();
check(await a.page.locator('#challenge-room').isVisible() && await a.page.locator('#challenge-share').isHidden(), 'the cross puts the sheet away');
check((await a.page.locator('#room-keys .rival-key.is-play[data-act="play"]').count()) === 1, 'back in the room, play now stands beside share');
await a.shot('05-lobby-sent');

// ── Rahul opens the link ────────────────────────────────────────────────────
const b = await phone('rahul');
await b.open(`${link}&debug=1&seed=333`);
check(await b.appears('#challenge-join'), 'the link lands straight on the join screen, no cover');
check(await b.page.locator('#intro').isHidden(), 'with the title screen out of the way');
const from = await b.page.locator('#challenge-from-name').innerText();
check(/shashank/i.test(from), 'saying who it is from', from);
await b.shot('06-join');
await b.page.locator('#challenge-name').fill('F.u.c.k');
await b.page.locator('#challenge-bat').click({ force: true });
await b.settle();
check(await b.page.locator('#challenge-join-error').isVisible(), 'a name nobody should be sent is refused on the spot');
await b.page.locator('#challenge-name').fill('Rahul');
await b.page.locator('#challenge-bat').click({ force: true });
check(await b.appears('#challenge-room'), 'a good one joins the room');
check((await b.page.locator('#room-players .room-seat:not(.is-empty)').count()) === 2, 'which now shows both faces');
await b.shot('07-room-joined');

await a.settle(4500);
const seen = await a.page.locator('#room-players').innerText();
check(/Rahul/.test(seen), 'and Shashank\'s room notices without a tap', seen);
await a.shot('08-lobby-both');

// ── Shashank bats first, Rahul watches ─────────────────────────────────────
await a.act('play');
check(await a.page.locator('#challenge-room').isHidden(), 'play now leaves the room');
await a.ball(); await a.ball();
await a.settle(800);
const partway = await fetch(`${base}/api/challenge?code=${code}`).then(r => r.json());
const shashank = partway.challenge?.players?.find(row => row.name === 'Shashank');
check(shashank && shashank.balls >= 2 && shashank.card.length === shashank.balls,
  'two balls in, two balls are on the server, as the balls themselves', JSON.stringify(shashank));

// Rahul, still in the room, sees an innings under way and cannot see the score.
await b.settle(3000);
const live = await b.page.locator('#room-players').innerText();
check(/batting|batted/.test(live) && !/\d+\/\d/.test(live), 'Rahul sees him batting and no score', live);
await b.shot('09-room-live-blind');

// Shashank finishes — thirty balls, or three wickets, whichever the headless bat manages.
while (!(await a.done())) { if (!(await a.ball())) break; }
await a.appears('#challenge-room', 20_000);
await a.settle(2500);
check(await a.page.locator('#challenge-room').isVisible(), 'his innings over, Shashank is back in the room');
const waiting = await a.page.locator('#room-lead').innerText();
check(/innings is in|batting|needs|past you|all out/i.test(waiting), 'waiting on Rahul', waiting);
await a.shot('10-waiting');

// Rahul bats against the recorded innings and meets it in the gaps.
await b.settle(2500);
const chase = await b.page.locator('#room-lead').innerText();
check(/has batted/.test(chase), 'Rahul\'s room says Shashank has batted, and nothing about the score', chase);
await b.shot('09b-room-chase');
await b.act('play');
await b.page.evaluate(() => {
  window.__ghosts = 0;
  new MutationObserver(() => { if (document.getElementById('ghost-flash').classList.contains('is-up')) window.__ghosts++; })
    .observe(document.getElementById('ghost-flash'), { attributes: true, attributeFilter: ['class'] });
});
for (let i = 0; i < 3; i++) { if (!(await b.ball())) break; }
const ghosts = await b.page.evaluate(() => window.__ghosts);
check(ghosts >= 2, 'and meets Shashank\'s balls in the gaps between his own', `${ghosts} flashes over 3 balls`);
await b.shot('10b-ghost');

// Shashank, back in the room, watches it come in.
await a.settle(3000);
const spectate = await a.page.locator('#room-players').innerText();
check(/batting|Rahul/.test(spectate), 'Shashank\'s room shows Rahul\'s innings landing', spectate);
await a.shot('10-spectate');

// Rahul finishes.
while (!(await b.done())) { if (!(await b.ball())) break; }
await b.appears('#challenge-room', 15_000);
await b.settle(2500);
check(await b.page.locator('#challenge-room').isVisible(), 'Rahul\'s innings over, the room shows the result');
const result = await b.page.locator('#room-lead').innerText();
check(/wins|dead heat/i.test(result), 'with a winner named', result);
check(/dead heat/i.test(result) || await b.page.locator('#room-anim svg').count() > 0, 'and the fire burning round the winner');
check((await b.page.locator('#room-scoreline .verdict-row').count()) === 2, 'and both innings as rows');
await b.shot('11-result');

// The scorecard off the result: a way back to it, and none of the keys that
// only belong at the end of a Blast innings.
const cardLink = b.page.locator('#room-keys [data-act="card"]');
check(await cardLink.count() > 0, 'the result offers the innings scorecard');
if (await cardLink.count()) {
  await cardLink.first().click();
  await b.settle(900);
  const shows = async sel => b.page.locator(sel).isVisible().catch(() => false);
  check(await shows('#end') && await shows('#card-result') && await shows('#card-modes'),
    'which carries BACK TO RESULT and a way to mode selection');
  check(!(await shows('#again')) && !(await shows('#challenge-set')),
    'and no PLAY AGAIN or CHALLENGE A FRIEND, which belong to a Blast innings');
  await b.page.locator('#card-result').click();
  await b.settle(900);
  check(await shows('#challenge-room') && !(await shows('#end')) && /wins|dead heat/i.test(await b.page.locator('#room-lead').innerText()),
    'BACK TO RESULT goes back to the result');
}

await a.settle(5000);
const aResult = await a.page.locator('#room-lead').innerText();
check(/wins|dead heat/i.test(aResult), 'Shashank\'s room turns into the result on its own', aResult);
await a.shot('12-result-live');

const final = await fetch(`${base}/api/challenge?code=${code}`).then(r => r.json());
check(final.challenge?.state === 'done', 'the room reads as done on the server', final.challenge?.state);
check(final.challenge?.players?.every(row => row.status === 'done'), 'with both innings finished');
const bRuns = final.challenge?.players?.find(row => row.name === 'Rahul')?.runs;
const bSnap = await b.snap();
check(bRuns === bSnap.runs, 'and Rahul\'s server score is the score he made', `${bRuns} vs ${bSnap.runs}`);

// ── The list, the head-to-head, the rematch ─────────────────────────────────
await b.page.locator('#room-back').click({ force: true });
await b.settle();
check(await b.page.locator('#modes').isVisible(), 'the back key leaves the result for the menu');
await b.page.locator('#modes-challenges').click({ force: true });
check(await b.appears('#challenge-list'), 'Rival Matches opens');
const list = await b.page.locator('#challenge-sections').innerText();
check(/past challenges/i.test(list) && /Shashank/.test(list), 'with the match under Past challenges, against Shashank', list);
await b.shot('13-list');
await b.page.locator('[data-rival]').first().click({ force: true });
await b.settle();
check(await b.page.locator('#challenge-rivalry').isVisible(), 'a name opens the head-to-head');
const tally = await b.page.locator('#rivalry-tally').innerText();
const who = await b.page.locator('#rivalry-who').innerText();
check(/\d – \d/.test(tally) && /1 match/.test(who), 'showing one match played', `${tally} · ${who}`);
await b.shot('14-rivalry');
await b.page.locator('#rivalry-again').click({ force: true });
check(await b.appears('#challenge-room'), 'challenge again opens a fresh room');
const again = await b.page.evaluate(() => location.href);
check(new URL(again).searchParams.get('c') !== code, 'with a new code', again);
await b.shot('15-rematch');

// ── A stranger opens the finished room ──────────────────────────────────────
const c = await phone('amit');
await c.open(`${link}&debug=1&seed=444`);
check(await c.appears('#challenge-join'), 'a third person on the link is offered a way in');
await c.page.locator('#challenge-name').fill('Amit');
await c.page.locator('#challenge-bat').click({ force: true });
await c.appears('#challenge-room');
await c.settle(500);
const third = await c.page.locator('#room-players').innerText();
check(/Shashank/.test(third) && /Rahul/.test(third) && /batted/.test(third) && !/\d+\/\d/.test(third), 'and sees both have batted, with no scores', third);
await c.shot('16-third');

if (errors.length) check(false, 'no page errors', errors.join('\n        '));
else check(true, 'no page errors');
console.log(failures ? `\n${failures} check${failures === 1 ? '' : 's'} failed.\n` : '\nAll checks passed.\n');
await browser.close();
process.exit(failures ? 1 : 0);
