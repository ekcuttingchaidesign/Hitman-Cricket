/**
 * The Dressing Room, reached the way a player reaches it: Choose a mode, its
 * card, the room.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/dressing-check.mjs
 *   SHOTS=dir node scripts/dressing-check.mjs      # and photographs each step
 *
 * The rules for what is earned are `dressing.ts`'s, in the unit tests; what no
 * unit test can see is the screen — the stage drawn, the shelf's pictures made
 * off the models, a locked item's key, a kit put on — and that the batter then
 * goes out to bat in it, which is the point of the room. It plays from a career
 * written into this browser, so it needs no database.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

/** A career that has earned some of each shelf and not the rest: Crimson, British Racing Green and Savage, not Electric or Ice Cold. */
const CAREER = {
  classic: { innings: 30, runs: 4000, balls: 2500, sixes: 182, fours: 300, wickets: 60, dots: 400, highest: 112, notOut: 2, individual: 112, hundreds: 1 },
  survive: { innings: 20, runs: 900, balls: 640, sixes: 20, fours: 60, blows: 10, wins: 18, draws: 1, losses: 1 },
  marathon: { innings: 6, runs: 900, balls: 1100, fours: 80, sixes: 10, highest: 142, individual: 142, fifties: 4, hundreds: 1, doubles: 0, longest: 300 },
};

const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(dressing) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.addInitScript(([career, dressing]) => {
    try {
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-whatsnew', 'dressing-room:9');
      localStorage.setItem('hitman-career', JSON.stringify(career));
      if (dressing && !sessionStorage.getItem('seeded')) { localStorage.setItem('hitman-dressing', JSON.stringify(dressing)); sessionStorage.setItem('seeded', '1'); }
    } catch { /* Then it shows. */ }
  }, [CAREER, dressing]);
  // Nothing to post to: the boards and the career stay in this browser.
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }) }));
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  await page.goto(`${base}/?debug=1`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(500); }
  await page.locator('#start').click({ force: true });
  await page.waitForSelector('#modes:not(.hidden)', { timeout: 20_000 });
  return page;
}
const shoot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };
const text = (page, selector) => page.locator(selector).innerText().then(s => s.trim(), () => '');
const until = async (page, phase) => {
  for (let i = 0; i < 80; i++) {
    const seen = await page.evaluate(() => window.__cricket.snapshot());
    if (seen.phase === phase) return seen;
    await page.waitForTimeout(250);
  }
  return page.evaluate(() => window.__cricket.snapshot());
};

console.log('Choose a mode');
const page = await open(null);
await page.waitForTimeout(1500);
check(await page.evaluate(() => window.__cricket.unlocking()) === null, 'a career arriving in the room is noted, not celebrated');
const card = page.locator('#modes-dressing');
check(await card.isVisible(), 'carries the Dressing Room card');
check(await text(page, '#modes-dressing-line') === '5 of 13 earned', 'which says how much of the room is earned, Boom not yet among it', await text(page, '#modes-dressing-line'));
check(await card.locator('.ms-tag').isVisible(), 'with NEW on it before the room is opened');
const order = await page.locator('.ms-content > *').evaluateAll(all => all.map(one => one.id || one.className.split(' ')[0]));
check(order.indexOf('mode-survive') < order.indexOf('ms-card') && order.indexOf('ms-card') < order.indexOf('modes-dressing') && order.indexOf('modes-dressing') < order.indexOf('ms-bento'),
  'under Rivals, above the boards and My stats', order.join(' · '));
await page.locator('.ms-content').evaluate(content => { content.scrollTop = content.scrollHeight; });
await shoot(page, '1-modes');

console.log('The room');
await card.click({ force: true });
await page.waitForSelector('#dressing-overlay .dr-stage', { timeout: 20_000 });
// Walking in earns Boom, handed over before anything else.
await page.waitForSelector('#unlock-overlay', { timeout: 30_000 }).catch(() => {});
check(await page.evaluate(() => window.__cricket.unlocking()) === 'bat:boom', 'the first visit hands over Boom', await page.evaluate(() => window.__cricket.unlocking()));
await page.waitForSelector('#unlock-overlay.is-revealed', { timeout: 30_000 }).catch(() => {});
await shoot(page, '2-boom');
await page.locator('#unlock-take').click();
await page.waitForTimeout(500);
check(await page.locator('#unlock-overlay').count() === 0 && await text(page, '#dressing-name') === 'BOOM', 'TAKE IT IN puts it in his hand, in the room', await text(page, '#dressing-name'));
check(await page.locator('.dr-item[data-id="boom"] .dr-badge.is-on').count() === 1, 'with the tick on it');
await page.locator('#dressing-tab-kit').click();
await page.waitForTimeout(300);
check(await text(page, '#dressing-name') === 'OG NAVY', 'the kits open on the one he wears', await text(page, '#dressing-name'));
await page.waitForFunction(() => document.querySelectorAll('#dressing-items img').length === 7, null, { timeout: 30_000 }).catch(() => {});
const pictures = await page.locator('#dressing-items img').evaluateAll(all => all.map(one => one.src.length));
check(pictures.length === 7 && pictures.every(size => size > 4000), 'with a picture of every kit, drawn off the model', JSON.stringify(pictures));
check(await page.locator('.dr-item[data-id="home"] .dr-badge.is-on').count() === 1, 'a tick on the one he wears');
check(await page.locator('.dr-item.is-locked').count() === 4, 'and a lock on each of the four not earned');
const rail = await page.locator('#dressing-items').evaluate(one => ({ shown: one.clientHeight, all: one.scrollHeight }));
check(rail.shown >= rail.all || (rail.shown + 20 < rail.all), 'the rail shows them all, or stops part-way down one', JSON.stringify(rail));
check((await text(page, '#dressing-key')).includes('WEARING'), 'which is WEARING at the foot');
check(await page.locator('#dressing-next').isVisible(), 'over Next up');
await shoot(page, '3-room');

