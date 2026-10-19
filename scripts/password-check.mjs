/**
 * The career password, in a real browser, the way a player meets it (Figma
 * section 13, "Career password · user journeys").
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=… node scripts/password-check.mjs http://127.0.0.1:5201
 *
 * A · a new player's gate asks for no password and offers Played before?.
 * B · My Stats carries the Set a password card above Road to Hitman, the key
 *     last; the sheet holds a password to the rules as it is typed (123456,
 *     abcdef and the name itself refused, the name with a number on it fine),
 *     takes a security question, and the card goes once it is set.
 * C · back on a wiped browser: the name typed in part lists the player, Forgot
 *     password? puts the question, a wrong answer is refused, the right one
 *     asks for a new password and brings the career back.
 * D · forgot with no question set: the career key, and Welcome back by a key
 *     offers a password.
 * E · the end card: no card under 50 career runs, the card past them in place
 *     of the career key, and the sheet after three end cards walked past.
 *
 * Names are letters and ids are new each run: see "Checks that create players"
 * in CLAUDE.md.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};
const letters = n => Array.from({ length: n }, () => 'abcdefghjkmnpqrstuvwxyz'[Math.floor(Math.random() * 23)]).join('');
const newId = () => `${Date.now().toString(36)}-${Array.from({ length: 12 }, () => 'abcdefghijkmnpqrstuvwxyz0123456789'[Math.floor(Math.random() * 34)]).join('')}`;
const api = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(r => r.json()).catch(() => null);
const BLAST = [1, 4, 6, 2, 6, 1, 6, 'W', 4, 1, 6, 0, 6, 6, 'W', 1, 4, 6, 4, 1, 6, 2, 6, 4, 6, 4, 1, 6, 4, 1];

const browser = await chromium.launch({ executablePath });

/** A browser of its own, past the notices and the stories, as `who` leaves it. */
async function open({ id = null, name = null, query = '', nudged = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ id, name, nudged }) => {
    try {
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-marathon-intro', 'done');
      localStorage.setItem('hitman-hurt-seen', '1');
      // Past the update's stories.
      localStorage.setItem('hitman-whatsnew', 'player-profiles:9');
      // The stars put away for good, so they never take the moment the nudge sheet wants.
      localStorage.setItem('hitman-rating', JSON.stringify({ rated: {}, finished: 0, played: {}, dismissals: 3, dismissedAt: Date.now() }));
      if (nudged && !localStorage.getItem('hitman-password-nudge')) localStorage.setItem('hitman-password-nudge', String(nudged));
      if (id && !localStorage.getItem('hitman-player')) localStorage.setItem('hitman-player', id);
      if (name && !localStorage.getItem('hitman-batter')) {
        localStorage.setItem('hitman-batter', JSON.stringify({ name, avatar: 1 }));
        localStorage.setItem('hitman-profile', '1');
      }
    } catch { /* Then the screens it skips stand in the way, and the check says so. */ }
  }, { id, name, nudged });
  await page.goto(`${base}/?debug=1&private=0&seed=4242${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  return { context, page, errors, snap };
}

const until = async (page, test, tries = 30) => { for (let i = 0; i < tries && !(await test()); i++) await page.waitForTimeout(300); return test(); };

/** From the cover to the crease, through Choose a mode. */
async function crease(page, snap) {
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) {
    const done = page.locator('#whatsnew-done');
    if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
    const pick = page.locator('#mode-classic');
    if (await pick.isVisible().catch(() => false)) await pick.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

/** Opens Bring your record back from a nameless player's My Stats. */
async function restoreSheet(page) {
  await page.locator('#cover-profile').click({ force: true });
  await page.waitForTimeout(1800);
  await page.locator('.stats-sheet-inner').evaluate(el => { el.scrollTop = el.scrollHeight; }).catch(() => {});
  await page.locator('#stats-restore').click({ force: true });
  await until(page, () => page.locator('#restore-form').isVisible());
}

// — A · a new player's gate.
{
  const { context, page, errors } = await open({ query: '&profile=1' });
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 30 && !(await page.locator('.welcome.is-gate').isVisible().catch(() => false)); i++) {
    const pick = page.locator('#mode-classic');
    if (await pick.isVisible().catch(() => false)) await pick.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
  check(await page.locator('.welcome.is-gate').isVisible(), 'A · a new player is asked who is batting');
  check(await page.locator('#profile-overlay input[type="password"]').count() === 0, 'A · with no password asked for there');
  check(await page.locator('#profile-played').isVisible(), 'A · and Played before? up top');
  await page.locator('#profile-played').click({ force: true });
  check(await until(page, () => page.locator('#restore-form').isVisible()), 'A · which opens Bring your record back');
  check(await page.locator('#restore-forgot').isVisible(), 'A · with Forgot password? beside the password');
  check(errors.length === 0, 'A · nothing thrown', errors.join(' | '));
  await context.close();
}

// — B · My Stats, the card, and the sheet.
const id = newId(); const name = `Pw${letters(6)}`;
{
  const claimed = await api('/api/name', { playerId: id, name, avatar: 1 });
  check(claimed?.ok === true, 'B · a player with a name, claimed', JSON.stringify(claimed));
  const { context, page, errors } = await open({ id, name });
  await page.locator('#cover-profile').click({ force: true });
  await until(page, () => page.locator('.stats-slide .pw-card').first().isVisible());
  check(await page.locator('.stats-slide .pw-card').first().isVisible(), 'B · My Stats carries the Set a password card');
  check((await page.locator('.stats-slide .pw-card').first().innerText()).includes('KEEP THIS CAREER SAFE'), 'B · naming what is at stake for a new career');
  const order = await page.evaluate(() => {
    const slide = document.querySelector('.stats-slide');
    const kids = [...slide.children].map(n => n.className.split(' ')[0]);
    const rail = document.getElementById('stats-rail'), key = document.querySelector('.key-pass');
    const after = [...document.querySelectorAll('.stats-sheet-inner > *')].filter(n => rail.compareDocumentPosition(n) & 4).map(n => n.className.split(' ')[0]);
    return { kids, keyAfterRail: !!key && !!(rail.compareDocumentPosition(key) & 4), after };
  });
  check(order.kids[0] === 'pw-card' && order.kids[1] === 'k-road', 'B · right under the career cards, above Road to Hitman', JSON.stringify(order.kids));
  check(order.keyAfterRail, 'B · with the career key below the cards', JSON.stringify(order.after));
  await page.locator('#stats-password').click({ force: true });
  check(await until(page, () => page.locator('#pw-form').isVisible()), 'B · SET A PASSWORD opens the sheet');
  check(await page.locator('#pw-form .pw-user').inputValue() === name, 'B · its username is the name, for the phone to save against');
  const rule = r => page.locator(`#pw-rules li[data-rule="${r}"]`).getAttribute('class');
  await page.locator('#pw-new').fill('abcdef');
  check(await rule('hard') === 'is-bad', 'B · abcdef is too easy');
  await page.locator('#pw-new').fill('123456');
  check(await rule('hard') === 'is-bad', 'B · and 123456');
  await page.locator('#pw-new').fill(name);
  check(await rule('hard') === 'is-bad', 'B · and the name itself');
  await page.locator('#pw-new').fill(`${name}123`);
  check(await rule('hard') === 'is-met' && await rule('long') === 'is-met', 'B · the name with a number on it is fine');
  await page.locator('#pw-confirm').fill(`${name}12`);
  check(await rule('same') === 'is-bad', 'B · and the two have to match');
  await page.locator('#pw-confirm').fill(`${name}123`);
  check(await rule('same') === 'is-met', 'B · which they do');
  await page.locator('#pw-question').click({ force: true });
  check(await until(page, () => page.locator('.pw-option').first().isVisible()) && await page.locator('.pw-option').count() === 8, 'B · eight questions to pick from');
  await page.locator('.pw-option').first().click({ force: true });
  await page.locator('#pw-q-use').click({ force: true });
  check(await until(page, () => page.locator('#pw-answer').isVisible()), 'B · picked, the answer is asked for');
  check(await page.locator('#pw-new').inputValue() === `${name}123`, 'B · with the password still typed in');
  await page.locator('#pw-answer').fill('Rahul and Ankit');
  await page.locator('#pw-send').click({ force: true });
  check(await until(page, () => page.locator('#pw-done').isVisible()), 'B · saved');
  check((await page.locator('#pw-done-title').innerText()).includes('CAREER PROTECTED'), 'B · and the career is protected');
  await page.locator('#pw-done').click({ force: true });
  await page.waitForTimeout(1200);
  check(await page.locator('.stats-slide .pw-card').count() === 0, 'B · the card is gone from My Stats');
  const status = await api('/api/restore?status=1', { name, playerId: id });
  check(status?.password === true && status?.question === 0, 'B · the store holds the password and the question', JSON.stringify(status));
  await page.locator('#stats-edit').click({ force: true });
  await until(page, () => page.locator('#profile-password-go').isVisible());
  check((await page.locator('#profile-password-go').innerText()).trim() === 'CHANGE' && (await page.locator('.welcome-pass').innerText()).includes('Set on'),
    'B · Your details has the password row, to change it', await page.locator('.welcome-pass').innerText().catch(() => ''));
  check(errors.length === 0, 'B · nothing thrown', errors.join(' | '));
  await context.close();
}

