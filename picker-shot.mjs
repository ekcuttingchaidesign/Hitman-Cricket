import { chromium } from '@playwright/test';
const out = '/tmp/claude-0/-home-user-Hitman-Cricket/1787dbd3-b6bd-559e-bb5a-fe17665f41e7/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 });
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.evaluate(() => {
  document.getElementById('end').classList.remove('hidden');
  document.getElementById('card-board').classList.remove('hidden');
  document.getElementById('card-claim').classList.remove('hidden');
  document.getElementById('card-peek').classList.add('hidden');
  document.getElementById('claim').classList.add('hidden');
  const KITS = [['pink','#d31e6e','avatar_7.webp'],['india blue','#0248c8','avatar_1.webp'],['purple','#3f0884','avatar_2.webp'],['orange','#f55b11','avatar_3.webp'],['teal','#018ea3','avatar_6.webp']];
  const order = [4,0,2,1,3], chosen = 4;
  document.getElementById('claim-picker').innerHTML =
    `<p class="claim-label" id="kit-picker-label">Choose your avatar</p><div class="kit-picker" role="radiogroup" aria-labelledby="kit-picker-label">` +
    order.map(k => { const [name,colour,file] = KITS[k];
      return `<button type="button" class="kit-option${k===chosen?' is-chosen':''}" role="radio" aria-checked="${k===chosen}" data-kit="${k}" aria-label="${name}"><span class="board-kit" style="--kit:${colour}" aria-hidden="true"><img src="avatars/${file}" alt=""></span></button>`; }).join('') + `</div>`;
});
await page.waitForTimeout(600);
console.log(JSON.stringify(await page.$$eval('.kit-option', o => o.map(b => ({
  kit: b.dataset.kit, aria: b.getAttribute('aria-label'), label: b.querySelector('small')?.textContent ?? null,
  imgOk: b.querySelector('img')?.naturalWidth > 0, ring: getComputedStyle(b).borderColor,
})))));
console.log('overflow:', await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth));
await page.locator('#card-claim').screenshot({ path: `${out}/picker-nolabel.png` });
await browser.close();
