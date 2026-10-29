/**
 * New #1 and the rank hero, driven in a real browser against the dev server.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=… node scripts/topspot-check.mjs http://localhost:5201
 *
 * Three rivals are put on the dev store's Blast board under new letters each
 * run, then a named player bats past all of them: New #1 plays over the end
 * card (the ladder with the rivals on it, the takeover, the lockup) and hands
 * back to it, the #1 landing on the rank hero, which says nobody is ahead. A
 * tap skips it. A second named player makes less than all of them: no New
 * #1, and the rank hero says where it landed and what the next place takes.
 * Then `?topspot=1`'s keys put it up by board. Photographs go to
 * test-results/topspot/.
 *
 * Start the dev server fresh for it: its top player makes 180, the most a
 * Blast can, so a board that already has one (this check run before, on the
 * same server) has nobody left for it to take the top from.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const SHOTS = 'test-results/topspot';
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};
const letters = () => Array.from({ length: 5 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
const run = letters();
const browser = await chromium.launch({ executablePath });

/** A page at the crease for a named player, past every first-visit screen. */
async function crease(name, query = '', seed = {}) {
  const context = await browser.newContext({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ who, seed }) => {
    try {
      for (const [key, value] of Object.entries(seed)) if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-marathon-intro', 'done');
      localStorage.setItem('hitman-whatsnew', 'super10:9');
      localStorage.setItem('hitman-profile', '1');
      localStorage.setItem('hitman-rating', JSON.stringify({ rated: {}, finished: 0, played: {}, dismissals: 3, dismissedAt: Date.now() }));
      if (who && !localStorage.getItem('hitman-batter')) localStorage.setItem('hitman-batter', JSON.stringify({ name: who, avatar: 1 }));
    } catch { /* The screens it skips stand in the way, and the check says so. */ }
    // Whether the unlock ever went up, however briefly: watched once the page has a body.
    const watch = () => new MutationObserver(() => { if (document.getElementById('unlock-overlay')) window.__unlockSeen = true; })
      .observe(document.body, { childList: true, subtree: true });
    if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  }, { who: name, seed });
  await page.goto(`${base}/?debug=1&private=0${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  // The debug readout `?debug=1` brings stands over the card; it is not the card.
  await page.addStyleTag({ content: '#debug{display:none!important}' });
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(600); }
  return { context, page, errors, snap: () => page.evaluate(() => window.__cricket.snapshot()) };
}

/** A Blast written ball by ball to its end. */
async function blast(page, snap, balls) {
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 40 && (await snap()).phase !== 'READY'; i++) {
    const pick = page.locator('#mode-classic');
    if (await pick.isVisible().catch(() => false)) await pick.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.evaluate(b => window.__cricket.blast(b), balls);
  for (let i = 0; i < 40 && (await snap()).phase !== 'INNINGS_END'; i++) await page.waitForTimeout(300);
}

// The rivals: three Blasts in the 140s, straight to the dev store.
{
  const { context, page } = await crease(null);
  const posted = await page.evaluate(async ({ run }) => {
    const out = [];
    // Figures that add up: 150 off 25 sixes; 148 off 24 and a four; 145 off 24 and a single.
    const figures = [
      { runs: 150, sixes: 25, fours: 0, wickets: 1, dots: 4, balls: 30 },
      { runs: 148, sixes: 24, fours: 1, wickets: 1, dots: 4, balls: 30 },
      { runs: 145, sixes: 24, fours: 0, wickets: 1, dots: 4, balls: 30 },
    ];
    for (const [i, innings] of figures.entries()) {
      const answer = await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        playerId: `${Date.now().toString(36)}-${Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')}`, name: `Rival${run}${'abc'[i]}`, avatar: i, mode: 'classic',
        innings,
      }) });
      out.push(answer.status);
    }
    return out;
  }, { run });
  check(posted.every(status => status === 200), 'three rivals on the Blast board', JSON.stringify(posted));
  await context.close();
}

