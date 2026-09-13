import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:5173/tools/card-lab.html';
const out = '/tmp/claude-0/-home-user-Hitman-Cricket/1787dbd3-b6bd-559e-bb5a-fe17665f41e7/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(base, { waitUntil: 'networkidle' });
for (const state of ['standing', 'standing-mid', 'form-update', 'offer']) {
  await page.evaluate(s => window.showCard(s), state);
  await page.waitForTimeout(350);
  const head = await page.textContent('#card-board-head').catch(() => null);
  const key = await page.textContent('#claim').catch(() => null);
  const send = await page.textContent('#claim-send').catch(() => null);
  const name = await page.inputValue('#claim-name').catch(() => null);
  const chosen = await page.$$eval('.kit-option', o => o.findIndex(b => b.classList.contains('is-chosen'))).catch(() => -1);
  const places = await page.$$eval('#card-peek .board-place', n => n.map(e => e.textContent));
  console.log(JSON.stringify({ state, head: head?.trim(), key: key?.trim(), send: send?.trim(), name, chosen, places }));
  await page.locator('#end').screenshot({ path: `${out}/card-${state}.png` });
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
