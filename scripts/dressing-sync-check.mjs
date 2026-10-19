/**
 * The Dressing Room following a player to another device.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/dressing-sync-check.mjs
 *
 * Two browsers that share nothing but a player id, which is what a career key
 * restores. On the first the player unlocks Boom in the room and puts on
 * Crimson; the second, opened afterwards with an empty Dressing Room, goes
 * out to bat in Crimson with Boom without being told anything, and has Boom's
 * unlock already behind it. A third player, with a name of their own, is
 * untouched by any of it. It runs against the dev server's store, in memory,
 * so it needs no database; `api/dressing.ts` is the same calls over Redis.
 *
 * Each run makes new players, so a second run on the same server starts clean.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const letters = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const idOf = () => `${Date.now().toString(36)}-${letters(14)}`;
/** Twenty-six innings: Crimson earned, and noted as seen so it does not go up over Choose a mode. */
const CAREER = { classic: { innings: 26, runs: 600, balls: 500, sixes: 20, fours: 60, wickets: 20, dots: 100, highest: 60, notOut: 0, individual: 60, hundreds: 0 } };

const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

/** A browser that is this player, with a name and a career, and whatever Dressing Room it is handed. */
async function device(id, name, dressing) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addInitScript(([id, name, career, dressing]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('hitman-player', id);
    localStorage.setItem('hitman-batter', JSON.stringify({ name, avatar: 0 }));
    localStorage.setItem('hitman-profile', '1');
    localStorage.setItem('hitman-shots-intro', 'done');
    // Past the update's stories.
    localStorage.setItem('hitman-whatsnew', 'player-profiles:9');
    localStorage.setItem('hitman-career', JSON.stringify(career));
    if (dressing) localStorage.setItem('hitman-dressing', JSON.stringify(dressing));
  }, [id, name, CAREER, dressing]);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  await page.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(500); }
  await page.locator('#start').click({ force: true });
  await page.waitForSelector('#modes:not(.hidden)', { timeout: 30_000 });
  return { page, context };
}
const held = page => page.evaluate(() => JSON.parse(localStorage.getItem('hitman-dressing') ?? 'null'));
const lookAtCrease = async page => {
  await page.locator('#mode-classic').click({ force: true });
  for (let i = 0; i < 80; i++) {
    const seen = await page.evaluate(() => window.__cricket.snapshot());
    if (seen.phase === 'READY') return seen.look;
    await page.waitForTimeout(250);
  }
  return page.evaluate(() => window.__cricket.snapshot().look);
};

const player = idOf(), name = `Drs${letters(6)}`;
const seen = ['kit:home', 'kit:crimson', 'bat:plain'];

console.log('The first device');
const first = await device(player, name, { outfit: 'home', bat: 'plain', pickedAt: 0, launch: null, seen, visited: false });
await first.page.locator('#modes-dressing').click({ force: true });
await first.page.waitForSelector('#dressing-overlay .dr-stage', { state: 'attached', timeout: 30_000 });
await first.page.waitForTimeout(1500);
await first.page.locator('#dressing-tab-bat').click();
await first.page.locator('.dr-item[data-id="boom"]').click();
await first.page.locator('#dressing-key').click();
await first.page.waitForSelector('#unlock-overlay.is-revealed', { timeout: 30_000 }).catch(() => {});
await first.page.locator('#unlock-take').click();
await first.page.waitForTimeout(400);
await first.page.locator('#dressing-tab-kit').click();
await first.page.locator('.dr-item[data-id="crimson"]').click();
// Crimson was earned before the room arrived, so it waits for its key too:
// its moment plays, and WEAR IT NOW puts it on.
check((await first.page.locator('#dressing-key').innerText()).includes('UNLOCK CRIMSON'), 'Crimson, earned before the room, waits for its key');
await first.page.locator('#dressing-key').click();
await first.page.waitForSelector('#unlock-overlay.is-revealed', { timeout: 30_000 }).catch(() => {});
await first.page.locator('#unlock-take').click();
// Sent a moment after the last change: the save that carries Crimson on him.
const sent = await first.page.waitForResponse(async response => response.url().includes('/api/dressing') && response.request().method() === 'POST'
  && (await response.json().catch(() => null))?.dressing?.outfit === 'crimson', { timeout: 15_000 }).catch(() => null);
check(!!sent && sent.ok(), 'a moment after the change, it is sent to the store', sent && sent.status());
const kept = sent ? (await sent.json()).dressing : null;
check(kept?.outfit === 'crimson' && kept?.bat === 'boom' && kept?.seen.includes('bat:boom') && kept?.shown.includes('kit:crimson'),
  'which keeps Crimson, Boom, and both unlocked', JSON.stringify(kept));
check(first.page.errors.length === 0, 'with nothing in the console', first.page.errors.join(' | '));
await first.context.close();

console.log('A second device, the same player');
const second = await device(player, name, null);
await second.page.waitForTimeout(1500);
const taken = await held(second.page);
check(taken?.outfit === 'crimson' && taken?.bat === 'boom', 'has the pick without being told', JSON.stringify(taken));
check(taken?.seen.includes('bat:boom') && taken?.shown.includes('kit:crimson'), 'and Boom and Crimson already unlocked, so neither waits in the room again', JSON.stringify(taken?.shown));
const look = await lookAtCrease(second.page);
check(look === 'crimson/boom/sterling', 'and goes out to bat in Crimson with Boom', look);
check(second.page.errors.length === 0, 'with nothing in the console', second.page.errors.join(' | '));
await second.context.close();

console.log('Somebody else');
const other = await device(idOf(), `Drs${letters(6)}`, null);
await other.page.waitForTimeout(1500);
const theirs = await lookAtCrease(other.page);
check(theirs === 'home/plain/sterling', 'is untouched by it', theirs);
await other.context.close();

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
