/**
 * "Claim your name", off the end of an innings that earned no place, in a real
 * browser.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/name-check.mjs                  # that dev server
 *   node scripts/name-check.mjs http://…:4173    # a preview build
 *
 * A place in a full top fifty used to be the only way a player was asked for a
 * name, and most players never earn one. So a player with no name is asked
 * after any finished innings, and the name is claimed on its own through
 * `/api/name` — nothing goes on a board, and the key comes back.
 *
 * Reached the way a player reaches it: an innings batted to its end, with no
 * name in this browser. Then the rules a new name is held to, said in the form
 * before a round trip, and the claim itself. Then a second player, in a browser
 * of their own, trying the same name with a number on the end within the day,
 * and being pointed at the name that is held and a way back to it.
 *
 * Then the details from the head of My Stats: a new name held to once a month
 * by the real store, and the kit and the batting hand changed at once.
 *
 * Then the form before the first innings (`?profile=1`, since `?debug=1` skips
 * it for every other check): a new player asked before a ball is bowled, held
 * to the rules, and sent out left-handed as they said; and a player who
 * already had a name, shown theirs and carrying on in one tap.
 *
 * The dev server's database is in memory, so the name is made up fresh each
 * run: a name claimed by an earlier run is held for as long as the server is up.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

/** Letters only, so the made-up name has no number of its own on the end. */
const fresh = `Nm${Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')}`;

const browser = await chromium.launch({ executablePath });

/**
 * A browser of its own, on the mode picker. `query` is added to the link, and
 * `player` is a name this browser already bats under, where it has one.
 */
async function toPicker({ query = '', player = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  // A visit remembered from an earlier day, so a headless browser is not taken
  // for a private window — which counts nothing and is offered no name.
  await page.addInitScript(held => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-seen', day);
      if (held && !localStorage.getItem('hitman-batter')) localStorage.setItem('hitman-batter', JSON.stringify(held));
    } catch { /* Then the notice stands. */ }
  }, player);
  // A full Test ladder nobody batting for a ball could get onto, so the strip
  // is the one for an innings with no place — which on an empty ladder, where
  // any innings is first, it would not be. Only the Test board's answer is
  // stood in for; the name is claimed against the dev server's own registry.
  await page.route('**/api/board?mode=survive*', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      rows: Array.from({ length: 50 }, (_, i) => ({
        playerId: `fill${String(i).padStart(2, '0')}-${'x'.repeat(12)}`, name: `Filler ${i + 1}`, avatar: i % 8,
        score: Number.MAX_SAFE_INTEGER - i, runs: 500 - i, balls: 300, wickets: 0, blows: 0, health: 100,
      })),
      cutoff: Number.MAX_SAFE_INTEGER - 49, size: 50,
    }),
  }));
  await page.clock.install();
  await page.goto(`${base}/?debug=1&seed=222${query}`, { waitUntil: 'load' });
  await advance(2500);
  await page.waitForTimeout(800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await advance(1200); await page.waitForTimeout(300); }
  await page.locator('#start').click({ force: true });
  await advance(400);
  await page.waitForTimeout(300);
  // The update's stories come up before the picker on a first visit: wait for the picker itself.
  for (let i = 0; i < 20 && !(await page.locator('#mode-survive').isVisible()); i++) {
    const done = page.locator('#whatsnew-done');
    if (await done.isVisible().catch(() => false)) await done.click({ force: true, timeout: 3000 }).catch(() => {});
    await advance(400);
    await page.waitForTimeout(300);
  }
  return { context, page, errors, advance, snap };
}

/** A Test innings batted to its end by a player with no name, on its own browser. */
async function endedInnings() {
  const { context, page, errors, advance, snap } = await toPicker();
  await page.locator('#mode-survive').click({ force: true });
  await advance(600);
  await page.waitForTimeout(400);
  // One blow from the floor and no shot played: an innings of no runs, which
  // no board has a place for.
  await page.evaluate(() => window.__cricket.hurt());
  for (let i = 0; i < 60; i++) {
    if ((await snap()).phase === 'INNINGS_END') break;
    await advance(1500);
  }
  check((await snap()).phase === 'INNINGS_END', 'the innings ends', JSON.stringify(await snap()));
  await advance(1500);
  await page.waitForTimeout(600);
  return { context, page, errors, advance, snap };
}

/** The form opened off the strip, with a name typed and sent. */
async function send(page, advance, name) {
  await page.locator('#claim-name').fill(name);
  await page.locator('#claim-send').click({ force: true });
  await advance(300);
  await page.waitForTimeout(900);
}

