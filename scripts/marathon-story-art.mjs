/**
 * The scorecard the second What's New story shows the Test Marathon with.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/marathon-story-art.mjs
 *
 * Drawn rather than photographed. The Rivals stories were screenshots of the
 * screens, which tells the truth about an update; the Marathon's first cut did
 * the same and read as a screenshot — a mode card with the debug panel across
 * it, and a scorecard in the game's own small type — where a launch wants a
 * poster. So it is drawn: laid out in HTML from the game's own font and art
 * and rendered in a browser, a broadcast scorecard of a big innings, the worm
 * with a ball where each man went. (The first story is a photograph of the kit
 * on the square, `marathon-intro.webp`, shown across the whole screen; this
 * script drew a poster for it until then.)
 *
 * It needs no server. Everything it draws is read from `src/assets/` and the
 * figures are made up — an innings nobody played, never written anywhere.
 *
 * Every figure is Satoshi, not Jaro. Jaro is the game's word on a key and a
 * title; set in it and outlined in black, the totals and the scores read as
 * stickers, and a scorecard is a table. Each row says how the man went and his
 * boundaries in words, with a bar in the colour of how — the shorthand (16×4,
 * SR 157) and a helmet in every row were clutter.
 */

import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const executablePath = process.env.CHROMIUM_PATH || undefined;
const asset = name => new URL(`../src/assets/${name}`, import.meta.url);
const b64 = async name => (await readFile(asset(name))).toString('base64');
const out = name => new URL(`../src/assets/whatsnew/${name}`, import.meta.url);

const satoshi = await b64('satoshi-latin.woff2');

const FONTS = `
  @font-face{font-family:Satoshi;src:url(data:font/woff2;base64,${satoshi}) format('woff2');font-weight:300 900}
  *{box-sizing:border-box;margin:0}
  body{background:transparent;width:720px}`;

/** A cricket ball, seam and all, for the corner of the poster and the worm's wickets. */
// One straight seam round its middle, two rows of stitching either side of it.
const ball = (size, rotate = -24, tone = 'red') => {
  const [hi, mid, lo, rim] = tone === 'amber' ? ['#ffe08a', '#f0b429', '#7a5200', '#3d2900'] : ['#ff6b5e', '#c8102e', '#5c0610', '#2a0306'];
  const id = `b${size}${tone}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" style="transform:rotate(${rotate}deg)"><defs><radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></radialGradient></defs><circle cx="20" cy="20" r="18" fill="url(#${id})" stroke="${rim}" stroke-width="2"/><path d="M2.5 18.4Q20 16.6 37.5 18.4M2.5 21.6Q20 23.4 37.5 21.6" fill="none" stroke="#fff3e6" stroke-width="1.5" stroke-dasharray="1.6 1.8"/><path d="M2.5 20Q20 20 37.5 20" fill="none" stroke="#00000040" stroke-width="1"/></svg>`;
};

/** The innings on the scorecard: three men, a big total, and a ball where each one went. */
const BATTERS = [
  { name: 'Opener', runs: 152, balls: 97, fours: 16, sixes: 8, how: 'Out', colour: '#ff5a5f' },
  { name: 'No. 3', left: true, runs: 64, balls: 65, fours: 8, sixes: 0, how: 'Retired hurt', colour: '#ffc845' },
  { name: 'Tailender', runs: 55, balls: 31, fours: 5, sixes: 5, how: 'Out', colour: '#ff5a5f' },
];
/** Runs a ball that add up to each man's score, lumpy the way an innings is: dots, singles, the odd boundary. */
function perBall() {
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const balls = [];
  for (const b of BATTERS) {
    const mine = Array(b.balls).fill(0);
    let left = b.runs - b.fours * 4 - b.sixes * 6;
    for (let i = 0; i < b.fours; i++) mine[Math.floor(next() * b.balls)] += 4;
    for (let i = 0; i < b.sixes; i++) mine[Math.floor(next() * b.balls)] += 6;
    while (left > 0) { mine[Math.floor(next() * b.balls)] += 1; left--; }
    balls.push(...mine);
  }
  return balls;
}
function worm() {
  const runs = perBall();
  const W = 640, H = 250, L = 46, R = 14, T = 16, B = 34;
  const xMax = 240, yMax = 300;
  const x = ball => L + ball / xMax * (W - L - R), y = r => T + (1 - r / yMax) * (H - T - B);
  let sum = 0;
  const pts = [[x(0), y(0)], ...runs.map((r, i) => { sum += r; return [x(i + 1), y(sum)]; })];
  const path = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
  const grid = [0, 100, 200, 300].map(r => `<line x1="${L}" x2="${W - R}" y1="${y(r)}" y2="${y(r)}" stroke="#ffffff1f"/><text x="${L - 10}" y="${y(r) + 6}" text-anchor="end">${r}</text>`).join('')
    + [0, 10, 20, 30, 40].map(o => `<text x="${x(o * 6)}" y="${H - 6}" text-anchor="middle">${o}${o === 40 ? ' ov' : ''}</text>`).join('');
  let at = 0, total = 0;
  const falls = BATTERS.map(b => { at += b.balls; total += b.runs; return { ...b, bx: x(at), by: y(total) }; });
  // Callouts above the line for the first and last, below it for the one in
  // between, so the two that fall close together do not sit on each other.
  const marks = falls.map((f, i) => {
    const below = i === 1, dx = i === 2 ? -44 : 0;
    const cy = below ? f.by + 48 : f.by - 30;
    return `<g transform="translate(${f.bx - 17} ${f.by - 17})">${ball(34, 20, f.how === 'Out' ? 'red' : 'amber')}</g>
    <g transform="translate(${f.bx + dx} ${cy})"><rect x="-60" y="-30" width="120" height="30" rx="15" fill="#000000c7"/><text y="-9" text-anchor="middle" class="call">${f.runs}${f.how === 'Out' ? '' : '*'} · ${f.name}</text></g>`;
  }).join('');
  return `<svg class="worm" viewBox="0 0 ${W} ${H}"><defs>
      <linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></linearGradient>
      <linearGradient id="stroke" x1="0" x2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#ff6b3d"/></linearGradient></defs>
    ${grid}
    <path d="${path}L${x(runs.length)} ${y(0)}L${x(0)} ${y(0)}Z" fill="url(#area)"/>
    <path d="${path}" fill="none" stroke="url(#stroke)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    ${marks}</svg>`;
}

