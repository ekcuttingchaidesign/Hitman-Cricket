/**
 * The pictures the What's New stories are told with.
 *
 *   npx vite --port 5199 &
 *   node scripts/whatsnew-art.mjs
 *
 * They are screenshots of the real screens rather than drawings of them, which
 * is the only way a story about an update stays true to the update: change the
 * board's look and this is re-run, rather than three pictures quietly becoming
 * a museum of what the game used to be.
 *
 * The board's own endpoints are stubbed, because a dev server has no Redis
 * behind it and an empty ladder makes a poor advertisement for a ladder. The
 * figures below are made up and are never written anywhere — they exist for the
 * length of one screenshot.
 */

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5199').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const out = new URL('../src/assets/whatsnew/', import.meta.url).pathname;

const NAMES = ['Rohit', 'Bumrah', 'Hardik', 'Ishan', 'Shreyas', 'Surya', 'Axar', 'Kuldeep'];
const ME = 'artart-aaaabbbbcccc';

/** An innings board that looks like one people have been playing on. */
const rows = NAMES.map((name, i) => ({
  playerId: i === 2 ? ME : `seed${i}-aaaabbbbccc${i}`,
  name, avatar: i % 6,
  runs: 148 - i * 9, sixes: 14 - i, fours: 6, wickets: i % 3, dots: 4 + i, balls: 30,
  score: 10_000_000 - i * 100_000,
}));

/** The same people, with careers behind them. */
const careerRow = (i, name) => ({
  playerId: i === 2 ? ME : `seed${i}-aaaabbbbccc${i}`,
  name, avatar: i % 6,
  score: 10_000_000 - i * 100_000,
  career: {
    innings: 40 - i, runs: 4200 - i * 260, balls: 1100 - i * 40,
    sixes: 210 - i * 14, fours: 96 - i * 6, wickets: 70 - i, dots: 300 - i * 8,
    highest: 148 - i * 9, notOut: 132 - i * 8, individual: 132 - i * 8,
    hundreds: i < 3 ? 3 - i : 0,
  },
});

const boards = {
  runs: NAMES.map((name, i) => careerRow(i, name)),
  boundaries: NAMES.map((name, i) => careerRow(i, name)),
  highest: NAMES.map((name, i) => careerRow(i, name)),
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});

await page.route('**/api/board**', route => route.fulfill({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ rows, cutoff: null, size: 50 }),
}));
await page.route('**/api/career**', route => {
  const mine = boards.runs[2];
  const player = new URL(route.request().url()).searchParams.get('player');
  route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(player
      ? { career: mine.career, name: mine.name, avatar: mine.avatar, granted: null }
      : { boards, size: 50 }),
  });
});
await page.addInitScript(id => {
  // The id the stubbed rows put in third place, and the kit that row is wearing,
  // so the board lights the row the way it does for whoever is looking at it.
  localStorage.setItem('hitman-player', id);
  localStorage.setItem('hitman-batter', JSON.stringify({ name: 'Hardik', avatar: 2 }));
  localStorage.setItem('hitman-seen', '2020-01-01');
}, ME);

// Loaded twice on purpose. The game reads its player id from three stores and
// mints a fresh one if they take longer than a second to answer, which on a
// cold profile they do — the first load is what warms them, so the second one
// picks up the id planted above and the board can light the row it belongs to.
await page.goto(`${base}/`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(3500);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(1500); }

// Whichever id this browser settled on, rather than the one that was planted:
// the game mints a fresh one when its three stores are slow to answer, and a
// board that does not light the row you are standing on is a board that is not
// showing what this update actually did.
const me = await page.evaluate(() => localStorage.getItem('hitman-player')) ?? ME;
rows[2].playerId = me;
for (const board of Object.values(boards)) board[2].playerId = me;

await mkdir(out, { recursive: true });
/**
 * Down to a width a phone actually shows it at, and out as WebP.
 *
 * Straight off a three-times screenshot these are four megabytes between them,
 * which is more than the rest of the game's artwork put together and all of it
 * for three pictures somebody sees twice. The resizing is done in the browser
 * because the browser is already open and already has an encoder in it.
 */
const WIDTH = 620;
async function keep(name, png) {
  const webp = await page.evaluate(async ([data, width]) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve; image.onerror = reject; image.src = data;
    });
    const scale = Math.min(1, width / image.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.86);
  }, [`data:image/png;base64,${png.toString('base64')}`, WIDTH]);
  const bytes = Buffer.from(webp.split(',')[1], 'base64');
  await writeFile(`${out}${name}.webp`, bytes);
  console.log(`  wrote ${name}.webp (${Math.round(bytes.length / 1024)}KB)`);
}

/**
 * Lights the third row as the player's own.
 *
 * The game resolves its player id from three stores with a one-second fuse and
 * mints a fresh one when they are slow, which in a headless browser on a cold
 * profile they always are — so the row is lit here rather than fought for. It
 * is the same class the board puts on it when it recognises you, on the real
 * component, in its real state.
 */
const lightMyRow = () => page.evaluate(() => {
  const row = document.querySelectorAll('.board-row')[2];
  if (row) { row.classList.add('is-you'); row.setAttribute('aria-current', 'true'); }
});

const shoot = async (name, selector) => {
  const target = await page.$(selector);
  if (!target) throw new Error(`nothing at ${selector} for ${name}`);
  await keep(name, await target.screenshot());
};

await page.click('#cover-board');
await page.waitForTimeout(1500);
await lightMyRow();
await shoot('board', '.board-stack');

// The career ladders, which are the part of the board that is actually new.
const ladder = await page.$('#board-ladder-runs');
if (ladder) { await ladder.click(); await page.waitForTimeout(1200); }
await lightMyRow();
await shoot('ladders', '.board-stack');

// The card is painted rather than screenshotted, because the address printed
// along its bottom edge is the address of whatever is serving it — and a
// picture of somebody's career with `127.0.0.1` on it is not an advertisement.
const drawn = await page.evaluate(async career => {
  const card = await import('/src/game/StatsCard.ts');
  const facts = card.statsFacts('classic', career, { name: 'Hardik', avatar: 2 }, '3rd on Runs');
  const picture = await card.statsCardImage(facts, 'hitman-cricket.vercel.app', 3);
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(picture);
  });
}, boards.runs[2].career);
await keep('card', Buffer.from(String(drawn).split(',')[1], 'base64'));

await browser.close();
console.log('\nart done\n');
