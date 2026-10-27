/**
 * Super10, in a real browser, by its link.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5201 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/super10-check.mjs
 *   node scripts/super10-check.mjs http://…:4173      # a preview build
 *
 * What no unit test can see: `?mode=super10` starting a ten-over innings, the
 * five bowlers coming on over by over in the schedule's order — each with his
 * own action at the top of his mark, the death bowler's above all — the speed
 * gun on every ball, the next batter named as he walks out after a wicket, and
 * the card at the end headed SUPER10, and the innings not practice: Super10
 * has a board and a career (`super10-post-check.mjs` follows a named player's
 * innings onto them). And the field
 * and its two corners: the map in the bottom right with a dot a man and the
 * batter in the map's own colours, enlarged by a tap and put back, each
 * over's field from the field book set for its bowler, its men stood on their
 * marks rather than walked there, Power Surge locked in the bottom left,
 * offered in the break before the sixth over, taken with P and two men
 * brought in for it with the bowler beckoning them, used after, the field
 * drawn in the pause sheet,
 * and the field map's coach card a first Super10 opens with, once. The
 * canopy under lights whatever the clock says, with the LED stumps and no
 * Lights row on the pause sheet. And the
 * canopy's big screen and the boards along its rope playing the brand's
 * moment for a four, and going back after it, the fence to its sponsors and
 * the screen to the Super10 mark and the score.
 *
 * The actions themselves are looked at in `bowler-sheet.html`
 * (`scripts/bowler-sheet.mjs`): a frame there is the frame asked for, which a
 * software-rendered game's clock does not promise.
 */

import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5201').replace(/\/$/, '');
const executablePath = process.env.CHROMIUM_PATH || undefined;

