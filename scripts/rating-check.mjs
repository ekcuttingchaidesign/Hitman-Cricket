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
 *
 * `QUICK=1` leaves the innings out and puts the slip up from the cover through
 * the hook: everything about the stars, nothing about when. It is for a machine
 * whose software renderer cannot bat three innings in any time worth waiting —
 * which is a machine this check has run on — and it is not the check: the rule
 * about when is the reason this script exists, and only the full run holds it.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const shots = process.env.SHOTS || '';
const quick = process.env.QUICK === '1';
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
// At one device pixel a CSS pixel: the ground is rendered in software here, and at
// two every step of the clock took the better part of a minute.
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
// Past how to hit, the coachmark before a first innings: `shots-check.mjs` is the one that looks at it.
await page.addInitScript(() => { try { localStorage.setItem('hitman-shots-intro', 'done'); } catch { /* Then it shows. */ } });
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
// A hand-wound clock for the innings. QUICK runs on real time instead: winding
// a clock renders every frame it passes, and a software renderer drawing the
// ground behind the cover takes most of a second over each one.
const advance = ms => quick ? page.waitForTimeout(Math.max(16, Math.round(ms))) : page.clock.runFor(Math.max(16, Math.round(ms)));
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
const started = Date.now();
const note = what => { if (process.env.TRACE) console.log(`  ..   ${((Date.now() - started) / 1000).toFixed(0)}s ${what}`); };
const finishInnings = async () => {
  note('innings starts');
  for (let i = 0; i < 2; i++) {
    const ball = await until('BALL_IN_FLIGHT');
    const key = ball.effectiveLine === 'MIDDLE' ? 'w' : Number(ball.finalX) < 0 ? 'a' : 'd';
    await advance(ball.contactAt - ball.elapsed - 65);
    await page.keyboard.press(key);
    await advance(2600);
    note(`ball ${i + 1} played`);
  }
  await page.evaluate(() => window.__cricket.hurt());
  for (let i = 0; i < 40; i++) {
    if ((await snap()).phase === 'INNINGS_END') return;
    await advance(1500);
  }
  throw new Error('The innings never ended');
};

// Every form the page sends, counted inside the page, where a slow renderer's
// gaps between the script's steps cannot get between a tap and the count.
await page.addInitScript(() => {
  const real = window.fetch.bind(window);
  window.__posts = [];
  window.fetch = (url, init) => {
    if (String(url).includes('/api/feedback') && init?.method === 'POST') window.__posts.push(init.body);
    return real(url, init);
  };
});

// A private window counts nothing, and a headless browser reads as one. A visit
// remembered from an earlier day is the tell that settles it.
await page.addInitScript(() => {
  const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
  try { localStorage.setItem('hitman-seen', day); } catch { /* Then nothing counts. */ }
  // And the notice for a batter one blow from being carried off told already:
  // `hurt()` below puts him there, and the notice pauses the innings until it
  // is answered, which this check never does — so the innings never ended.
  try { localStorage.setItem('hitman-hurt-seen', '1'); } catch { /* Then it pauses. */ }
});

note('launching');
if (!quick) await page.clock.install();
await page.goto(`${base}/?debug=1&seed=222`, { waitUntil: 'load' });
await settle(2500);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await settle(1200); }

// Into Test Survival the way a player goes: the cover, the stories if they
// come up, the picker. Each is waited for rather than assumed, because a
// software renderer can take seconds to put the next screen up.
const visible = async selector => { const at = page.locator(selector); return (await at.count()) > 0 && at.first().isVisible(); };
let picked = quick;
for (let i = 0; i < 40 && !picked; i++) {
  if (await visible('#whatsnew-done')) await page.locator('#whatsnew-done').click({ force: true, timeout: 3000 }).catch(() => {});
  else if (await visible('#mode-survive')) { await page.locator('#mode-survive').click({ force: true }); picked = true; }
  else if (await visible('#start')) await page.locator('#start').click({ force: true, timeout: 3000 }).catch(() => {});
  await settle(500);
}
if (!picked) throw new Error('Never reached Test Survival on the picker');
note('survival picked');

