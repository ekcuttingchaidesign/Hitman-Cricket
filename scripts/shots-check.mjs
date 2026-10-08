/**
 * How to hit, before a first innings: the coachmark with the six swipes, and
 * after it the confidence meter lit on the scoreboard.
 *
 * A first innings in the Blast opens with both and bowls nothing until they
 * are put away; they are not shown again, nor to a browser that has batted
 * here before; a keyboard's card carries the keys; a Test Survival shows the
 * swipes alone and leaves the meter for the first Blast; and a Test
 * Marathon's coachmarks open with the same swipes card, drawn for whichever
 * hand is in. Everything is reached the way
 * a player reaches it — the play key, the picker — and nothing is seeded but
 * what says this browser is not a private window.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/shots-check.mjs http://localhost:5201
 *
 * Photographs go to `SHOTS_DIR` (default `/tmp/shots-check`).
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5201';
const out = process.env.SHOTS_DIR || '/tmp/shots-check';
mkdirSync(out, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });

/** A browser of its own, remembering a visit from two days ago so it is not taken for a private window. */
async function open(options, seed = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(([store]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-seen', day);
      for (const [key, value] of Object.entries(store)) localStorage.setItem(key, value);
    } catch { /* Then it is a first visit. */ }
  }, [seed]);
  await page.clock.install();
  return { context, page, errors };
}

const advance = (page, ms) => page.clock.runFor(Math.max(16, Math.round(ms)));
const snap = page => page.evaluate(() => window.__cricket.snapshot());

/** In by the play key and the picker, as a player is. */
async function walkOut(page, mode, query = '') {
  await page.goto(`${base}/?debug=1&seed=4242${query}`, { waitUntil: 'load' });
  await advance(page, 2500);
  await page.waitForTimeout(800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await advance(page, 1200); }
  await page.locator('#start').click({ force: true });
  await advance(page, 400);
  await page.waitForTimeout(300);
  for (let i = 0; i < 8; i++) {
    const done = page.locator('#whatsnew-done');
    if (!(await done.count()) || !(await done.isVisible())) break;
    await done.click({ force: true, timeout: 3000 }).catch(() => {});
    await advance(page, 400);
    await page.waitForTimeout(200);
  }
  await page.locator(`#mode-${mode}`).click({ force: true });
  await advance(page, 600);
  await page.waitForTimeout(300);
}

const intro = page => page.locator('#marathon-intro');
const upWithin = async page => {
  for (let i = 0; i < 20 && !(await intro(page).isVisible()); i++) { await advance(page, 300); await page.waitForTimeout(100); }
  return intro(page).isVisible();
};
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1440, height: 900 } };