let failures = 0;
const check = (ok, what, detail) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}${ok || detail === undefined ? '' : `\n        ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.addInitScript(() => {
  try {
    localStorage.setItem('hitman-shots-intro', 'done');
    if (!location.search.includes('intro=')) localStorage.setItem('hitman-field-intro', 'done');
    localStorage.setItem('hitman-whatsnew', 'super10:9');
    localStorage.setItem('hitman-seen', new Date(Date.now() - 172_800_000).toISOString().slice(0, 10));
  } catch { /* Then the coachmarks show, and the check stops at them. */ }
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// Anything that puts an innings on a board or counts it toward a career.
const sent = [];
page.on('request', request => {
  const { pathname } = new URL(request.url());
  if (request.method() !== 'GET' && /^\/api\/(score|career|survive|innings|marathon)/.test(pathname)) sent.push(pathname);
});

const snap = () => page.evaluate(() => window.__cricket.snapshot());
const advance = ms => page.clock.runFor(Math.max(16, Math.round(ms)));
const until = async (phases, tries = 120, step = 150) => {
  for (let i = 0; i < tries; i++) {
    const seen = await snap();
    if (phases.includes(seen.phase)) return seen;
    await advance(step);
  }
  throw new Error(`Never reached ${phases}: ${JSON.stringify(await snap())}`);
};

await page.clock.install();
await page.goto(`${base}/?debug=1&mode=super10&seed=777`, { waitUntil: 'load' });
await advance(2500);
await page.waitForTimeout(800);
// Headless Chromium looks like a private window: past its notice, as the other checks go.
const anyway = page.getByRole('button', { name: /PLAY ANYWAY/i });
if (await anyway.count()) { await anyway.first().click(); await advance(1200); await page.waitForTimeout(300); }
await page.locator('#start').click({ force: true });

// In small steps: the opener is named only until the first ball is bowled.
const first = await until(['READY'], 800, 16);
check(first.super10 !== null, '?mode=super10 starts a Super10 innings', JSON.stringify(first.super10));
check(first.super10?.practising === false, 'and it is not practice: Super10 has a board and a career now');
check(first.look?.startsWith('s10-purple/') && first.shirt === '10', 'the opener bats in the purple kit with 10 on his back', `${first.look} ${first.shirt}`);
check(/^s10-/.test(first.fieldingKit ?? '') && first.fieldingKit !== 's10-purple', "and the side in the field in another team's", first.fieldingKit);
const opener = await page.locator('#phase-label').textContent();
check(first.balls === 0 && !!opener?.startsWith('OPENER IN'), 'the opener is named as he walks out', `${opener} (balls ${first.balls})`);
const ball = await page.evaluate(() => window.__cricket.ball());
check(ball === '#e84829', 'and it is played with the red ball', ball);
const look = await page.evaluate(() => ({ ground: window.__cricket.ground(), lights: window.__cricket.lights(), led: window.__cricket.ledStumps(), turf: window.__cricket.turf() }));
check(look.ground === 'canopy' && look.lights === 'night' && look.led && look.turf === 'fresh',
  'at the canopy under lights, whatever the clock, with the Super10 LED stumps and the canopy\'s turf', JSON.stringify(look));
const corner = await page.evaluate(() => ({
  map: document.querySelectorAll('#s10-map .s10-man').length, bat: !!document.querySelector('#s10-map .s10-bat'),
  shown: !document.querySelector('#s10-map')?.classList.contains('hidden'), surge: document.querySelector('#s10-surge')?.dataset.state,
  man: getComputedStyle(document.querySelector('#s10-map .s10-man circle')).fill,
  batter: getComputedStyle(document.querySelector('#s10-map .s10-bat')).fill,
}));
check(first.super10.field?.id === 'new-ball' && corner.shown && corner.map === 9 && corner.bat,
  'the first over\'s field is on the map in its corner before the first ball, a dot a man and the batter', JSON.stringify({ corner, field: first.super10.field }));
check(corner.man === 'rgb(255, 68, 56)' && corner.batter === 'rgb(47, 164, 255)',
  'the fielders drawn red and the batter blue, whatever either side wears', JSON.stringify(corner));
check(corner.surge === 'locked', 'and Power Surge is locked in the other', corner.surge);
// Both taps in one turn of the page, or the bowler's first stride can put the
// map back before the second.
const taps = await page.evaluate(() => {
  const enlarged = () => window.__cricket.snapshot().super10.enlarged;
  document.querySelector('#s10-map').click();
  const big = enlarged(), shown = getComputedStyle(document.querySelector('#s10-big')).display !== 'none';
  document.querySelector('#s10-big').click();
  return { big, shown, after: enlarged() };
});
check(taps.big && taps.shown && !taps.after, 'a tap enlarges the map from its corner, and another puts it back', JSON.stringify(taps));

const ACTION = { PACE: 'pace', SPIN: 'pace', EXPRESS: 'express', DEATH: 'death' };
const kinds = [];
const actions = {};
const speeds = [];
const fields = [];
let armed = null, pauseMap = false, pauseLights = true, offered = null, usedAfter = null, bigLine = null;
const signals = [], away = [];
const write = balls => page.evaluate(b => window.__cricket.blast(b), balls);
// Who bowls each over is read off the game at its top; one real ball is bowled
// for each kind of bowler — the swing bowler's, the spinner's, the sling
// bowler's and the death bowler's — to see the action he runs in with, and the
// rest of the innings is written through the debug hook: ten overs cannot be
// batted in software. The second over's are written with a wicket in them.
const REAL = new Set([0, 3, 4, 7]);
for (let over = 0; over < 10; over++) {
  const ready = await until(['READY', 'INNINGS_END']);
  if (ready.phase === 'INNINGS_END') break;
  kinds[over] = ready.super10.bowler;
  fields[over] = ready.super10.field;
  // The new field's men are on their marks the moment the over is set, nobody walking there.
  if (over >= 1) away.push(ready.super10.away);
  if (over === 7) usedAfter = await page.evaluate(() => document.querySelector('#s10-surge')?.dataset.state);
  // Power Surge, taken in the break before the sixth over, which it is for.
  if (over === 5) {
    offered = await page.evaluate(() => document.querySelector('#s10-surge')?.dataset.state);
    await page.keyboard.press('p');
    const surged = (await snap()).super10;
    armed = surged.surge; fields[5] = surged.field;
    // He starts the beckon a moment after the press: watched for a second.
    for (let i = 0; i < 12 && !signals.some(Boolean); i++) { await advance(80); signals.push((await snap()).super10.signalling); }
  }
  if (over === 3) {
    // No field in the pause sheet: the corner has it.
    await page.keyboard.press('Escape');
    pauseMap = await page.locator('#pause-overlay .s10-svg').count() > 0;
    pauseLights = await page.locator('#lights-row').isVisible();
    await page.keyboard.press('Escape');
  }
  if (over === 2) {
    const label = await page.locator('#phase-label').textContent();
    check(!!label?.startsWith('NO. 2 IN'), 'after a wicket the No. 2 is named walking out', label);
    const shirt = (await snap()).shirt;
    check(shirt === '17', 'with 17 on his back', shirt);
  }
  let left = 6;
  if (REAL.has(over)) {
    // The sling bowler's ball is driven with the map enlarged: the ball's line goes on the big map too.
    if (over === 4) await page.keyboard.press('f');
    const runup = await until(['BOWLER_RUNUP'], 400, 16);
    actions[over] = { kind: runup.super10.bowler, action: runup.super10.action, death: runup.super10.death, express: runup.super10.express };
    const flight = await until(['BALL_IN_FLIGHT']);
    speeds.push(await page.locator('#speed').textContent());
    await advance(flight.contactAt - flight.elapsed - 40);
    await page.keyboard.press(over === 4 ? 'w' : 's');
    if (over === 4) {
      await advance(400);
      bigLine = await page.evaluate(() => {
        const line = document.querySelector('#s10-big .s10-shot'), corner = document.querySelector('#s10-map .s10-shot');
        return { open: window.__cricket.snapshot().super10.enlarged, big: !!line?.getAttribute('d') && line.classList.contains('is-on'), corner: !!corner?.getAttribute('d') };
      });
      await page.keyboard.press('f');
    }
    const after = await until(['READY', 'INNINGS_END']);
    if (after.phase === 'INNINGS_END') break;
    left = 6 - (after.balls % 6);
  }
  const rest = Array(left).fill(0);
  if (over === 1) rest[0] = 'W';
  await write(rest);
  await advance(300);
}

await until(['INNINGS_END'], 200);
const final = await snap();
check(final.balls === 60 || final.wickets === 5, 'the innings ends at ten overs or five wickets', `${final.runs}/${final.wickets} off ${final.balls}`);

// The canopy's screen and the boards along the rope: the brand's moment on both, then their own faces back.
const ground = await page.evaluate(() => window.__cricket.ground());
await page.evaluate(() => window.__cricket.arenaCue('four'));
await advance(120);
const cued = await page.evaluate(() => window.__cricket.arena());
await advance(2600);
const rested = await page.evaluate(() => window.__cricket.arena());
check(ground === 'canopy', 'Super10 is played at the canopy', ground);
const screenGround = await page.evaluate(() => document.querySelector('#viewport').classList.contains('has-screen'));
check(screenGround, 'and the call over the field is taken down off its big screen', String(screenGround));
const moments = await page.evaluate(() => document.querySelector('#viewport').classList.contains('screen-moments'));
check(moments, 'which plays the moments, so a boundary\'s word is left to it (a wicket\'s never is)', String(moments));
check(cued?.word === 'FOUR' && cued.board === 'four' && cued.sting === 'four' && cued.screen === 'w|FOUR',
  'a four puts FOUR and its sting on the screen and the boards along the rope', JSON.stringify(cued));
check(rested?.word === null && rested.board === 'idle' && rested.sting === null && rested.screen?.startsWith('b|SUPER10'),
  'and after it the fence goes back to its sponsors and the screen to the Super10 mark and the score', JSON.stringify(rested));

// The schedule: swing, seam, swing, spin, sling, spin and seam either way, death, sling, death.
const want = ['PACE', 'PACE', 'PACE', 'SPIN', 'EXPRESS', null, null, 'DEATH', 'EXPRESS', 'DEATH'];
const middle = [kinds[5], kinds[6]].sort().join(',');
check(kinds.every((k, i) => want[i] === null || want[i] === k) && (kinds.length < 7 || middle === 'PACE,SPIN'),
  'the five bowlers come on in the schedule\'s order', kinds.join(' '));
const real = Object.values(actions);
check(real.length === REAL.size && real.every(o => o.action === ACTION[o.kind]),
  'the swing, spin, sling and death bowlers each run in with their own action', JSON.stringify(actions));
check(real.every(o => o.death === (o.kind === 'DEATH') && o.express === (o.kind === 'EXPRESS')),
  'and the death and sling bowlers\' balls are flagged as theirs');
const BOWLER = { PACE: ['SWING', 'SEAM'], SPIN: ['SPIN'], EXPRESS: ['SLING'], DEATH: ['DEATH'] };
check(fields.length >= 8 && fields.every((f, i) => f && BOWLER[kinds[i]].includes(f.bowler)), 'each over\'s field is set for its bowler',
  fields.map(f => f?.id).join(' '));
check(fields.slice(0, 3).every(f => f.deep.length === 2) && fields.slice(3, 5).every(f => f.deep.length === 5),
  'with two men back in the Powerplay and five after it', fields.map(f => f?.deep.length).join(' '));
check(away.every(a => a < .5), 'and the men stand on a new field\'s marks, nobody walking there', away.join(' '));
// Five men back, less the two the surge brings in.
check(armed === 5 && fields[5]?.change === 'surge' && fields[5].deep.length === 3,
  'Power Surge taken with P before the sixth over brings two men in for it', `${armed} ${JSON.stringify(fields[5])}`);
check(signals.some(Boolean), 'and the bowler beckons them in', JSON.stringify(signals));
check(offered === 'offer' && usedAfter === 'used', 'its corner offers it in the break before the sixth and shows it used after',
  `${offered} ${usedAfter}`);
check(fields.slice(6).every(f => f?.change !== 'surge'), 'and it is one over only: the ninth does not switch it on again');
check(!bigLine?.corner || (bigLine.open && bigLine.big), "with the map enlarged, the ball's line is drawn on the big map as on the corner's", JSON.stringify(bigLine));
check(!pauseMap, 'the pause sheet has no field map');
check(!pauseLights, 'and no Lights row: Super10 is always played at night');
check(speeds.every(v => /^\d+$/.test(v ?? '')), 'the speed gun reads out every ball', speeds.slice(0, 12).join(' '));

const card = await page.locator('#end').textContent().catch(() => '');
const heading = `${await page.locator('#end-mode').textContent()} · ${await page.locator('#end-label').textContent()}`;
check(heading === 'SUPER10 · 10 OVERS', 'the card is headed SUPER10 · 10 OVERS', heading);
const note = (await page.locator('#card-board-head').textContent()) ?? '';
check(!/still being built/i.test(note), 'and no longer says Super10 does not count', note);
check(!/best stands/i.test(card ?? ''), 'and quotes no Blast best on it');
// Its own card: the Blast's in Super10's colours, ten overs charted with the
// surge's over marked, and the Marathon's batting card, a row a man who came in.
const drawn = await page.evaluate(() => ({
  themed: document.querySelector('#end').classList.contains('is-super10'),
  overs: document.querySelectorAll('#final-balls .ec-over').length,
  surge: [...document.querySelectorAll('#final-balls .ec-over')].findIndex(o => o.classList.contains('is-surge')),
  rows: [...document.querySelectorAll('#mcard-score tbody tr')].map(r => r.querySelector('.ec-bat-name')?.textContent),
  shown: !!document.querySelector('#mcard-score')?.offsetHeight,
  balls: [...document.querySelectorAll('#mcard-score tbody tr')].reduce((n, r) => n + Number(r.cells[2]?.textContent ?? 0), 0),
}));
check(drawn.themed && drawn.overs === 10, 'the card charts all ten overs in Super10\'s colours', JSON.stringify(drawn));
check(drawn.surge === 5, 'with the bolt over the sixth, the over Power Surge was taken in', String(drawn.surge));
check(drawn.shown && drawn.rows.length === final.wickets + (final.wickets < 5 ? 1 : 0) && drawn.rows[0] === 'OPENER' && drawn.rows[1] === 'NO. 2',
  'and a batting card under it, a row for each man who came in', drawn.rows.join(' · '));
check(drawn.balls === final.balls, 'whose balls add up to the innings\'', `${drawn.balls} of ${final.balls}`);
await page.locator('#end .ec-content').screenshot({ path: 'test-results/super10-card.png' }).catch(() => {});
check(sent.every(path => path === '/api/score' || path === '/api/innings'), 'what it sends goes to the board and the career (super10-post-check.mjs follows it there)', sent.join(', '));

// A first Super10 in this browser opens with its rules, once.
for (const time of ['first', 'second']) {
  await page.goto(`${base}/?debug=1&mode=super10&seed=778`, { waitUntil: 'load' });
  if (time === 'first') await page.evaluate(() => localStorage.removeItem('hitman-field-intro'));
  for (let i = 0; i < 80 && !(await page.evaluate(() => !!document.querySelector('#start') && !!window.__cricket)); i++) {
    if (await anyway.count()) await anyway.first().click().catch(() => {});
    await advance(300); await page.waitForTimeout(200);
  }
  await page.locator('#start').click({ force: true });
  await until(['READY'], 800, 16);
  const up = await page.locator('#marathon-intro').isVisible();
  if (time === 'first') {
    // Ten overs, five wickets, the field map, the gaps: one card each, the first three outlined and tagged.
    const cards = [];
    for (let i = 0; i < 4 && await page.locator('#marathon-intro').isVisible(); i++) {
      cards.push(await page.evaluate(() => ({
        title: document.querySelector('#mi-title')?.textContent,
        tag: document.querySelector('#mi-tag:not(.hidden)')?.textContent ?? null,
        gaps: !!document.querySelector('#mi-stage .mi-gaps'),
        big: window.__cricket.snapshot().super10.enlarged,
        // Measured from the foot of the cards' own overlay, so a page scrolled under it is no difference.
        bottom: Math.round(document.querySelector('#marathon-intro').getBoundingClientRect().bottom - document.querySelector('#mi-card').getBoundingClientRect().bottom),
        // And nothing under them slid: the game's stage scrolled once, when the map was held up.
        scroll: Math.round(scrollY + (document.querySelector('#viewport')?.scrollTop ?? 0)),
      })));
      if (i === 3) await page.locator('#marathon-intro').screenshot({ path: 'test-results/super10-gaps.png' }).catch(() => {});
      await page.locator('#mi-next').click(); await advance(200);
    }
    const want = [['Ten overs', 'Overs'], ['Five wickets', 'Wickets'], ['Watch the field', 'Field map'], ['Play in the gaps', null]];
    check(up && cards.length === 4 && cards.every((c, i) => c.title === want[i][0] && c.tag === want[i][1]) && cards[3].gaps,
      'a first Super10 opens with its rules: ten overs, five wickets, the field map tagged, the gaps drawn at the bat', JSON.stringify(cards));
    check(cards.every(c => c.bottom === cards[0].bottom && c.scroll === 0) && cards.map(c => c.big).join() === 'false,false,true,false',
      'every card stands at the foot, and Watch the field holds the map up enlarged over its card, then puts it back', JSON.stringify(cards));
    check(!(await page.locator('#marathon-intro').isVisible()) && !(await snap()).super10.enlarged, "and LET'S BAT puts them away, the map in its corner");
  } else check(!up, 'and never again');
}
check(errors.length === 0, 'no errors on the page', errors.join(' | '));

await browser.close();
console.log(failures ? `\n${failures} failed` : '\nAll good');
process.exit(failures ? 1 : 0);
