/**
 * How to hit, before a first innings: the coachmark with the swipes fanned
 * from the bat, and after it the confidence meter outlined on the scoreboard.
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
/**
 * Stops the page's clock where it stands, until `resume`. The installed clock
 * runs on in real time between steps, and a renderer slow enough spends whole
 * beats of the coachmarks' light between two of them; its time can also run
 * past the moment asked for between reading it and pausing at it, so it is read
 * and asked for again until it holds.
 */
async function freeze(page) {
  for (let tries = 0; ; tries++) {
    try { await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 250); return; } catch (error) { if (tries > 8) throw error; }
  }
}
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
  check(JSON.stringify(names) === JSON.stringify(['Pull', 'On drive', 'Straight drive', 'Cover drive', 'Cut', 'Late cut', 'Hook']), 'seven lanes, named', JSON.stringify(names));
  check(await page.locator('.hb-caption.is-block .touch-only').textContent() === 'Swipe down', 'and the block a swipe down');
  check(!(await page.locator('.hb-label kbd').first().isVisible()), 'and no keys on a touch screen');
  check(await page.locator('.touch-only', { hasText: 'Swipe the way' }).isVisible(), 'told to swipe');
  check(await page.locator('#mi-skip').isVisible() && await page.locator('#mi-next').textContent() === 'NEXT', 'the first of two: Skip and NEXT');
  check(await page.locator('#mi-mode').textContent() === 'The Blast', 'named for the Blast', await page.locator('#mi-mode').textContent());
  // Every label on the screen and clear of the next.
  const boxes = await page.locator('.hb-label, .hb-caption').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
  const app = await page.locator('#app').evaluate(n => n.getBoundingClientRect().toJSON());
  check(boxes.every(b => b.left >= app.left && b.right <= app.right), 'every name inside the screen', JSON.stringify(boxes.map(b => [Math.round(b.left), Math.round(b.right)])));
  const overlap = boxes.some((a, i) => boxes.some((b, j) => i < j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
  check(!overlap, 'and none over another');
  // The light goes round — the straight drive first, as drawn, which the unit
  // tests hold (`data-lit="2"`) — and a beat later the next lane, the caption
  // under the thumb following it. Judged on the page's clock held still, so it
  // is one beat however long the renderer took to get here.
  const lit = () => page.evaluate(() => [document.querySelector('.hb-fan')?.dataset.lit, document.querySelector('.hb-caption.is-lane span')?.textContent]);
  const ORDER = [2, 3, 4, 5, 6, 0, 1], NAMED = ['pull', 'on drive', 'straight drive', 'cover drive', 'cut', 'late cut', 'hook at a bouncer'];
  await freeze(page);
  const [a, aSays] = await lit();
  await advance(page, 1750);
  const [b, bSays] = await lit();
  await page.clock.resume();
  const after = ORDER[(ORDER.indexOf(Number(a)) + 1) % ORDER.length];
  check(Number(b) === after && aSays?.includes(NAMED[Number(a)]) && bSays?.includes(NAMED[Number(b)]),
    'and the lanes are lit in turn, the caption saying which', `${a} ${aSays} / ${b} ${bSays}`);
  await page.screenshot({ path: `${out}/phone.png` });
  await page.locator('#mi-next').click({ force: true });
  await advance(page, 50);
  check(await page.locator('#mi-title').textContent() === 'Fill your confidence', 'then the confidence meter', await page.locator('#mi-title').textContent());
  check(await page.locator('#mi-spot').isVisible() && await page.locator('#mi-tag').textContent() === 'Confidence meter', 'outlined on the scoreboard, and named');
  await page.waitForTimeout(600);
  const meter = await page.locator('#confidence').boundingBox(), ring = await page.locator('#mi-spot').boundingBox();
  check(ring.x < meter.x && ring.y < meter.y && ring.x + ring.width > meter.x + meter.width && ring.y + ring.height > meter.y + meter.height, 'round the meter itself', JSON.stringify({ meter, ring }));
  check(!(await page.locator('#mi-skip').count()) && await page.locator('#mi-back').isVisible() && await page.locator('#mi-next').textContent() === 'LET’S BAT', 'the last: Back, and LET’S BAT');
  await page.screenshot({ path: `${out}/phone-confidence.png` });
  await advance(page, 4000);
  const held = await snap(page);
  check(held.phase === 'READY' && held.balls === 0, 'nothing bowled while it is up', held.phase);
  check(await page.evaluate(() => localStorage.getItem('hitman-shots-intro')) === 'done', 'remembered as shown');
  await page.locator('#mi-back').click({ force: true });
  await advance(page, 50);
  check(await page.locator('#mi-title').textContent() === 'Swipe to hit', 'Back goes back to the swipes');
  await page.locator('#mi-next').click({ force: true });
  await advance(page, 50);
  await page.locator('#mi-next').click({ force: true });
  await advance(page, 50);
  check(!(await intro(page).isVisible()), 'put away by LET’S BAT');
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
  check(JSON.stringify(keys) === JSON.stringify(['A', 'A+W', 'W', 'W+D', 'D', 'D+S', 'A+S']), 'a keyboard\'s card carries the keys', JSON.stringify(keys));
  check(await page.locator('.hb-caption.is-block .keyboard-only').isVisible(), 'and the block is S');
  check(await page.locator('.hb-label kbd').first().isVisible() && await page.locator('.keyboard-only', { hasText: 'Press the way' }).isVisible(), 'and says press, not swipe');
  check(!(await page.locator('#mi-skip').count()) && !(await page.locator('#mi-back').isVisible()) && await page.locator('#mi-next').textContent() === 'LET’S BAT', 'and no confidence card after it: Survival\'s meter is the injury');
  check(/survive every ball for the draw/.test(await page.locator('.mi-line .keyboard-only').textContent()) && await page.locator('#mi-mode').textContent() === 'Test Survival', 'named for Test Survival, and saying how to win it');
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
