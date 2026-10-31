/**
 * A challenge from a profile, in two browsers (Figma section 23, lanes B to
 * D): the setter opens a profile off the board, CHALLENGE, picks the Blast,
 * sees the card before the first ball, bats the total and is shown Challenge
 * sent; the profile's foot then says so with NUDGE locked. The other player
 * opens the game to the challenge in the cover's line, opens the invite with
 * the total in the open, accepts, sees the chase card with its warning, bats
 * the same balls, and the match is decided.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/invite-check.mjs http://127.0.0.1:5201
 *
 * `MODE=super10` sends it in Super10 instead: both innings ten overs long,
 * bowled as Super10 on the same seed.
 *
 * It seeds both players under new letters each run, and photographs each
 * state into test-results/invite.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const MODE = process.env.MODE === 'super10' ? 'super10' : 'classic';
const S10 = MODE === 'super10';
const out = `test-results/invite${S10 ? '-super10' : ''}`;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};
const letters = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const run = letters(4);
const idOf = name => `${name.toLowerCase().slice(0, 10).padEnd(6, 'x')}-${letters(12)}`;
const innings = runs => { const sixes = Math.floor(runs / 6), singles = runs % 6; return { runs, sixes, fours: 0, wickets: 1, dots: 30 - sixes - singles - 1, balls: 30 }; };
const post = async (path, body) => (await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
async function seed(name, runs, avatar) {
  const playerId = idOf(name);
  await post('/api/innings', { playerId, name, avatar, nonce: letters(16), mode: 'classic', innings: { ...innings(runs), individual: runs, hundreds: runs >= 100 ? 1 : 0 } });
  const scored = await post('/api/score', { playerId, name, avatar, mode: 'classic', innings: innings(runs) });
  if (!scored.ok) throw new Error(`${name} was not taken: ${scored.error}`);
  return playerId;
}

const setter = `Iset${run}`, chaser = `Ichase${run}`;
const setterId = await seed(setter, 96, 2), chaserId = await seed(chaser, 168, 3);

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath });
async function as(playerId, name, avatar) {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.addInitScript(([id, who, kit]) => {
    try {
      localStorage.setItem('hitman-player', id);
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-marathon-intro', 'done');
      localStorage.setItem('hitman-profile', '1');
      localStorage.setItem('hitman-whatsnew', 'super10:9');
      localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: kit }));
    } catch { /* The screens it skips stand in the way. */ }
  }, [playerId, name, avatar]);
  await page.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  return page;
}
const phase = page => page.evaluate(() => window.__cricket?.snapshot?.().phase);
async function waitPhase(page, want, ms = 150000) {
  const until = Date.now() + ms;
  const seen = new Set();
  while (Date.now() < until) { const now = await phase(page); seen.add(now); if (now === want) return true; await page.waitForTimeout(100); }
  console.log('        phases seen:', [...seen].join(', '), await page.evaluate(() => JSON.stringify(window.__cricket?.snapshot?.() ?? {}).slice(0, 300)));
  return false;
}

