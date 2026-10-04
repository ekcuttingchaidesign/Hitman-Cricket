/**
 * The two pictures the What's New stories introduce the Test Marathon with.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/marathon-story-art.mjs
 *
 * Drawn rather than photographed. The Rivals stories were screenshots of the
 * screens, which tells the truth about an update; the Marathon's first cut did
 * the same and read as a screenshot — a mode card with the debug panel across
 * it, and a scorecard in the game's own small type — where a launch wants a
 * poster. So these are posters, laid out in HTML from the game's own fonts and
 * art and rendered in a browser: the kit on the square in British racing green
 * with the mode's four rules as badges, and a broadcast scorecard of a big
 * innings, the worm with a ball where each man went.
 *
 * It needs no server. Everything it draws is read from `src/assets/` and the
 * figures are made up — an innings nobody played, never written anywhere.
 */

import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const executablePath = process.env.CHROMIUM_PATH || undefined;
const asset = name => new URL(`../src/assets/${name}`, import.meta.url);
const b64 = async name => (await readFile(asset(name))).toString('base64');
const out = name => new URL(`../src/assets/whatsnew/${name}`, import.meta.url);

const [jaro, satoshi, plate] = await Promise.all([b64('jaro-latin.woff2'), b64('satoshi-latin.woff2'), b64('marathon-plate.webp')]);

const FONTS = `
  @font-face{font-family:Jaro;src:url(data:font/woff2;base64,${jaro}) format('woff2')}
  @font-face{font-family:Satoshi;src:url(data:font/woff2;base64,${satoshi}) format('woff2');font-weight:300 900}
  *{box-sizing:border-box;margin:0}
  body{background:transparent;width:720px}`;

/** The helmet from the design (Figma, node 12-127), as the rules coachmark draws it. */
const HELMET = `<svg viewBox="100 66 428 384"><path fill="currentColor" fill-rule="evenodd" d="M118 268C108 268 106 256 110 246C128 150 200 80 290 78C370 76 440 130 468 212L502 212C512 212 518 222 514 230C512 236 506 238 500 238L268 262L276 300C277 307 272 312 266 312L186 312C181 312 177 309 176 304L162 268ZM182 216H234A17 17 0 0 1 234 250H182A17 17 0 0 1 182 216Z"/><circle cx="190" cy="233" r="6" fill="currentColor"/><circle cx="226" cy="233" r="6" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="15" stroke-linecap="round" stroke-linejoin="round" d="M192 316V368L224 436H456C470 436 476 428 478 416L486 340C487 330 480 324 470 325L262 340C256 341 252 336 252 330V316M198 386H482M332 338V436M414 331V436"/></svg>`;
const line = body => `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const EYE = line('<path d="M6 32s10-16 26-16 26 16 26 16-10 16-26 16S6 32 6 32Z"/><circle cx="32" cy="32" r="8"/>');
const PITCH = line('<rect x="20" y="6" width="24" height="52" rx="3"/><path d="M27 16l4 5-3 5 5 4M37 34l-4 4 3 5-4 4"/>');
const FLAG = line('<path d="M18 58V10"/><path d="M18 12h24l-6 8 6 8H18"/>');
/** A cricket ball, seam and all, for the corner of the poster and the worm's wickets. */
// One straight seam round its middle, two rows of stitching either side of it.
const ball = (size, rotate = -24, tone = 'red') => {
  const [hi, mid, lo, rim] = tone === 'amber' ? ['#ffe08a', '#f0b429', '#7a5200', '#3d2900'] : ['#ff6b5e', '#c8102e', '#5c0610', '#2a0306'];
  const id = `b${size}${tone}`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" style="transform:rotate(${rotate}deg)"><defs><radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></radialGradient></defs><circle cx="20" cy="20" r="18" fill="url(#${id})" stroke="${rim}" stroke-width="2"/><path d="M2.5 18.4Q20 16.6 37.5 18.4M2.5 21.6Q20 23.4 37.5 21.6" fill="none" stroke="#fff3e6" stroke-width="1.5" stroke-dasharray="1.6 1.8"/><path d="M2.5 20Q20 20 37.5 20" fill="none" stroke="#00000040" stroke-width="1"/></svg>`;
};