// — The first player: asked, held to the rules, and given the name and a key.
{
  const { context, page, errors, advance } = await endedInnings();
  const strip = page.locator('#card-board');
  check(await strip.isVisible(), 'a player with no name is offered one on the end card');
  check((await page.locator('#card-board-head').innerText()).includes('Claim your name'),
    'headed as a claim on the name', await page.locator('#card-board-head').innerText());
  check(await page.locator('#claim').innerText() === 'CLAIM YOUR NAME',
    'with a key that says so', await page.locator('#claim').innerText());

  await page.locator('#claim').click({ force: true });
  await advance(400);
  await page.waitForTimeout(300);
  check(await page.locator('#card-claim').isVisible(), 'the key opens the form');
  check(await page.locator('#claim-send').innerText() === 'CLAIM MY NAME',
    'whose key claims a name rather than a place', await page.locator('#claim-send').innerText());

  const asked = [];
  page.on('request', request => { if (request.url().includes('/api/')) asked.push(new URL(request.url()).pathname); });
  await send(page, advance, 'Ab');
  check((await page.locator('#claim-error').innerText()).includes('At least 3'),
    'a name too short is turned down in the form', await page.locator('#claim-error').innerText());
  await send(page, advance, 'Rohit9876543');
  check((await page.locator('#claim-error').innerText()).includes('phone number'),
    'and a phone number', await page.locator('#claim-error').innerText());
  check(!asked.includes('/api/name'), 'without asking the server', asked.join(', '));

  await send(page, advance, fresh);
  check(asked.includes('/api/name'), 'a good name is claimed on its own', asked.join(', '));
  check(!asked.includes('/api/score'), 'with no innings sent to a board', asked.join(', '));
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('hitman-batter') ?? 'null'));
  check(kept?.name === fresh, 'and this browser bats under it now', JSON.stringify(kept));
  check(!(await strip.isVisible()), 'the strip goes once the name is held');
  check(await page.locator('#end-survive').isVisible(), 'and the card stays, with no board opened over it');
  check(await page.evaluate(() => Boolean(localStorage.getItem('hitman-career-key'))),
    'the career key is kept in this browser');
  check(await page.locator('#card-key').isVisible(), 'and the card carries it');

  // — Changing it, from the head of My Stats.
  await page.locator('#card-career').click({ force: true });
  await advance(400);
  await page.waitForTimeout(2500);
  const who = page.locator('#stats-overlay .stats-who');
  check(await who.isVisible(), 'My Stats is headed with the player\'s name');
  check((await who.innerText()).includes(fresh), 'which is the name just claimed', await who.innerText().catch(() => ''));
  check(!(await page.locator('#stats-overlay .key-pass #name-change').count()), 'and the key card no longer carries it');
  await page.locator('#stats-edit').click({ force: true });
  await advance(300);
  await page.waitForTimeout(500);
  check(await page.locator('#profile-name').inputValue() === fresh, 'its edit key opens the details on the name held now');
  check(await page.locator('#profile-close').isVisible(), 'with a way out, since it is no gate');
  check((await page.locator('#profile-overlay .welcome-fine').innerText()).includes('once every 30 days'),
    'and says how often before anybody types');
  await page.locator('#profile-name').fill(`${fresh}x`);
  await page.locator('#profile-send').click({ force: true });
  await advance(300);
  await page.waitForTimeout(900);
  const month = await page.locator('#profile-error').innerText().catch(() => '');
  check(/You took your name on .+\. You can change it again from .+\./.test(month),
    'a second new name inside the month is turned down, with the day it opens', month);
  const still = await page.evaluate(() => JSON.parse(localStorage.getItem('hitman-batter') ?? 'null'));
  check(still?.name === fresh, 'and nothing changes', JSON.stringify(still));

  // The kit and the hand change whenever: the same name, a new kit, left-handed.
  await page.locator('#profile-name').fill(fresh);
  await page.locator('#profile-overlay .kit-option:not(.is-chosen)').first().click({ force: true });
  await page.locator('#profile-overlay [data-hand="left"]').click({ force: true });
  const kitPicked = Number(await page.locator('#profile-overlay .kit-option.is-chosen').getAttribute('data-kit'));
  await page.locator('#profile-send').click({ force: true });
  await advance(300);
  await page.waitForTimeout(1200);
  check(await page.locator('#profile-overlay .welcome').isHidden(), 'the same name with a new kit and hand is saved at once');
  const kitted = await page.evaluate(() => ({
    player: JSON.parse(localStorage.getItem('hitman-batter') ?? 'null'), hand: localStorage.getItem('hitman-hand'),
  }));
  check(kitted.player?.avatar === kitPicked && kitted.hand === 'left', 'and remembered', JSON.stringify(kitted));
  check(errors.length === 0, 'with nothing thrown', errors.join('\n'));
  await context.close();
}

