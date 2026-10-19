/**
 * Player profiles in a browser (section 14, lane A): a named row on a board
 * opens that player's profile, risen over the board, with the figures the
 * store answers; a mode they have never batted says so and offers no chase;
 * the sheet puts itself away by its X, by Escape and by the scrim; the
 * player's own row opens My profile; and CHASE starts that mode with the
 * chase held for the post.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/profile-check.mjs http://127.0.0.1:5201
 *
 * It seeds its own players through the dev server's store, each run under new
 * names (a name with a number on the end is a sibling of the last run's for a
 * day), and photographs each state into test-results/profile.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const out = 'test-results/profile';

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

/** Letters only, new every run. */
const letters = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const run = letters(4);
const idOf = name => `${name.toLowerCase().slice(0, 10).padEnd(6, 'x')}-${letters(12)}`;
const innings = runs => {
  const sixes = Math.floor(runs / 6), singles = runs % 6;
  return { runs, sixes, fours: 0, wickets: 1, dots: 30 - sixes - singles - 1, balls: 30 };
};
const post = async (path, body) => {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return response.json();
};

/** A player on the Blast board with a career behind them, and a line about themselves. */
async function seed(name, runs, avatar, bio) {
  const playerId = idOf(name);
  const tally = { ...innings(runs), individual: runs, hundreds: runs >= 100 ? 1 : 0 };
  await post('/api/innings', { playerId, name, avatar, nonce: letters(16), mode: 'classic', innings: tally });
  const scored = await post('/api/score', { playerId, name, avatar, mode: 'classic', innings: innings(runs) });
  if (!scored.ok) throw new Error(`${name} was not taken: ${scored.error}`);
  if (bio) await post('/api/profile', { playerId, name, bio });
  return playerId;
}

const top = `Ptop${run}`;
await seed(top, 174, 3, 'Leg-side bully. Pulls everything short.');
const secondId = await seed(`Psec${run}`, 168, 1);
// Below the podium, so a fresh server's list has named rows too.
await seed(`Plow${run}`, 6, 2);
await seed(`Pend${run}`, 4, 3);

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(who => {
  try {
    localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
    localStorage.setItem('hitman-shots-intro', 'done');
    localStorage.setItem('hitman-marathon-intro', 'done');
    localStorage.setItem('hitman-profile', '1');
    localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 2 }));
  } catch { /* The screens it skips stand in the way. */ }
}, `Plook${run}`);
await page.goto(`${base}/?debug=1`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
await page.addStyleTag({ content: '#debug{display:none!important}' });

await page.evaluate(() => document.getElementById('cover-board')?.click());
await page.waitForSelector('#board-overlay .lb-screen');
await page.waitForTimeout(900);

// Found by name: a dev server that has run this before has players above them.
const step = page.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: top }).first();
check(await step.count() === 1, 'their row opens a profile');
check(await page.locator('.lb-step.is-1[data-handle]').count() === 1, 'so does the top of the podium');
check(await page.locator('.lb-row[data-handle] .lb-go').count() > 0, 'named rows carry a chevron');

await step.click();
await page.waitForSelector('#player-sheet');
const firstName = await page.locator('#player-name').textContent();
check(firstName === top, 'the sheet opens on their name at once, off the row', firstName);
await page.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/a2-blast.png` });
const sheet = page.locator('#player-sheet');
check(await page.locator('.ps-bio').textContent().then(t => t.includes('Leg-side bully')), 'their bio stands under the name');
check(/^#\d+$/.test((await page.locator('.ps-glance-one.is-place b').textContent()).trim()), 'their place on the Blast board is at a glance');
check(await page.locator('.ps-tile.is-target b').textContent() === '174', 'the figure a chase aims at is their best');
const chaseWords = (await page.locator('#player-chase').textContent()).trim();
check(chaseWords.includes(`${top.toUpperCase()}’S 174`), 'CHASE names them and their best', chaseWords);
check((await sheet.getAttribute('class')).includes('tier-'), 'the sheet wears a rung');

await page.locator('.ps-tab[data-mode="survive"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/a4a-empty.png` });
check(await page.locator('.ps-message h3').textContent().then(t => /No Survival innings yet/.test(t)), 'a mode never batted says so');
check(await page.locator('#player-chase').count() === 0, 'and offers nothing to chase');

await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(await page.locator('#player-sheet').count() === 0, 'Escape puts the sheet away');
check(await page.locator('#board-overlay .lb-screen').count() === 1, 'and leaves the board up');

