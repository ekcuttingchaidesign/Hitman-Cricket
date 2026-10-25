import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
// Photographs a Super10 kit from eight sides on kits.html and lays them in a sheet: node wip/s10kit-round.mjs out-dir s10-orange
const [out, kit = 's10-orange'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 600, height: 700 } });
await page.goto('http://localhost:5201/kits.html');
await page.waitForFunction(() => window.__kits?.ready, null, { timeout: 60000 });
await page.evaluate(k => window.__kits.wear(k), kit);
const files = [];
for (let a = 0; a < 360; a += 45) {
  const r = a * Math.PI / 180;
  await page.evaluate(eye => window.__kits.look(eye), [-3.2 * Math.cos(r), .3, 3.2 * Math.sin(r)]);
  await page.waitForTimeout(300);
  const f = `${out}/${kit}-${a}.png`; files.push(f);
  await page.locator('#stage').screenshot({ path: f });
}
const p = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await p.setContent(`<body style="margin:0;background:#0d0a1f;display:grid;grid-template-columns:repeat(4,1fr);gap:4px">${files.map((f, i) => `<figure style="margin:0;position:relative"><img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="width:100%"><figcaption style="position:absolute;top:4px;right:8px;color:#fff;font:600 14px sans-serif">${i * 45}°</figcaption></figure>`).join('')}</body>`);
await p.screenshot({ path: `${out}/../${kit}-round.png`, fullPage: true });
await browser.close();