// — C · a wiped browser, and a forgotten password.
{
  const { context, page, errors } = await open();
  await restoreSheet(page);
  await page.locator('#restore-name').pressSequentially(name.slice(0, 5), { delay: 40 });
  const row = page.locator(`.rs-found-row[data-name="${name}"]`);
  check(await until(page, () => row.isVisible()), 'C · a few letters list the player');
  await row.click({ force: true });
  await page.locator('#restore-forgot').click({ force: true });
  check(await until(page, () => page.locator('#rq-form').isVisible()), 'C · Forgot password? puts their question');
  check((await page.locator('.pw-question').innerText()).includes('gully cricket'), 'C · the one they picked');
  await page.locator('#rq-answer').fill('virat');
  await page.locator('#rq-send').click({ force: true });
  check(await until(page, () => page.locator('#rq-error').isVisible()), 'C · a wrong answer is refused');
  await page.locator('#rq-answer').fill('rahul AND ankit');
  await page.locator('#rq-send').click({ force: true });
  check(await until(page, () => page.locator('#pw-form[data-mode="recover"]').isVisible()), 'C · the right one, capitals aside, asks for a new password');
  check(await page.locator('#pw-question').count() === 0, 'C · with no question to pick again');
  await page.locator('#pw-new').fill(`${name}456`);
  await page.locator('#pw-confirm').fill(`${name}456`);
  await page.locator('#pw-send').click({ force: true });
  check(await until(page, () => page.locator('#restore-done').isVisible()), 'C · and brings the career back');
  check(await until(page, async () => await page.evaluate(() => localStorage.getItem('hitman-player')) === id, 10), 'C · as the same player, written down');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const back = await page.evaluate(() => ({ id: localStorage.getItem('hitman-player'), who: JSON.parse(localStorage.getItem('hitman-batter') ?? 'null') }));
  check(back.id === id && back.who?.name === name, 'C · and still them on the next visit', JSON.stringify(back));
  const old = await api('/api/restore', { name, password: `${name}123` });
  const fresh = await api('/api/restore', { name, password: `${name}456` });
  check(!!old?.error && fresh?.playerId === id, 'C · the old password stops, the new one opens it', JSON.stringify({ old, fresh }));
  check(errors.length === 0, 'C · nothing thrown', errors.join(' | '));
  await context.close();
}