// — A second player, the same name with a number on it, within the day.
{
  const { context, page, errors, advance } = await endedInnings();
  await page.locator('#claim').click({ force: true });
  await advance(400);
  await page.waitForTimeout(300);
  await send(page, advance, `${fresh} 2`);
  const said = await page.locator('#claim-error').innerText();
  check(said.includes(`${fresh} was claimed in the last day`), 'a sibling of a fresh name is turned down, naming it', said);
  check(await page.locator('#claim-back').isVisible(), 'with a way back to the career under it');
  await page.locator('#claim-restore').click({ force: true });
  await advance(400);
  await page.waitForTimeout(500);
  const filled = await page.locator('#restore-name').inputValue().catch(() => '');
  check(filled === fresh, 'which starts from the name that is held, not the one typed', filled);
  check(await page.evaluate(() => localStorage.getItem('hitman-batter')) === null, 'and nothing was claimed');
  check(errors.length === 0, 'with nothing thrown', errors.join('\n'));
  await context.close();
}

// — The gate before the first innings: a new player, asked before a ball.
{
  const { context, page, errors, advance, snap } = await toPicker({ query: '&profile=1' });
  await page.locator('#mode-survive').click({ force: true });
  await advance(600);
  await page.waitForTimeout(500);
  // The sheet, not its holder: the holder has no size of its own.
  const sheet = page.locator('#profile-overlay .welcome');
  check(await sheet.isVisible(), 'a new player is asked who is batting before the first innings');
  check((await page.locator('#profile-title').innerText()).toLowerCase().includes('who'), 'as a new player',
    await page.locator('#profile-title').innerText().catch(() => ''));
  check(!(await page.locator('#profile-close').count()), 'with no way past but answering');
  check((await snap()).phase === 'START', 'and nothing bowled meanwhile', (await snap()).phase);
  check((await page.locator('#profile-overlay .welcome-fine').innerText()).includes('once every 30 days'),
    'told the name changes once every 30 days');
  await page.locator('#profile-name').fill('Ab');
  await page.locator('#profile-send').click({ force: true });
  await advance(300);
  await page.waitForTimeout(500);
  check((await page.locator('#profile-error').innerText().catch(() => '')).includes('At least 3'), 'held to the rules for a name');
  const gated = `${fresh}g`;
  await page.locator('#profile-name').fill(gated);
  await page.locator('#profile-overlay [data-hand="left"]').click({ force: true });
  await page.locator('#profile-send').click({ force: true });
  await advance(300);
  await page.waitForTimeout(1500);
  check(await sheet.isHidden(), 'and LET\'S BAT sends them out to bat');
  const held = await page.evaluate(() => ({
    player: JSON.parse(localStorage.getItem('hitman-batter') ?? 'null'), hand: localStorage.getItem('hitman-hand'),
    done: localStorage.getItem('hitman-profile'), key: !!localStorage.getItem('hitman-career-key'),
  }));
  check(held.player?.name === gated && held.done === '1', 'under the name claimed', JSON.stringify(held));
  check(held.key, 'with the career key kept');
  await advance(1500);
  const playing = await snap();
  check(playing.phase !== 'START', 'the innings starts', playing.phase);
  check(playing.mirrored === true, 'with a left-handed batter, as they said they bat', JSON.stringify({ mirrored: playing.mirrored }));
  // The next innings is not held up again.
  await page.evaluate(() => window.__cricket.hurt());
  for (let i = 0; i < 60 && (await snap()).phase !== 'INNINGS_END'; i++) await advance(1500);
  await page.locator('#survive-again').click({ force: true });
  await advance(600);
  await page.waitForTimeout(500);
  check(await sheet.isHidden(), 'and the next innings is not asked again');
  check(errors.length === 0, 'with nothing thrown', errors.join('\n'));
  await context.close();
}

// — The gate for a player who already has a name: theirs, filled in, and on.
{
  const known = `${fresh}k`;
  const { context, page, errors, advance, snap } = await toPicker({ query: '&profile=1', player: { name: known, avatar: 2 } });
  await page.locator('#mode-classic').click({ force: true });
  await advance(600);
  await page.waitForTimeout(500);
  check(await page.locator('#profile-overlay .welcome').isVisible(), 'a player with a name is shown the form once too');
  check(await page.locator('#profile-name').inputValue() === known, 'with their name filled in');
  check(await page.locator('#profile-overlay .kit-option.is-chosen').getAttribute('data-kit') === '2', 'and their kit');
  await page.locator('#profile-send').click({ force: true });
  await advance(300);
  await page.waitForTimeout(1500);
  check(await page.locator('#profile-overlay .welcome').isHidden(), 'carrying on in one tap');
  await advance(1500);
  const playing = await snap();
  check(playing.phase !== 'START' && playing.mirrored === false, 'into a right-handed Blast, the hand it was always batted with',
    JSON.stringify({ phase: playing.phase, mirrored: playing.mirrored }));
  check(errors.length === 0, 'with nothing thrown', errors.join('\n'));
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed.` : '\nAll good.');
process.exit(failures ? 1 : 0);
