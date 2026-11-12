/**
 * The pictures on the pause sheet's Camera row (`src/assets/cameras/*.webp`,
 * `cameraSwitch` in the HUD): each camera's own view of the Blast at the
 * stadium by day, the batter in his guard and the bowler at his mark, the
 * score bar and keys out of the way, cut to three by four round what that
 * camera is about. Taken again whenever a camera or the ground's look changes.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/camera-thumbs.mjs http://localhost:5201
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5201';
const dir = process.argv[3] || 'src/assets/cameras';
mkdirSync(dir, { recursive: true });
/** Where each picture is cut from the 402 by 874 screen: its top, the cut 3:4 and the full width. */
const CUTS = { classic: 190, close: 250, pro: 170 };
const W = 168, H = 224;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const [cam, top] of Object.entries(CUTS)) {
  const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    try { localStorage.setItem('hitman-shots-intro', 'done'); localStorage.setItem('hitman-whatsnew', 'rivals:9,diwali:9'); } catch { /* Then they show. */ }
  });
  await page.goto(`${base}/?debug=1&seed=4242&lights=day&ground=stadium&mode=classic&cam=${cam}`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 400; i++) {
    if ((await page.evaluate(() => window.__cricket?.snapshot().phase)) === 'READY') break;
    await page.waitForTimeout(50);
  }
  // The ground alone: everything on the page but the picture put out of sight.
  await page.addStyleTag({ content: 'body *{visibility:hidden!important} canvas{visibility:visible!important}' });
  await page.waitForTimeout(600);
  const png = await page.screenshot();
  const webp = await page.evaluate(async ({ b64, top, W, H }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
    const cut = img.width * 4 / 3;
    canvas.getContext('2d').drawImage(img, 0, top, img.width, cut, 0, 0, W, H);
    return canvas.toDataURL('image/webp', 0.8).split(',')[1];
  }, { b64: png.toString('base64'), top, W, H });
  const out = `${dir}/${cam}.webp`;
  writeFileSync(out, Buffer.from(webp, 'base64'));
  console.log('written', out, Buffer.from(webp, 'base64').length, 'bytes');
  await page.close();
}
await browser.close();