await page.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: `Psec${run}` }).first().click();
await page.waitForSelector('#player-sheet');
await page.locator('#player-close').click();
await page.waitForTimeout(400);
check(await page.locator('#player-sheet').count() === 0, 'the X puts it away');

await step.click();
await page.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await page.locator('#player-chase').click();
await page.waitForTimeout(1200);
const snap = await page.evaluate(() => window.__cricket?.snapshot?.());
check(snap?.chase?.target === 174 && snap?.chase?.mode === 'classic', 'CHASE holds their best as the target', JSON.stringify(snap?.chase));
check(await page.locator('#board-overlay .lb-screen').count() === 0, 'and the board makes way for the innings');

/** Writes balls once the bowler is at his mark: the debug hook writes only between balls. */
const write = async balls => {
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(b => window.__cricket.snapshot().phase === 'READY' && window.__cricket.blast(b), balls)) return true;
    await page.waitForTimeout(150);
  }
  return false;
};

// Lane B: the chase. The intro stands before the first ball and nothing is bowled under it.
await page.waitForSelector('#chase-intro', { timeout: 6000 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/b1-intro.png` });
check((await page.locator('.ch-intro-target b').textContent()) === '174', 'the intro counts up to their best');
await page.waitForTimeout(1500);
check((await page.evaluate(() => window.__cricket.snapshot().phase)) === 'READY', 'and nothing is bowled while it stands');
// LET'S BAT, and ten singles written in the same moment, before the bowler sets off.
await page.evaluate(() => { document.getElementById('chase-bat').click(); window.__cricket.blast(Array(10).fill(1)); });
await page.waitForTimeout(400);
const need = (await page.locator('.ch-chip .ch-need').textContent()).trim();
check(need === '165', 'the chip under the scoreboard says what is wanted', need);
await page.screenshot({ path: `${out}/b2-chip.png` });
await write(['W', 'W', 'W', 'W', 'W']);
await page.waitForSelector('.ch-strip.is-short', { timeout: 8000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/b5-short.png` });
check((await page.locator('.ch-strip-text b').textContent()).startsWith('164 short of'), 'fallen short, the card says by how many');
check((await page.locator('#again').textContent()).includes('CHASE 174 AGAIN'), 'and the key takes it on again');
await page.locator('#again').click();
await page.waitForTimeout(800);
check(await page.locator('#chase-intro').count() === 0, 'again, it goes straight to the crease');
check(await page.locator('.ch-chip').count() === 1, 'with the chip still up');

// Passed: chase the second player's 168, and go past it with a ball to spare.
const second = `Psec${run}`;
await write(['W', 'W', 'W', 'W']);
await page.waitForSelector('#chase-board', { timeout: 8000 });
await page.locator('#chase-board').click();
await page.waitForSelector('#board-overlay .lb-screen');
await page.waitForTimeout(800);
await page.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: second }).first().click();
await page.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await page.locator('#player-chase').click();
await page.waitForSelector('#chase-intro', { timeout: 6000 });
await page.evaluate(() => { document.getElementById('chase-bat').click(); window.__cricket.blast([...Array(28).fill(6), 6]); });
await page.waitForSelector('#chase-passed', { timeout: 4000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/b3-passed.png` });
check(await page.locator('#chase-passed .ch-stamp span').textContent() === second.toUpperCase(), 'going past it stamps SURPASSED with their name');
check((await page.locator('.ch-chip').count()) === 0, 'and the chip under the scoreboard goes: the chase is done');
await page.waitForTimeout(2000);
await write(['W']);
await page.waitForSelector('.ch-strip.is-beat', { timeout: 8000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/b4-beat.png` });
check((await page.locator('.ch-strip-text b').textContent()) === `You beat ${second} by 6`, 'beaten, the card says by how many');
check(!(await page.locator('#again').textContent()).includes('CHASE'), 'and the key is PLAY AGAIN: a chase won is over');
const events = await (await fetch(`${base}/api/profile?player=${encodeURIComponent(secondId)}`)).json();
check(events.events?.[0]?.kind === 'beat' && events.events[0].runs === 174, 'and the store put the beat on their profile', JSON.stringify(events.events?.[0]));

