/**
 * The picture two of Super Knockout's What's new cards stand on
 * (`src/assets/knockout/story-ground.webp`, `KnockoutStory.ts`): a practice
 * room's own ground before a ball, the canopy under lights, on a 402 by 874
 * phone, with everything over the 3D picture put out of sight, since each card
 * lays its own piece of the mode over it. Taken again when the ground's look
 * changes.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/knockout-story-ground.mjs http://localhost:5201
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5201';
const out = process.argv[3] || 'src/assets/knockout/story-ground.webp';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.addInitScript(() => {
  if (sessionStorage.getItem('s')) return;
  sessionStorage.setItem('s', '1');
  localStorage.setItem('hitman-seen', '2026-10-01');
  localStorage.setItem('hitman-shots-intro', 'done');
  localStorage.setItem('hitman-whatsnew', 'rivals:9');
  localStorage.setItem('hitman-knockout-rules', '1');
});
await page.goto(`${base}/?debug=1&seed=4242&knockout=1&intro=0`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.locator('#start').click({ force: true });
// The room walked out into, the batter in his guard and the bowler at his mark.
await page.waitForFunction(() => !!window.__cricket?.knockout?.(), null, { timeout: 60000 });
await page.waitForFunction(() => ['READY', 'RUNUP'].includes(window.__cricket.snapshot().phase), null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(600);
// Only the 3D picture: everything beside the canvas, at every level up from it, is put out of sight.
await page.evaluate(() => {
  const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  for (let node = canvas; node && node !== document.body; node = node.parentElement) {
    for (const beside of node.parentElement.children) if (beside !== node) beside.style.visibility = 'hidden';
  }
});
await page.waitForTimeout(500);
const png = await page.locator('#app').screenshot();
const webp = await page.evaluate(async b64 => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas.toDataURL('image/webp', 0.8).split(',')[1];
}, png.toString('base64'));
writeFileSync(out, Buffer.from(webp, 'base64'));
console.log('written', out, Buffer.from(webp, 'base64').length, 'bytes');
await browser.close();