// — D · forgot, with no question: the career key, and a password offered on the way back in.
{
  const id2 = newId(); const name2 = `Pk${letters(6)}`;
  const claimed = await api('/api/name', { playerId: id2, name: name2, avatar: 2 });
  check(typeof claimed?.key === 'string', 'D · a player with a key and no password', JSON.stringify(claimed));
  const { context, page, errors } = await open();
  await restoreSheet(page);
  await page.locator('#restore-name').fill(name2);
  await page.locator('#restore-forgot').click({ force: true });
  check(await until(page, () => page.locator('#rq-use-key').isVisible()), 'D · Forgot password? with no question offers the career key');
  check((await page.locator('.pw-nokey').innerText()).includes('NO KEY EITHER'), 'D · and says what happens with no key either');
  await page.locator('#rq-use-key').click({ force: true });
  check(await until(page, () => page.locator('#restore-key').isVisible()) && await page.locator('#restore-name').inputValue() === name2, 'D · the key face, the name kept');
  await page.locator('#restore-key').fill(claimed?.key ?? '');
  await page.locator('#restore-send').click({ force: true });
  check(await until(page, () => page.locator('#restore-set-password').isVisible()), 'D · Welcome back by key offers a password');
  await page.locator('#restore-set-password').click({ force: true });
  check(await until(page, () => page.locator('#pw-form[data-mode="set"]').isVisible()), 'D · which opens the sheet');
  check(errors.length === 0, 'D · nothing thrown', errors.join(' | '));
  await context.close();
}

// — E · the end card, and the sheet after three walked past.
{
  const id3 = newId(); const name3 = `Pe${letters(6)}`;
  await api('/api/name', { playerId: id3, name: name3, avatar: 3 });
  const { context, page, errors, snap } = await open({ id: id3, name: name3, nudged: 3 });
  await crease(page, snap);
  await page.evaluate(balls => window.__cricket.blast(balls), BLAST);
  await until(page, async () => (await snap()).phase === 'INNINGS_END');
  await page.waitForTimeout(3000);
  const first = await page.locator('#card-password .pw-card').isVisible();
  check(!first, 'E · no card under 50 career runs');
  check(await page.locator('#card-key .k-ticket').count() === 0, 'E · and no career key on the end card');
  await page.locator('#again').click({ force: true });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) await page.waitForTimeout(300);
  await page.evaluate(balls => window.__cricket.blast(balls), BLAST);
  await until(page, async () => (await snap()).phase === 'INNINGS_END');
  check(await until(page, () => page.locator('#card-password .pw-card').isVisible()), 'E · past 50 runs the end card carries the card');
  check((await page.locator('#card-password').innerText()).includes('RUNS. DON’T LOSE THEM.'), 'E · naming the runs', await page.locator('#card-password').innerText().catch(() => ''));
  check(await page.locator('#card-password .k-cta--solid').isVisible(), 'E · with the solid orange key, not PLAY AGAIN’s');
  check(await until(page, () => page.locator('#pw-nudge-set').isVisible(), 20), 'E · three cards walked past, and the sheet asks outright');
  check(await page.evaluate(() => localStorage.getItem('hitman-password-nudge')) === '4', 'E · the card counted as walked past');
  await page.locator('#pw-nudge-set').click({ force: true });
  check(await until(page, () => page.locator('#pw-form').isVisible()), 'E · SET A PASSWORD opens the sheet');
  check(errors.length === 0, 'E · nothing thrown', errors.join(' | '));
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall good');
process.exit(failures ? 1 : 0);
