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

/**
 * A career that has earned some of each shelf and not the rest: Crimson,
 * British Racing Green, and Rage, Venom, Lone Wolf, Roar and Savage; not
 * Electric, Ice Cold, Meg or Reign.
 */
const CAREER = {
  classic: { innings: 30, runs: 4000, balls: 2500, sixes: 182, fours: 300, wickets: 60, dots: 400, highest: 112, notOut: 2, individual: 112, hundreds: 1 },
  survive: { innings: 20, runs: 900, balls: 640, sixes: 20, fours: 60, blows: 10, wins: 18, draws: 1, losses: 1 },
  marathon: { innings: 6, runs: 900, balls: 1100, fours: 80, sixes: 10, highest: 142, individual: 142, fifties: 4, hundreds: 1, doubles: 0, longest: 300 },
  // Twelve Super10 innings: the Apex Vipers earned, the rest of its ladder not, and too few sixes to tip Ice Cold's 250.
  super10: { innings: 12, runs: 1200, balls: 700, wickets: 50, fours: 90, sixes: 30, highest: 150, hundreds: 4, doubles: 0 },
};

/** Every bat that career has earned, Boom unlocked as well: seen, so none goes up over Choose a mode. */
const EARNED_BATS = ['bat:plain', 'bat:boom', 'bat:rage', 'bat:venom', 'bat:lonewolf', 'bat:roar', 'bat:savage'];

