/**
 * The flash for a pulled bouncer, in a real browser: focus lines run out from
 * him in the pull's pen, a swoosh follows the bat through its swing, and the
 * ball goes away with a gold streak behind it — and the ground keeps its
 * colour, because it is a great shot, not a special one.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/pull-check.mjs
 *   node scripts/pull-check.mjs http://…:4173    # a preview build
 *
 * First the flash on its own, through the debug hook, to see what it draws.
 * Then a real one in each mode: balls played on a clock wound by hand, as
 * power-check winds it, every ball blocked until a bouncer comes and that one
 * pulled on time — because a flash that only the debug hook can raise is a
 * flash nobody has proved a player will ever see. Which outcomes earn it is
 * `pulledBouncer`'s business, held by `tests/special-flash.test.ts`.
 *
 * Needs `VITE_SHOW_SURVIVE=1` on the server, for the Test match.
 */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath });

/** A page past the notices and the covers, on a clock wound by hand, at the mode picker. */
async function open(options) {
  const page = await browser.newPage(options);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text()); });
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-seen', day);
      localStorage.setItem('hitman-whatsnew', 'rivals-launch:9');
      localStorage.setItem('hitman-unveiled', 'ground-2026');
    } catch { /* Then the notices stand. */ }
  });
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  await page.clock.install();
  await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
  // Held still between steps. An installed clock otherwise goes on running at
  // the wall's pace, and software rendering spends long enough on a frame
  // after a wicket that the doodle's own 1.3-second timer went off between
  // putting it up and looking at it.
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 3000);
  await advance(2500);
  await page.waitForTimeout(800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await advance(1200); }
  await page.locator('#start').click({ force: true, timeout: 15_000 });
  await advance(600);
  for (let i = 0; i < 8; i++) {
    const done = page.locator('#whatsnew-done');
    if (!(await done.count()) || !(await done.isVisible())) break;
    await done.click({ force: true });
    await advance(400);
  }
  return { page, errors, advance, snap };
}

// ── The flash on its own ─────────────────────────────────────────────────
for (const [name, options] of [
  ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['desktop', { viewport: { width: 1280, height: 720 } }],
]) {
  console.log(name);
  const { page, errors, advance, snap } = await open(options);
  await page.locator('#mode-classic').click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  let seen = '';
  for (let i = 0; i < 60 && seen !== 'READY'; i++) { await advance(250); seen = (await snap()).phase; }
  check(seen === 'READY', 'an innings is under way', seen);

  await page.evaluate(() => window.__cricket.pull());
  await advance(120);
  const up = await page.evaluate(() => {
    const doodle = document.querySelector('.milestone.is-pull');
    // Judged at 400ms on its own clock, set by hand: see milestone-check.
    for (const animation of doodle?.getAnimations({ subtree: true }) ?? []) { animation.pause(); animation.currentTime = 400; }
    const ray = doodle?.querySelector('.pw-ray.is-b');
    return {
      doodle: !!doodle,
      rays: doodle?.querySelectorAll('.pw-ray').length ?? 0,
      travelling: [...(doodle?.querySelectorAll('.pw-ray') ?? [])].filter(ray => {
        const offset = parseFloat(getComputedStyle(ray).strokeDashoffset);
        return offset < 0 && offset > -.95;
      }).length,
      bursts: document.querySelectorAll('.pw-burst').length,
      thrown: document.querySelectorAll('.pw-thrown').length,
      power: !!document.querySelector('.milestone.is-power'),
      pen: ray ? getComputedStyle(ray).stroke : '',
      aside: !!document.querySelector('#viewport.milestone-on'),
      ...window.__cricket.snapshot(),
    };
  });
  check(up.doodle && !up.power, 'the pull’s flash goes up, and not the special stroke’s');
  check(up.rays >= 8 && up.rays <= 14 && up.travelling >= 4, 'focus lines travelling out from him', JSON.stringify(up));
  check(up.bursts === 0 && up.thrown === 0, 'with nothing burst or thrown on the ground', JSON.stringify(up));
  check(up.pen === 'rgb(18, 224, 196)', 'in the pull’s turquoise', up.pen);
  check(up.swishing, 'a swoosh behind the bat', JSON.stringify(up));
  check(up.tail === 'pull', 'the ball’s tail set to the pull’s', up.tail);
  check(up.muted === 0, 'and the ground left in its colours', up.muted);
  check(!up.aside, 'and the call for the ball left where it is');
  await page.screenshot({ path: `test-results/pull-${name}.png` });
  await advance(1500);
  const after = await snap();
  check(await page.locator('.is-pull').count() === 0 && !after.swishing, 'all of it gone again by itself', JSON.stringify(after));
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

/**
 * A key pressed and let go, stamped with the page's own time. A key sent the
 * ordinary way is stamped by the browser's real clock, which a wound clock
 * does not reach, and the game times a stroke from that stamp — so it lands
 * anywhere up to 60ms off, and a Test match's perfect pull is 18ms wide.
 */
function press(page, key) {
  return page.evaluate(key => {
    for (const type of ['keydown', 'keyup']) {
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: performance.now() });
      window.dispatchEvent(event);
    }
  }, key);
}