const POSTER = `<!doctype html><html><head><style>${FONTS}
  .poster{position:relative;width:720px;height:900px;border-radius:44px;overflow:hidden;color:#fff;font-family:Satoshi;
    background:radial-gradient(120% 80% at 50% 0%,#0a6b3d 0%,#004225 45%,#00180d 100%)}
  .plate{position:absolute;left:0;right:0;top:0;height:520px;background:url(data:image/webp;base64,${plate}) center 40%/cover;filter:saturate(1.15)}
  .plate{-webkit-mask-image:linear-gradient(180deg,#000 55%,#0000 100%);mask-image:linear-gradient(180deg,#000 55%,#0000 100%)}
  .plate::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,#00422500 30%,#00422599 100%)}
  .stripes{position:absolute;inset:0;background:repeating-linear-gradient(90deg,#ffffff06 0 60px,#00000000 60px 120px);mix-blend-mode:screen}
  .flag{position:absolute;left:48px;top:44px;padding:9px 18px;border-radius:24px;background:linear-gradient(90deg,#cd1f22,#ff6567);font-weight:900;font-size:22px;letter-spacing:.16em;box-shadow:0 6px 18px #0006}
  .ball{position:absolute;right:38px;top:34px;filter:drop-shadow(0 10px 14px #0008)}
  .title{position:absolute;left:0;right:0;top:350px;text-align:center}
  .title b{display:block;font-family:Jaro;font-weight:400;font-size:132px;line-height:.86;letter-spacing:.01em;color:#fff;
    -webkit-text-stroke:5px #000;paint-order:stroke fill;text-shadow:0 8px 0 #000,0 14px 30px #000a}
  .title b+b{color:#ffcf5a;font-size:150px}
  .title em{display:inline-block;margin-top:16px;padding:8px 22px;border-radius:30px;background:#000000a6;font-style:normal;font-weight:700;font-size:26px;letter-spacing:.06em;color:#e9f6ec}
  .rules{position:absolute;left:30px;right:30px;bottom:34px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .rule{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
  .rule i{display:grid;place-items:center;width:96px;height:96px;border-radius:50%;background:#fff;color:#0b1622;border:5px solid #000;box-shadow:0 7px 0 #000,0 14px 24px #0008}
  .rule i svg{width:58px;height:58px}
  .rule:first-child i svg{width:70px;height:62px}
  .rule span{font-weight:800;font-size:22px;line-height:1.15;color:#fff}
</style></head><body>
  <div class="poster">
    <div class="plate"></div><div class="stripes"></div>
    <div class="flag">NEW MODE</div>
    <div class="ball">${ball(92)}</div>
    <div class="title"><b>TEST</b><b>MARATHON</b><em>Bat all day</em></div>
    <div class="rules">
      <div class="rule"><i>${HELMET}</i><span>Three<br>batters</span></div>
      <div class="rule"><i>${EYE}</i><span>Focus to<br>settle</span></div>
      <div class="rule"><i>${PITCH}</i><span>The pitch<br>wears</span></div>
      <div class="rule"><i>${FLAG}</i><span>Declare &amp;<br>register</span></div>
    </div>
  </div>
</body></html>`;

/** The innings on the scorecard: three men, a big total, and a ball where each one went. */
const BATTERS = [
  { name: 'Opener', runs: 152, balls: 97, fours: 16, sixes: 8, how: 'out', colour: '#ff6b5e' },
  { name: 'No. 3', left: true, runs: 64, balls: 65, fours: 8, sixes: 0, how: 'retired hurt', colour: '#ffcf5a' },
  { name: 'Tailender', runs: 55, balls: 31, fours: 5, sixes: 5, how: 'out', colour: '#ff6b5e' },
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
    return `<g transform="translate(${f.bx - 17} ${f.by - 17})">${ball(34, 20, f.how === 'out' ? 'red' : 'amber')}</g>
    <g transform="translate(${f.bx + dx} ${cy})"><rect x="-60" y="-30" width="120" height="30" rx="15" fill="#000000c7"/><text y="-9" text-anchor="middle" class="call">${f.runs}${f.how === 'out' ? '' : '*'} · ${f.name}</text></g>`;
  }).join('');
  return `<svg class="worm" viewBox="0 0 ${W} ${H}"><defs>
      <linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffb347" stop-opacity=".55"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></linearGradient>
      <linearGradient id="stroke" x1="0" x2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#ff6b3d"/></linearGradient></defs>
    ${grid}
    <path d="${path}L${x(runs.length)} ${y(0)}L${x(0)} ${y(0)}Z" fill="url(#area)"/>
    <path d="${path}" fill="none" stroke="url(#stroke)" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
    ${marks}</svg>`;
}