/** A player id as the store wants one: the moment, then a random half. */
const newId = () => `${Date.now().toString(36)}-${Array.from({ length: 16 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('')}`;

// A named player bats past all three: New #1, then the card. Ninety career
// sixes already counted, so this innings's thirty earn Rage at a hundred as
// well: the unlock must not go up over New #1, and Rage waits in the room.
{
  const topId = newId();
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise(done => setTimeout(done, 10_500));
    const counted = await fetch(`${base}/api/innings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      playerId: topId, mode: 'classic', nonce: `count-${run}-${i}`, look: null, name: `Top${run}`, avatar: 1,
      innings: { runs: 180, sixes: 30, fours: 0, wickets: 0, dots: 0, balls: 30, individual: 180, hundreds: 1 },
    }) });
    if (!counted.ok) check(false, 'ninety career sixes counted beforehand', `${counted.status} ${await counted.text()}`);
  }
  await new Promise(done => setTimeout(done, 10_500));
  const room = JSON.stringify({ outfit: 'home', bat: 'plain', seen: ['kit:home', 'kit:papaya', 'bat:plain', 'bat:boom'], shown: ['kit:home', 'kit:papaya', 'bat:plain', 'bat:boom'] });
  const { context, page, errors, snap } = await crease(`Top${run}`, '', { 'hitman-player': topId, 'hitman-dressing': room });
  await blast(page, snap, Array(30).fill(6));
  check((await snap()).phase === 'INNINGS_END', 'a Blast of sixes ends');
  await page.waitForSelector('.ts', { timeout: 15_000 }).catch(() => {});
  const up = await page.locator('.ts').count();
  check(up === 1, 'New #1 goes up over the end card');
  check(!(await page.locator('.lu-overlay').count()), 'before the Level Up the same innings earned, not behind it');
  if (up) {
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/1-gather.png` });
    const ladder = await page.evaluate(() => [...document.querySelectorAll('.ts-row')].map(row => row.querySelector('.ts-n').textContent));
    // Whoever else this dev server's board holds stands in it too, in their places.
    check(ladder.filter(name => name.startsWith(`Rival${run}`)).length >= 2 && ladder.at(-1) === 'You', 'the ladder: the rows that stood above, then you', JSON.stringify(ladder));
    check((await page.locator('.ts-head').textContent()) === 'THE BLAST · TOP OF THE BOARD', 'over the Blast board');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/2-takeover.png` });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOTS}/3-crowned.png` });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/4-lockup.png` });
    check((await page.locator('.ts-top').textContent()) === 'TOP OF THE BLAST', 'the lockup names the board');
    check(/^180 · 30 clear of Rival/.test(await page.locator('.ts-sub').textContent()), 'and says by how much', await page.locator('.ts-sub').textContent());
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) { await page.waitForTimeout(150); gone = !(await page.locator('.ts').count()); }
    check(gone, 'and hands back to the end card by itself');
    check(!(await page.evaluate(() => window.__cricket.topSpotOpen())), 'with nothing left playing');
    await page.waitForTimeout(3000);
    check(await page.locator('.lu-overlay').count() === 1, 'then that Level Up follows it');
    check(!(await page.evaluate(() => window.__unlockSeen ?? false)), 'and the bat the innings also earned does not go up over it or after it');
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('hitman-dressing') ?? '{}'));
    check(kept.seen?.includes('bat:rage') && !kept.shown?.includes('bat:rage'), 'Rage is known, and waits in the Dressing Room for its key', JSON.stringify({ seen: kept.seen, shown: kept.shown }));
  }
  await page.waitForTimeout(500);
  const hero = await page.evaluate(() => ({
    place: document.querySelector('#card-hero:not(.hidden) .rh-place')?.textContent ?? null,
    visible: getComputedStyle(document.querySelector('#card-hero .rh-place') ?? document.body).visibility,
    next: document.querySelector('#card-hero .rh-next')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    old: getComputedStyle(document.getElementById('card-board')).display,
  }));
  check(hero.place === '#1' && hero.visible === 'visible', 'the rank hero says #1, landed', JSON.stringify(hero));
  check(/Nobody ahead/.test(hero.next ?? ''), 'and nobody ahead', hero.next);
  check(hero.old === 'none', 'standing in for the old rank header');
  await page.screenshot({ path: `${SHOTS}/5-card.png` });
  // A Level Up the same innings earned followed New #1: put it away, as GO TO SCORECARD would.
  // The first Escape jumps it to its keys; the next is GO TO SCORECARD.
  for (let i = 0; i < 4 && await page.locator('.lu-overlay').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(900); }
  check(!(await page.evaluate(() => window.__unlockSeen ?? false)), 'nor after Level Up hands back');
  // Again, skipped by a tap.
  await page.evaluate(() => window.__cricket.topSpot('classic'));
  await page.waitForSelector('.ts', { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.mouse.click(200, 400);
  let skipped = false;
  for (let i = 0; i < 12 && !skipped; i++) { await page.waitForTimeout(150); skipped = !(await page.locator('.ts').count()); }
  check(skipped, 'a tap skips on to the end card');
  check(errors.length === 0, 'nothing thrown', errors.join(' | '));
  await context.close();
}

// A named player under all three: no New #1, the rank hero says where and what the next place takes.
{
  const { context, page, errors, snap } = await crease(`Low${run}`);
  await blast(page, snap, [...Array(10).fill(6), ...Array(19).fill(0), 'W']);
  let hero = null;
  for (let i = 0; i < 30 && !hero; i++) { await page.waitForTimeout(300); hero = await page.locator('#card-hero:not(.hidden) .rh').count() ? true : null; }
  check(!!hero, 'a named player’s card is the rank hero');
  await page.waitForTimeout(1500);
  check(!(await page.locator('.ts').count()), 'and no New #1 for a place below the top');
  const said = await page.evaluate(() => ({
    place: document.querySelector('.rh-place')?.textContent, chip: document.querySelector('.rh-chip')?.textContent.trim(),
    head: document.querySelector('.rh-head')?.textContent.trim(), left: document.querySelector('.rh-cell small')?.textContent,
    next: document.querySelector('.rh-next')?.textContent.replace(/\s+/g, ' ').trim(),
  }));
  check(/^#\d+$/.test(said.place ?? '') && said.chip === 'NEW', 'its place, NEW for a first row', JSON.stringify(said));
  check(said.head === 'New best 60', 'a new best said with its runs', said.head);
  check(said.left === 'THIS INNINGS' || said.left === 'YOU SURPASSED', 'what it surpassed, or the innings', said.left);
  check(/^NEXT · #\d+ .* \d+ runs to surpass$/.test(said.next ?? ''), 'and the next place, with what it takes', said.next);
  await page.screenshot({ path: `${SHOTS}/6-below.png` });
  check(errors.length === 0, 'nothing thrown', errors.join(' | '));
  await context.close();
}

// `?topspot=1`: one a board.
{
  const { context, page, errors } = await crease(`Prv${run}`, '&topspot=1');
  const keys = await page.locator('.topspot-preview .rate-preview-key').allTextContents();
  check(JSON.stringify(keys) === JSON.stringify(['BLAST', 'MARATHON', 'SURVIVAL']), '?topspot=1 carries a key a board', JSON.stringify(keys));
  await page.locator('.topspot-preview [data-mode="marathon"]').click();
  await page.waitForTimeout(3200);
  check((await page.locator('.ts-top').textContent().catch(() => '')) === 'TOP OF THE MARATHON', 'the Marathon’s, in its own words');
  await page.screenshot({ path: `${SHOTS}/7-marathon.png` });
  check(errors.length === 0, 'nothing thrown', errors.join(' | '));
  await context.close();
}

await browser.close();
console.log(`\n${failures ? `${failures} failed` : `all ok — pictures in ${SHOTS}/`}\n`);
if (failures) process.exitCode = 1;