if (quick) {
  console.log('  --   QUICK: no innings played, so nothing here says when the stars are asked for');
  await page.evaluate(() => window.__cricket.rating('survive'));
  await settle(600);
  check(await popUp(), 'the stars rise when asked for');
  check(await pop.getAttribute('data-thing') === 'survive', 'asked about the mode by name');
  check((await pop.locator('.rate-ask').textContent())?.includes('Test Survival'), 'and says which');
  await shoot('rating-asked');
} else {
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
}

// A pointer over the row lights the stars up to it, without giving them.
const star = n => pop.locator(`.rate-star[data-n="${n}"]`);
const box = await star(2).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await settle(100);
check(await pop.locator('.rate-star.is-lit').count() === 2, 'two stars lit under a pointer on the second');
check((await pop.locator('.rate-word').textContent()) === 'It’s okay', 'with the second star’s word under them');
check(sent.length === 0, 'and nothing is sent for looking');

// ── Five, tapped ────────────────────────────────────────────────────────────
// What is thrown in the air is taken away again 1.8s later, which a slow
// renderer can spend between two steps of this script. So every piece is
// written down as it goes in, rather than looked for afterwards.
const watchThrown = () => page.evaluate(() => {
  window.__thrown = [];
  const burst = document.querySelector('.rate-pop:not(.is-leaving) .rate-burst');
  new MutationObserver(changes => {
    for (const change of changes) for (const node of change.addedNodes) window.__thrown.push(node.className);
  }).observe(burst, { childList: true });
});
const thrown = () => page.evaluate(() => window.__thrown);
await watchThrown();
// Five, then three, then five again, in one go inside the page: a renderer this
// slow can spend the wait before a mark is sent between two steps of a script,
// and what is being checked is that taps in quick succession send one mark.
const changes = await page.evaluate(() => {
  const pop = document.querySelector('.rate-pop:not(.is-leaving)');
  const row = pop.querySelector('.rate-stars');
  const tap = n => {
    const at = pop.querySelector(`.rate-star[data-n="${n}"]`).getBoundingClientRect();
    const where = { clientX: at.left + at.width / 2, clientY: at.top + at.height / 2, pointerId: 7, pointerType: 'touch', bubbles: true };
    row.dispatchEvent(new PointerEvent('pointerdown', where));
    row.dispatchEvent(new PointerEvent('pointerup', where));
    return { stars: pop.dataset.stars, tiers: ['is-low', 'is-mid', 'is-high', 'is-top'].filter(one => pop.classList.contains(one)), posts: window.__posts.length };
  };
  return [tap(5), tap(3), tap(5)];
});
check(changes[0].stars === '5', 'a tap on the fifth gives five', JSON.stringify(changes));
check(changes[1].stars === '3' && changes[1].tiers.join() === 'is-mid', 'a tap on the third then changes it to three, met as a three');
check(changes[2].stars === '5' && changes[2].tiers.join() === 'is-top', 'and a tap on the fifth changes it back');
check(changes.every(one => one.posts === 0), 'with nothing sent while the mark is still changing');
check(await pop.evaluate(node => node.classList.contains('is-top')), 'and is met as a five');
check(await star(5).evaluate(node => getComputedStyle(node).opacity) === '1', 'and the stars stay lit once given',
  await star(5).evaluate(node => getComputedStyle(node).opacity));
const five$ = await thrown();
check(five$.includes('rate-ball') && five$.includes('rate-six'), 'the last star goes up as a ball, with the call', five$.join(' '));
check(five$.filter(one => one.startsWith('rate-confetti')).length > 10, 'and the confetti with it', String(five$.length));
await shoot('rating-five');
const ratings = () => sent.filter(form => form.rating && !Object.keys(form.answers).length);
await settle(2200);
check(ratings().length === 1 && ratings()[0].rating.stars === 5, 'one rating is sent, of the mark settled on',
  JSON.stringify(ratings().map(form => form.rating)));
