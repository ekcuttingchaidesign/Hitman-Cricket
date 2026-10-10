/**
 * An innings put on the board by itself, in a real browser, in minutes.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/post-check.mjs                  # that dev server
 *   node scripts/post-check.mjs http://…:4173    # a preview build
 *
 * A player with a name has nothing to press at the end of an innings: a place
 * earned is posted once, by itself, and the card says where it landed with
 * VIEW LEADERBOARD in place of the register key. An innings that earns no
 * place — a duck, against a board the page is shown full — is posted too,
 * quietly, with the card left as it was: the store keeps
 * only a best, and what it answers is where the player stands on the whole
 * board — a place below the fifty as readily as in it (`snapshot().standing`,
 * and `GET /api/board?player=`). A player with no name is still asked, and
 * nothing is sent for them.
 *
 * Walked in a Test Marathon because it is the quickest innings the store will
 * take as real: written ball by ball through `__cricket.marathon` and bowled
 * out in a handful of balls, rather than thirty balls of the Blast batted in
 * software. The named player bats left-handed, so the side posted carries two
 * left-handers (`leftHandersOf`) and the store has to take that too.
 *
 * The longer things a Marathon is checked for — the overs, the bowlers, the
 * declare key — are `marathon-check.mjs`'s; this is only the end and the post.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

/** A big innings and three wickets: enough for a place on any board the dev server holds. */
const INNINGS = [...Array(80).fill(6), 'W', 4, 'W', 1, 'W'];
/** Three balls, three wickets, no runs: a place on no board worth the name. */
const DUCKS = ['W', 'W', 'W'];

const browser = await chromium.launch({ executablePath });

/** A Marathon innings written to its end, by a player who has `player`'s name, or none. */
async function bowledOut(player, innings = INNINGS, full = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const posts = [];
  page.on('response', async response => {
    if (!response.url().includes('/api/score') || response.request().method() !== 'POST') return;
    posts.push({ status: response.status(), sent: JSON.parse(response.request().postData() ?? '{}') });
  });
  await page.addInitScript(held => {
    try {
      // Been before, past the coachmarks and the Marathon's rules cards, with
      // the details already given — so the innings is the first thing here.
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-marathon-intro', 'done');
      localStorage.setItem('hitman-profile', '1');
      if (held && !localStorage.getItem('hitman-batter')) {
        localStorage.setItem('hitman-batter', JSON.stringify({ name: held.name, avatar: 2 }));
        localStorage.setItem('hitman-hand', held.hand);
      }
    } catch { /* Then the screens it skips stand in the way, and the check says so. */ }
  }, player);
  if (full) {
    await page.route(url => url.pathname === '/api/board' && url.searchParams.get('mode') === 'marathon' && !url.searchParams.has('player'),
      route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FULL) }));
  }
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  await page.goto(`${base}/?debug=1&mode=marathon&seed=4242`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 30 && (await snap()).phase !== 'READY'; i++) {
    const done = page.locator('#whatsnew-done');
    if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }
  check((await snap()).phase === 'READY', `${player ? 'a named player' : 'a player with no name'} walks out in a Test Marathon`, (await snap()).phase);
  await page.evaluate(balls => window.__cricket.marathon(balls), innings);
  for (let i = 0; i < 30 && (await snap()).phase !== 'INNINGS_END'; i++) await page.waitForTimeout(300);
  check((await snap()).phase === 'INNINGS_END', 'and is bowled out', (await snap()).phase);
  // The strip goes up once the boards are fetched, and the post answers after that.
  for (let i = 0; i < 40; i++) {
    const head = await page.locator('#card-board-head').textContent().catch(() => '');
    const placed = innings === INNINGS ? /on the leaderboard/.test(head ?? '') : true;
    if (player ? placed && posts.length && (await snap()).standing : (await page.locator('#claim').isVisible())) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  return { context, page, errors, posts, snap };
}

/** Where the store says a player stands, asked the way the cover will ask it. */
const askStanding = (page, id) => page.evaluate(async player => {
  const answer = await fetch(`/api/board?mode=marathon&player=${encodeURIComponent(player)}`);
  return { status: answer.status, cache: answer.headers.get('cache-control'), body: await answer.json() };
}, id);

/**
 * A full Marathon board, as the page is shown it — fifty sides above anything
 * a duck could make — so the card works out that it has no place. Only the
 * page is shown it: the post still goes to the dev server's own store, which
 * ranks it for real, and nothing is written there to get in a later run's way.
 */