await page.locator('.dr-item[data-id="electric"]').click();
await page.waitForTimeout(300);
check(await text(page, '#dressing-name') === 'ELECTRIC', 'a locked kit is tried on');
check((await text(page, '#dressing-foot')).includes('Win 50 Test Survivals'), 'and says what it takes');
check((await text(page, '#dressing-key')).includes('PLAY TEST SURVIVAL'), 'with the key to the game it is won in');
await shoot(page, '4-locked');

await page.locator('.dr-item[data-id="forest"]').click();
await page.waitForTimeout(300);
check((await text(page, '#dressing-key')).includes('WEAR IT'), 'an earned one can be worn');
await page.locator('#dressing-key').click();
await page.waitForTimeout(300);
check((await text(page, '#dressing-key')).includes('WEARING') && await page.locator('.dr-item[data-id="forest"] .dr-badge.is-on').count() === 1, 'and is, the tick moving with it');

await page.locator('#dressing-tab-bat').click();
await page.waitForFunction(() => document.querySelectorAll('#dressing-items img').length === 6, null, { timeout: 30_000 }).catch(() => {});
const bats = await page.locator('#dressing-items img').evaluateAll(all => all.map(one => one.src.length));
check(bats.length === 6 && bats.every(size => size > 4000), 'the bat shelf has a picture of every bat', JSON.stringify(bats));
await page.locator('.dr-item[data-id="savage"]').click();
await page.waitForTimeout(300);
check((await text(page, '#dressing-key')).includes('PICK IT UP'), 'Savage is earned and can be taken up');
await page.locator('#dressing-key').click();
await page.waitForTimeout(300);
check((await text(page, '#dressing-key')).includes('IN HAND'), 'and is');
await shoot(page, '5-bat');

await page.locator('#dressing-back').click();
await page.waitForTimeout(400);
check(await page.locator('#dressing-overlay').count() === 0, 'the back key goes back to Choose a mode');
check(!(await card.locator('.ms-tag').isVisible()), 'which has taken NEW off the card');

console.log('Out to bat');
await page.locator('#mode-classic').click({ force: true });
const ready = await until(page, 'READY');
check(ready.look === 'forest/savage', 'he goes out in British Racing Green with Savage', ready.look);
await shoot(page, '6-batting');
check(page.errors.length === 0, 'with nothing in the console', page.errors.join(' | '));
await page.close();

console.log('A pick no longer earned');
const other = await open({ outfit: 'lagoon', bat: 'hitman', launch: null, seen: ['kit:home', 'kit:crimson', 'kit:forest', 'bat:plain', 'bat:boom', 'bat:savage'], visited: true });
check(!(await other.locator('#modes-dressing .ms-tag').isVisible()), 'a room already opened has no NEW');
await other.locator('#mode-classic').click({ force: true });
const fallback = await until(other, 'READY');
check(fallback.look === 'home/plain', 'goes out in OG Navy with Plain instead', fallback.look);
await other.close();

console.log('An unlock');
// Crimson is earned by this career and not yet celebrated; everything else has been.
const seen = ['kit:home', 'kit:forest', 'bat:plain', 'bat:boom', 'bat:savage'];
const third = await open({ outfit: 'home', bat: 'boom', launch: { classic: 4000, survive: 640, marathon: 900 }, seen, visited: true });
await third.waitForSelector('#unlock-overlay', { timeout: 30_000 }).catch(() => {});
check(await third.evaluate(() => window.__cricket.unlocking()) === 'kit:crimson', 'goes up over Choose a mode for what was earned and not yet celebrated', await third.evaluate(() => window.__cricket.unlocking()));
await third.waitForSelector('#unlock-overlay.is-revealed', { timeout: 30_000 }).catch(() => {});
check((await text(third, '#unlock-words')).includes('NEW KIT UNLOCKED') && (await text(third, '#unlock-words')).includes('CRIMSON'), 'and says what it is');
await shoot(third, '7-unlock');
await third.locator('#unlock-take').click();
await third.waitForTimeout(500);
check(await third.locator('#unlock-overlay').count() === 0, 'WEAR IT NOW puts it away');
const after = await third.evaluate(() => JSON.parse(localStorage.getItem('hitman-dressing')));
check(after.outfit === 'crimson' && after.seen.includes('kit:crimson'), 'and puts it on, never to be celebrated again', JSON.stringify(after));
await third.reload({ waitUntil: 'load' });
await third.waitForTimeout(1200);
const again = third.getByRole('button', { name: /PLAY ANYWAY/i }); if (await again.count()) { await again.first().click(); await third.waitForTimeout(500); }
await third.locator('#start').click({ force: true });
await third.waitForSelector('#modes:not(.hidden)', { timeout: 20_000 });
await third.waitForTimeout(1500);
check(await third.locator('#unlock-overlay').count() === 0, 'not on the next visit either');
check(third.errors.length === 0, 'with nothing in the console', third.errors.join(' | '));
await third.close();

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
