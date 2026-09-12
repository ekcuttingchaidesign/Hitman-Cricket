import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const out = process.argv[2];
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5310/tools/card-lab.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const states = ['complete','record','offer','offer-known','offer-top','offer-blind','form','form-error','sending','board'];
const captured = {};
for (const s of states) {
  await page.evaluate(k => window.showCard(k), s);
  await page.waitForTimeout(320);
  captured[s] = await page.evaluate(() => {
    const end = document.getElementById('end');
    const board = document.getElementById('board-overlay');
    const live = board && !board.classList.contains('hidden') ? board : end;
    return live ? live.outerHTML : '';
  });
}
await writeFile(`${out}/states.json`, JSON.stringify(captured));
// And one look at the strip to be sure nothing is hanging over its edge.
await page.evaluate(() => window.showCard('offer'));
await page.waitForTimeout(400);
const fit = await page.evaluate(() => {
  const strip = document.querySelector('.card-board').getBoundingClientRect();
  const key = document.querySelector('.card-board .claim-key').getBoundingClientRect();
  const card = document.querySelector('.scorecard').getBoundingClientRect();
  return {
    keyInsideStrip: key.right <= strip.right + 0.5 && key.left >= strip.left - 0.5,
    stripWiderThanText: Math.round(strip.width) > Math.round(card.width) - 52,
    stripInsideCard: strip.left >= card.left - 0.5 && strip.right <= card.right + 0.5,
    strip: Math.round(strip.width), key: Math.round(key.width), card: Math.round(card.width),
  };
});
await page.screenshot({ path: `${out}/strip.png`, clip: { x: 0, y: 120, width: 400, height: 700 } });
await browser.close();
console.log(JSON.stringify(fit, null, 1));