// Lane C: My profile, as the player who was beaten, in a browser of their own.
{
  const theirs = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const them = await theirs.newPage();
  them.on('pageerror', e => errors.push(`[beaten] ${e.message}`));
  await them.addInitScript(({ id, name }) => {
    try {
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-profile', '1');
      localStorage.setItem('hitman-player', id);
      localStorage.setItem('hitman-batter', JSON.stringify({ name, avatar: 1 }));
    } catch { /* The screens it skips stand in the way. */ }
  }, { id: secondId, name: second });
  await them.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
  await them.waitForTimeout(2500);
  // The widget turns its lines over every few seconds: watch it for one round.
  let coverLines = '';
  for (let i = 0; i < 40 && !/RANK DOWN/.test(coverLines); i++) {
    coverLines = await them.locator('#cover-board').innerText().catch(() => '');
    if (!/RANK DOWN/.test(coverLines)) await them.waitForTimeout(300);
  }
  check(/RANK DOWN/.test(coverLines) && /Someone beat your 168/.test(coverLines), 'the cover leads with the place that went down', coverLines.replace(/\s+/g, ' ').slice(0, 120));
  await them.click('#cover-profile');
  await them.waitForSelector('.mp-hero.is-on', { timeout: 15_000 });
  check((await them.locator('.st-title').textContent()).trim() === 'MY PROFILE', 'My Stats is My profile now');
  await them.waitForSelector('.mp-news.is-taken', { timeout: 8000 });
  await them.waitForTimeout(600);
  await them.screenshot({ path: `${out}/c2-profile.png` });
  const news = (await them.locator('.mp-news').textContent()).replace(/\s+/g, ' ').trim();
  check((await them.locator('.mp-news-text b').textContent()).trim() === 'Rank down', 'the headline says the rank went down', news);
  check(/You’re (#\d+ now|out of the top (3|10)|no longer #1)/.test(news), 'and where it left them', news);
  check(news.includes('Someone beat your 168 in the Blast') && !news.includes(`Plook${run}`), 'and what happened, without who: the sheet names them', news);
  check(await them.locator('.mp-news-down').isVisible() && !(await them.locator('.mp-news .board-kit').count()), 'a red arrow down, not their face');
  check(await them.locator('[data-bio-add]').first().isVisible(), 'and with no bio, the hero offers a line about you');
  const tabs = await them.evaluate(() => [...document.querySelectorAll('.mp-mode')].map(one => ({
    on: one.classList.contains('is-on'), text: one.textContent.replace(/\s+/g, ' ').trim(), line: getComputedStyle(one, '::after').opacity,
  })));
  check(tabs.length === 3 && tabs.every(one => /^[A-Z]+$/.test(one.text)), 'the mode tabs are names and badges, no figures', JSON.stringify(tabs));
  check(tabs.filter(one => one.on).length === 1 && tabs.every(one => (one.line === '1') === one.on), 'and only the one picked is underlined', JSON.stringify(tabs));

  // Lane D: the bio, from that offer into Your details.
  await them.locator('[data-bio-add]').first().click();
  await them.waitForSelector('#profile-bio', { timeout: 8000 });
  check(await them.locator('.bio-idea').count() === 3, 'D · an empty bio offers three lines to start from');
  await them.locator('#profile-bio').fill('DM me on insta @kabir_99 for nets');
  await them.waitForTimeout(800);
  check(/Keep contact details and links out of your bio/.test(await them.locator('#bio-problem').innerText()), 'D · a way to reach somebody is refused before a round trip');
  await them.screenshot({ path: `${out}/d2-refused.png` });
  await them.locator('#profile-bio').fill('Opener. Hits the first ball for four, then gets serious. Ask my last bowler.');
  await them.waitForTimeout(700);
  check((await them.locator('#bio-count').textContent()).trim() === '4 left', 'D · from seventy the count says what is left', await them.locator('#bio-count').textContent());
  await them.locator('#profile-bio').fill('Six or nothing.');
  await them.waitForTimeout(700);
  await them.screenshot({ path: `${out}/d1-details.png` });
  await them.locator('#profile-send').click();
  await them.waitForSelector('#profile-overlay.hidden', { state: 'attached', timeout: 8000 }).catch(() => {});
  await them.waitForTimeout(1200);
  const kept = await (await fetch(`${base}/api/profile?player=${encodeURIComponent(secondId)}`)).json();
  check(kept.bio === 'Six or nothing.', 'D · the store keeps the bio', JSON.stringify(kept.bio));
  const shown = await them.locator('.mp-hero.is-on .ps-bio').textContent().catch(() => '');
  check(/Six or nothing\./.test(shown ?? ''), 'D · and My profile says it under the name', shown);
  await them.locator('#mp-activity-open').click();
  await them.waitForSelector('#activity-sheet');
  await them.waitForTimeout(500);
  await them.screenshot({ path: `${out}/c4-sheet.png` });
  check(await them.locator('#activity-sheet .mp-win').count() >= 1, 'the sheet offers WIN IT BACK');
  check(/Who looked stays private/.test(await them.locator('#activity-sheet').innerText()), 'and keeps who looked private');
  await them.locator('#activity-sheet .mp-win').first().click();
  await them.waitForSelector('#chase-intro', { timeout: 8000 });
  check((await them.locator('.ch-intro-target b').getAttribute('data-to')) === '174', 'WIN IT BACK chases the runs that took it');
  // Played to the end and fallen short, the Rank down card still comes down.
  await them.evaluate(() => { document.getElementById('chase-bat').click(); window.__cricket.blast(['W', 'W', 'W', 'W', 'W']); });
  await them.waitForSelector('.ch-strip.is-short', { timeout: 10_000 });
  const answered = await them.evaluate(() => localStorage.getItem('hitman-answered') ?? '');
  check(/:classic"/.test(answered), 'C · the innings WIN IT BACK started is noted as answered', answered);
  await them.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
  await them.waitForTimeout(2000);
  await them.click('#cover-profile');
  await them.waitForSelector('.mp-hero.is-on', { timeout: 15_000 });
  await them.waitForFunction(() => !!document.querySelector('#mp-activity')?.innerHTML.trim(), null, { timeout: 8000 }).catch(() => {});
  await them.waitForTimeout(600);
  check(await them.locator('.mp-news.is-taken').count() === 0, 'C · and My profile no longer leads with Rank down', await them.locator('#mp-activity').innerText().catch(() => ''));
  await theirs.close();
}

// C3: an ordinary innings's end card, for a named player who climbed: where
// they are, who they passed under it, and who is next as one row.
{
  const own = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const me = await own.newPage();
  me.on('pageerror', e => errors.push(`[climber] ${e.message}`));
  await me.addInitScript(name => {
    try {
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-profile', '1');
      localStorage.setItem('hitman-batter', JSON.stringify({ name, avatar: 2 }));
    } catch { /* The screens it skips stand in the way. */ }
  }, `Pclimb${run}`);
  await me.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
  await me.waitForTimeout(2000);
  await me.addStyleTag({ content: '#debug{display:none!important}' });
  const snap = () => me.evaluate(() => window.__cricket.snapshot());
  await me.locator('#start').click({ force: true });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) {
    const done = me.locator('#whatsnew-done');
    if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
    const pick = me.locator('#mode-classic');
    if (await pick.isVisible().catch(() => false)) await pick.click({ force: true }).catch(() => {});
    await me.waitForTimeout(300);
  }
  // A first innings of 66 for none, then a second of 170 that climbs past the both of them.
  const writeHere = async balls => {
    for (let i = 0; i < 60; i++) {
      if (await me.evaluate(b => window.__cricket.snapshot().phase === 'READY' && window.__cricket.blast(b), balls)) return true;
      await me.waitForTimeout(150);
    }
    return false;
  };
  await writeHere([...Array(11).fill(6), ...Array(19).fill(0)]);
  await me.waitForSelector('#card-board-head', { timeout: 10_000 });
  await me.waitForTimeout(11_000);
  await me.locator('#again').click();
  await me.waitForTimeout(800);
  await writeHere([...Array(28).fill(6), 2, 0]);
  for (let i = 0; i < 30 && !(await me.locator('#card-board-passed:not(.hidden)').count()); i++) await me.waitForTimeout(300);
  await me.waitForTimeout(800);
  await me.locator('.ec-player').scrollIntoViewIfNeeded();
  await me.screenshot({ path: `${out}/c3-endcard.png` });
  const passedLine = await me.locator('#card-board-passed').innerText().catch(() => '');
  check(/^Surpassed /.test(passedLine), 'C3 · who the innings went past is a quiet line under the place', passedLine);
  check(await me.locator('.ca-next').count() === 1, 'C3 · and who is next is one row of its own');
  const round = await me.locator('.ca-next-face .board-kit').evaluate(n => { const r = n.getBoundingClientRect(); return Math.abs(r.width - r.height) < 1; });
  check(round, 'C3 · with a round face, not an oval');
  check(!(await me.locator('#card-board-who').isVisible()), 'C3 · and no name over the player’s own face');
  await own.close();
}

// B in Test Survival: the chase is of their result — here, outlast a player
// bowled out after forty balls — keyed, introduced and counted in balls.
{
  const surv = `Psurv${run}`;
  const survId = idOf(surv);
  const surviveInnings = { runs: 30, balls: 40, wickets: 1, blows: 0, health: 100 };
  const posted = await post('/api/score', { playerId: survId, name: surv, avatar: 1, mode: 'survive', innings: surviveInnings });
  check(posted.ok, 'S · a Survival innings is on its board', JSON.stringify(posted).slice(0, 120));
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const s = await ctx.newPage();
  s.on('pageerror', e => errors.push(`[survival] ${e.message}`));
  await s.addInitScript(name => {
    try {
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-hurt-seen', '1');
      localStorage.setItem('hitman-profile', '1');
      localStorage.setItem('hitman-batter', JSON.stringify({ name, avatar: 2 }));
    } catch { /* The screens it skips stand in the way. */ }
  }, `Pouts${run}`);
  await s.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
  await s.waitForTimeout(2000);
  await s.addStyleTag({ content: '#debug{display:none!important}' });
  await s.evaluate(() => document.getElementById('cover-board')?.click());
  await s.waitForSelector('#board-overlay .lb-screen');
  await s.locator('#board-mode').click();
  await s.locator('[data-mode="survive"]').click();
  await s.waitForTimeout(1200);
  await s.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: surv }).first().click();
  await s.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
  const key = (await s.locator('#player-chase').textContent()).trim();
  check(key === `OUTLAST ${surv.toUpperCase()}`, 'S · the key asks to outlast them, not to chase their runs', key);
  await s.locator('#player-chase').click();
  await s.waitForSelector('#chase-intro', { timeout: 8000 });
  await s.waitForTimeout(900);
  await s.screenshot({ path: `${out}/s1-intro.png` });
  check((await s.locator('.ch-intro-target b').getAttribute('data-to')) === '41', 'S · the intro is built round the balls it takes: 41');
  check(/BALLS TO OUTLAST/.test(await s.locator('.ch-intro-target em').textContent()), 'S · to outlast them');
  await s.locator('#chase-bat').click();
  await s.waitForTimeout(500);
  const chip = (await s.locator('.ch-chip .ch-need').textContent().catch(() => '')).trim();
  check(chip === 'Survive 41 more', 'S · and the chip counts the balls still to survive', chip);
  await s.screenshot({ path: `${out}/s2-chip.png` });
  await ctx.close();
}