// ── A real one, in each mode ─────────────────────────────────────────────
// Every ball blocked until a bouncer comes, and that one pulled on time. The
// block is there so a run of good balls cannot end the innings before the
// bouncer turns up.
for (const mode of ['classic', 'survive']) {
  console.log(`a real pull, ${mode}`);
  const { page, errors, advance, snap } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.locator(`#mode-${mode}`).click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  let landed = null, bouncers = 0;
  // How far ahead of the ideal moment to send the key: none, since the key
  // carries the wound clock's own time (see `press`), but learnt off each
  // ball's timing error all the same, in case a frame gets in the way.
  let lead = 0;
  for (let ball = 0; ball < 30 && !landed; ball++) {
    let seen = await snap();
    for (let i = 0; i < 120 && seen.phase !== 'BALL_IN_FLIGHT'; i++) {
      if (seen.phase === 'INNINGS_END') break;
      await advance(100); seen = await snap();
    }
    if (seen.phase !== 'BALL_IN_FLIGHT') break;
    const bouncer = seen.style === 'SHORT';
    if (bouncer) bouncers++;
    await advance(seen.contactAt - seen.elapsed - lead);
    await press(page, bouncer ? 'a' : 's');
    for (let i = 0; i < 40; i++) {
      await advance(50);
      const now = await snap();
      if (now.swishing) { landed = now; break; }
      if (now.phase === 'RESULT' || now.phase === 'READY') break;
    }
    const played = landed ?? await snap();
    const error = Number(played.timingDelta);
    if (Number.isFinite(error)) lead = Math.max(0, lead + error / 2);
    if (bouncer && !landed) console.log(`        a bouncer went unrewarded (${played.timingDelta}ms): ${played.outcome}`);
    // Landed, it is looked at where it is, with the ball still in the air.
    if (!landed) await advance(2000);
  }
  check(bouncers > 0, 'a bouncer comes', bouncers);
  check(!!landed, 'one pulled on time flashes, on the hit', JSON.stringify(landed));
  if (landed) {
    check(landed.pulled && landed.style === 'SHORT' && landed.shot === 'LEG', 'a bouncer pulled and hit', JSON.stringify(landed));
    check(await page.locator('.milestone.is-pull').count() === 1, 'with the focus lines up over him');
    await advance(60);
    const mid = await snap();
    await page.screenshot({ path: `test-results/pull-real-${mode}.png` });
    check(mid.tail === 'pull' && mid.burning >= 10, 'the ball going away with the pull’s streak behind it', JSON.stringify(mid));
    check(mid.muted === 0 && !mid.special, 'with the ground in colour, and nothing special about it but the shot', JSON.stringify(mid));
  }
  // And the next ball back to the ordinary trail.
  let next = await snap();
  for (let i = 0; i < 80 && next.phase !== 'BALL_IN_FLIGHT'; i++) { await advance(100); next = await snap(); }
  check(next.tail === null && !next.swishing, 'the next ball goes back to the ordinary trail', JSON.stringify(next));
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
