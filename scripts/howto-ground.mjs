/**
 * The picture HOW TO PLAY stands on when it is opened from the cover
 * (`src/assets/howto-ground.webp`): the Blast's own screen before its first
 * ball, on a 402 by 874 phone, by day. Taken again whenever the in-game screen
 * changes; it prints where the bat and the confidence meter are in it, which
 * go into `HOWTO_GROUND` in `src/ui/HUD.ts`.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/howto-ground.mjs http://localhost:5201
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://localhost:5201';
const out = process.argv[3] || 'src/assets/howto-ground.webp';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
await page.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('hitman-seen', '2026-10-01'); } });
await page.goto(`${base}/?debug=1&seed=4242&lights=day`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.locator('#start').click({ force: true });
const visible = async sel => (await page.locator(sel).count()) && page.locator(sel).first().isVisible();
for (let i = 0; i < 40 && !(await visible('#marathon-intro')); i++) {
  await page.waitForTimeout(400);
  if (await visible('#whatsnew-done')) await page.locator('#whatsnew-done').click({ force: true });
  else if (await visible('#mode-classic')) await page.locator('#mode-classic').click({ force: true });
}
await page.waitForTimeout(1500);
const where = await page.evaluate(() => {
  const overlay = document.getElementById('marathon-intro');
  const frame = overlay.getBoundingClientRect();
  const rect = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left - frame.left, y: b.top - frame.top, w: b.width, h: b.height }; };
  return { frame: { w: frame.width, h: frame.height }, bat: { x: parseFloat(overlay.style.getPropertyValue('--x')), y: parseFloat(overlay.style.getPropertyValue('--y')) }, confidence: rect('confidence') };
});
console.log(JSON.stringify(where));
await page.addStyleTag({ content: '#debug,#marathon-intro{display:none!important}' });
await page.waitForTimeout(800);
const png = await page.locator('#app').screenshot();
const webp = await page.evaluate(async b64 => {
  const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d').drawImage(img, 0, 0);
  return canvas.toDataURL('image/webp', 0.82).split(',')[1];
}, png.toString('base64'));
writeFileSync(out, Buffer.from(webp, 'base64'));
console.log('written', out, Buffer.from(webp, 'base64').length, 'bytes');
await browser.close();
