/**
 * An innings the career never heard about is kept until it does — and counted
 * once, however many times it goes.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/pending-check.mjs [http://…]
 *
 * The career used to send an innings twice, four seconds apart, and then forget
 * it, while the innings board kept a register key on the card: a 150 not out
 * could stand on Top score and nowhere on the career that the Individual, Runs
 * and Boundaries ladders are read from (`src/game/pending-innings.ts`).
 *
 * Two ways to lose an innings, both played out against the dev server's store:
 * no signal at all, where nothing reaches the store until the next visit; and a
 * reply lost on the way back, where the store counted it and the browser could
 * not know — the resend must find it counted, not count it again. Innings are
 * written through the debug hook (`__cricket.blast`), which ends them through
 * `end` like any other.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

/** Thirty balls, none of them a wicket: 4 6 1 0 over and over, 66 all told. */
const BLAST = Array.from({ length: 30 }, (_, i) => [4, 6, 1, 0][i % 4]);
const RUNS = BLAST.reduce((sum, ball) => sum + ball, 0);

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  try {
    // A visit remembered from an earlier day: a headless browser otherwise reads as a private window, which counts nothing.
    localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
    localStorage.setItem('hitman-shots-intro', 'done');
    localStorage.setItem('hitman-profile', '1');
  } catch { /* Then the screens it skips stand in the way. */ }
});

let sent = 0;
page.on('request', request => { if (new URL(request.url()).pathname === '/api/innings') sent++; });

const snap = () => page.evaluate(() => window.__cricket.snapshot());
const career = () => page.evaluate(() => {
  try {
    const held = JSON.parse(localStorage.getItem('hitman-career') ?? '{}').classic ?? {};
    return { innings: Number(held.innings) || 0, runs: Number(held.runs) || 0 };
  } catch { return { innings: -1, runs: -1 }; }
});
const pending = () => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('hitman-pending-innings') ?? '[]').length; } catch { return -1; }
});
const waitFor = async (done, tries = 80) => { for (let i = 0; i < tries && !(await done()); i++) await page.waitForTimeout(500); };

/** The cover, PLAY, past the stories, and the Blast picked on Choose a mode. */
async function toCrease() {
  await page.addStyleTag({ content: '#debug{display:none!important}' }).catch(() => {});
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) {
    const done = page.locator('#whatsnew-done');
    if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
    const pick = page.locator('#mode-classic');
    if (await pick.isVisible().catch(() => false)) await pick.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
}
async function load() {
  await page.goto(`${base}/?debug=1&seed=4242`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
}

// ── No signal at the end card ──────────────────────────────────────────────
await load();
await toCrease();
await page.route('**/api/innings', route => route.abort('internetdisconnected'));
sent = 0;
check(await page.evaluate(balls => window.__cricket.blast(balls), BLAST), 'an innings is written and ended');
// Past both tries, the second four seconds after the first.
await page.waitForTimeout(7000);
check(sent === 2, 'it is tried twice', `${sent} sent`);
check((await career()).innings === 0, 'and counts nothing while there is no signal', JSON.stringify(await career()));
check(await pending() === 1, 'but is kept, rather than forgotten after the second try', `${await pending()} held`);

await page.unroute('**/api/innings');
sent = 0;
await load();
await waitFor(async () => (await pending()) === 0);
check(await pending() === 0, 'the next visit sends it and crosses it off once the store answers', `${await pending()} held`);
const first = await career();
check(first.innings === 1 && first.runs === RUNS, 'counted once, for exactly what it scored', JSON.stringify(first));
check(sent === 1, 'in one request', `${sent} sent`);

sent = 0;
await load();
await page.waitForTimeout(3000);
check(sent === 0 && (await career()).innings === 1, 'and nothing goes again on the visit after', `${sent} sent, ${JSON.stringify(await career())}`);

// ── The store counted it, the reply never came back ────────────────────────
await toCrease();
// Through to the store, and the answer thrown away on the way back.
await page.route('**/api/innings', async route => { await route.fetch().catch(() => null); await route.abort('connectionreset'); });
check(await page.evaluate(balls => window.__cricket.blast(balls), BLAST), 'a second innings is written and ended');
await page.waitForTimeout(7000);
check(await pending() === 1, 'with no answer it is kept, though the store may well have it', `${await pending()} held`);

await page.unroute('**/api/innings');
await load();
// The store spaces counted innings ten seconds apart on its own clock, so a
// resend can be told to wait; it goes again rather than being dropped.
await waitFor(async () => (await pending()) === 0);
check(await pending() === 0, 'the resend is answered and crossed off', `${await pending()} held`);
const second = await career();
check(second.innings === 2 && second.runs === RUNS * 2,
  'and the store counted it once, not once for each time it was sent', JSON.stringify(second));

check(!errors.length, 'nothing threw on the way', errors.join('\n        '));
console.log(failures ? `\n${failures} failed` : '\nall good');
await browser.close();
process.exit(failures ? 1 : 0);
