/**
 * The year recap, kept as a player plays: a finished innings lands in the
 * player's year once, in the kit and with the bat it was played in, and a
 * piece of the Dressing Room is dated the day it is won.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/recap-check.mjs http://127.0.0.1:5201
 *
 * Its rule is about *when*, as `career-count-check`'s is: the recap is folded
 * on the server from the innings the career takes, and only when it takes it,
 * so no unit test sees a browser's innings arrive there. It reads what was kept
 * through the dev server's own `/api/recap`, which nothing deployed answers. It
 * passes `?private=0`, because headless Chromium looks like a private window,
 * and a private window counts nothing.
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
const id = `${Date.now().toString(36)}-${letters(14)}`;
/** Twenty-six Blast innings: Crimson earned, and worn. Boom not yet unlocked. */
const CAREER = { classic: { innings: 26, runs: 600, balls: 500, sixes: 20, fours: 60, wickets: 20, dots: 100, highest: 60, notOut: 0, individual: 60, hundreds: 0 } };
const DRESSING = { outfit: 'crimson', bat: 'plain', pickedAt: 1, launch: null, seen: ['kit:home', 'bat:plain', 'kit:crimson'], visited: true };

const browser = await chromium.launch({ executablePath, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(([id, name, career, dressing]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem('hitman-player', id);
  localStorage.setItem('hitman-batter', JSON.stringify({ name, avatar: 0 }));
  localStorage.setItem('hitman-profile', '1');
  localStorage.setItem('hitman-shots-intro', 'done');
  localStorage.setItem('hitman-marathon-intro', 'done');
  localStorage.setItem('hitman-hurt-seen', '1');
  localStorage.setItem('hitman-whatsnew', 'dressing-room:9');
  localStorage.setItem('hitman-career', JSON.stringify(career));
  localStorage.setItem('hitman-dressing', JSON.stringify(dressing));
}, [id, `Recap${letters(6)}`, CAREER, DRESSING]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const recap = () => page.evaluate(async ([base, id]) => (await fetch(`${base}/api/recap?player=${id}`)).json(), [base, id]);
const until = async (ok, tries = 40) => { for (let i = 0; i < tries; i++) { const now = await recap(); if (ok(now)) return now; await page.waitForTimeout(500); } return recap(); };
const snap = () => page.evaluate(() => window.__cricket.snapshot());

await page.goto(`${base}/?debug=1&private=0`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(500); }
await page.locator('#start').click({ force: true });
await page.waitForSelector('#modes:not(.hidden)', { timeout: 30_000 });
const before = (await recap()).totals;

// ── An innings, finished ────────────────────────────────────────────────────
await page.locator('#mode-marathon').click({ force: true });
for (let i = 0; i < 60 && (await snap()).phase !== 'READY'; i++) await page.waitForTimeout(300);
await page.evaluate(() => window.__cricket.marathon([4, 6, 1, 'W', 2, 0, 4, 'W', 6, 'W']));
const kept = await until(now => now.player?.innings >= 1);
check(kept.player?.innings === 1, 'a finished innings lands in the player\'s year', JSON.stringify(kept.player));
check(kept.player?.modes?.marathon?.innings === 1 && kept.player.modes.marathon.runs === 23, 'under its mode, with its runs', JSON.stringify(kept.player?.modes));
check(JSON.stringify(kept.player?.kits) === '{"crimson":1}' && JSON.stringify(kept.player?.bats) === '{"plain":1}',
  'in the kit and with the bat it was played in', JSON.stringify({ kits: kept.player?.kits, bats: kept.player?.bats }));
check(Object.values(kept.player?.days ?? {}).reduce((a, b) => a + b, 0) === 1 && Object.keys(kept.player?.hours ?? {}).length === 1, 'on its day and in its hour');
check((kept.totals.innings ?? 0) === (before.innings ?? 0) + 1 && (kept.totals['kit:crimson'] ?? 0) === (before['kit:crimson'] ?? 0) + 1,
  'and in the year\'s totals for everybody', JSON.stringify(kept.totals));
// The innings is sent twice on purpose; the second must not count.
await page.waitForTimeout(4000);
check((await recap()).player?.innings === 1, 'once, though it is sent twice');

// ── A piece of the room, won ────────────────────────────────────────────────
await page.locator('#mcard-modes').click({ force: true });
await page.waitForSelector('#modes:not(.hidden)', { timeout: 20_000 });
await page.locator('#modes-dressing').click({ force: true });
await page.waitForSelector('#dressing-overlay', { timeout: 30_000 });
await page.waitForTimeout(1500);
await page.locator('#dressing-tab-bat').click();
await page.waitForTimeout(400);
await page.locator('.dr-item[data-id="boom"]').click();
await page.waitForTimeout(400);
await page.locator('#dressing-key').click();
const won = await until(now => now.player?.unlocked?.['bat:boom']);
const at = won.player?.unlocked?.['bat:boom'];
check(typeof at === 'number' && Math.abs(Date.now() - at) < 120_000, 'Boom unlocked in the room is dated the day it was won', String(at));
check((won.totals['unlock:bat:boom'] ?? 0) === (before['unlock:bat:boom'] ?? 0) + 1, 'and counted once among everybody who won it', JSON.stringify(won.totals));
check(!('kit:home' in (won.player?.unlocked ?? {})) && !('bat:plain' in (won.player?.unlocked ?? {})) && !('unlock:kit:home' in won.totals),
  'the free kit and bat are never counted as won', JSON.stringify(won.player?.unlocked));

check(errors.length === 0, 'nothing thrown', errors.join(' | '));
await browser.close();
console.log(`\n${failures ? `${failures} failed` : 'all good'}\n`);
process.exitCode = failures ? 1 : 0;
