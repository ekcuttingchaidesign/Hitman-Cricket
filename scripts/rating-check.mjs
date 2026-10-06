/**
 * The star prompt: when it rises, what a star sends, and what follows it.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/rating-check.mjs
 *   node scripts/rating-check.mjs http://…:4173    # a preview build
 *
 * Reached the way a player reaches it — by finishing innings — because the rule
 * it holds is one about *when*, and the debug hook that puts it up on demand
 * cannot say anything about that. A first innings must not ask; the second, in
 * a mode not yet rated, must; a third that visit must not, however it ends.
 * Only after that does it use the hook, to look at each way a rating is met
 * without batting through four more innings.
 *
 * The celebrations are judged by what they leave in the page rather than by
 * their frames: a headless browser rendering in software can hold a CSS
 * animation on its first frame, so the check reads the classes, the pieces in
 * the burst, and the requests that went out — the things a frozen animation
 * cannot fake. Pictures are written to the folder named by `SHOTS`, if one is,
 * for a person to look at.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const shots = process.env.SHOTS || '';
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', error => errors.push(error.message));

/** Every form sent, as the endpoint received it. */
const sent = [];
page.on('request', request => {
  if (request.url().includes('/api/feedback') && request.method() === 'POST') {
    try { sent.push(JSON.parse(request.postData() ?? '{}')); } catch { /* Not one of ours. */ }
  }
});