/** Super10's first-time rules, put away with SKIP: they follow the challenge's card in each browser. */
async function rulesAway(page) {
  await page.waitForSelector('#marathon-intro:not(.hidden)', { timeout: 15000 }).catch(() => null);
  for (let i = 0; i < 8 && await page.locator('#marathon-intro').isVisible(); i++) {
    await page.locator('#mi-skip').click({ noWaitAfter: true, timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(500);
  }
  await waitPhase(page, 'READY');
}

// ── The setter ──────────────────────────────────────────────────────────
const a = await as(setterId, setter, 2);
await a.evaluate(() => document.getElementById('cover-board')?.click());
await a.waitForSelector('#board-overlay .lb-screen');
await a.waitForTimeout(900);
await a.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: chaser }).first().click();
await a.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await a.waitForTimeout(500);
check(await a.locator('#player-challenge').count() === 1, 'a profile offers CHALLENGE beside CHASE');
await a.screenshot({ path: `${out}/a-profile.png` });
await a.locator('#player-challenge').click();
await a.waitForSelector('#cc-confirm .cc-sheet');
check(await a.locator('#cc-confirm .cc-mode').count() === 2, 'the confirm sheet offers two modes');
check(await a.locator('#cc-confirm .cc-mode.is-on[data-mode="classic"]').count() === 1, 'the Blast picked');
if (S10) {
  await a.locator('#cc-confirm .cc-mode[data-mode="super10"]').click();
  check(await a.locator('#cc-confirm .cc-mode.is-on[data-mode="super10"]').count() === 1, 'Super10 picked');
}
await a.waitForTimeout(400);
await a.screenshot({ path: `${out}/b1-confirm.png` });
await a.locator('#cc-go').click({ noWaitAfter: true });
await a.waitForSelector('#chase-intro .cs-card', { timeout: 90000 });
await a.waitForTimeout(600);
const setText = await a.locator('#chase-intro').innerText();
check(/FIRST MATCH/.test(setText), 'the setter’s card says it is their first match', setText);
// The aim comes from their average in the mode: the chaser is seeded with Blasts only.
if (S10) check(!/Aim for/.test(setText), 'and no aim, with no Super10 innings of theirs to aim from', setText);
else check(/Aim for \d+/.test(setText), 'and suggests an aim', setText);
if (S10) check(await a.locator('#chase-intro .cs-band .cs-logo').count() === 1 && /10 OVERS/.test(setText), 'the band names Super10 by its logo, ten overs', setText);
if (S10) check(!await a.locator('#marathon-intro').isVisible(), 'Super10’s rules wait behind the card');
await a.screenshot({ path: `${out}/b3-set.png` });
await a.locator('#cs-bat').click({ noWaitAfter: true });
check(await waitPhase(a, 'READY'), 'the innings starts on LET’S BAT');
const setSnap = await a.evaluate(() => window.__cricket.snapshot());
check(setSnap.mode === (S10 ? 'SUPER10' : 'CLASSIC'), `the setter bats ${S10 ? 'Super10' : 'the Blast'}`, setSnap.mode);
if (S10) {
  await a.waitForSelector('#marathon-intro:not(.hidden)', { timeout: 15000 }).catch(() => null);
  check(await a.locator('#marathon-intro').isVisible(), 'and its rules come up once the card is put away');
  await a.screenshot({ path: `${out}/b3-rules.png` });
  await rulesAway(a);
}
const BALLS = S10 ? 60 : 30;
const total = [6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 4, ...Array(BALLS - 11).fill(0)];
check(await a.evaluate(balls => window.__cricket.blast(balls), total), 'the setter’s innings is written');
await a.waitForSelector('#room-title', { timeout: 90000 });
await a.waitForFunction(() => document.getElementById('room-title')?.textContent === 'Challenge sent', null, { timeout: 10000 }).catch(() => null);
check((await a.locator('#room-title').textContent()) === 'Challenge sent', 'the innings ends on Challenge sent', await a.locator('#room-title').textContent());
check((await a.locator('#room-lead').textContent()).includes(chaser), 'waiting on the player it is for');
await a.screenshot({ path: `${out}/b4-sent.png` });

const theirs = await (await fetch(`${base}/api/challenge?player=${chaserId}`)).json();
const room = theirs.challenges?.find(one => one.invite?.state === 'waiting');
check(!!room, 'the store has it waiting on them');
check(!JSON.stringify(theirs.challenges ?? []).includes(setterId), 'and names nobody by id');

// The foot, back on their profile.
await a.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
await a.waitForTimeout(2500);
await a.addStyleTag({ content: '#debug{display:none!important}' });
await a.evaluate(() => document.getElementById('cover-board')?.click());
await a.waitForSelector('#board-overlay .lb-screen');
await a.waitForTimeout(900);
await a.locator('.lb-step[data-handle], .lb-row[data-handle]').filter({ hasText: chaser }).first().click();
await a.waitForSelector('#player-sheet.is-ready', { timeout: 6000 });
await a.waitForTimeout(600);
check((await a.locator('.ps-state').innerText().catch(() => '')).includes('CHALLENGE SENT'), 'their profile’s foot says it was sent');
check(/NUDGE IN/i.test(await a.locator('#player-nudge').innerText().catch(() => '')), 'with NUDGE locked for three hours');
await a.screenshot({ path: `${out}/b5-foot.png` });

