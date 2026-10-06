/**
 * The move from hitman-cricket.vercel.app to hitmancricket.in
 * (`src/game/move-house.ts`), walked in a real browser.
 *
 * Both addresses are served from one dev server through request interception,
 * so the hop is the real one: the old address packs up a returning player and
 * sends them on, and the new one has to come up knowing them — the id in all
 * three stores, the name, the career key, the best — with the fragment gone off
 * the address. Then the same player follows the old link again and nothing
 * about them changes.
 *
 * The dev server has to be built with the move switched on:
 *
 *   VITE_HOME_ORIGIN=https://hitmancricket.in npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/move-check.mjs http://127.0.0.1:5201
 */
import { chromium } from '@playwright/test';
const server = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await b.newContext();
await ctx.route(/^https:\/\/(hitman-cricket\.vercel\.app|hitmancricket\.in)\//, async route => {
  const u = new URL(route.request().url());
  if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  const r = await route.fetch({ url: server + u.pathname + u.search });
  await route.fulfill({ response: r });
});
await ctx.route(/zgo\.at/, r => r.abort());
const id = 'lzz00000-aaaaaaaaaaaa';
await ctx.addInitScript(id => {
  if (location.hostname !== 'hitman-cricket.vercel.app') return;
  localStorage.setItem('hitman-player', id);
  localStorage.setItem('hitman-batter', JSON.stringify({ name: 'Rohit Jī', avatar: 2 }));
  localStorage.setItem('hitman-career-key', 'yorker-sprint-cover-47');
  localStorage.setItem('hitman-best', '63');
}, id);
const page = await ctx.newPage();
const seen = [];
page.on('framenavigated', f => { if (f === page.mainFrame()) seen.push(f.url().replace(/carry=.*/, 'carry=…')); });
await page.goto('https://hitman-cricket.vercel.app/?mode=marathon');
await page.waitForURL(/hitmancricket\.in/, { timeout: 15000 });
await page.waitForTimeout(3000);
const out = await page.evaluate(() => ({
  url: location.href,
  player: localStorage.getItem('hitman-player'),
  batter: localStorage.getItem('hitman-batter'),
  key: localStorage.getItem('hitman-career-key'),
  best: localStorage.getItem('hitman-best'),
  cookie: document.cookie,
}));
const fail = [];
const expect = (ok, what) => { if (!ok) fail.push(what); };
expect(out.url === 'https://hitmancricket.in/?mode=marathon', `landed on ${out.url}, not the same path and query with no fragment`);
expect(out.player === id, `id ${out.player}`);
expect(out.cookie.includes(`hitman-player=${id}`), 'id not in the cookie');
expect(JSON.parse(out.batter ?? '{}').name === 'Rohit Jī', `name ${out.batter}`);
expect(out.key === 'yorker-sprint-cover-47', `key ${out.key}`);
expect(out.best === '63', `best ${out.best}`);
const kept = await page.evaluate(() => new Promise(done => {
  setTimeout(() => done('nothing within 3s'), 3000);
  try {
    const open = indexedDB.open('hitman-cricket');
    open.onsuccess = () => {
      try {
        const got = open.result.transaction('player').objectStore('player').get('hitman-player');
        got.onsuccess = () => done(got.result);
        got.onerror = () => done(null);
      } catch (error) { done(String(error)); }
    };
    open.onerror = () => done(null);
  } catch (error) { done(String(error)); }
}));
expect(kept === id, `IndexedDB holds ${kept}`);
console.log(seen);
// Same player following the old link again: nothing changes, still lands.
await page.goto('https://hitman-cricket.vercel.app/');
await page.waitForURL(/hitmancricket\.in\//, { timeout: 15000 });
await page.waitForTimeout(2000);
expect(await page.evaluate(() => localStorage.getItem('hitman-player')) === id, 'a second hop changed the player');
await b.close();
if (fail.length) { console.error('move-check FAILED\n  ' + fail.join('\n  ')); process.exit(1); }
console.log('move-check: the old address hands a returning player to the new one whole');