/** Fours and sixes in words, the ones there were. */
const boundaries = b => [b.fours && `${b.fours} four${b.fours === 1 ? '' : 's'}`, b.sixes && `${b.sixes} six${b.sixes === 1 ? '' : 'es'}`].filter(Boolean).join(' · ');

const SCORE = `<!doctype html><html><head><style>${FONTS}
  .card{width:720px;height:900px;border-radius:44px;overflow:hidden;color:#fff;font-family:Satoshi;background:linear-gradient(180deg,#0e2537 0%,#0a1824 100%);font-variant-numeric:tabular-nums}
  .band{display:flex;align-items:center;justify-content:space-between;padding:30px 40px 28px;background:linear-gradient(90deg,#00381f,#0a6b3d)}
  .band b{font-weight:900;font-size:24px;letter-spacing:.24em}
  .band span{padding:8px 16px 7px;border-radius:999px;background:#c8102e;font-weight:900;font-size:17px;letter-spacing:.16em}
  .total{display:flex;align-items:flex-end;justify-content:space-between;padding:34px 44px 0}
  .total b{font-weight:900;font-size:112px;line-height:.8;letter-spacing:-.04em}
  .total b small{margin-left:6px;font-size:52px;font-weight:800;letter-spacing:-.02em;color:#ffc845}
  .total em{font-style:normal;text-align:right;font-weight:800;font-size:42px;line-height:1;letter-spacing:-.02em}
  .total em small{display:block;margin-top:8px;font-size:17px;font-weight:700;letter-spacing:.16em;color:#9fb2bd}
  .worm{display:block;width:640px;margin:44px 40px 0;overflow:visible}
  .worm text{font-family:Satoshi;font-size:17px;font-weight:700;fill:#9fb2bd}
  .worm text.call{font-size:16px;font-weight:800;fill:#fff}
  .rows{display:flex;flex-direction:column;gap:12px;padding:20px 36px 0}
  .row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px 16px 28px;border-radius:20px;background:#ffffff0d;overflow:hidden}
  .row::before{content:'';position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--how)}
  .row .who b{display:block;font-weight:800;font-size:26px;line-height:1.15}
  .row .who em{display:block;margin-top:4px;font-style:normal;font-size:17px;font-weight:600;color:#9fb2bd}
  .row .who em b{display:inline;font-size:17px;font-weight:800;color:var(--how)}
  .row .runs{text-align:right;font-weight:900;font-size:46px;line-height:.95;letter-spacing:-.03em}
  .row .runs i{font-style:normal;color:#ffc845}
  .row .runs small{display:block;margin-top:4px;font-weight:700;font-size:16px;letter-spacing:0;color:#9fb2bd}
</style></head><body>
  <div class="card">
    <div class="band"><b>SCORECARD</b><span>ALL OUT</span></div>
    <div class="total"><b>271<small>/3</small></b><em>32.1<small>OVERS</small></em></div>
    ${worm()}
    <div class="rows">${BATTERS.map(b => `
      <div class="row" style="--how:${b.colour}">
        <span class="who"><b>${b.name}</b><em><b>${b.how}</b> · ${boundaries(b)}</em></span>
        <span class="runs">${b.runs}${b.how === 'Out' ? '' : '<i>*</i>'}<small>${b.balls} balls</small></span>
      </div>`).join('')}
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 1.5 });
for (const [html, name] of [[SCORE, 'marathon-card']]) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const png = await page.locator('body > div').screenshot({ omitBackground: true });
  // The story serves a webp: drawn into a canvas and written out at the same size.
  const webp = await page.evaluate(async data => {
    const img = new Image(); img.src = `data:image/png;base64,${data}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.9).split(',')[1];
  }, png.toString('base64'));
  await writeFile(out(`${name}.webp`), Buffer.from(webp, 'base64'));
  console.log(`${name}.webp`);
}
await browser.close();