// ── The chaser ─────────────────────────────────────────────────────────
const b = await as(chaserId, chaser, 3);
await b.waitForFunction(() => document.getElementById('cover-board')?.classList.contains('is-challenge'), null, { timeout: 30000 }).catch(() => null);
const line = await b.locator('#cover-board').innerText();
if (!/CHALLENGED YOU/.test(line)) console.log('        errors:', b.errors.join(' | '), '\n        seen by the chaser:', await b.evaluate(async id => JSON.stringify({ me: localStorage.getItem('hitman-player'), id, phase: window.__cricket?.snapshot?.().phase, list: (await (await fetch('/api/challenge?player=' + localStorage.getItem('hitman-player'))).json()).challenges?.map(c => [c.code, c.invite?.state]) }), chaserId));
check(/CHALLENGED YOU/.test(line) && /Chase\s*64/.test(line) && (!S10 || /Super10/.test(line)), 'the cover’s line is the challenge', line);
await b.screenshot({ path: `${out}/c1-cover.png` });
await b.locator('#cover-board').click();
await b.waitForSelector('#cc-invite .cc-sheet');
check((await b.locator('#cc-invite .iv-card b').textContent()) === '64', 'the invite shows their total in the open');
await b.waitForTimeout(400);
await b.screenshot({ path: `${out}/c2-invite.png` });
await b.locator('#iv-accept').click({ noWaitAfter: true });
await b.waitForSelector('#chase-intro .cs-card', { timeout: 90000 });
await b.waitForTimeout(800);
check(/leaving or closing the game counts as a loss/.test(await b.locator('#chase-intro').innerText()), 'the chase card warns that leaving is a loss');
await b.screenshot({ path: `${out}/c3-chase.png` });
await b.locator('#cs-bat').click({ noWaitAfter: true });
check(await waitPhase(b, 'READY'), 'the chase starts on LET’S BAT');
const chaseSnap = await b.evaluate(() => window.__cricket.snapshot());
check(chaseSnap.mode === setSnap.mode, 'in the same mode', chaseSnap.mode);
check(chaseSnap.seed === setSnap.seed, 'on the same seed, so the same balls', `${chaseSnap.seed} / ${setSnap.seed}`);
if (S10) await rulesAway(b);
await b.waitForTimeout(600);
check(await b.locator('#chase-chip').isVisible().catch(() => false), 'with the chase chip under the scoreboard');
await b.screenshot({ path: `${out}/c4-chip.png` });
await waitPhase(b, 'READY');
check(await b.evaluate(n => window.__cricket.blast(Array(n).fill(1)), BALLS), 'the chaser’s innings is written');
await b.waitForSelector('#room-title', { timeout: 90000 }).catch(async () => {
  await b.screenshot({ path: `${out}/c5-fail.png` });
  console.log('        after the chase:', await b.evaluate(async () => JSON.stringify({ phase: window.__cricket?.snapshot?.().phase, url: location.search,
    rooms: (await (await fetch('/api/challenge?player=' + localStorage.getItem('hitman-player'))).json()).challenges?.map(c => [c.code, c.state, c.invite?.state, c.players.map(p => [p.name, p.status, p.card])]) })), b.errors.join(' | '));
});
await b.waitForFunction(() => document.getElementById('room-title')?.textContent === 'Result', null, { timeout: 12000 }).catch(() => null);
check((await b.locator('#room-title').textContent()) === 'Result', 'the chase ends on the result', await b.locator('#room-title').textContent());
check(/WINS/i.test(await b.locator('#room-lead').textContent()), 'and names the winner', await b.locator('#room-lead').textContent());
await b.screenshot({ path: `${out}/c5-result.png` });

check(!a.errors.length && !b.errors.length, 'no errors on either page', [...a.errors, ...b.errors].join(' | '));
await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
