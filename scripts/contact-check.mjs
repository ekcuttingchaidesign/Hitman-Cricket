/**
 * The bat meeting the ball, in a real browser (`src/game/contact.ts`): a
 * straight drive timed on the keys at the cover drive's ball (`?cover=1`)
 * until one is middled for a boundary. Dust comes up where the ball pitches;
 * on the ball the game's clock keeps going (no beat is held: on a phone it read
 * as lag), the phone is buzzed, and chips come off the bat, with the camera left where it is (the
 * push in is a special stroke's alone). His trunk carries on after the ball
 * (`followThrough.ts`). Then the same with `?contact=0&follow=0`: none of it.
 * Photographed on the ball, into `test-results/contact-*.png`.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/contact-check.mjs
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

async function innings(off) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DPR ?? 1), isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    const day = new Date(Date.now() - 172_800_000).toISOString().slice(0, 10);
    try {
      localStorage.setItem('hitman-shots-intro', 'done');
      localStorage.setItem('hitman-seen', day);
      localStorage.setItem('hitman-whatsnew', 'rivals:9');
    } catch { /* Then the notices stand. */ }
    // Every buzz asked for, whether or not the machine has a motor.
    window.__buzzed = [];
    navigator.vibrate = pattern => { window.__buzzed.push([].concat(pattern)); return true; };
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
  const snap = () => page.evaluate(() => window.__cricket.snapshot());
  await page.clock.install();
  await page.goto(`${base}/?debug=1&seed=2718&cover=1&replay=0&catchcam=0&lights=day${off ? '&contact=0&follow=0' : ''}`, { waitUntil: 'load' });
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 3000);
  await advance(2500);
  await page.waitForTimeout(800);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await advance(1200); }
  await page.locator('#start').click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.locator('#mode-classic').click({ force: true, timeout: 15_000 });
  await advance(600);
  await page.addStyleTag({ content: '[class*=debug]{display:none!important}' });
  const press = (...keys) => page.evaluate(keys => {
    for (const type of ['keydown', 'keyup']) for (const key of keys) {
      const event = new KeyboardEvent(type, { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'timeStamp', { value: performance.now() });
      window.dispatchEvent(event);
    }
  }, keys);

  let best = null;
  for (let ball = 0; ball < 14 && !best; ball++) {
    let seen = await snap();
    for (let i = 0; i < 200 && seen.phase !== 'BALL_IN_FLIGHT'; i++) { await advance(100); seen = await snap(); }
    if (seen.phase !== 'BALL_IN_FLIGHT') break;
    // Through the flight a frame at a time, for the dust at the pitch.
    let dust = 0;
    while (seen.phase === 'BALL_IN_FLIGHT' && seen.contactAt - seen.elapsed > 20) {
      await advance(Math.min(16, seen.contactAt - seen.elapsed)); seen = await snap();
      dust = Math.max(dust, await page.evaluate(() => window.__cricket.contactShown().dust));
    }
    await press('w');
    // Frame by frame from the swing: the game's clock against the page's.
    const frames = []; let shot = false;
    for (let i = 0; i < 90; i++) {
      const before = await snap();
      await advance(16);
      const after = await snap();
      frames.push({ phase: after.phase, went: after.elapsed - before.elapsed, contact: after.contact, follow: after.follow });
      if (!off && !shot && after.contact) { shot = true; await page.screenshot({ path: 'test-results/contact-beat.png' }); }
      if (after.phase === 'RESULT') break;
    }
    const last = await snap();
    console.log(`        ball ${ball + 1}: ${last.outcome} (${last.timingGrade}) ${frames.find(f => f.contact)?.contact?.kind ?? '—'}`);
    const kind = frames.find(f => f.contact)?.contact?.kind;
    if (off ? /FOUR|SIX|4|6/.test(String(last.outcome)) : kind === 'sweet' || kind === 'clean') best = { frames, dust, last };
    for (let i = 0; i < 80 && (await snap()).phase === 'RESULT'; i++) await advance(50);
  }
  const buzzed = await page.evaluate(() => window.__buzzed);
  await page.close();
  return { best, buzzed, errors };
}

const on = await innings(false);
check(!!on.best, 'a drive off the middle is found');
if (on.best) {
  const { frames, dust } = on.best, struck = frames.findIndex(f => f.contact);
  check(dust > 0, 'dust comes up where the ball pitches', String(dust));
  // No beat held: the game's clock keeps going through the ball (held, it read as lag on a phone).
  check(struck >= 0 && frames.slice(struck, struck + 6).every(f => f.went > 8), 'the game\'s clock keeps going through the ball', JSON.stringify(frames.map(f => Math.round(f.went))));
  check(frames.some(f => f.contact?.chips > 0), 'chips come off the bat');
  // An ordinary stroke leaves the camera where it is: the push is a special stroke's.
  check(frames.every(f => !f.contact || f.contact.push === 0), 'the camera stays where it is', JSON.stringify(frames.map(f => f.contact?.push ?? 0)));
  const end = frames[frames.length - 1];
  check(end.contact?.push === 0 && end.went > 8, 'and the clock is running again well before the ball is dead', JSON.stringify(end));
  check(on.buzzed.length > 0, 'the phone is buzzed at the bat', JSON.stringify(on.buzzed));
  // The follow-through (`followThrough.ts`): his trunk carried on after the ball, by centimetres.
  const leans = frames.map(f => f.follow?.lean ?? 0);
  check(Math.max(...leans) > .005 && Math.max(...leans) <= .05, 'his trunk carries on after the ball, by a few centimetres', JSON.stringify(leans.map(v => +v.toFixed(3))));
}
check(on.errors.length === 0, 'with no errors on the page', on.errors.join('\n'));

const off = await innings(true);
check(!!off.best, '?contact=0: a boundary is found');
if (off.best) {
  check(off.best.frames.every(f => !f.contact), 'and nothing is made of it');
  check(off.best.dust === 0, 'no dust at the pitch');
  check(off.best.frames.every(f => f.phase !== 'SHOT_RESOLVE' || f.went > 8), 'the clock never held');
  check(off.buzzed.length === 0, 'and no buzz', JSON.stringify(off.buzzed));
  check(off.best.frames.every(f => !f.follow?.lean && !f.follow?.give), '?follow=0: he is drawn where the stroke has him');
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
