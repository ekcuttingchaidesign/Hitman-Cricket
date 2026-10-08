/**
 * The picture on the mode screen's Leaderboards card.
 *
 *   node scripts/leaderboard-art.mjs
 *
 * A podium with three of the game's own kits on it, first, second and third,
 * lit gold from behind. Drawn here as a page and photographed rather than
 * painted, so it is made of the same faces a player sees on the board, and a
 * new kit or a new colour is a re-run rather than a commission. It needs no
 * dev server: the faces are read off `public/avatars/` and the page is built
 * in the browser that photographs it.
 *
 * The frame is the card's picture box — a little under three to one — and the
 * podium keeps to its middle: the left of the box fades into the card's words,
 * and the right carries the card's arrow.
 */

import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

const executablePath = process.env.CHROMIUM_PATH || undefined;
const root = new URL('../public/', import.meta.url).pathname;
const WIDTH = 840;
const HEIGHT = 312;

const face = async file => `data:image/webp;base64,${(await readFile(`${root}avatars/${file}`)).toString('base64')}`;
const [first, second, third] = await Promise.all(['avatar_7.webp', 'avatar_1.webp', 'avatar_3.webp'].map(face));

/** Bits of confetti, placed by a fixed hand so every run draws the same picture. */
const confetti = Array.from({ length: 34 }, (_, i) => {
  const x = (i * 97) % 100;
  const y = (i * 53) % 70;
  const hue = ['#ffd24a', '#ff7a3d', '#4fc3ff', '#ffffff', '#ffb02e'][i % 5];
  const turn = (i * 41) % 180;
  return `<i style="left:${16 + x * 0.78}%;top:${y}%;background:${hue};transform:rotate(${turn}deg);opacity:${0.45 + (i % 4) * 0.15}"></i>`;
}).join('');

const html = `<!doctype html><html><head><style>
  *{box-sizing:border-box;margin:0}
  body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden;background:#0b1a2b;font-family:system-ui,sans-serif}
  .scene{position:relative;width:100%;height:100%;overflow:hidden;
    background:
      radial-gradient(60% 90% at 55% 62%,#ffb62e66 0%,#ff8a1f33 32%,#0000 70%),
      radial-gradient(40% 60% at 55% 20%,#fff3c455 0%,#0000 70%),
      linear-gradient(180deg,#0c2440 0%,#0a1a2e 70%,#081322 100%)}
  .rays{position:absolute;left:55%;top:-40%;width:900px;height:900px;margin-left:-450px;
    background:repeating-conic-gradient(from 0deg at 50% 50%,#ffd35a1f 0deg 6deg,#0000 6deg 18deg);
    -webkit-mask-image:radial-gradient(closest-side,#000 20%,#0000 75%);mask-image:radial-gradient(closest-side,#000 20%,#0000 75%)}
  .lamp{position:absolute;top:12px;width:26px;height:12px;border-radius:4px;background:#fff8d8;box-shadow:0 0 22px 10px #ffe9a0aa}
  .confetti i{position:absolute;width:9px;height:4px;border-radius:1px}
  .block{position:absolute;bottom:0;width:140px;border-radius:12px 12px 0 0;
    display:flex;justify-content:center;padding-top:10px;
    font:900 34px/1 system-ui,sans-serif;color:#ffffffe6;text-shadow:0 3px 0 #0005}
  .block.one{left:calc(55% - 70px);height:74px;background:linear-gradient(180deg,#ffd45a 0%,#f0a21c 55%,#b86a08 100%);box-shadow:inset 0 3px 0 #fff4c0,inset 0 -10px 18px #0003,0 0 40px #ffb62e66}
  .block.two{left:calc(55% - 70px - 144px);height:52px;background:linear-gradient(180deg,#eef3f8 0%,#b8c4cf 60%,#7d8a96 100%);box-shadow:inset 0 3px 0 #fff,inset 0 -10px 18px #0003;color:#ffffffee}
  .block.three{left:calc(55% + 70px + 4px);height:40px;background:linear-gradient(180deg,#f3b07a 0%,#cf7a3c 60%,#8e4a1c 100%);box-shadow:inset 0 3px 0 #ffd8b8,inset 0 -10px 18px #0003}
  .kit{position:absolute;border-radius:50%;padding:6px;box-shadow:0 10px 20px #0007}
  .kit img{display:block;width:100%;height:100%;border-radius:50%}
  .kit.one{width:156px;height:156px;left:calc(55% - 78px);bottom:80px;background:linear-gradient(160deg,#fff3b0,#f6b21e 45%,#b8740a)}
  .kit.two{width:122px;height:122px;left:calc(55% - 70px - 144px + 9px);bottom:57px;background:linear-gradient(160deg,#ffffff,#b9c5d1 50%,#72808c)}
  .kit.three{width:114px;height:114px;left:calc(55% + 70px + 4px + 13px);bottom:45px;background:linear-gradient(160deg,#ffd6b0,#d4843f 50%,#8e4a1c)}
  .crown{position:absolute;left:calc(55% - 30px);bottom:228px;width:60px;height:44px;filter:drop-shadow(0 4px 6px #0006)}
</style></head><body><div class="scene">
  <div class="rays"></div>
  <span class="lamp" style="left:24%"></span><span class="lamp" style="left:80%"></span>
  <div class="confetti">${confetti}</div>
  <div class="block two">2</div><div class="block one">1</div><div class="block three">3</div>
  <div class="kit two"><img src="${second}"></div>
  <div class="kit three"><img src="${third}"></div>
  <div class="kit one"><img src="${first}"></div>
  <svg class="crown" viewBox="0 0 60 44"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ffc62e"/><stop offset="1" stop-color="#d98a0a"/></linearGradient></defs>
    <path d="M4 14 L17 26 L30 4 L43 26 L56 14 L51 40 L9 40 Z" fill="url(#g)" stroke="#8a5200" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="4" cy="13" r="4" fill="#ffd84a" stroke="#8a5200" stroke-width="2"/><circle cx="30" cy="4" r="4" fill="#ffd84a" stroke="#8a5200" stroke-width="2"/><circle cx="56" cy="13" r="4" fill="#ffd84a" stroke="#8a5200" stroke-width="2"/>
    <circle cx="30" cy="30" r="4.5" fill="#e9582b"/></svg>
</div></body></html>`;

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
// Past how to hit, the coachmark before a first innings: `shots-check.mjs` is the one that looks at it.
await page.addInitScript(() => { try { localStorage.setItem('hitman-shots-intro', 'done'); } catch { /* Then it shows. */ } });
await page.setContent(html, { waitUntil: 'load' });
const png = await page.screenshot({ type: 'png' });
// WebP, through the browser's own encoder — the same way the stories' pictures
// are made, so the repository needs no image library for the sake of one file.
const webp = await page.evaluate(async ([data, width, height]) => {
  const img = new Image();
  img.src = `data:image/png;base64,${data}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas.toDataURL('image/webp', 0.86);
}, [png.toString('base64'), WIDTH, HEIGHT]);
const bytes = Buffer.from(webp.split(',')[1], 'base64');
await writeFile(`${root}leaderboard_cover.webp`, bytes);
console.log(`public/leaderboard_cover.webp  ${WIDTH}×${HEIGHT}  ${Math.round(bytes.length / 1024)} KB`);
await browser.close();
