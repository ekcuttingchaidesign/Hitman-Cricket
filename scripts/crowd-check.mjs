/**
 * The stands on their feet: arms up and placards across the far end for a four
 * or a six struck and for every milestone, and nothing for anything else.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/crowd-check.mjs http://127.0.0.1:5201
 *
 * Two halves. The first builds the scene alone on a blank page and calls the
 * game's own `presentResult` and `celebrate` on it, so the rule is the game's
 * and not a copy: a single, a two, a wicket and a wicket on four runs raise
 * nobody; a four and a six do, and so does each milestone; a boundary does
 * not cut short a bigger moment still up; it settles by itself back to the
 * idle draw count, and a new ball sits them down without a jump; and with reduced motion the crowd holds still. The second
 * opens the real game and asks for a hundred by name, so the hook-up in play
 * is seen too.
 *
 * Pictures land in test-results/crowd/, for a person to look at.
 */

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

await mkdir('test-results/crowd', { recursive: true });
const browser = await chromium.launch({ executablePath });

for (const [name, width, height, reduce] of [['phone', 390, 844, false], ['desktop', 1280, 720, false], ['reduced', 390, 844, true]]) {
  console.log(`the scene alone · ${name}`);
  const page = await browser.newPage({
    viewport: { width, height }, deviceScaleFactor: name === 'desktop' ? 1 : 1.5, isMobile: name !== 'desktop',
    reducedMotion: reduce ? 'reduce' : 'no-preference',
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.route('**/crowd-lab*', r => r.fulfill({
    contentType: 'text/html',
    body: '<head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="ground" style="width:100vw;height:100vh"></div></body>',
  }));
  await page.goto(`${base}/crowd-lab`);
  const seen = await page.evaluate(async () => {
    const { GameScene } = await import('/src/scene/GameScene.ts');
    const { Game } = await import('/src/Game.ts');
    const { MARK_OF } = await import('/src/game/milestone.ts');
    const scene = window.labScene = new GameScene(document.querySelector('#ground'));
    scene.render(0);
    window.idle = scene.renderer.info.render.calls;
    const cheers = [];
    // Just enough of a game for the two methods: everything else they touch
    // is the HUD's, and that is not what is being looked at here.
    const game = {
      scene, elapsed: 0, lesson: 0, chargeMiss: null, felled: false, outcome: null,
      hud: { result() {}, blow() {}, milestone: () => ({}) },
      audio: { play() {}, cheer(seconds) { cheers.push(seconds); } },
      mark() {},
    };
    window.present = (runs, isWicket = false) => {
      game.outcome = { runs, isWicket, madeBatContact: true, aerial: false };
      Game.prototype.presentResult.call(game);
    };
    window.milestone = kind => Game.prototype.celebrate.call(game, { kind, mark: MARK_OF[kind] }, true);
    const quiet = [];
    for (const [runs, wicket] of [[0, false], [1, false], [2, false], [0, true], [4, true], [6, true]]) {
      scene.reset(); window.present(runs, wicket);
      if (scene.crowdState.kind !== null) quiet.push(`${runs}${wicket ? 'w' : ''}`);
    }
    const quietCheers = cheers.length;
    const raised = {};
    for (const [runs, kind] of [[4, 'hit-four'], [6, 'hit-six']]) { scene.reset(); window.present(runs); raised[kind] = scene.crowdState.kind; }
    for (const kind of ['fifty', 'raise', 'century', 'six-sixes', 'double', 'triple', 'four']) { scene.reset(); window.milestone(kind); raised[kind] = scene.crowdState.kind; }
    scene.reset();
    return { quiet, quietCheers, raised, idle: window.idle };
  });
  check(seen.quiet.length === 0, 'nobody stands for a dot, a single, a two or a wicket', seen.quiet.join(', '));
  check(seen.quietCheers === 0, 'and nobody is heard', `${seen.quietCheers} cheers`);
  for (const [kind, got] of Object.entries(seen.raised)) check(got === kind, `the stands rise for ${kind}`, got);

  const looks = [];
  for (const kind of ['hit-four', 'hit-six', 'fifty', 'raise', 'century', 'four']) {
    const look = await page.evaluate(kind => {
      const scene = window.labScene;
      scene.reset();
      if (kind === 'hit-four' || kind === 'hit-six') window.present(kind === 'hit-four' ? 4 : 6); else window.milestone(kind);
      scene.render(900);
      return { kind, ...scene.crowdState, calls: scene.renderer.info.render.calls, png: scene.renderer.domElement.toDataURL('image/png').split(',')[1] };
    }, kind);
    check(look.calls <= seen.idle + 4, `${kind}: four draws or fewer on top of the idle ${seen.idle}`, look.calls);
    check(look.banners >= 4, `${kind}: placards up`, look.banners);
    if (name !== 'reduced') await writeFile(`test-results/crowd/${name}-${kind}.png`, Buffer.from(look.png, 'base64'));
    looks.push(look);
  }

  const after = await page.evaluate(() => {
    const scene = window.labScene, crowd = scene.crowd;
    let still = true;
    if (crowd.reducedMotion) {
      scene.render(1100); const was = Array.from(crowd.bodies.instanceMatrix.array);
      scene.render(1300); still = was.every((v, i) => v === crowd.bodies.instanceMatrix.array[i]);
    }
    scene.render(10_000);
    const settled = scene.crowdState.kind === null && scene.crowdState.banners === 0, calls = scene.renderer.info.render.calls;
    scene.cheer('century', 10_000); scene.cheer('hit-four', 10_100);
    const kept = scene.crowdState.kind;
    // A new ball: they sit down over the fall, not in a frame.
    scene.render(10_200); scene.reset(); scene.render(10_250);
    const sitting = scene.crowdState.kind === 'century';
    scene.render(10_700);
    return { still, settled, calls, kept, sitting, cleared: scene.crowdState.kind === null };
  });
  if (reduce) check(after.still, 'with reduced motion, the crowd holds still');
  check(after.settled, 'it settles by itself');
  check(after.calls === seen.idle, 'back to the idle draw count', `${after.calls} against ${seen.idle}`);
  check(after.kept === 'century', 'a four does not cut short a hundred', after.kept);
  check(after.sitting, 'a new ball sits them down over the fall, not in a frame');
  check(after.cleared, 'and they are seated by the time it is bowled');
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

console.log('in the game');
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/board**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ rows: [], cutoff: null, size: 50 }),
  }));
  await page.goto(`${base}/?debug=1&seed=222&lights=day`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
  if (await anyway.count()) { await anyway.first().click(); await page.waitForTimeout(800); }
  await page.locator('#start').click({ force: true });
  for (let i = 0; i < 30; i++) {
    const mode = page.locator('#mode-classic'), done = page.locator('#whatsnew-done');
    if (await mode.isVisible().catch(() => false)) {
      await page.waitForTimeout(500);
      await mode.click({ force: true, timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(800);
      if (!(await mode.isVisible().catch(() => false))) break;
      continue;
    }
    if (await done.isVisible().catch(() => false)) await done.click({ force: true, timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  let phase = '';
  for (let i = 0; i < 60 && !/READY|RUNUP/.test(phase); i++) { await page.waitForTimeout(250); phase = await page.evaluate(() => window.__cricket?.snapshot().phase ?? ''); }
  check(/READY|RUNUP/.test(phase), 'an innings is under way', phase);
  const resting = await page.evaluate(() => window.__cricket.crowd());
  check(resting.kind === null && resting.spectators > 0, 'the stands are seated before anything happens', JSON.stringify(resting));
  await page.evaluate(() => window.__cricket.milestone('century'));
  await page.waitForTimeout(400);
  const up = await page.evaluate(() => window.__cricket.crowd());
  check(up.kind === 'century' && up.banners > 0, 'a hundred brings them up', JSON.stringify(up));
  await page.screenshot({ path: 'test-results/crowd/game-century.png' });
  check(errors.length === 0, 'with nothing in the console', errors.join('\n        '));
  await page.close();
}

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
