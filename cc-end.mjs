import { chromium } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.addInitScript(() => { try { localStorage.setItem('hitman-seen','2020-01-01'); } catch {} });
const errors = [];
page.on('pageerror', e => errors.push(String(e.message)));
page.on('console', m => { if (m.type()==='error' && !/ERR_TUNNEL|403|gc\.zgo/i.test(m.text())) errors.push(m.text()); });
await page.goto('http://127.0.0.1:5173/');
await page.locator('canvas').waitFor({ timeout: 20000 });
await page.evaluate(() => localStorage.setItem('hitman-batter', JSON.stringify({ name:'Rohit', avatar:1 })));
await page.reload();
await page.locator('canvas').waitFor({ timeout: 20000 });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /START INNINGS/i }).first().click({ force: true });
for (let i = 0; i < 150; i++) {
  if (await page.locator('#end').evaluate(e => !e.classList.contains('hidden')).catch(() => false)) break;
  await page.keyboard.press('w');
  await page.waitForTimeout(400);
}
await page.waitForTimeout(2500);
const vis = s => page.locator(s).evaluate(e => !e.classList.contains('hidden')).catch(() => false);
console.log('end card :', await vis('#end'));
console.log('keys     :', (await page.$$eval('#end button, #end a', e => e.filter(x=>x.offsetParent).map(x=>x.id||x.textContent.trim().slice(0,20)))).join(' | '));
console.log('widget   :', await vis('#card-career'), '| NEW:', await vis('#career-new'));
await page.screenshot({ path: 'cc-end.png' });
await page.click('#card-career');
await page.locator('#stats-back').waitFor({ timeout: 15000 });
await page.waitForTimeout(3000);
console.log('page     : back key yes | shot:', await page.locator('#stats-overlay .stats-shot').count());
await page.screenshot({ path: 'cc-career-page.png' });
await page.click('#stats-back');
await page.waitForTimeout(800);
console.log('after back: end card', await vis('#end'), '| NEW now:', await vis('#career-new'));
console.log(errors.length ? `ERRORS: ${errors.slice(0,4).join(' | ')}` : 'no page errors');
await browser.close();