// ── A first innings on a phone ──────────────────────────────────────────────
{
  const { context, page, errors } = await open(PHONE);
  await walkOut(page, 'classic');
  check(await upWithin(page), 'a first Blast opens with how to hit');
  check(await page.locator('#mi-title').textContent() === 'Swipe to hit', 'titled for it', await page.locator('#mi-title').textContent());
  const names = await page.locator('.hb-label b').allTextContents();
  check(JSON.stringify(names) === JSON.stringify(['Pull', 'On drive', 'Straight drive', 'Cover drive', 'Cut', 'Block']), 'six swipes, named', JSON.stringify(names));
  check(!(await page.locator('.hb-label kbd').first().isVisible()), 'and no keys on a touch screen');
  check(await page.locator('.touch-only', { hasText: 'Swipe the way' }).isVisible(), 'told to swipe');
  check(await page.locator('#mi-skip').isVisible() && await page.locator('#mi-next').textContent() === 'Next', 'the first of two: Skip and Next');
  // Every label on the screen and clear of the next.
  const boxes = await page.locator('.hb-label').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
  const app = await page.locator('#app').evaluate(n => n.getBoundingClientRect().toJSON());
  check(boxes.every(b => b.left >= app.left && b.right <= app.right), 'every name inside the screen', JSON.stringify(boxes.map(b => [Math.round(b.left), Math.round(b.right)])));
  const overlap = boxes.some((a, i) => boxes.some((b, j) => i < j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
  check(!overlap, 'and none over another');
  // The hand goes round: one ray's hand is up at a time, and a moment later another's.
  const hands = () => page.locator('.hb-hand').evaluateAll(nodes => nodes.map(n => Number(getComputedStyle(n).opacity) > .5));
  const a = await hands(); await page.waitForTimeout(1300); const b = await hands();
  check(JSON.stringify(a) !== JSON.stringify(b), 'and a hand swipes them in turn', `${a} / ${b}`);
  await page.screenshot({ path: `${out}/phone.png` });
  await page.locator('#mi-next').click({ force: true });
  await advance(page, 50);
  check(await page.locator('#mi-title').textContent() === 'Fill your confidence', 'then the confidence meter', await page.locator('#mi-title').textContent());
  check(await page.locator('#mi-spot').isVisible() && await page.locator('#mi-spot .mi-meter').isVisible(), 'lit on the scoreboard, with a bar filling under it');
  check(!(await page.locator('#mi-skip').isVisible()) && await page.locator('#mi-next').textContent() === "Let's bat", 'the last: no skip, and Let\'s bat');
  await page.screenshot({ path: `${out}/phone-confidence.png` });
  await advance(page, 4000);
  const held = await snap(page);
  check(held.phase === 'READY' && held.balls === 0, 'nothing bowled while it is up', held.phase);
  check(await page.evaluate(() => localStorage.getItem('hitman-shots-intro')) === 'done', 'remembered as shown');
  await page.locator('#mi-next').click({ force: true });
  await advance(page, 50);
  check(!(await intro(page).isVisible()), 'put away by Let\'s bat');
  let bowled = false;
  for (let i = 0; i < 30 && !bowled; i++) { await advance(page, 300); bowled = (await snap(page)).phase === 'BALL_IN_FLIGHT'; }
  check(bowled, 'and then the bowler comes in');
  // A second innings, and a second visit, carry straight on.
  await walkOut(page, 'classic');
  await advance(page, 1500);
  check(!(await intro(page).isVisible()), 'not shown a second time');
  check(!errors.length, 'no page errors', errors.join(' | '));
  await context.close();
}

// ── A browser that has batted here ─────────────────────────────────────────
{
  const { context, page } = await open(PHONE, { 'hitman-best': '41' });
  await walkOut(page, 'survive');
  await advance(page, 1500);
  check(!(await intro(page).isVisible()), 'never shown to a browser with a best score');
  await context.close();
}

// ── A keyboard ─────────────────────────────────────────────────────────────
{
  const { context, page } = await open(DESK);
  await walkOut(page, 'survive');
  check(await upWithin(page), 'a first Test Survival opens with it too');
  const keys = await page.locator('.hb-label kbd').allTextContents();
  check(JSON.stringify(keys) === JSON.stringify(['A', 'A+W', 'W', 'W+D', 'D', 'S']), 'a keyboard\'s card carries the keys', JSON.stringify(keys));
  check(await page.locator('.hb-label kbd').first().isVisible() && await page.locator('.keyboard-only', { hasText: 'Press the way' }).isVisible(), 'and says press, not swipe');
  check(!(await page.locator('#mi-skip').isVisible()), 'and no confidence card after it: Survival\'s meter is the injury');
  await page.screenshot({ path: `${out}/desk.png` });
  await page.locator('#mi-next').click({ force: true });
  await advance(page, 50);
  // The meter's card waits for the first innings that has the meter.
  await walkOut(page, 'classic');
  check(await upWithin(page) && await page.locator('#mi-title').textContent() === 'Fill your confidence', 'the first Blast after it opens with the meter alone');
  await page.locator('#mi-next').click({ force: true });
  await advance(page, 50);
  check(await page.evaluate(() => localStorage.getItem('hitman-shots-intro')) === 'done', 'and then both are remembered');
  await context.close();
}

// ── The Marathon's coachmarks open with it ─────────────────────────────────
for (const lefty of [0, 1]) {
  const { context, page } = await open(PHONE);
  await walkOut(page, 'marathon', `&lefty=${lefty}`);
  check(await upWithin(page), `a first Marathon opens its coachmarks${lefty ? ' (left-hander in)' : ''}`);
  const titles = [];
  for (let i = 0; i < 5; i++) {
    titles.push(await page.locator('#mi-title').textContent());
    if (i === 0) {
      // The pull goes to whichever side his leg side is on.
      const pull = await page.locator('.hb-label').first().boundingBox();
      const app = await page.locator('#app').boundingBox();
      const right = pull.x > app.x + app.width / 2;
      check(right === !!lefty, `with the pull on the ${lefty ? 'right, for a left-hander' : 'left'}`);
      await page.screenshot({ path: `${out}/marathon-${lefty ? 'left' : 'right'}.png` });
    }
    await page.locator('#mi-next').click({ force: true });
    await advance(page, 50);
  }
  check(titles[0] === 'Swipe to hit' && titles.length === 5 && titles[4] === 'Every innings counts', 'the swipes first, then the four rules', JSON.stringify(titles));
  check(await page.evaluate(() => localStorage.getItem('hitman-shots-intro')) === 'swipes', 'and a Blast after it has only the meter to tell');
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall ok');
process.exit(failures ? 1 : 0);