// The key under a name as wide as a name can be (fourteen letters, Ms and Ws):
// the name drops out of it rather than running it off its face, and a short
// name keeps it.
{
  const wide = `Mwmw${run}Mwmwmw`.slice(0, 14);
  await seed(wide, 162, 4);
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const k = await ctx.newPage();
  k.on('pageerror', e => errors.push(`[key] ${e.message}`));
  await k.addInitScript(name => {
    try {
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-profile', '1');
      localStorage.setItem('hitman-batter', JSON.stringify({ name, avatar: 2 }));
    } catch { /* The screens it skips stand in the way. */ }
  }, `Pkey${run}`);
  await k.goto(`${base}/?debug=1`, { waitUntil: 'load' });
  await k.waitForTimeout(1800);
  await k.addStyleTag({ content: '#debug{display:none!important}' });
  await k.evaluate(() => document.getElementById('cover-board')?.click());
  await k.waitForSelector('#board-overlay .lb-screen');
  await k.waitForTimeout(900);
  const keyOf = async name => {
    await k.locator('.lb-step[data-handle], .lb-row[data-handle], .lb-chip[data-handle]').filter({ hasText: name }).first().click();
    await k.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
    await k.evaluate(() => document.fonts.ready);
    await k.waitForTimeout(500);
    const said = await k.locator('#player-chase .k-cta-face>span').evaluate(label => {
      const face = label.parentElement, style = getComputedStyle(face);
      const room = face.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { text: label.textContent.trim(), fits: label.offsetWidth <= room + 0.5 };
    });
    return said;
  };
  const long = await keyOf(wide);
  await k.screenshot({ path: `${out}/k1-long-name.png` });
  check(long.text === 'CHASE THEIR 162', 'K · a name too long for the key drops out of it', long.text);
  check(long.fits, 'K · and the short key fits its face');
  await k.keyboard.press('Escape');
  await k.waitForTimeout(500);
  const short = await keyOf(top);
  check(short.text === `CHASE ${top.toUpperCase()}’S 174` && short.fits, 'K · a name that fits stays on the key', short.text);
  await ctx.close();
}

check(errors.length === 0, 'no page errors', errors.join('\n'));
await browser.close();
console.log(failures ? `\n${failures} failed.` : '\nAll passed.');
process.exit(failures ? 1 : 0);
