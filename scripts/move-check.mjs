/**
 * The move to hitmancricket.in, in a real browser: a player on the old address
 * lands on the new one as themselves, a newcomer lands there with nothing, and
 * a link with somebody else's career in it is refused.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/move-check.mjs
 *
 * Both addresses are played by the dev server: every request to either one is
 * answered from it, so the browser really does leave one origin for the other
 * — with its own storage on each side, and a referrer saying where it came
 * from — which is the whole of what is being checked.
 */

import { chromium } from '@playwright/test';

const dev = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;
const OLD = 'https://hitman-cricket.vercel.app';
const NEW = 'https://hitmancricket.in';
const ID = 'lq0x2k1a-abcdefghijkl';

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });

async function visitor() {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  for (const origin of [OLD, NEW]) {
    await context.route(`${origin}/**`, async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }) });
      }
      const response = await route.fetch({ url: `${dev}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    });
  }
  return context;
}
const settled = page => page.waitForURL(url => url.origin === NEW, { timeout: 30_000 }).then(() => true).catch(() => false);

// ── A player with a career on the old address ──────────────────────────────
{
  console.log('a player on the old address');
  const context = await visitor();
  const page = await context.newPage();
  await page.goto(`${OLD}/robots.txt`).catch(() => {});
  await page.evaluate(id => {
    localStorage.setItem('hitman-player', id);
    localStorage.setItem('hitman-batter', JSON.stringify({ name: 'Rohit', avatar: 1 }));
    localStorage.setItem('hitman-best', '88');
    localStorage.setItem('hitman-seen', '2020-01-01');
  }, ID);
  await page.goto(`${OLD}/?room=abc123`);
  check(await settled(page), 'is sent on to hitmancricket.in', page.url());
  await page.waitForTimeout(1500);
  const url = new URL(page.url());
  check(url.search === '?room=abc123', 'to the same page, the link\'s query kept', url.href);
  check(url.hash === '', 'with the carried career taken off the address', url.hash.slice(0, 40));
  const there = await page.evaluate(() => ({
    player: localStorage.getItem('hitman-player'), batter: localStorage.getItem('hitman-batter'), best: localStorage.getItem('hitman-best'),
  }));
  check(there.player === ID, 'arriving as the same player', JSON.stringify(there));
  check(there.batter?.includes('Rohit') && there.best === '88', 'with the name and the best score', JSON.stringify(there));
  await page.waitForTimeout(1500);
  const cookie = (await context.cookies(NEW)).find(c => c.name === 'hitman-player');
  check(cookie?.value === ID, 'and the id written to the cookie there too, by the game', JSON.stringify(cookie));
  await context.close();
}

// ── A newcomer ────────────────────────────────────────────────────────────
{
  console.log('a newcomer on the old address');
  const context = await visitor();
  const page = await context.newPage();
  await page.goto(`${OLD}/`);
  check(await settled(page), 'is sent on to hitmancricket.in');
  await page.waitForTimeout(1000);
  check(new URL(page.url()).hash === '', 'carrying nothing', page.url());
  await context.close();
}

// ── Somebody else's career, in a link ─────────────────────────────────────
{
  console.log('a carry that did not come from the old address');
  const context = await visitor();
  const page = await context.newPage();
  const payload = Buffer.from(JSON.stringify({ v: 1, k: { 'hitman-player': ID }, h: '' })).toString('base64url');
  await page.goto(`${NEW}/#carry=${payload}`);
  await page.waitForTimeout(2500);
  const player = await page.evaluate(() => localStorage.getItem('hitman-player'));
  check(player !== ID, 'is refused: the visitor stays themselves', player);
  check(new URL(page.url()).hash === '', 'and the link\'s payload is still taken off the address', page.url());
  await context.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exitCode = 1;