const tap = ratings()[0];
check(tap?.rating?.thing === 'survive' && tap.rating.moment === 'mode', 'of the mode, at the end of its innings', JSON.stringify(tap));
check(!!(await memory())?.rated?.survive, 'and remembered as rated', JSON.stringify(await memory()));

const more = pop.locator('.rate-more');
check(await more.isVisible(), 'then it offers more');
check((await more.textContent())?.includes('NEXT'), 'in words that answer a five', await more.textContent());
await shoot('rating-more');

// Changed again after it went: the keys follow the new mark at once, and the
// new mark is sent under the same ref, so it replaces the first rather than
// counting beside it.
await star(2).click();
await page.waitForTimeout(150);
check((await more.textContent()) === 'TELL US WHY', 'changed to two after the keys are up, the keys ask why',
  await more.textContent());
check((await pop.locator('.rate-say').textContent())?.includes('fell short'), 'and the words are a two’s');
await settle(2200);
const again = ratings().at(-1);
check(ratings().length === 2 && again.rating.stars === 2 && again.rating.ref === tap.rating.ref,
  'the new mark is sent under the same ref', JSON.stringify(ratings().map(form => form.rating)));
// And back to five for the rest, sent at once by the key that moves on.
await star(5).click();
await page.waitForTimeout(150);

// ── Tell us more ────────────────────────────────────────────────────────────
await pop.locator('.rate-more').click();
await settle(400);
check(!(await popUp()), 'the slip goes when more is asked for');
check(ratings().at(-1)?.rating?.stars === 5, 'taking the five with it, sent without waiting',
  JSON.stringify(ratings().map(form => form.rating)));
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
if (!quick) {
  await page.locator('#survive-again').click({ force: true });
  await settle(600);
  await finishInnings();
  await settle(2500);
  check(!(await popUp()), 'the next innings this visit asks nothing');
}

// ── The other faces, on demand ──────────────────────────────────────────────
await page.evaluate(() => window.__cricket.rating('marathon'));
await settle(600);
await watchThrown();
await star(1).click();
await page.waitForTimeout(150);
check(await pop.evaluate(node => node.classList.contains('is-low')), 'one star is met quietly');
check((await thrown()).length === 0, 'with nothing thrown in the air', (await thrown()).join(' '));
await settle(1000);
check((await pop.locator('.rate-more').textContent()) === 'TELL US WHY', 'and asks why', await pop.locator('.rate-more').textContent());
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

// A thumb laid on the row and slid along it fills the stars as it goes and
// gives them where it lifts — a real touch, not a mouse pretending: the row
// takes the pointer for itself, and a phone that scrolled instead would fail.
await page.evaluate(() => window.__cricket.rating('classic'));
await settle(600);
const touch = await page.context().newCDPSession(page);
const centre = async n => { const at = await star(n).boundingBox(); return { x: at.x + at.width / 2, y: at.y + at.height / 2 }; };
const finger = async (type, at) => touch.send('Input.dispatchTouchEvent', {
  type, touchPoints: type === 'touchEnd' ? [] : [{ x: at.x, y: at.y, id: 1 }],
});
const swipedFrom = sent.length;
await finger('touchStart', await centre(1));
for (const n of [2, 3]) { await finger('touchMove', await centre(n)); await page.waitForTimeout(60); }
check(await pop.locator('.rate-star.is-lit').count() === 3, 'a thumb slid to the third lights three',
  String(await pop.locator('.rate-star.is-lit').count()));
check(await pop.getAttribute('data-stars') === null && sent.length === swipedFrom, 'and gives nothing while it is still down');
await finger('touchMove', await centre(4));
await finger('touchEnd');
await page.waitForTimeout(400);
check(await pop.getAttribute('data-stars') === '4', 'lifted on the fourth, it gives four', await pop.getAttribute('data-stars'));
await settle(2000);
check(sent.slice(swipedFrom).some(form => form.rating?.stars === 4), 'and four is what is sent');
// Two ways on, side by side and half the width each: never a key with a link under it.
const pair = await pop.locator('.rate-keys > button').evaluateAll(keys => keys.map(key => {
  const at = key.getBoundingClientRect();
  return { top: Math.round(at.top), width: Math.round(at.width), underline: getComputedStyle(key).textDecorationLine };
}));
check(pair.length === 2 && pair[0].top === pair[1].top && Math.abs(pair[0].width - pair[1].width) <= 1,
  'the two keys after a rating sit side by side at half the width each', JSON.stringify(pair));
