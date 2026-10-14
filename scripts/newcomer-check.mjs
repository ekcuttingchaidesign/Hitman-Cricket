/**
 * A newcomer's help, and when it moves on.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   node scripts/newcomer-check.mjs                  # that dev server
 *   node scripts/newcomer-check.mjs http://…:4173    # a preview build
 *
 * The first three finished innings in a mode are batted with a newcomer's
 * windows (`src/game/newcomer.ts`, in the unit tests), the help shrinking each
 * time. What a unit test cannot hold is *when* an innings is counted toward
 * that: only once it is finished, in `end`, beside the career's own count — or
 * a player could keep the help for ever by restarting every innings that went
 * badly. So this plays one, walks out, looks; plays one to the end, looks.
 *
 * Every other check drives `?debug=1`, which keeps the help off so their
 * strokes meet the real windows. This one adds `?newcomer=1`, which lets it
 * back in by the browser's own count, and then checks that the link alone
 * still keeps it off.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
// Past how to hit, the coachmark before a first innings: `shots-check.mjs` is the one that looks at it.
await context.addInitScript(() => { try { localStorage.setItem('hitman-shots-intro', 'done'); } catch { /* Then it shows. */ } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const snap = () => page.evaluate(() => window.__cricket.snapshot());
const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
const played = () => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('hitman-newcomer') ?? 'null'); } catch { return 'junk'; }
});

/** A few balls of an innings, without finishing it. */
const playOn = async balls => {
  for (let i = 0; i < balls; i++) {
    let ball = await snap();
    for (let t = 0; t < 60 && ball.phase !== 'BALL_IN_FLIGHT' && ball.phase !== 'INNINGS_END'; t++) { await advance(300); ball = await snap(); }
    if (ball.phase !== 'BALL_IN_FLIGHT') break;
    await advance(ball.contactAt - ball.elapsed - 65);
    await page.keyboard.press(ball.effectiveLine === 'MIDDLE' ? 'w' : Number(ball.finalX) < 0 ? 'a' : 'd');
    await advance(2600);
  }
};

/** Into a Test Survival innings from the cover, by its `?mode=` link. */
const walkOut = async link => {
  await page.clock.install();
  await page.goto(`${base}/${link}`, { waitUntil: 'load' });
  await advance(2500);
  await page.waitForTimeout(800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await advance(1200); await page.waitForTimeout(300); }
  await page.locator('#start').click({ force: true });
  await advance(400);
  await page.waitForTimeout(300);
  for (let i = 0; i < 8; i++) {
    const done = page.locator('#whatsnew-done');
    if (!(await done.count()) || !(await done.isVisible())) break;
    await done.click({ force: true, timeout: 3000 }).catch(() => {});
    await advance(400);
    await page.waitForTimeout(200);
  }
  await advance(600);
  await page.waitForTimeout(400);
};

await walkOut('?mode=survive&debug=1&newcomer=1&seed=222');
const first = await snap();
check(first.ease === 1.35, 'a first innings in the mode is helped the most', `ease ${first.ease}`);
const seeded = await played();
check(seeded && typeof seeded === 'object' && !seeded.survive, 'a new browser starts with nothing played', JSON.stringify(seeded));

// ── Walked out on ──────────────────────────────────────────────────────────
await playOn(3);
await page.keyboard.press('r');
await advance(600);
await page.waitForTimeout(1500);
check((await snap()).ease === 1.35, 'an innings walked out on does not use the help up', `ease ${(await snap()).ease}`);
check(!(await played())?.survive, 'and is not counted', JSON.stringify(await played()));

// ── Played to the end ──────────────────────────────────────────────────────
await playOn(2);
await page.evaluate(() => window.__cricket.hurt());
for (let i = 0; i < 40; i++) {
  if ((await snap()).phase === 'INNINGS_END') break;
  await advance(1500);
}
check((await snap()).phase === 'INNINGS_END', 'the innings ends');
check((await played())?.survive === 1, 'a finished innings is counted once', JSON.stringify(await played()));
check(!(await played())?.classic, 'toward its own mode only', JSON.stringify(await played()));

await page.locator('#survive-again').click({ force: true });
await advance(600);
await page.waitForTimeout(400);
check((await snap()).ease === 1.2, 'and the next innings is helped less', `ease ${(await snap()).ease}`);

// ── The checks' own link ───────────────────────────────────────────────────
await walkOut('?mode=survive&debug=1&seed=222');
check((await snap()).ease === 1, 'the link every other check drives keeps the help off', `ease ${(await snap()).ease}`);

check(!errors.length, 'nothing threw on the way', errors.join('\n        '));
console.log(failures ? `\n${failures} failed` : '\nall good');
await browser.close();
process.exit(failures ? 1 : 0);