const snap = () => page.evaluate(() => window.__cricket.snapshot());
const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
const settle = async (ms = 300) => { await advance(ms); await page.waitForTimeout(250); };
const shoot = async name => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`) }); };
const until = async phase => {
  for (let i = 0; i < 60; i++) {
    const seen = await snap();
    if (seen.phase === phase) return seen;
    await advance(300);
  }
  throw new Error(`Never reached ${phase}: ${JSON.stringify(await snap())}`);
};
const memory = () => page.evaluate(() => JSON.parse(localStorage.getItem('hitman-rating') ?? 'null'));
const pop = page.locator('.rate-pop:not(.is-leaving)');
const popUp = async () => (await pop.count()) > 0 && pop.first().isVisible();

/** A Test Survival innings, played a few balls and then to the end. */
const finishInnings = async () => {
  for (let i = 0; i < 2; i++) {
    const ball = await until('BALL_IN_FLIGHT');
    const key = ball.effectiveLine === 'MIDDLE' ? 'w' : Number(ball.finalX) < 0 ? 'a' : 'd';
    await advance(ball.contactAt - ball.elapsed - 65);
    await page.keyboard.press(key);
    await advance(2600);
  }
  await page.evaluate(() => window.__cricket.hurt());
  for (let i = 0; i < 40; i++) {
    if ((await snap()).phase === 'INNINGS_END') return;
    await advance(1500);
  }
  throw new Error('The innings never ended');
};

// A private window counts nothing, and a headless browser reads as one. A visit
// remembered from an earlier day is the tell that settles it.
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try { localStorage.setItem('hitman-seen', day); } catch { /* Then nothing counts. */ }
});

await page.clock.install();
await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
await settle(2500);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await settle(1200); }

await page.locator('#start').click({ force: true });
await settle(400);
for (let i = 0; i < 8; i++) {
  const done = page.locator('#whatsnew-done');
  if (!(await done.count()) || !(await done.isVisible())) break;
  await done.click({ force: true, timeout: 3000 }).catch(() => {});
  await settle(400);
}
await page.locator('#mode-survive').click({ force: true });
await settle(600);

// ── The first innings anybody plays asks nothing ────────────────────────────
await finishInnings();
await settle(2500);
check(!(await popUp()), 'the first finished innings is not asked about');
check((await memory())?.finished === 1, 'but it is counted', JSON.stringify(await memory()));

// ── The second, in a mode not yet rated, asks about that mode ───────────────
await page.locator('#survive-again').click({ force: true });
await settle(600);
await finishInnings();
await settle(400);
check(!(await popUp()), 'the card stands on its own for a moment first');
await settle(1800);
check(await popUp(), 'then the stars rise under it');
check(await pop.getAttribute('data-thing') === 'survive', 'asked about the mode just played, by name',
  await pop.getAttribute('data-thing'));
check((await pop.locator('.rate-ask').textContent())?.includes('Test Survival'), 'and says which');
check((await page.locator('#survive-again').isVisible()), 'with the card and its keys still there behind it');
await shoot('rating-asked');

// A pointer over the row lights the stars up to it, without giving them.
const star = n => pop.locator(`.rate-star[data-n="${n}"]`);
const box = await star(2).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await settle(100);
check(await pop.locator('.rate-star.is-lit').count() === 2, 'two stars lit under a pointer on the second');
check((await pop.locator('.rate-word').textContent()) === 'It’s okay', 'with the second star’s word under them');
check(sent.length === 0, 'and nothing is sent for looking');

// ── Five, tapped ────────────────────────────────────────────────────────────
const five = await star(5).boundingBox();
await page.mouse.move(five.x + five.width / 2, five.y + five.height / 2);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(150);
check(await pop.getAttribute('data-stars') === '5', 'a tap on the fifth gives five');
check(await pop.evaluate(node => node.classList.contains('is-top')), 'and is met as a five');
check(await pop.locator('.rate-ball').count() === 1 && await pop.locator('.rate-six').count() === 1,
  'the last star goes up as a ball, with the call');
check(await pop.locator('.rate-confetti').count() > 10, 'and the confetti with it', String(await pop.locator('.rate-confetti').count()));
await shoot('rating-five');
await settle(400);
const tap = sent.find(form => form.rating);
check(tap?.rating?.stars === 5 && tap.rating.thing === 'survive' && tap.rating.moment === 'mode',
  'the stars are sent the moment they land', JSON.stringify(tap));
check(tap && Object.keys(tap.answers).length === 0, 'on their own, with nothing else asked');
check(!!(await memory())?.rated?.survive, 'and remembered as rated', JSON.stringify(await memory()));

await settle(1400);
const more = pop.locator('.rate-more');
check(await more.isVisible(), 'then it offers more');
check((await more.textContent())?.includes('NEXT'), 'in words that answer a five', await more.textContent());
await shoot('rating-more');

// ── Tell us more ────────────────────────────────────────────────────────────
await more.click();
await settle(400);
check(!(await popUp()), 'the slip goes when more is asked for');
const sheet = page.locator('.feedback-screen');
check(await sheet.isVisible(), 'and the follow-up opens');
check((await sheet.locator('.feedback-eyebrow').textContent()) === 'TELL US MORE', 'as the follow-up, not the questionnaire');
check((await sheet.locator('.feedback-ask').textContent()) === 'What should we build next?', 'asking a five what to build next',
  await sheet.locator('.feedback-ask').textContent());
await sheet.locator('.feedback-choice[data-choice="bowl"]').click();
await sheet.locator('#feedback-next').click();
await settle(200);
check((await sheet.locator('.feedback-ask').textContent()) === 'How did taking blows feel?', 'then about the mode itself',
  await sheet.locator('.feedback-ask').textContent());
await sheet.locator('.feedback-choice[data-choice="fair"]').click();
await settle(300);
await sheet.locator('.feedback-choice[data-choice="right"]').click();
await settle(300);
await sheet.locator('#feedback-send').click();
await settle(600);
const told = sent.filter(form => form.rating).at(-1);
check(told !== tap && told?.answers?.build?.[0] === 'bowl' && told.answers.sblows?.[0] === 'fair',
  'the answers are sent', JSON.stringify(told));
check(told?.rating?.ref === tap?.rating?.ref, 'under the same ref as the stars, so they read as one rating');
check(!(await page.evaluate(() => localStorage.getItem('hitman-feedback'))), 'and the questionnaire is still on offer after');
const back = page.locator('#feedback-done');
if (await back.count()) await back.click();
await settle(300);

// ── Once a visit ────────────────────────────────────────────────────────────
await page.locator('#survive-again').click({ force: true });
await settle(600);
await finishInnings();
await settle(2500);
check(!(await popUp()), 'the next innings this visit asks nothing');

// ── The other faces, on demand ──────────────────────────────────────────────
await page.evaluate(() => window.__cricket.rating('marathon'));
await settle(600);
await star(1).click();
await page.waitForTimeout(150);
check(await pop.evaluate(node => node.classList.contains('is-low')), 'one star is met quietly');
check(await pop.locator('.rate-burst > i').count() === 0, 'with nothing thrown in the air');
await settle(1000);
check((await pop.locator('.rate-more').textContent())?.includes('WENT WRONG'), 'and asks what went wrong');
await shoot('rating-one');
await pop.locator('.rate-done').click();
await settle(400);
check(!(await popUp()), 'Done puts it away');

await page.evaluate(() => window.__cricket.rating('rivals'));
await settle(600);
const before = (await memory())?.dismissals ?? 0;
await pop.locator('.rate-close').click();
await settle(400);
check(!(await popUp()), 'the cross waves it away');
check((await memory())?.dismissals === before + 1, 'and is remembered, so it keeps quiet for a while');
check(!(await memory())?.rated?.rivals, 'without counting as a rating');

// A keyboard walks the stars with the arrows and gives them with Enter.
await page.evaluate(() => window.__cricket.rating('game'));
await settle(600);
await star(1).focus();
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check(await pop.getAttribute('data-stars') === '3', 'arrows and Enter give three', await pop.getAttribute('data-stars'));
check(await pop.evaluate(node => node.classList.contains('is-mid')), 'and three glows');
await shoot('rating-three');

// Walking out to bat takes it away.
await page.keyboard.press('r');
await settle(800);
check(!(await popUp()), 'the next innings puts it away');

check(!errors.length, 'nothing threw on the way', errors.join('\n        '));
console.log(failures ? `\n${failures} failed` : '\nall good');
await browser.close();
process.exit(failures ? 1 : 0);