check(pair.every(key => key.underline === 'none'), 'and neither is drawn as a link');
// Half the width is not much on a phone, and the longest label was cut off
// at it. Every label each tier can show is put in a key and measured.
const fits = await pop.locator('.rate-more').evaluate(key => {
  const was = key.textContent;
  const labels = ['TELL US WHY', 'TELL US MORE', 'WHAT’S NEXT?', 'DONE'];
  const over = labels.filter(label => { key.textContent = label; return key.scrollWidth > key.clientWidth; });
  key.textContent = was;
  return over;
});
check(fits.length === 0, 'and every label fits its key', fits.join(', '));
await shoot('rating-swiped');
await pop.locator('.rate-done').click();
await settle(400);

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

check((await snap()).phase === (quick ? 'START' : 'INNINGS_END'), 'and the Enter that gave them started nothing behind it',
  (await snap()).phase);

// Walking out to bat takes it away.
if (!quick) {
  await page.keyboard.press('r');
  await settle(800);
  check(!(await popUp()), 'the next innings puts it away');
}

// ── ?rate=1 ─────────────────────────────────────────────────────────────────
// The preview: a key a thing along the foot, the real sticker and follow-up,
// and nothing sent or remembered however it is played with.
const before$ = { posts: sent.length, memory: JSON.stringify(await memory()) };
await page.goto(`${base}/?debug=1&rate=1`, { waitUntil: 'load' });
await settle(2500);
if (await anyway.count()) { await anyway.first().click(); await settle(1200); }
const keys = page.locator('.rate-preview-key');
check(await keys.count() === 5, 'the preview puts a key up for the game and each mode', String(await keys.count()));
await page.locator('.rate-preview-key[data-thing="marathon"]').click();
await settle(600);
check(await popUp() && await pop.getAttribute('data-thing') === 'marathon', 'its MARATHON key puts the Marathon’s stars up');
const lifted = await page.evaluate(() => {
  const keys = document.querySelector('.rate-preview').getBoundingClientRect();
  const sticker = document.querySelector('.rate-pop:not(.is-leaving)').getBoundingClientRect();
  return sticker.bottom <= keys.top;
});
check(lifted, 'with the sticker lifted clear of the keys');
await shoot('rating-preview');
await star(4).click();
await settle(2200);
await page.locator('.rate-preview-key[data-thing="rivals"]').click();
await settle(600);
check(await pop.getAttribute('data-thing') === 'rivals', 'and another key asks again at once, about that one');
await star(1).click();
await settle(1200);
await pop.locator('.rate-more').click();
await settle(400);
const preview = page.locator('.feedback-screen');
check(await preview.isVisible() && !(await page.locator('.rate-preview').isVisible()), 'the follow-up opens, with the keys out of its way');
for (let i = 0; i < 6 && !(await page.locator('#feedback-send').count()); i++) {
  const next = page.locator('#feedback-next');
  await preview.locator('.feedback-choice').first().click();
  if (await next.count()) await next.click();
  await settle(300);
}
await page.locator('#feedback-send').click();
await settle(600);
check((await preview.locator('.feedback-eyebrow').textContent())?.includes('NOTHING WAS SENT'), 'and says it sent nothing');
check(sent.length === before$.posts, 'because it did not', `${sent.length - before$.posts} sent`);
check(JSON.stringify(await memory()) === before$.memory, 'and nothing about being asked was remembered');

check(!errors.length, 'nothing threw on the way', errors.join('\n        '));
console.log(failures ? `\n${failures} failed` : '\nall good');
await browser.close();
process.exit(failures ? 1 : 0);
