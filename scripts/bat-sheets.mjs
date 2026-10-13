/**
 * Bat skins from the Figma template (Skin templates → Bat) into the sheets the
 * game reads, `src/assets/bats/<id>.webp`.
 *
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/bat-sheets.mjs <folder> [name=id …]
 *
 * The template exports four panels a bat, `bat-<name>-face.png`,
 * `-edge-left.png`, `-back.png` and `-edge-right.png`, each 1400 high at 1 px =
 * 0.5 mm. They are laid side by side as `SKIN` in `src/entities/batGeometry.ts`
 * places them — face, left edge, back, right edge, with a strip of nothing
 * between so one never bleeds into the next — on a clear sheet, which the game
 * lays over willow. `name=id` names the sheet when the file's name is not the
 * bat's (the designs are named for their animal, the bats for their word).
 * Then the bat goes into `SHEETS` in `src/entities/batSkins.ts` and `BATS` in
 * `src/game/dressing.ts`.
 */

import { chromium } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [folder, ...renames] = process.argv.slice(2);
if (!folder) { console.error('Which folder? node scripts/bat-sheets.mjs <folder> [name=id …]'); process.exit(1); }
const executablePath = process.env.CHROMIUM_PATH || undefined;
const idOf = Object.fromEntries(renames.map(pair => pair.split('=')));

/** `SKIN` in `batGeometry.ts`: where each panel starts, on a sheet 720 by 1400. */
const SHEET = { width: 720, height: 1400 };
const PANELS = [['face', 8], ['edge-left', 268], ['back', 364], ['edge-right', 624]];

const names = [...new Set((await readdir(folder)).map(file => file.match(/^bat-(.+)-face\.png$/)?.[1]).filter(Boolean))];
if (!names.length) { console.error(`No bat-<name>-face.png in ${folder}.`); process.exit(1); }

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
for (const name of names) {
  const panels = await Promise.all(PANELS.map(async ([side, x]) =>
    [`data:image/png;base64,${(await readFile(join(folder, `bat-${name}-${side}.png`))).toString('base64')}`, x]));
  const webp = await page.evaluate(async ([panels, SHEET]) => {
    const c = document.createElement('canvas'); c.width = SHEET.width; c.height = SHEET.height;
    const g = c.getContext('2d');
    for (const [data, x] of panels) {
      const img = new Image(); img.src = data; await img.decode();
      g.drawImage(img, x, 0, img.width, SHEET.height);
    }
    return c.toDataURL('image/webp', 0.9);
  }, [panels, SHEET]);
  const id = idOf[name] ?? name.replace(/-/g, '');
  const out = new URL(`../src/assets/bats/${id}.webp`, import.meta.url);
  await writeFile(out, Buffer.from(webp.split(',')[1], 'base64'));
  console.log(`${name} → src/assets/bats/${id}.webp`);
}
await browser.close();