const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(dressing) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.addInitScript(([career, dressing]) => {
    try {
      localStorage.setItem('hitman-shots-intro', 'done');
      // Past the update's stories.
      localStorage.setItem('hitman-whatsnew', 'super10:9');
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
// Off production Super10's six kits are on the shelf too: the Panthers and the Vipers earned.
check(await text(page, '#modes-dressing-line') === '12 of 26 earned', 'which says how much of the room is earned, Boom not yet among it', await text(page, '#modes-dressing-line'));
check(await card.locator('.ms-tag').isVisible(), 'with NEW on it before the room is opened');
const order = await page.locator('.ms-content > *').evaluateAll(all => all.map(one => one.id || one.className.split(' ')[0]));
check(order.indexOf('mode-super10') >= 0 && order.indexOf('mode-super10') < order.indexOf('modes-dressing') && order.indexOf('modes-dressing') < order.indexOf('ms-card') && order.indexOf('ms-card') < order.indexOf('ms-bento'),
  'under Super10, above Rivals, the boards and My stats', order.join(' · '));
await page.locator('.ms-content').evaluate(content => { content.scrollTop = content.scrollHeight; });
await shoot(page, '1-modes');

console.log('The room');
await card.click({ force: true });
await page.waitForSelector('#dressing-overlay .dr-stage', { timeout: 20_000 });
// Boom waits in the room for its key: nothing goes off on the way in.
await page.waitForTimeout(1500);
check(await page.evaluate(() => window.__cricket.unlocking()) === null, 'nothing is unlocked on the way in');
// What the career earned before the room arrived waits there too, for its key:
// a dot on both tabs, and every earned bat waiting beside Boom.
check(await page.locator('#dressing-tab-bat.has-dot').count() === 1 && await page.locator('#dressing-tab-kit.has-dot').count() === 1, 'a dot on both tabs, where things wait');
await page.locator('#dressing-tab-bat').click();
await page.waitForTimeout(400);
const waitingBats = await page.locator('.dr-item.is-ready').evaluateAll(all => all.map(one => one.dataset.id).sort());
check(JSON.stringify(waitingBats) === JSON.stringify(['boom', 'lonewolf', 'rage', 'roar', 'savage', 'venom']) && await page.locator('.dr-item[data-id="boom"].is-ready .dr-badge.is-ready').count() === 1,
  'and on the bat shelf, Boom and every bat the career earned waiting to be unlocked', JSON.stringify(waitingBats));
await page.locator('.dr-item[data-id="boom"]').click();
await page.waitForTimeout(300);
check((await text(page, '#dressing-key')).includes('UNLOCK BOOM'), 'tapped, its key unlocks it', await text(page, '#dressing-key'));
await page.locator('#dressing-key').click();
await page.waitForSelector('#unlock-overlay.is-revealed', { timeout: 30_000 }).catch(() => {});
check(await page.evaluate(() => window.__cricket.unlocking()) === 'bat:boom', 'and its unlock goes up', await page.evaluate(() => window.__cricket.unlocking()));
await shoot(page, '2-boom');
await page.locator('#unlock-take').click();
await page.waitForTimeout(500);
check(await page.locator('#unlock-overlay').count() === 0 && await text(page, '#dressing-name') === 'BOOM', 'TAKE IT IN puts it in his hand, in the room', await text(page, '#dressing-name'));
check(await page.locator('.dr-item[data-id="boom"] .dr-badge.is-on').count() === 1 && !(await page.locator('.dr-item[data-id="boom"]').evaluate(one => one.classList.contains('is-ready'))),
  'with the tick on it, no longer waiting');
await page.locator('#dressing-tab-kit').click();
await page.waitForTimeout(300);
check(await text(page, '#dressing-name') === 'OG NAVY', 'the kits open on the one he wears', await text(page, '#dressing-name'));
await page.waitForFunction(() => document.querySelectorAll('#dressing-items img').length === 14, null, { timeout: 30_000 }).catch(() => {});
const pictures = await page.locator('#dressing-items img').evaluateAll(all => all.map(one => one.src.length));
check(pictures.length === 14 && pictures.every(size => size > 4000), 'with a picture of every kit, Super10\'s six among them, drawn off the model', JSON.stringify(pictures));
check(await page.locator('.dr-item .dr-s10').count() === 6 && await page.locator('.dr-item:last-child .dr-s10').count() === 1, 'Super10\'s at the foot of the shelf, each tagged S10');
check(await page.locator('.dr-item[data-id="home"] .dr-badge.is-on').count() === 1, 'a tick on the one he wears');
check(await page.locator('.dr-item.is-locked').count() === 8, 'and a lock on each of the eight not earned, four of them Super10\'s');
const rail = await page.locator('#dressing-items').evaluate(one => ({ shown: one.clientHeight, all: one.scrollHeight }));
check(rail.shown >= rail.all || (rail.shown + 20 < rail.all), 'the rail shows them all, or stops part-way down one', JSON.stringify(rail));
check((await text(page, '#dressing-key')).includes('WEARING'), 'which is WEARING at the foot');
check(await page.locator('#dressing-next').isVisible(), 'over Next up');
await shoot(page, '3-room');

await page.locator('.dr-item[data-id="electric"]').click();
await page.waitForTimeout(300);
check(await text(page, '#dressing-name') === 'ELECTRIC', 'a locked kit is tried on');
check((await text(page, '#dressing-foot')).includes('Make 150 in the Blast'), 'and says what it takes');
check((await text(page, '#dressing-key')).includes('PLAY THE BLAST'), 'with the key to the game it is won in');
await shoot(page, '4-locked');

// Earned before the room arrived: its key plays its moment, and that puts it on.
await page.locator('.dr-item[data-id="forest"]').click();
await page.waitForTimeout(300);
check((await text(page, '#dressing-key')).includes('UNLOCK BRITISH RACING GREEN'), 'a kit earned before the room waits for its key', await text(page, '#dressing-key'));
await page.locator('#dressing-key').click();
await page.waitForSelector('#unlock-overlay.is-revealed', { timeout: 30_000 }).catch(() => {});
check(await page.evaluate(() => window.__cricket.unlocking()) === 'kit:forest', 'which plays its unlock', await page.evaluate(() => window.__cricket.unlocking()));
await page.locator('#unlock-take').click();
await page.waitForTimeout(500);
check((await text(page, '#dressing-key')).includes('WEARING') && await page.locator('.dr-item[data-id="forest"] .dr-badge.is-on').count() === 1, 'and puts it on, the tick moving with it');
check((await page.evaluate(() => JSON.parse(localStorage.getItem('hitman-dressing')).shown)).includes('kit:forest'), 'never to wait again');

// Super10's: earned off its own career, unlocked in the room, worn in Super10 alone.
await page.locator('.dr-item[data-id="s10-violet"]').click();
await page.waitForTimeout(300);
const mavericks = await text(page, '#dressing-foot');
check(await text(page, '#dressing-name') === 'ROYAL MAVERICKS' && /Only in Super10/i.test(mavericks) && mavericks.includes('Make 200 in a Super10 innings') && mavericks.includes('Score 10,000 runs in Super10'),
  'a locked Super10 kit is tried on, only for Super10, with its team-total targets', mavericks.replace(/\s+/g, ' ').slice(0, 160));
check((await text(page, '#dressing-key')).includes('PLAY SUPER10'), 'its key plays Super10');
await shoot(page, '5a-super10-locked');
await page.locator('.dr-item[data-id="s10-neon"]').click();
await page.waitForTimeout(300);
check((await text(page, '#dressing-key')).includes('UNLOCK APEX VIPERS'), 'a Super10 kit already earned waits for its key', await text(page, '#dressing-key'));
await page.locator('#dressing-key').click();
await page.waitForSelector('#unlock-overlay.is-revealed', { timeout: 30_000 }).catch(() => {});
check(await page.evaluate(() => window.__cricket.unlocking()) === 'kit:s10-neon', 'which plays its unlock', await page.evaluate(() => window.__cricket.unlocking()));
await shoot(page, '5b-super10-unlock');
await page.locator('#unlock-take').click();
await page.waitForTimeout(500);
const picked = await page.evaluate(() => JSON.parse(localStorage.getItem('hitman-dressing')));
check((await text(page, '#dressing-key')).includes('WEARING IN SUPER10') && await page.locator('.dr-item[data-id="s10-neon"] .dr-badge.is-on').count() === 1
  && await page.locator('.dr-item[data-id="forest"] .dr-badge.is-on').count() === 1,
'and puts it on for Super10, the kit he wears elsewhere still ticked');
check(picked.super10 === 's10-neon' && picked.outfit === 'forest', 'kept as Super10\'s pick alone', JSON.stringify({ super10: picked.super10, outfit: picked.outfit }));

await page.locator('#dressing-tab-bat').click();
await page.waitForFunction(() => document.querySelectorAll('#dressing-items img').length === 12, null, { timeout: 30_000 }).catch(() => {});
const bats = await page.locator('#dressing-items img').evaluateAll(all => all.map(one => one.src.length));
check(bats.length === 12 && bats.every(size => size > 4000), 'the bat shelf has a picture of every bat', JSON.stringify(bats));
await page.locator('.dr-item[data-id="savage"]').click();
await page.waitForTimeout(300);
check((await text(page, '#dressing-key')).includes('UNLOCK SAVAGE'), 'Savage is earned and waits for its key');
await page.locator('#dressing-key').click();
await page.waitForSelector('#unlock-overlay.is-revealed', { timeout: 30_000 }).catch(() => {});
await page.locator('#unlock-take').click();
await page.waitForTimeout(500);
check((await text(page, '#dressing-key')).includes('IN HAND'), 'and after its moment is in his hand');
await shoot(page, '5-bat');

console.log('The guard');
await page.locator('#dressing-tab-guard').click();
await page.waitForTimeout(400);
check(await text(page, '#dressing-name') === 'STERLING', 'the guard shelf opens on the one he wears', await text(page, '#dressing-name'));
await page.waitForFunction(() => document.querySelectorAll('#dressing-items img').length === 8, null, { timeout: 30_000 }).catch(() => {});
const gloves = await page.locator('#dressing-items img').evaluateAll(all => all.map(one => one.src.length));
check(gloves.length === 8 && gloves.every(size => size > 4000), 'the shelf has a picture of every guard, gloves and pads', JSON.stringify(gloves));
check(await page.locator('#dressing-items .is-locked').count() === 0 && await page.locator('#dressing-tab-guard.has-dot').count() === 0, 'none of them locked, nothing waiting');
check((await text(page, '#dressing-key')).includes('WEARING'), 'which is WEARING at the foot');
await page.locator('.dr-item[data-id="carbon"]').click();
await page.waitForTimeout(300);
check(await text(page, '#dressing-name') === 'EMBER' && /free/i.test(await text(page, '#dressing-foot')), 'another guard is tried on, free', `${await text(page, '#dressing-name')} · ${await text(page, '#dressing-foot')}`);
check((await text(page, '#dressing-key')).includes('WEAR IT'), 'with WEAR IT at the foot');
await page.locator('#dressing-key').click();
await page.waitForTimeout(300);
check((await text(page, '#dressing-key')).includes('WEARING') && await page.locator('.dr-item[data-id="carbon"] .dr-badge.is-on').count() === 1, 'and puts it on, the tick moving with it');
await shoot(page, '5b-guard');

await page.locator('#dressing-back').click();
await page.waitForTimeout(400);
check(await page.locator('#dressing-overlay').count() === 0, 'the back key goes back to Choose a mode');
check(await card.locator('.ms-tag').isVisible(), 'which keeps NEW on the card while anything still waits');

console.log('Out to bat');
await page.locator('#mode-classic').click({ force: true });
const ready = await until(page, 'READY');
check(ready.look === 'forest/savage/carbon', 'he goes out in British Racing Green with Savage, in Ember', ready.look);
await shoot(page, '6-batting');
console.log('Out to bat in Super10');
await page.goto(`${base}/?debug=1&mode=super10`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.locator('#start').click({ force: true });
for (let i = 0; i < 30 && (await page.evaluate(() => window.__cricket.snapshot())).phase !== 'READY'; i++) {
  const done = page.locator('#whatsnew-done');
  if (await done.isVisible().catch(() => false)) await done.click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
}
const tenReady = await page.evaluate(() => window.__cricket.snapshot());
check(/^s10-neon\/savage\/super10/.test(tenReady.look ?? ''), 'he goes out in the Apex Vipers, its gloves and pads, with Savage', tenReady.look);
await shoot(page, '6b-super10');
check(page.errors.length === 0, 'with nothing in the console', page.errors.join(' | '));
await page.close();

console.log('A pick no longer earned');
const shownAll = ['kit:home', 'kit:crimson', 'kit:forest', 'kit:s10-neon', ...EARNED_BATS];
const other = await open({ outfit: 'lagoon', bat: 'hitman', guard: 'midnight', launch: null, seen: shownAll, shown: shownAll, visited: true });
check(!(await other.locator('#modes-dressing .ms-tag').isVisible()), 'a room already opened has no NEW');
await other.locator('#mode-classic').click({ force: true });
const fallback = await until(other, 'READY');
check(fallback.look === 'home/plain/midnight', 'goes out in OG Navy with Plain instead, the guard still his', fallback.look);
await other.close();

console.log('An unlock');
// Crimson is earned by this career and not yet celebrated; everything else has been.
const seen = ['kit:home', 'kit:forest', 'kit:s10-neon', ...EARNED_BATS];
const third = await open({ outfit: 'home', bat: 'boom', launch: { classic: 4000, survive: 640, marathon: 900 }, seen, shown: seen, visited: true });
await third.waitForSelector('#unlock-overlay', { timeout: 30_000 }).catch(() => {});
check(await third.evaluate(() => window.__cricket.unlocking()) === 'kit:crimson', 'goes up over Choose a mode for what was earned and not yet celebrated', await third.evaluate(() => window.__cricket.unlocking()));
await third.waitForSelector('#unlock-overlay.is-revealed', { timeout: 30_000 }).catch(() => {});
check((await text(third, '#unlock-words')).includes('NEW KIT UNLOCKED') && (await text(third, '#unlock-words')).includes('CRIMSON'), 'and says what it is');
await shoot(third, '7-unlock');
await third.locator('#unlock-take').click();
await third.waitForTimeout(500);
check(await third.locator('#unlock-overlay').count() === 0, 'WEAR IT NOW puts it away');
const after = await third.evaluate(() => JSON.parse(localStorage.getItem('hitman-dressing')));
check(after.outfit === 'crimson' && after.seen.includes('kit:crimson') && after.shown.includes('kit:crimson'), 'and puts it on, never to be celebrated again', JSON.stringify(after));
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