const SCORE = `<!doctype html><html><head><style>${FONTS}
  .card{width:720px;height:900px;border-radius:44px;overflow:hidden;color:#fff;font-family:Satoshi;background:linear-gradient(180deg,#0e2537 0%,#0a1824 100%)}
  .band{display:flex;align-items:center;justify-content:space-between;padding:30px 40px 26px;background:linear-gradient(90deg,#004225,#0a6b3d);border-bottom:4px solid #000}
  .band b{font-family:Jaro;font-weight:400;font-size:46px;letter-spacing:.02em;-webkit-text-stroke:3px #000;paint-order:stroke fill}
  .band span{padding:8px 18px;border-radius:22px;background:linear-gradient(90deg,#c8102e,#ff5f57);font-weight:900;font-size:20px;letter-spacing:.14em;border:3px solid #000}
  .total{display:flex;align-items:flex-end;justify-content:space-between;padding:26px 44px 0}
  .total b{font-family:Jaro;font-weight:400;font-size:132px;line-height:.8;color:#fff;-webkit-text-stroke:5px #000;paint-order:stroke fill;text-shadow:0 7px 0 #000}
  .total b small{font-size:64px;color:#ffcf5a}
  .total em{font-style:normal;text-align:right;font-weight:800;font-size:44px;line-height:1}
  .total em small{display:block;margin-top:6px;font-size:20px;font-weight:700;letter-spacing:.12em;color:#9fb2bd}
  .worm{display:block;width:640px;margin:44px 40px 0;overflow:visible}
  .worm text{font-family:Satoshi;font-size:17px;font-weight:700;fill:#9fb2bd}
  .worm text.call{font-size:16px;font-weight:800;fill:#fff}
  .rows{display:flex;flex-direction:column;gap:12px;padding:18px 36px 0}
  .row{display:grid;grid-template-columns:62px 1fr auto;align-items:center;gap:16px;padding:10px 18px 10px 12px;border-radius:22px;background:#ffffff0f;border:2px solid #ffffff14}
  .row i{display:grid;place-items:center;width:62px;height:62px;border-radius:50%;background:#fff;color:#0b1622;border:3px solid #000}
  .row i svg{width:40px;height:36px}
  .row .who b{display:block;font-weight:900;font-size:26px;line-height:1.1}
  .row .who b small{margin-left:8px;padding:2px 8px;border-radius:8px;background:#ffffff1f;font-size:15px;letter-spacing:.06em;vertical-align:4px;color:#cfe0e8}
  .row .who em{font-style:normal;font-size:17px;font-weight:700;color:#9fb2bd}
  .row .who em b{display:inline;font-size:17px;color:var(--how)}
  .row .runs{text-align:right;font-family:Jaro;font-size:58px;line-height:.9;color:#fff;-webkit-text-stroke:2px #000;paint-order:stroke fill}
  .row .runs small{display:block;font-family:Satoshi;font-weight:800;font-size:17px;color:#9fb2bd;-webkit-text-stroke:0}
</style></head><body>
  <div class="card">
    <div class="band"><b>SCORECARD</b><span>ALL OUT</span></div>
    <div class="total"><b>271<small>/3</small></b><em>32.1<small>OVERS</small></em></div>
    ${worm()}
    <div class="rows">${BATTERS.map(b => `
      <div class="row" style="--how:${b.colour}">
        <i>${HELMET}</i>
        <span class="who"><b>${b.name}${b.left ? '<small>LH</small>' : ''}</b><em><b>${b.how}</b> · ${b.fours}×4 · ${b.sixes}×6 · SR ${(b.runs / b.balls * 100).toFixed(0)}</em></span>
        <span class="runs">${b.runs}${b.how === 'out' ? '' : '*'}<small>${b.balls} balls</small></span>
      </div>`).join('')}
    </div>
  </div>
</body></html>`;

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 720, height: 900 }, deviceScaleFactor: 1.5 });
for (const [html, name] of [[POSTER, 'marathon-hero'], [SCORE, 'marathon-card']]) {
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
