import { chromium } from '@playwright/test';
const ORIGIN = 'http://hitman-cricket.test', LOCAL = 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname === 'gc.zgo.at') return route.fulfill({ contentType: 'text/javascript',
    body: 'window.goatcounter={count:h=>{(window.__hits=window.__hits||[]).push(h.path)}};' });
  if (url.origin === ORIGIN) return route.fulfill({ response: await route.fetch({ url: LOCAL + url.pathname + url.search }) });
  return route.continue();
});
const hits = () => page.evaluate(() => window.__hits ?? []);
await page.goto(ORIGIN + '/', { waitUntil: 'networkidle' });
await page.locator('canvas').waitFor();
await page.locator('#start').click();
const deadline = Date.now() + 260_000;
while (Date.now() < deadline && !(await hits()).includes('played-1m')) {
  await page.keyboard.press('d');
  await page.waitForTimeout(350);
  if (await page.locator('#again').isVisible().catch(() => false)) {
    await page.locator('#again').click();
    await page.waitForTimeout(400);
  }
}
console.log('RESULT:', (await hits()).join(', '));
await browser.close();
