import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const snapshot = () => page.evaluate(() => window.__cricket.snapshot());
const advance = async ms => { await page.clock.runFor(Math.max(16, Math.round(ms))); return snapshot(); };
const until = async phase => {
  for (let i = 0; i < 100; i++) { const s = await snapshot(); if (s.phase === phase) return s; await advance(100); }
  throw new Error(`Did not reach ${phase}: ${JSON.stringify(await snapshot())}`);
};
try {
  await page.goto('http://127.0.0.1:5173/?debug=1&seed=222', { waitUntil: 'networkidle' });
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 500));
  await page.locator('#start').click({ force: true });
  await advance(200);
  await page.keyboard.press('Escape');
  const paused = await snapshot(); await advance(2000);
  assert.equal((await snapshot()).elapsed, paused.elapsed, 'Pause must freeze the game clock');
  await page.keyboard.press('Escape');
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    let s = await until('BALL_IN_FLIGHT'); seen.add(s.style);
    // Keyboard events only: the debug bridge exposes no gameplay mutations.
    const x = Number(s.finalX);
    const key = s.effectiveLine === 'MIDDLE' ? 'w' : x < 0 ? 'a' : 'd';
    s = await advance(s.contactAt - s.elapsed - 65);
    await page.keyboard.press(key);
    await advance(150);
    s = await until('SHOT_RESOLVE');
    assert.equal(s.balls, i + 1); assert.equal(s.wickets, 0); assert.equal(s.timingGrade, 'PERFECT');
    if (i === 0) {
      await mkdir('test-results', { recursive: true });
      await page.screenshot({ path: 'test-results/perfect-shot.png' });
    }
    await advance(2400);
  }
  const complete = await until('INNINGS_END');
  assert.equal(complete.balls, 30); assert.equal(complete.wickets, 0); assert(complete.runs >= 120);
  assert.equal(await page.locator('#final-overs').innerText(), '5.0');
  await page.screenshot({ path: 'test-results/full-innings.png', fullPage: true });
  await page.keyboard.press('r'); await advance(100);
  assert.equal((await snapshot()).balls, 0); assert.equal((await snapshot()).runs, 0);
  // No shot innings must finish after three wickets; outside-line balls remain dots.
  for (let i = 0; i < 150; i++) {
    if ((await snapshot()).phase === 'INNINGS_END') break;
    await advance(500);
  }
  const allOut = await snapshot(); assert.equal(allOut.phase, 'INNINGS_END'); assert.equal(allOut.wickets, 3); assert(allOut.balls < 30);
  await page.screenshot({ path: 'test-results/all-out.png', fullPage: true });
  // Verify actual combo-window input and the one-attempt rule.
  for (const [first, second, expected] of [['a', 'w', 'LONG_ON'], ['w', 'd', 'COVER_LONG_OFF']]) {
    await page.keyboard.press('r'); let s = await until('BALL_IN_FLIGHT');
    await advance(s.contactAt - s.elapsed - 80);
    await page.keyboard.down(first); await advance(48); await page.keyboard.down(second);
    await page.keyboard.up(first); await page.keyboard.up(second); await page.keyboard.press('a'); await page.keyboard.press('d');
    s = await until('SHOT_RESOLVE'); assert.equal(s.shot, expected); assert.equal(s.balls, 1); assert.equal(s.timingGrade, 'PERFECT');
  }
  // Debug information must be absent during normal play.
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => '__cricket' in window), false);
  assert.equal(await page.locator('#debug').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ complete, allOut, stylesSeen: [...seen], comboInputs: 'passed', pause: 'passed', restart: 'passed', errors }, null, 2));
} finally { await browser.close(); }