const FULL = {
  team: { rows: Array.from({ length: 50 }, (_, i) => ({ playerId: `full${String(i).padStart(4, '0')}-xxxxxxxxxxxx`, name: `Side ${i + 1}`, avatar: i % 5, score: Number.MAX_SAFE_INTEGER - i, runs: 400 - i, balls: 300, boundaries: 40, ending: 'ALL_OUT' })), cutoff: Number.MAX_SAFE_INTEGER - 49, size: 50 },
  solo: { rows: Array.from({ length: 50 }, (_, i) => ({ playerId: `full${String(i).padStart(4, '0')}-xxxxxxxxxxxx`, name: `Bat ${i + 1}`, avatar: i % 5, score: Number.MAX_SAFE_INTEGER - i, runs: 200 - i, balls: 200, out: true, order: 1 })), cutoff: Number.MAX_SAFE_INTEGER - 49, size: 50 },
};

// — A player with a name, batting left-handed.
{
  const { context, page, errors, posts, snap } = await bowledOut({ name: `Post${Math.random().toString(36).slice(2, 7)}`, hand: 'left' });
  check(posts.length === 1, 'the innings is posted by itself, once', JSON.stringify(posts.map(one => one.status)));
  const lefties = posts[0]?.sent?.innings?.batters?.filter(b => b.left).length;
  check(posts[0]?.sent?.mode === 'marathon' && lefties === 2, 'a left-hander\'s side, with two left-handers in it', `mode ${posts[0]?.sent?.mode}, ${lefties} left-handed`);
  check(posts[0]?.status === 200, 'and the store takes it', String(posts[0]?.status));
  const head = await page.locator('#card-board-head').textContent();
  check(/You.re \d+\w\w on the leaderboard/.test(head ?? ''), 'the card says where it landed', head);
  check((await page.locator('#claim').textContent())?.trim() === 'VIEW LEADERBOARD', 'with the board one tap away, and nothing to register',
    await page.locator('#claim').textContent());
  check(!(await page.locator('#claim-why').isVisible()), 'and no line about registering');
  const standing = (await snap()).standing?.standing;
  check(standing?.team?.rank >= 1 && standing.team.total >= standing.team.rank && standing.team.was === null,
    'the store says where the innings put them, out of how many, from nowhere', JSON.stringify(standing));
  await page.locator('#claim').click({ force: true });
  await page.waitForTimeout(1500);
  check(await page.locator('#board-overlay').isVisible(), 'which opens the board');
  check(errors.length === 0, 'with nothing thrown', errors.join('\n'));
  await context.close();
}

// — A player with no name: still asked, and nothing sent.
{
  const { context, page, errors, posts } = await bowledOut(null);
  check(posts.length === 0, 'nothing is posted for a player with no name', String(posts.length));
  check((await page.locator('#claim').textContent())?.trim() === 'REGISTER SCORE ON LEADERBOARD', 'whose card still asks',
    await page.locator('#claim').textContent());
  check(errors.length === 0, 'with nothing thrown', errors.join('\n'));
  await context.close();
}

// — A player with a name whose innings earns no place: posted all the same, and the card as it was.
{
  const { context, page, errors, posts, snap } = await bowledOut({ name: `Duck${Math.random().toString(36).slice(2, 7)}`, hand: 'right' }, DUCKS, true);
  check(posts.length === 1 && posts[0].status === 200, 'an innings with no place is posted too, once', JSON.stringify(posts.map(one => one.status)));
  const head = await page.locator('#card-board-head').textContent().catch(() => '');
  check(!/You.re \d+\w\w on the leaderboard/.test(head ?? ''), 'and the card does not claim a place for it', head);
  const standing = (await snap()).standing?.standing;
  check(standing?.team?.rank >= 1 && standing.team.rank === standing.team.total,
    'the store puts it last on the whole board, wherever that is', JSON.stringify(standing));
  const asked = await askStanding(page, posts[0]?.sent?.playerId);
  check(asked.status === 200 && asked.body?.team?.rank === standing?.team?.rank && asked.body?.team?.row?.runs === 0,
    'and says the same place when asked without an innings', JSON.stringify(asked.body));
  check(/no-store/.test(asked.cache ?? ''), 'an answer about one player, never cached', asked.cache);
  const nobody = await askStanding(page, 'zzzzzz-zzzzzzzzzzzz');
  check(nobody.body?.team?.rank === null && nobody.body?.team?.row === null, 'and a player the board has never seen has no place', JSON.stringify(nobody.body));
  const junk = await askStanding(page, 'not a player');
  check(junk.status === 400, 'and anything that is not a player is turned away', String(junk.status));
  check(errors.length === 0, 'with nothing thrown', errors.join('\n'));
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed.` : '\nAll good.');
process.exit(failures ? 1 : 0);
