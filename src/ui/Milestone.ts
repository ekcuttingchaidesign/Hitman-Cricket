/**
 * The doodles that go up for the moments an innings stops for: a fifty, a
 * hundred, six sixes in a row — and, in a Test innings, every fifty after:
 * the raised bat's number for 150, 250 and 350, and the three big ones.
 *
 * After the street-racing games that draw on their own screens: the moment is
 * marked in marker pen over the picture rather than in a panel in front of it,
 * drawn on stroke by stroke, held with the slight shiver of a hand-drawn
 * frame, and wiped.
 *
 * The fifty is the mild one — a 50 written beside him, a small burst, a few
 * stars, the ground left in its colours. The hundred is the big one: the
 * ground goes grey (see GameScene), a crown on the helmet, energy up both
 * sides, the 100 on fire, and fire up the edges of the screen, cel-shaded
 * flames that flicker between two drawn frames the way drawn animation does.
 * Six sixes is the wild one, for Yuvraj Singh: all of the hundred's fire,
 * SIX 6s slammed across the top, YUVI tagged big beside him, and under it a
 * question with an arrow at the batter — is that you?
 *
 * The Test innings' marks after the hundred have looks of their own rather
 * than the hundred's fire made bigger: a sticker slapped on beside him for
 * 150, 250 and 350, with the ball peeking over it; and for the big three a
 * layer that goes up behind him — a neon starburst for the double, wings for
 * the triple, a poster covering the whole picture for four hundred — with him
 * drawn back over it and outlined (see `Cutout`, and GameScene's `cutout`).
 * Their figures are fat bubble figures with a 3D side. The number is the
 * thing, and none of them piles more round him than the one before.
 *
 * Everything is placed off where the batter actually is on screen, so it
 * follows him from a phone held upright to a monitor. Everything is SVG
 * strokes and CSS: nothing here touches the ground's renderer — the cut-out
 * is GameScene's — and none of it outlives the moment it is up for.
 *
 * The marks are drawn with a seeded wobble, so they look inked rather than
 * plotted and look the same every time. The figures are drawn rather than set
 * in a face: a number somebody wrote reads as a moment where a number in a
 * font reads as a label. The words are set, in the cover's display face,
 * because they are shouted rather than written.
 */

import type { Milestone, Moment } from '../game/milestone';

interface Point { x: number; y: number }
export interface BatterOnScreen { feet: Point; head: Point; bat: Point; width: number; height: number }

/** Same marks, same wobble, every time. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const f = (n: number) => n.toFixed(1);
const line = (points: Point[]) => `M${points.map(p => `${f(p.x)} ${f(p.y)}`).join('L')}`;

/**
 * A mark in three layers: the ink it sits on, the colour, and a thin highlight
 * down it. `delay` is when the pen starts, `draw` how long the stroke takes.
 */
function mark(d: string, width: number, delay: number, draw: number, highlight = true) {
  const style = `--delay:${delay}ms;--draw:${draw}ms`;
  return `<g class="cy-mark" style="${style}">`
    + `<path class="cy-ink" d="${d}" pathLength="1" stroke-width="${f(width * 1.5)}" transform="translate(${f(width * .35)} ${f(width * .45)})"/>`
    + `<path class="cy-paint" d="${d}" pathLength="1" stroke-width="${f(width)}"/>`
    + (highlight ? `<path class="cy-shine" d="${d}" pathLength="1" stroke-width="${f(Math.max(1, width * .22))}" transform="translate(${f(-width * .18)} ${f(-width * .2)})"/>` : '')
    + '</g>';
}

/** A loop that goes round a little more than once, the way a pen does. */
function loop(cx: number, cy: number, rx: number, ry: number, random: () => number, turns = 1.12) {
  const points: Point[] = [];
  const steps = 26;
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + i / steps * Math.PI * 2 * turns;
    const wobble = 1 + (random() - .5) * .1;
    points.push({ x: cx + Math.cos(a) * rx * wobble, y: cy + Math.sin(a) * ry * wobble });
  }
  // A smooth hand, not a polygon: through the midpoints, bending at the points.
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += `Q${f(points[i].x)} ${f(points[i].y)} ${f(mid.x)} ${f(mid.y)}`;
  }
  return d;
}

/** A jagged run of energy from `from` to `to`: lightning drawn by hand. */
function jag(from: Point, to: Point, random: () => number, kinks = 5, amplitude = 1) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length, ny = dx / length;
  const points = [from];
  for (let i = 1; i < kinks; i++) {
    const t = i / kinks, side = (i % 2 ? 1 : -1) * (.5 + random() * .5) * amplitude;
    points.push({ x: from.x + dx * t + nx * side, y: from.y + dy * t + ny * side });
  }
  points.push(to);
  return line(points);
}

function star(c: Point, r: number, random: () => number) {
  const points: Point[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5 + (random() - .5) * .12;
    const radius = (i % 2 ? r * .45 : r) * (1 + (random() - .5) * .15);
    points.push({ x: c.x + Math.cos(a) * radius, y: c.y + Math.sin(a) * radius });
  }
  return line(points);
}

/**
 * One flame: a few tongues off a rounded base, drawn as one closed shape so it
 * can be filled. `lean` tips it sideways, as a fraction of its height, which
 * is how the flames up the sides of the screen lick in towards the middle.
 */
function flame(base: Point, w: number, h: number, random: () => number, lean = 0) {
  const n = 3;
  const tip = (k: number): Point => ({
    x: base.x + w * ((k + .5) / n - .5) * .8 + lean * h * (.7 + random() * .3),
    y: base.y - h * (k === 1 ? .92 + random() * .08 : .52 + random() * .25),
  });
  const valley = (k: number): Point => ({
    x: base.x + w * ((k + 1) / n - .5) * .8 + lean * h * .35,
    y: base.y - h * (.28 + random() * .14),
  });
  const p = (q: Point) => `${f(q.x)} ${f(q.y)}`;
  const tips = [0, 1, 2].map(tip), valleys = [0, 1].map(valley);
  let d = `M${p({ x: base.x - w / 2, y: base.y })}`;
  d += `Q${p({ x: base.x - w * .62 + lean * h * .15, y: base.y - h * .42 })} ${p(tips[0])}`;
  for (let k = 0; k < n - 1; k++) {
    d += `Q${p({ x: (tips[k].x + valleys[k].x) / 2 + w * .04, y: valleys[k].y - h * .10 })} ${p(valleys[k])}`;
    d += `Q${p({ x: valleys[k].x + w * .02, y: tips[k + 1].y + h * .25 })} ${p(tips[k + 1])}`;
  }
  d += `Q${p({ x: base.x + w * .62 + lean * h * .15, y: base.y - h * .42 })} ${p({ x: base.x + w / 2, y: base.y })}`;
  return `${d}Q${p({ x: base.x, y: base.y + h * .12 })} ${p({ x: base.x - w / 2, y: base.y })}Z`;
}

/**
 * A flame in three colours — the orange body, a yellow heart, a cream core —
 * outlined in ink, drawn twice with different hands so it can flicker between
 * the two. `delay` staggers when it whooshes up.
 */
function fire(base: Point, w: number, h: number, lean: number, seed: number, delay: number, ink: number) {
  const frames = [0, 1].map(frame => {
    const random = seeded(seed * 7 + frame * 131);
    const body = flame(base, w, h, random, lean);
    const heart = flame({ x: base.x + lean * h * .05, y: base.y }, w * .62, h * .66, random, lean * .8);
    const core = flame({ x: base.x + lean * h * .04, y: base.y }, w * .32, h * .36, random, lean * .6);
    return `<g class="cy-frame"><path class="cy-flame" d="${body}" stroke-width="${f(ink)}"/>`
      + `<path class="cy-flame-heart" d="${heart}"/><path class="cy-flame-core" d="${core}"/></g>`;
  });
  return `<g class="cy-fire" style="--delay:${delay}ms;transform-origin:${f(base.x)}px ${f(base.y)}px">${frames.join('')}</g>`;
}

/**
 * Fire up the edges of the screen: a bank in each bottom corner and a run up
 * each side, leaning in, the bottom middle left clear for him and the pitch.
 */
function edges(width: number, height: number, blaze = 1) {
  const unit = Math.min(width, height);
  const out: string[] = [];
  const ink = Math.max(2, unit * .005);
  // The bigger the moment, the taller the flames and the more of them.
  const tall = 1 + (blaze - 1) * .18, banks = 3 + (blaze - 1), climbs = 2 + (blaze > 1 ? 1 : 0);
  let seed = 1;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? 0 : width;
    // The corner bank: wide, low flames along the bottom from the edge in.
    for (let i = 0; i < banks; i++) {
      const w = unit * (.24 - i * .04), h = unit * (.30 - i * .05) * tall;
      const x = edge - side * (w * .35 + i * w * .55);
      out.push(fire({ x, y: height + unit * .02 }, w, h, side * -.12, seed++, 40 + i * 50, ink));
    }
    // And up the side, smaller as they climb, leaning in towards him — the
    // lower half of it only, clear of the score bar and the keys.
    for (let i = 0; i < climbs; i++) {
      const w = unit * (.15 - i * .03), h = unit * (.22 - i * .05) * tall;
      const y = height - unit * (.30 + i * .19);
      out.push(fire({ x: edge - side * w * .15, y }, w, h, side * -.45, seed++, 120 + i * 60, ink));
    }
  }
  // Embers off the top of it all, drifting up.
  const random = seeded(55);
  for (let i = 0; i < 14 + (blaze - 1) * 10; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side < 0 ? random() * width * .22 : width - random() * width * .22;
    const y = height - unit * (.15 + random() * .5);
    out.push(`<circle class="cy-ember" cx="${f(x)}" cy="${f(y)}" r="${f(unit * (.004 + random() * .006))}" style="--delay:${Math.round(150 + random() * 700)}ms;--rise:${f(-unit * (.12 + random() * .12))}px"/>`);
  }
  return `<g class="cy-edges">${out.join('')}</g>`;
}

/** The figure 100, written: a one with a flag, two noughts that overshoot. */
function hundred(x: number, y: number, h: number, random: () => number, delay: number, stroke: number) {
  const one = line([{ x: x + h * .05, y: y + h * .24 }, { x: x + h * .30, y }, { x: x + h * .26, y: y + h }]);
  const nought = (left: number) => loop(left + h * .30, y + h * .5, h * .27, h * .5, random, 1.08);
  return mark(one, stroke, delay, 110)
    + mark(nought(x + h * .42), stroke, delay + 90, 170)
    + mark(nought(x + h * 1.02), stroke, delay + 190, 170);
}

/**
 * Any number, written: each figure a stroke or two of the pen, a one with a
 * flag, noughts that overshoot, a four in two strokes. `widthOf` is how wide
 * it will come out, for placing it before it is drawn.
 */
const FIGURE_WIDTH = (ch: string) => (ch === '1' ? .36 : .64) + .04;
export const widthOf = (text: string, h: number) => h * ([...text].reduce((w, ch) => w + FIGURE_WIDTH(ch), 0) - .04);
/**
 * The strokes of one figure, as paths with how long each takes to draw:
 * a one with a flag, noughts, a four in two strokes. `turns` is how far
 * round a nought goes — a little over once, the way a pen overshoots, or
 * exactly once for the fat bubble figures, where an overshoot reads as a
 * lump. `widthOf` is how wide a number comes out, for placing it first.
 */
function figurePaths(ch: string, x: number, y: number, h: number, random: () => number, turns = 1.08): { d: string; draw: number; after?: number }[] {
  const p = (px: number, py: number) => `${f(x + px * h)} ${f(y + py * h)}`;
  const nought = turns > 1 ? [h * .27, h * .5] : [h * .25, h * .47];
  switch (ch) {
    case '0': return [{ d: loop(x + h * .30, y + h * .5, nought[0], nought[1], random, turns), draw: 170 }];
    case '1': return [{ d: line([{ x: x + h * .05, y: y + h * .24 }, { x: x + h * .30, y }, { x: x + h * .26, y: y + h }]), draw: 110 }];
    case '2': return [{ d: `M${p(.06, .26)}Q${p(.10, -.04)} ${p(.32, .00)}Q${p(.62, .02)} ${p(.54, .34)}Q${p(.46, .58)} ${p(.04, .96)}L${p(.60, .92)}`, draw: 190 }];
    case '3': return [{ d: `M${p(.06, .10)}Q${p(.56, -.12)} ${p(.52, .30)}Q${p(.48, .50)} ${p(.24, .50)}Q${p(.62, .52)} ${p(.56, .80)}Q${p(.50, 1.06)} ${p(.04, .90)}`, draw: 200 }];
    case '4': return [{ d: `M${p(.44, .00)}L${p(.04, .68)}L${p(.62, .66)}`, draw: 120 }, { d: `M${p(.46, .30)}L${p(.44, 1.00)}`, draw: 90, after: 100 }];
    case '5': return [{ d: `M${p(.52, 0)}L${p(.12, .02)}L${p(.08, .44)}Q${p(.62, .26)} ${p(.56, .70)}Q${p(.48, 1.04)} ${p(.04, .90)}`, draw: 170 }];
    case '6': return [{ d: `M${p(.54, .06)}Q${p(.10, .10)} ${p(.08, .60)}Q${p(.10, 1.00)} ${p(.34, .98)}Q${p(.60, .96)} ${p(.56, .68)}Q${p(.52, .44)} ${p(.10, .54)}`, draw: 200 }];
    case '7': return [{ d: `M${p(.06, .04)}L${p(.60, .00)}L${p(.24, 1.00)}`, draw: 130 }];
    case '8': return [{ d: `M${p(.50, .22)}Q${p(.50, -.04)} ${p(.30, .00)}Q${p(.06, .04)} ${p(.14, .26)}Q${p(.24, .48)} ${p(.42, .54)}Q${p(.64, .62)} ${p(.58, .84)}Q${p(.50, 1.04)} ${p(.26, 1.00)}Q${p(.04, .94)} ${p(.10, .72)}Q${p(.18, .52)} ${p(.42, .48)}`, draw: 230 }];
    case '9': return [{ d: `M${p(.54, .40)}Q${p(.52, .00)} ${p(.30, .02)}Q${p(.06, .04)} ${p(.08, .30)}Q${p(.10, .54)} ${p(.34, .52)}Q${p(.56, .50)} ${p(.54, .34)}Q${p(.56, .70)} ${p(.20, 1.00)}`, draw: 200 }];
    default: return [];
  }
}

/** The figure 50, written: a five in one stroke, flag first, and a nought. */
function fifty(x: number, y: number, h: number, random: () => number, delay: number, stroke: number) {
  const f5 = (px: number, py: number) => `${f(x + px * h)} ${f(y + py * h)}`;
  const five = `M${f5(.52, 0)}L${f5(.12, .02)}L${f5(.08, .44)}Q${f5(.62, .26)} ${f5(.56, .70)}Q${f5(.48, 1.04)} ${f5(.04, .90)}`;
  return mark(five, stroke, delay, 170)
    + mark(loop(x + h * .92, y + h * .5, h * .27, h * .5, random, 1.08), stroke, delay + 150, 170);
}

/** The crown, sat on the helmet at an angle: `size` is one for the hundred's. */
function crown(x: number, headY: number, s: number, pen: number, size = 1, delay = 120) {
  const cw = s * .46 * size, ch = s * .3 * size, cx = x - cw / 2, cy = headY - s * .16;
  return mark(line([
    { x: cx, y: cy }, { x: cx - cw * .06, y: cy - ch }, { x: cx + cw * .28, y: cy - ch * .45 },
    { x: cx + cw * .5, y: cy - ch * 1.15 }, { x: cx + cw * .72, y: cy - ch * .45 },
    { x: cx + cw * 1.06, y: cy - ch }, { x: cx + cw, y: cy }, { x: cx - cw * .04, y: cy + ch * .08 },
  ]), pen * 1.1 * Math.sqrt(size), delay, 260);
}



/** The burst behind him: strokes out from the chest, up and to the sides. */
function burst(x: number, y: number, s: number, random: () => number, pen: number, count = 9, spread = .9) {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = -Math.PI * ((1 - spread) / 2 + spread * i / (count - 1)) + (random() - .5) * .12;
    const inner = s * (.95 + random() * .2), outer = s * (1.45 + random() * .45);
    const from = { x: x + Math.cos(a) * inner, y: y + Math.sin(a) * inner * 1.2 };
    const to = { x: x + Math.cos(a) * outer, y: y + Math.sin(a) * outer * 1.2 };
    out.push(mark(jag(from, to, random, 3, s * .06), pen * .8, 60 + i * 28, 120, false));
  }
  return out;
}

/** Stars popping round him at `spots`: offsets and sizes in metres at the batter. */
function stars(x: number, y: number, s: number, random: () => number, pen: number, spots: [number, number, number][], from = 260) {
  return spots.map(([dx, dy, r], i) => {
    const c = { x: x + dx * s, y: y + dy * s };
    return `<g class="cy-pop" style="--delay:${from + i * 70}ms;transform-origin:${f(c.x)}px ${f(c.y)}px">${
      mark(star(c, r * s, random), pen * .7, 0, 1, false)}</g>`;
  });
}

/**
 * Words that land rather than get written: `lines` of display type, slammed
 * in from big at `delay`, each an ink outline over a coloured shadow.
 */
function slam(x: number, y: number, size: number, tilt: number, delay: number, words: string, kind: string, shadow = size * .07) {
  const text = (dx: number, dy: number, cls: string) =>
    `<text class="${cls}" x="${f(x + dx)}" y="${f(y + dy)}" font-size="${f(size)}">${words}</text>`;
  return `<g transform="rotate(${tilt} ${f(x)} ${f(y)})"><g class="cy-slam ${kind}" style="--delay:${delay}ms">`
    + text(shadow, shadow, 'cy-type-shadow') + text(0, 0, 'cy-type') + '</g></g>';
}

/**
 * YUVI, as a wall tag rather than as a word: a fat orange halo round it, a
 * deep block of ink behind it for depth, a gradient of blue down the letters in a heavy outline, a thin
 * cream rim catching the light on each, a marker swoosh drawn under it, and
 * a couple of sparkles. Leaning and tilted, slammed in from big.
 */
function tagged(x: number, y: number, size: number, tilt: number, delay: number, pen: number) {
  const text = (cls: string, dx = 0, dy = 0) =>
    `<text class="${cls}" x="${f(x + dx)}" y="${f(y + dy)}" font-size="${f(size)}">YUVI</text>`;
  const depth = Array.from({ length: 7 }, (_, i) => text('cy-yuvi-depth', (i + 1) * size * .012, (i + 1) * size * .014)).join('');
  const w = size * 1.12;
  const swoosh = `M${f(x - w)} ${f(y + size * .2)}Q${f(x - w * .2)} ${f(y + size * .36)} ${f(x + w * 1.05)} ${f(y + size * .08)}`;
  const sparkle = (px: number, py: number, r: number) =>
    `M${f(px)} ${f(py - r)}L${f(px)} ${f(py + r)}M${f(px - r)} ${f(py)}L${f(px + r)} ${f(py)}`;
  return `<g transform="rotate(${tilt} ${f(x)} ${f(y)})">`
    + mark(swoosh, Math.max(4, size * .07), delay + 180, 220)
    + `<g class="cy-slam is-yuvi" style="--delay:${delay}ms"><g transform="skewX(-8) translate(${f(y * .1405)} 0)">`
    + text('cy-yuvi-halo') + depth + text('cy-yuvi') + text('cy-yuvi-shine', -size * .012, -size * .014) + '</g></g>'
    + mark(sparkle(x + w * .95, y - size * .78, size * .09) + sparkle(x - w * .9, y - size * .55, size * .06), Math.max(2, pen * .6), delay + 260, 90, false)
    + '</g>';
}

/**
 * What a moment puts up: `marks` over the picture, and for the Test innings'
 * marks `back`, a layer under him, with the patterns each needs in `defs` and
 * `backDefs`, and the `cutout` that draws him back over it.
 */
type Layout = { marks: string[]; back?: string[]; defs?: string; backDefs?: string; cutout?: Cutout; dots: number; fire: boolean; said: string; blaze?: number };

/** A hundred: crown, energy, burst, stars and the 100 on fire. */
function century(at: BatterOnScreen, s: number, pen: number, random: () => number): Layout {
  const x = at.head.x;
  const marks = burst(x, at.head.y + s * .5, s, random, pen);
  // Energy up both sides of him, from the knees to above the raised bat.
  for (const side of [-1, 1]) {
    const from = { x: x + side * s * .42, y: at.feet.y - s * .35 };
    const to = { x: x + side * s * .52, y: at.bat.y + s * .1 };
    marks.push(mark(jag(from, to, random, 7, s * .09), pen, 40 + (side + 1) * 40, 260));
  }
  // The crown, sat on the helmet at an angle.
  marks.push(crown(x, at.head.y, s, pen));

  // The 100: beside him where there is room, above him where there is not.
  const h = Math.min(s * .95, at.width * .2, 130);
  const wide = h * 1.62;
  const roomRight = at.width - (x + s * .9) - 16;
  // Beside him only with room to spare: the flames stand off the top of it and
  // the tilt swings its corners out, and squeezed against the edge it reads as
  // cut off. On a phone held upright that sends it up into the empty sky.
  const aside = roomRight >= wide + h * .35;
  const tx = aside ? x + s * .9 : Math.max(16, Math.min(at.width - wide - 16, x - wide / 2));
  const ty = aside ? at.head.y - h * .35 : Math.max(96, at.bat.y - h * 1.75);
  const text = h * .3;
  marks.push(`<g class="cy-hundred" transform="rotate(-8 ${f(tx + wide / 2)} ${f(ty + h / 2)})">`
    + `<circle class="cy-dots" cx="${f(tx + wide * .55)}" cy="${f(ty + h * .55)}" r="${f(h * .95)}"/>`
    // A hundred on fire: flames off the top of both noughts, behind them.
    + fire({ x: tx + h * .72, y: ty + h * .12 }, h * .5, h * .62, .1, 91, 330, Math.max(1.5, h * .025))
    + fire({ x: tx + h * 1.32, y: ty + h * .1 }, h * .44, h * .74, .15, 92, 380, Math.max(1.5, h * .025))
    + hundred(tx, ty, h, random, 150, Math.max(6, h * .16))
    + `<text class="cy-word" x="${f(tx + wide / 2)}" y="${f(ty + h + text * 1.25)}" font-size="${f(text)}">CENTURY</text>`
    + '</g>');
  marks.push(...stars(x, at.head.y, s, random, pen, [[-1.05, -.25, .16], [1.1, .35, .12], [-.8, .75, .1], [.35, -1.05, .11], [-1.3, .35, .08]]));
  return { marks, dots: h, fire: true, said: 'A hundred.' };
}

/**
 * A fifty: the mild one. No fire, no crown, the ground left in its colours —
 * a 50 written beside him, the word under it, a small burst and three stars,
 * and gone again before he is back in his guard.
 */
function halfCentury(at: BatterOnScreen, s: number, pen: number, random: () => number): Layout {
  const x = at.head.x;
  const marks = burst(x, at.head.y + s * .45, s * .8, random, pen * .8, 5, .6);
  const h = Math.min(s * .62, at.width * .14, 84);
  const wide = h * 1.25;
  const roomRight = at.width - (x + s * .8) - 16;
  const aside = roomRight >= wide + h * .35;
  const tx = aside ? x + s * .8 : Math.max(16, Math.min(at.width - wide - 16, x - wide / 2));
  const ty = aside ? at.head.y - h * .2 : Math.max(96, at.bat.y - h * 1.7);
  const text = h * .32;
  marks.push(`<g transform="rotate(-6 ${f(tx + wide / 2)} ${f(ty + h / 2)})">`
    + `<circle class="cy-dots" cx="${f(tx + wide * .55)}" cy="${f(ty + h * .55)}" r="${f(h * .85)}"/>`
    + fifty(tx, ty, h, random, 90, Math.max(5, h * .16))
    + `<text class="cy-word" x="${f(tx + wide / 2)}" y="${f(ty + h + text * 1.25)}" font-size="${f(text)}" style="animation-delay:.3s">FIFTY</text>`
    + '</g>');
  marks.push(...stars(x, at.head.y, s, random, pen, [[-.95, -.3, .12], [.75, -.75, .1], [-1.15, .45, .08]], 200));
  return { marks, dots: h, fire: false, said: 'Fifty.' };
}

/**
 * Six sixes in a row, for Yuvraj Singh. The wild one: SIX 6s slammed across
 * the top with the six of them ticked off under it, YUVI tagged big beside
 * him, and under it a question with an arrow at the man who just did it — is
 * that you?
 */
function yuvi(at: BatterOnScreen, s: number, pen: number, random: () => number): Layout {
  const x = at.head.x, W = at.width;
  // A wide burst, but not a dense one: it sits behind four lots of words.
  const marks = burst(x, at.head.y + s * .5, s * 1.2, random, pen, 8, .96);

  // SIX 6s, across the top, clear of the score bar.
  const size = Math.min(W * .15, at.height * .13, 116);
  const top = 92 + size * .9;
  marks.push(`<circle class="cy-dots" cx="${f(W / 2)}" cy="${f(top - size * .35)}" r="${f(size * 1.25)}"/>`);
  marks.push(slam(W / 2, top, size, -5, 60, 'SIX 6s', 'is-head'));
  // The six of them, ticked off one after another under it.
  const r = size * .16, gap = r * 2.7;
  for (let i = 0; i < 6; i++) {
    const c = { x: W / 2 + (i - 2.5) * gap, y: top + size * .42 };
    marks.push(`<g class="cy-pop" style="--delay:${200 + i * 85}ms;transform-origin:${f(c.x)}px ${f(c.y)}px">`
      + `<circle class="cy-ball" cx="${f(c.x)}" cy="${f(c.y)}" r="${f(r)}" stroke-width="${f(Math.max(1.5, r * .18))}"/>`
      + `<text class="cy-ball-six" x="${f(c.x)}" y="${f(c.y + r * .42)}" font-size="${f(r * 1.25)}">6</text></g>`);
  }

  // YUVI, once, big: beside him on whichever side has the room, and where
  // neither does — a phone held upright — on the pitch below his feet. The
  // question goes under it, with an arrow from it to the man.
  const tag = Math.min(size * 1.3, s * 1.0, W * .24, 150), tagWide = tag * 2.3;
  const roomLeft = x - s * .8 - 16, roomRight = W - x - s * .8 - 16;
  const side = roomRight >= tagWide ? 1 : roomLeft >= tagWide ? -1 : 0;
  const spot = side
    ? { x: x + side * (s * .8 + tagWide / 2), y: at.head.y + s * .2 }
    : { x: Math.min(W - 16 - tagWide / 2, Math.max(16 + tagWide / 2, x + s * .15)), y: Math.min(at.height - tag * 1.3, at.feet.y + s * .45 + tag) };
  marks.push(tagged(spot.x, spot.y, tag, side < 0 ? 7 : -7, 300, pen));

  // is that you? — under YUVI, and an arrow from it to him.
  const ask = Math.max(18, tag * .3);
  const askAt = { x: spot.x, y: spot.y + tag * .62 + ask };
  marks.push(`<g class="cy-slam is-ask" style="--delay:620ms"><text class="cy-ask" x="${f(askAt.x)}" y="${f(askAt.y)}" font-size="${f(ask)}" `
    + `transform="skewX(-10) translate(${f(askAt.y * .176)} 0)">is that you?</text></g>`);
  // Beside him, from the end of the question nearest him round to his chest;
  // below him, from just over YUVI straight up at him, clear of both words.
  const askHalf = ask * 2.75;
  const from = side
    ? { x: askAt.x - side * (askHalf + ask * .35), y: askAt.y - ask * .35 }
    : { x: spot.x - tagWide * .3, y: spot.y - tag * .95 };
  const to = side ? { x: x + side * s * .32, y: at.head.y + s * .45 } : { x: x - s * .05, y: at.feet.y - s * .2 };
  const bend = side
    ? { x: (from.x + to.x) / 2, y: Math.max(from.y, to.y) + s * .25 }
    : { x: from.x - s * .15, y: (from.y + to.y) / 2 };
  const head = { x: to.x - bend.x, y: to.y - bend.y };
  const len = Math.hypot(head.x, head.y) || 1, ux = head.x / len, uy = head.y / len, barb = s * .13;
  marks.push(mark(`M${f(from.x)} ${f(from.y)}Q${f(bend.x)} ${f(bend.y)} ${f(to.x)} ${f(to.y)}`
    + `M${f(to.x - ux * barb - uy * barb * .6)} ${f(to.y - uy * barb + ux * barb * .6)}L${f(to.x)} ${f(to.y)}`
    + `L${f(to.x - ux * barb + uy * barb * .6)} ${f(to.y - uy * barb - ux * barb * .6)}`, pen * .9, 700, 180, false));

  marks.push(...stars(x, at.head.y, s, random, pen,
    [[-1.25, -.4, .14], [1.2, -.7, .13], [-.95, .95, .1], [1.05, .85, .1], [.1, -1.25, .09], [-1.5, .3, .08]], 300));
  return { marks, dots: size, fire: true, said: 'Six sixes. Yuvi, is that you?' };
}

/**
 * The Test innings' marks after the hundred, each with a look of its own
 * rather than the hundred's fire made bigger: what goes up says which day it
 * is, and none of them piles more round him than the one before.
 *
 * They are the same pen — the black outline, the poppy colour, the boil — with
 * two things the hundred does not have. Some of it goes up *behind* him: a
 * layer under the picture of him, which GameScene draws him (and his stumps,
 * which stand in front of him) back over. And he can be cut out with an
 * outline, a marker line or three hugging him, drawn from his silhouette by
 * GameScene too: see `Cutout`.
 *
 * Figures here are fat bubble figures: the same hand as the marker figures,
 * drawn as a thick stroke with a stacked 3D side, an ink line round it,
 * halftone or hatching for shade, and a highlight.
 *
 * Everything is placed in metres at the batter, `s` pixels to the metre, off
 * where he stands on screen; the full-screen poster's sheet is the screen's.
 */

/**
 * The cut-out the moment wants, if any: outline rings round him, biggest
 * first, in CSS pixels, each optionally offset; and whether the stumps in
 * front of him are drawn back over the doodle's back layer with him.
 */
export interface Cutout { rings: { r: number; colour: string; dx?: number; dy?: number }[]; stumps: boolean }

const INK = '#120b08';
/** A plain stroke: no ink line, no shine. */
const st = (d: string, width: number, colour: string, dx = 0, dy = 0, extra = '') =>
  `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${f(width)}" stroke-linecap="round" stroke-linejoin="round"${dx || dy ? ` transform="translate(${f(dx)} ${f(dy)})"` : ''}${extra ? ` ${extra}` : ''}/>`;
/** A filled shape in the ink outline. */
const shape = (d: string, fill: string, width = 3, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${f(width)}" stroke-linejoin="round" stroke-linecap="round"${extra ? ` ${extra}` : ''}/>`;
const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
/** A four-pointed sparkle, pinched in at the waist. */
function sparkle(x: number, y: number, r: number, fill: string, width = 2) {
  const k = .24;
  return shape(`M${f(x)} ${f(y - r)}Q${f(x + r * k)} ${f(y - r * k)} ${f(x + r)} ${f(y)}Q${f(x + r * k)} ${f(y + r * k)} ${f(x)} ${f(y + r)}`
    + `Q${f(x - r * k)} ${f(y + r * k)} ${f(x - r)} ${f(y)}Q${f(x - r * k)} ${f(y - r * k)} ${f(x)} ${f(y - r)}Z`, fill, width);
}
const halftone = (id: string, colour: string, size = 5, r = 1.3) =>
  `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${colour}"/></pattern>`;
const hatching = (id: string, colour: string, gap = 5, width = 1.6, angle = 40) =>
  `<pattern id="${id}" width="${gap}" height="${gap}" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><path d="M0 0V${gap}" stroke="${colour}" stroke-width="${width}"/></pattern>`;

/**
 * A number with body. The hand-drawn figures as a fat stroke `w` wide, with a
 * side stacked down and to the right `depth` pixels deep, an ink line round
 * the lot, `shade` (a pattern's id) inside the lower edge, a highlight up the
 * top edge, and — for a sticker — a die-cut white border and a drop shadow.
 */
function bubble(text: string, x: number, y: number, h: number, o: { face: string; side: string; shade?: string; border?: number; seed?: number; w?: number }) {
  const w = o.w ?? h * .21, ink = Math.min(4.2, Math.max(2.6, h * .03)), depth = Math.round(Math.min(12, Math.max(5, h * .08)));
  const random = seeded(o.seed ?? 3);
  const paths: string[] = []; let dx = 0;
  for (const ch of text) { paths.push(...figurePaths(ch, x + dx, y, h, random, 1).map(p => p.d)); dx += h * FIGURE_WIDTH(ch); }
  const steps = Array.from({ length: depth }, (_, i) => depth - i);
  const at = (i: number): [number, number] => [i * .55, i];
  const all = (width: number, colour: string, offset: [number, number] = [0, 0], extra = '') => paths.map(d => st(d, width, colour, ...offset, extra)).join('');
  let out = '';
  if (o.border) {
    const width = w + 2 * ink + 2 * o.border;
    out += all(width, 'rgba(0,0,0,.28)', [5 + depth * .55, 8 + depth]);
    for (const i of [depth, ...steps.filter(k => k % 2 === 0), 0]) out += all(width, '#fff', at(i));
  }
  for (const i of [...steps, 0]) out += all(w + 2 * ink, INK, at(i));
  for (const i of steps) out += all(w, o.side, at(i));
  out += all(w + ink * .9, INK) + all(w, o.face);
  if (o.shade) out += all(w * .45, `url(#${o.shade})`, [w * .2, w * .22], 'opacity=".55"');
  return out + all(Math.max(2, w * .16), '#fff', [-w * .18, -w * .2], 'opacity=".9"');
}

/**
 * **150, 250, 350 — the sticker.** A die-cut sticker of the number slapped on
 * beside him, and the ball — a little red one with googly eyes — popping up
 * behind it to grip the edge and wink. The next stick of colour each time;
 * the ground keeps its own.
 */
const STICKERS = [
  { face: '#b6f03c', side: '#3c9a1e', accent: '#ff4f9a' },
  { face: '#42d6ff', side: '#1f6fd1', accent: '#ffe14a' },
  { face: '#ff9a2b', side: '#7a3fd6', accent: '#ffe14a' },
] as const;
function googly(cx: number, cy: number, r: number, delay: number) {
  const seam = `M${f(cx - r * .98)} ${f(cy + r * .1)}Q${f(cx)} ${f(cy + r * .45)} ${f(cx + r * .98)} ${f(cy + r * .1)}`;
  let stitches = '';
  for (let i = 1; i < 8; i++) {
    const t = i / 8, x = cx - r * .98 + t * r * 1.96, y = cy + r * .1 + Math.sin(t * Math.PI) * r * .34;
    stitches += `M${f(x - r * .08)} ${f(y - r * .16)}L${f(x + r * .08)} ${f(y + r * .16)}`;
  }
  return `<g class="cy-peek" style="--delay:${delay}ms">`
    + shape(circle(cx, cy, r), '#e8283c', Math.max(2.4, r * .13))
    + `<path d="M${f(cx + r * .2)} ${f(cy + r * .95)}A${f(r)} ${f(r)} 0 0 0 ${f(cx + r * .98)} ${f(cy + r * .1)}Q${f(cx + r * .5)} ${f(cy + r * .7)} ${f(cx + r * .2)} ${f(cy + r * .95)}Z" fill="#a8122a"/>`
    + st(seam, r * .14, '#fff3dc') + st(stitches, r * .07, '#fff3dc')
    + `<ellipse cx="${f(cx - r * .45)}" cy="${f(cy - r * .55)}" rx="${f(r * .22)}" ry="${f(r * .12)}" fill="#fff" opacity=".8" transform="rotate(-30 ${f(cx - r * .45)} ${f(cy - r * .55)})"/>`
    // One eye open and on him, the other winking.
    + shape(`M${f(cx - r * .62)} ${f(cy - r * .22)}a${f(r * .24)} ${f(r * .3)} 0 1 0 ${f(r * .48)} 0a${f(r * .24)} ${f(r * .3)} 0 1 0 ${f(-r * .48)} 0Z`, '#fff', r * .1)
    + `<circle cx="${f(cx - r * .45)}" cy="${f(cy - r * .2)}" r="${f(r * .13)}" fill="${INK}"/>`
    + st(`M${f(cx + r * .12)} ${f(cy - r * .2)}Q${f(cx + r * .36)} ${f(cy - r * .42)} ${f(cx + r * .6)} ${f(cy - r * .2)}`, r * .13, INK)
    + '</g>';
}
function stickered(at: BatterOnScreen, s: number, _pen: number, _random: () => number, runs: number): Layout {
  const colours = STICKERS[((Math.round((runs - 150) / 100) % 3) + 3) % 3];
  const h = Math.min(s * .7, at.width * .17, 92), text = String(runs), wide = widthOf(text, h);
  const x = at.head.x;
  const aside = at.width - (x + s * .6) - 16 >= wide + h * .35;
  const tx = aside ? x + s * .6 : Math.max(16, Math.min(at.width - wide - 16, x - wide / 2));
  const ty = aside ? at.head.y - s * .45 : Math.max(110, at.bat.y - h * 1.9);
  const cx = tx + wide / 2, cy = ty + h / 2, k = h / 66;
  const bx = tx + wide - 20 * k, by = ty - 26 * k, r = 24 * k;
  const mitt = (mx: number, my: number) => shape(`M${f(mx - 7 * k)} ${f(my + 4 * k)}Q${f(mx - 8 * k)} ${f(my - 6 * k)} ${f(mx)} ${f(my - 6 * k)}Q${f(mx + 8 * k)} ${f(my - 6 * k)} ${f(mx + 7 * k)} ${f(my + 4 * k)}Z`, '#fff', 2.4)
    + st(`M${f(mx - 2.5 * k)} ${f(my - 5 * k)}L${f(mx - 2.5 * k)} ${f(my + k)}M${f(mx + 2.5 * k)} ${f(my - 5 * k)}L${f(mx + 2.5 * k)} ${f(my + k)}`, 1.4, INK);
  const ticks = [[-16, -14, -30, -26], [-20, 8, -36, 10], [wide / k + 18, 76, wide / k + 32, 88], [wide / k + 24, 52, wide / k + 40, 50]]
    .map(([a, b, c, d]) => st(`M${f(tx + a * k)} ${f(ty + b * k)}L${f(tx + c * k)} ${f(ty + d * k)}`, 3.5 * Math.sqrt(k), INK)).join('');
  const shade = 'cy-sticker-shade';
  const marks = [`<g transform="rotate(-8 ${f(cx)} ${f(cy)})">`
    + googly(bx, by, r, 380)
    + `<g class="cy-slap" style="--delay:80ms">${bubble(text, tx, ty, h, { face: colours.face, side: colours.side, border: 6 * k, shade, seed: runs })}</g>`
    + `<g class="cy-peek" style="--delay:380ms">${mitt(bx - 15 * k, ty - 9 * k)}${mitt(bx + 16 * k, ty - 8 * k)}</g>`
    + `<g class="cy-wipe" style="--delay:260ms">${ticks}</g>`
    + `<g class="cy-pop" style="--delay:520ms;transform-origin:${f(tx - 22 * k)}px ${f(ty + h + 14 * k)}px">${sparkle(tx - 22 * k, ty + h + 14 * k, 9 * k, colours.accent)}</g>`
    + `<g class="cy-pop" style="--delay:600ms;transform-origin:${f(tx + wide + 26 * k)}px ${f(ty - 26 * k)}px">${sparkle(tx + wide + 26 * k, ty - 26 * k, 7 * k, colours.accent)}</g>`
    + '</g>'];
  return { marks, defs: halftone(shade, colours.side, 4.5, 1.2), dots: h, fire: false, said: `${runs}.` };
}

/**
 * **200 — the neon burst.** The retro trading card: a spiky starburst in four
 * neon colours goes off behind him while he flexes, confetti dots round it,
 * a pink and a cyan outline set off either side of him, retro stripes up
 * both edges of the screen, and the number in yellow bubble figures.
 */
const NEON = ['#ff3fa4', '#ff7a2b', '#ffe24a', '#2de2ff'] as const;
function burstCard(at: BatterOnScreen, s: number, _pen: number, random: () => number, runs: number): Layout {
  const W = at.width, H = at.height, k = s / 94;
  const c = { x: at.head.x, y: at.head.y + s * .62 };
  let rays = '';
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2 + (random() - .5) * .2, length = s * (1.28 + random() * 1.17), half = .07 + random() * .04;
    const p = (r: number, da: number) => `${f(c.x + Math.cos(a + da) * r)} ${f(c.y + Math.sin(a + da) * r * 1.12)}`;
    const inner = s * .43;
    rays += shape(`M${p(inner, -half)}L${p(length * .62, -half * .4)}L${p(length * .55, half * .6)}L${p(length, 0)}L${p(length * .5, half * 1.2)}L${p(length * .58, half * .1)}L${p(inner, half)}Z`, NEON[i % 4], 2.4);
  }
  let confetti = '';
  for (let i = 0; i < 34; i++) {
    const a = random() * Math.PI * 2, r = s * (1.4 + random() * 1.25);
    const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r * 1.2;
    if (y < 92 || y > H - 40) continue;
    confetti += random() < .25 ? sparkle(x, y, 5 * k, NEON[i % 4], 1.6) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f((2 + random() * 2.5) * k)}" fill="${NEON[i % 4]}"/>`;
  }
  const stripes = (x: number, side: number) => NEON.map((colour, i) =>
    `<rect x="${f(x + side * i * 5 - (side < 0 ? 4 : 0))}" y="${f(110 + i * 26)}" width="4" height="${f(Math.max(0, H - 204 - i * 52))}" fill="${colour}" stroke="${INK}" stroke-width="1"/>`).join('');
  const h = Math.min(s * .75, W * .2, 110), text = String(runs), wide = widthOf(text, h);
  const nx = Math.min(W - wide / 2 - 22, at.head.x + s * 1.5), ny = Math.max(100, at.head.y - s * 2.6);
  const number = `<g transform="rotate(-7 ${f(nx)} ${f(ny + h / 2)})"><g class="cy-slap" style="--delay:360ms">`
    + bubble(text, nx - wide / 2, ny, h, { face: '#ffe24a', side: '#ff3fa4', shade: 'cy-neon-shade', seed: 5 }) + '</g></g>';
  return {
    back: [`<g class="cy-pop" style="--delay:80ms;transform-origin:${f(c.x)}px ${f(c.y)}px">${rays}</g>`, `<g class="cy-wipe" style="--delay:300ms">${confetti}</g>`],
    marks: [`<g class="cy-wipe" style="--delay:150ms">${stripes(10, 1)}${stripes(W - 10, -1)}</g>`, number],
    defs: halftone('cy-neon-shade', '#d6286f', 4.5, 1.2),
    cutout: { rings: [{ r: 5 * k, colour: '#ff3fa4', dx: -4 * k, dy: -2 * k }, { r: 5 * k, colour: '#2de2ff', dx: 4 * k, dy: 3 * k }], stumps: true },
    dots: h, fire: false, said: runs === 200 ? 'A double hundred.' : `${runs}.`,
  };
}

/**
 * **300 — wings.** Heaven-sent: cel-shaded wings snap open from behind his
 * back over his outstretched arms and keep a slow beat, a wonky gold halo
 * over him, a sky-blue outline cutting him out, the number in white bubble
 * figures with a sky-blue side, and a couple of feathers drifting down.
 */
function feather(bx: number, by: number, length: number, width: number, angle: number, fill: string, shade: string) {
  const a = angle * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const P = (along: number, across: number) => `${f(bx + ux * along + nx * across)} ${f(by + uy * along + ny * across)}`;
  const d = `M${P(0, -width * .5)}Q${P(length * .55, -width * .62)} ${P(length * .92, -width * .28)}Q${P(length * 1.04, 0)} ${P(length * .92, width * .3)}Q${P(length * .55, width * .62)} ${P(0, width * .5)}Z`;
  const dark = `M${P(length * .2, width * .2)}Q${P(length * .6, width * .5)} ${P(length * .92, width * .3)}Q${P(length * .7, width * .1)} ${P(length * .2, width * .2)}Z`;
  return shape(d, fill, 2.6) + `<path d="${dark}" fill="${shade}"/>` + st(`M${P(length * .1, 0)}L${P(length * .72, 0)}`, 1.3, INK, 0, 0, 'opacity=".45"');
}
function wing(side: number, root: Point, k: number) {
  const tip = { x: root.x + side * 150 * k, y: root.y - 128 * k }, ctrl = { x: root.x + side * 70 * k, y: root.y - 150 * k };
  const along = (t: number) => ({ x: (1 - t) ** 2 * root.x + 2 * (1 - t) * t * ctrl.x + t * t * tip.x, y: (1 - t) ** 2 * root.y + 2 * (1 - t) * t * ctrl.y + t * t * tip.y });
  // Three rows of feathers off the arm of the wing, the longest at the back.
  const rows = [
    { n: 7, length: [70, 112], width: 24, fill: '#d8efff', shade: '#7cc4f5', from: .18, to: 1 },
    { n: 7, length: [46, 64], width: 22, fill: '#ffffff', shade: '#bfe3fb', from: .08, to: .9 },
    { n: 8, length: [24, 34], width: 18, fill: '#ffffff', shade: '#d8efff', from: .02, to: .82 },
  ];
  let out = '';
  for (const row of rows) for (let i = row.n - 1; i >= 0; i--) {
    const t = row.from + (row.to - row.from) * i / (row.n - 1), p = along(t);
    out += feather(p.x, p.y, (row.length[0] + (row.length[1] - row.length[0]) * t) * k, row.width * k, side > 0 ? 100 - t * 62 : 80 + t * 62, row.fill, row.shade);
  }
  const edge = `M${f(root.x)} ${f(root.y)}Q${f(ctrl.x)} ${f(ctrl.y)} ${f(tip.x)} ${f(tip.y)}`;
  out += st(edge, 13 * k, INK) + st(edge, 8 * k, '#ffffff') + st(edge, 2.4 * k, '#bfe3fb', 0, 2.5 * k);
  const hand = side < 0 ? 'is-left' : 'is-right';
  return `<g class="cy-spread ${hand}" style="--delay:120ms;--fold:${side * 40}deg"><g class="cy-flap ${hand}" style="--beat:${side * -5}deg">${out}</g></g>`;
}
function winged(at: BatterOnScreen, s: number, _pen: number, _random: () => number, runs: number): Layout {
  const k = s / 94, hx = at.head.x, hy = at.head.y;
  const back = [wing(-1, { x: hx - s * .09, y: hy + s * .43 }, k) + wing(1, { x: hx + s * .13, y: hy + s * .43 }, k)];
  const halo = { x: hx + s * .02, y: hy - s * .3 }, rx = 28 * k, ry = 8.5 * k;
  const ring = `M${f(halo.x - rx)} ${f(halo.y)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0Z`;
  const haloMark = `<g class="cy-pop" style="--delay:420ms;transform-origin:${f(halo.x)}px ${f(halo.y)}px"><g transform="rotate(-8 ${f(halo.x)} ${f(halo.y)})">`
    + st(ring, 11 * k, INK) + st(ring, 6 * k, '#ffc928')
    + st(`M${f(halo.x - rx * .86)} ${f(halo.y + ry * .2)}Q${f(halo.x)} ${f(halo.y + ry * 1.5)} ${f(halo.x + rx * .86)} ${f(halo.y + ry * .2)}`, 3 * k, '#e08a00')
    + st(`M${f(halo.x - rx * .68)} ${f(halo.y - ry * .6)}Q${f(halo.x - rx * .2)} ${f(halo.y - ry * 1.2)} ${f(halo.x + rx * .35)} ${f(halo.y - ry * .95)}`, 2 * k, '#fff6c8') + '</g></g>';
  const h = Math.min(s * .92, at.width * .24, 120), text = String(runs), wide = widthOf(text, h);
  const nx = Math.max(16 + wide / 2, Math.min(at.width - 16 - wide / 2, hx + s * .2)), ny = Math.max(100, hy - s * 2.38);
  const number = `<g transform="rotate(-6 ${f(nx)} ${f(ny + h / 2)})"><g class="cy-slap" style="--delay:200ms">`
    + bubble(text, nx - wide / 2, ny, h, { face: '#ffffff', side: '#3fa9f5', shade: 'cy-wing-shade', seed: 2 }) + '</g></g>';
  const feathers = [[-1.06, 1.98, 70, 0], [1.74, 2.4, 110, 500]].map(([dx, dy, angle, delay]) =>
    `<g class="cy-drift" style="--delay:${delay}ms">${feather(hx + dx * s, hy + dy * s, 40 * k, 18 * k, angle, '#ffffff', '#bfe3fb')}</g>`).join('');
  const twinkles = [[-wide * .55, -.05, 10], [wide * .6, -.2, 13], [wide * .45, 1.05, 7], [-wide * .5, 1.1, 7]].map(([dx, dy, r], i) => {
    const x = nx + dx, y = ny + dy * h;
    return `<g class="cy-pop" style="--delay:${600 + i * 100}ms;transform-origin:${f(x)}px ${f(y)}px"><g class="cy-twinkle" style="--delay:${i * 100}ms">${sparkle(x, y, r * k, '#ffc928')}</g></g>`;
  }).join('');
  return {
    back, marks: [haloMark, number, feathers, twinkles], defs: halftone('cy-wing-shade', '#2f8fd6', 4.5, 1.2),
    cutout: { rings: [{ r: 7.5 * k, colour: INK }, { r: 6 * k, colour: '#3fa9f5' }, { r: 2.5 * k, colour: '#ffffff' }], stumps: true },
    dots: h, fire: false, said: runs === 300 ? 'A triple hundred.' : `${runs}.`,
  };
}

/**
 * **400 — the poster.** The whole picture behind him goes to a navy
 * starfield, the one for the wall. He stands on a drawn podium, so he is
 * grounded rather than floating in it; the giant red 400 with its cyan side
 * and hatching fills the middle behind his body; two spotlights come down
 * from the top corners onto him; the ribbon round the podium says whose club
 * he has joined; bolts and planets in the corners; and a clean yellow and
 * navy outline cuts him out against it.
 */
function bolt(x: number, y: number, k: number, rot: number, delay: number) {
  const corners = [[0, 0], [44, 0], [26, 38], [52, 38], [6, 104], [18, 54], [-6, 54]];
  const path = (dx: number, dy: number) => 'M' + corners.map(([px, py]) => `${f(x + dx + px * k)} ${f(y + dy + py * k)}`).join('L') + 'Z';
  return `<g class="cy-pop" style="--delay:${delay}ms;transform-origin:${f(x + 20 * k)}px ${f(y + 50 * k)}px"><g transform="rotate(${rot} ${f(x)} ${f(y)})">`
    + shape(path(-7 * k, -5 * k), '#35c8ff', 2.6) + shape(path(-3.5 * k, -2.5 * k), '#ffffff', 2)
    + shape(path(0, 0), '#e8283c', 3) + `<path d="${path(0, 0)}" fill="url(#cy-poster-hatch)" opacity=".9"/></g></g>`;
}
function planet(cx: number, cy: number, r: number, body: string, band: string, rot: number) {
  return `<g transform="rotate(${rot} ${f(cx)} ${f(cy)})">` + shape(circle(cx, cy, r), body, 2.4)
    + `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r * 1.75)}" ry="${f(r * .42)}" fill="none" stroke="${INK}" stroke-width="5"/>`
    + `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r * 1.75)}" ry="${f(r * .42)}" fill="none" stroke="${band}" stroke-width="2.6"/></g>`;
}
function postered(at: BatterOnScreen, s: number, _pen: number, random: () => number, runs: number): Layout {
  const W = at.width, H = at.height, k = s / 94, fx = at.feet.x, fy = at.feet.y;
  let stars = '';
  for (let i = 0; i < Math.round(W * H / 6000); i++) {
    const x = random() * W, y = 86 + random() * (H - 110);
    stars += random() < .22 ? sparkle(x, y, 3 + random() * 4, '#fff6c8', 1.4) : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(.8 + random() * 1.6)}" fill="#e9f4ff" opacity="${f(.45 + random() * .5)}"/>`;
  }
  const night = `<rect width="${f(W)}" height="${f(H)}" fill="#1b1f4a"/><rect width="${f(W)}" height="${f(H)}" fill="url(#cy-poster-grain)" opacity=".35"/>${stars}`
    + planet(52, Math.min(H - 60, fy + s * 2.13), 15 * k, '#ffd23f', '#ff6aa8', -18) + planet(W - 46, Math.min(H - 110, fy + s * 1.57), 9 * k, '#ff6aa8', '#35c8ff', 14);
  // Spotlights from the top corners onto him.
  const low = fy + s * .62;
  const beam = (x0: number, x1: number, x2: number, x3: number) => {
    const d = `M${f(x0)} 70L${f(x1)} 70L${f(x3)} ${f(low)}L${f(x2)} ${f(low)}Z`;
    return `<path d="${d}" fill="#fff3b0" opacity=".14"/><path d="${d}" fill="url(#cy-poster-beam)" opacity=".35"/>`;
  };
  const lamp = (x: number) => shape(`M${f(x - 25)} 64L${f(x + 25)} 64L${f(x + 31)} 92L${f(x - 31)} 92Z`, '#3a3f6e', 3) + `<rect x="${f(x - 23)}" y="86" width="46" height="6" fill="#fff3b0"/>`;
  const lights = `<g class="cy-wipe" style="--delay:120ms">${beam(-30, 40, fx - s * .69, fx + s * .17)}${beam(W - 40, W + 30, fx - s * .11, fx + s * .76)}${lamp(19)}${lamp(W - 19)}</g>`;
  const h = Math.min(s * 2.08, W * .5, 300), text = String(runs), wide = widthOf(text, h);
  const nx = Math.max(wide * .4, Math.min(W - wide * .4, fx + s * .37)), ny = at.head.y - s * 1.1;
  const number = `<g transform="rotate(-7 ${f(nx)} ${f(ny + h / 2)})"><g class="cy-slap" style="--delay:380ms">`
    + bubble(text, nx - wide / 2, ny, h, { face: '#e8283c', side: '#35c8ff', shade: 'cy-poster-hatch2', seed: 4, w: h * .2 }) + '</g></g>';
  // The podium: its top just behind his feet, its front carrying the ribbon,
  // and short enough to stand on the screen where he is low on a wide one.
  const top = fy - s * .06, lip = fy + s * .28, foot = Math.max(lip + s * .7, Math.min(fy + s * 1.47, H - 34)), l = fx - s * 1.03, r = fx + s * 1.08;
  const podium = `<g class="cy-rise" style="--delay:200ms">`
    + `<ellipse cx="${f((l + r) / 2)}" cy="${f(foot + 6 * k)}" rx="${f((r - l) / 2 + 30 * k)}" ry="${f(12 * k)}" fill="rgba(0,0,0,.35)"/>`
    + shape(`M${f(l + 22 * k)} ${f(top)}L${f(r - 22 * k)} ${f(top)}L${f(r)} ${f(lip)}L${f(l)} ${f(lip)}Z`, '#5ad8ff', 3.4)
    + shape(`M${f(l)} ${f(lip)}L${f(r)} ${f(lip)}L${f(r)} ${f(foot)}L${f(l)} ${f(foot)}Z`, '#2aa3d9', 3.4)
    + `<path d="M${f(l)} ${f(lip)}L${f(r)} ${f(lip)}L${f(r)} ${f(foot)}L${f(l)} ${f(foot)}Z" fill="url(#cy-poster-hatch3)" opacity=".5"/>`
    + st(`M${f(l + 30 * k)} ${f(top + 6 * k)}L${f(r - 30 * k)} ${f(top + 6 * k)}`, 2, '#e8fbff', 0, 0, 'opacity=".8"') + '</g>';
  const ry = lip + (foot - lip) * .48, r0 = l - 6 * k, r1 = r + 6 * k, mid = (r0 + r1) / 2, q = k;
  const ribbon = `<g class="cy-pop" style="--delay:760ms;transform-origin:${f(mid)}px ${f(ry)}px"><g transform="rotate(-4 ${f(mid)} ${f(ry)})">`
    + shape(`M${f(r0 - 30 * q)} ${f(ry - 4 * q)}L${f(r0 + 8 * q)} ${f(ry - 8 * q)}L${f(r0 + 8 * q)} ${f(ry + 26 * q)}L${f(r0 - 30 * q)} ${f(ry + 30 * q)}L${f(r0 - 16 * q)} ${f(ry + 11 * q)}Z`, '#d9a400', 3)
    + shape(`M${f(r1 + 30 * q)} ${f(ry - 4 * q)}L${f(r1 - 8 * q)} ${f(ry - 8 * q)}L${f(r1 - 8 * q)} ${f(ry + 26 * q)}L${f(r1 + 30 * q)} ${f(ry + 30 * q)}L${f(r1 + 16 * q)} ${f(ry + 11 * q)}Z`, '#d9a400', 3)
    + shape(`M${f(r0)} ${f(ry - 16 * q)}Q${f(mid)} ${f(ry - 26 * q)} ${f(r1)} ${f(ry - 16 * q)}L${f(r1)} ${f(ry + 18 * q)}Q${f(mid)} ${f(ry + 8 * q)} ${f(r0)} ${f(ry + 18 * q)}Z`, '#ffd23f', 3.2)
    + `<path d="M${f(r0)} ${f(ry + 10 * q)}Q${f(mid)} ${f(ry)} ${f(r1)} ${f(ry + 10 * q)}L${f(r1)} ${f(ry + 18 * q)}Q${f(mid)} ${f(ry + 8 * q)} ${f(r0)} ${f(ry + 18 * q)}Z" fill="#e8b400"/>`
    // Brian Lara's 400 not out is the Test record: four hundred joins him, and past it he is beyond him.
    + `<text class="cy-ribbon" x="${f(mid)}" y="${f(ry + 10 * q)}" font-size="${f(27 * q)}">${runs === 400 ? 'LARA’S CLUB' : 'PAST LARA'}</text>`
    + '</g></g>';
  const back = [`<g class="cy-wipe" style="--delay:0ms">${night}</g>`, lights, number, podium, ribbon,
    bolt(nx - wide * .46 - 20 * k, ny - s * .8, .85 * k, -12, 620) + bolt(nx + wide * .34, ny - s * .6, .9 * k, 14, 680) + bolt(W - 60 * k, Math.min(H - 80, fy + s * 2.13), .55 * k, 20, 740)];
  return {
    back, marks: [],
    backDefs: hatching('cy-poster-hatch', '#7d0d1f', 5, 1.6) + hatching('cy-poster-hatch2', '#8a0f22', 6, 2.2, 35) + halftone('cy-poster-grain', '#2f3a7a', 4, 1)
      + halftone('cy-poster-beam', '#fff3b0', 6, 1.3) + hatching('cy-poster-hatch3', '#156a99', 6, 2, 45),
    cutout: { rings: [{ r: 10 * k, colour: INK }, { r: 8.5 * k, colour: '#1b1f4a' }, { r: 4.5 * k, colour: '#ffd23f' }], stumps: false },
    dots: h, fire: false, said: runs === 400 ? 'Four hundred.' : `${runs}.`,
  };
}

const LAYOUTS: Record<Milestone, (at: BatterOnScreen, s: number, pen: number, random: () => number, mark: number) => Layout> = {
  century, fifty: halfCentury, 'six-sixes': yuvi, raise: stickered, double: burstCard, triple: winged, four: postered,
};

/** The doodle for one moment: what goes over the picture, what goes under him, and how he is cut out. */
export interface Doodle { element: HTMLElement; back?: HTMLElement; cutout?: Cutout }

/**
 * The picture for one moment, laid out round him. `s` is a metre at the
 * batter, in pixels, so every mark is sized to him rather than to the screen.
 * `lasts` is how long it is up; it wipes over the last quarter second of it.
 */
export function milestoneDoodle(moment: Moment, at: BatterOnScreen, lasts: number): Doodle {
  const { kind, mark } = moment;
  const random = seeded(kind === 'six-sixes' ? 66 : mark);
  const s = Math.max(40, (at.feet.y - at.head.y) / 1.78);
  const pen = Math.max(3, s * .045);
  const layout = LAYOUTS[kind](at, s, pen, random, mark);
  const { marks, dots, fire: burning, said, blaze = 1 } = layout;
  const box = `viewBox="0 0 ${f(at.width)} ${f(at.height)}" width="${f(at.width)}" height="${f(at.height)}" aria-hidden="true"`;
  const svg = `<svg class="cy-svg" ${box}>`
    + `<defs><pattern id="cy-dot" width="${f(dots * .09)}" height="${f(dots * .09)}" patternUnits="userSpaceOnUse">`
    + `<circle cx="${f(dots * .045)}" cy="${f(dots * .045)}" r="${f(dots * .018)}" fill="var(--cy-paint)"/></pattern>`
    + '<linearGradient id="cy-yuvi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fe0ff"/>'
    + `<stop offset=".45" stop-color="#3fa0ff"/><stop offset="1" stop-color="#1d4fd8"/></linearGradient>${layout.defs ?? ''}</defs>`
    + (burning ? edges(at.width, at.height, blaze) : '')
    + `<g class="cy-boil">${marks.join('')}</g></svg>`;
  const element = document.createElement('div');
  element.className = `milestone is-${kind}`;
  element.style.setProperty('--out', `${lasts - 300}ms`);
  element.setAttribute('role', 'status');
  element.innerHTML = `<span class="milestone-said">${said}</span>${svg}`;
  if (!layout.back) return { element };
  const back = document.createElement('div');
  back.className = `milestone milestone-under is-${kind}`;
  back.style.setProperty('--out', `${lasts - 300}ms`);
  back.innerHTML = `<svg class="cy-svg" ${box}><defs>${layout.backDefs ?? ''}</defs><g class="cy-boil">${layout.back.join('')}</g></svg>`;
  return { element, back, cutout: layout.cutout };
}

/**
 * A special stroke played on a full meter — the charge, the slog sweep, a
 * scoop — gets a look of its own rather than the moments' fire, and the marks
 * move.
 *
 * Focus lines, the way a comic pulls the eye to one figure: two waves of
 * strokes run out from round him and off the edges of the screen, each a
 * short length of line travelling along its path — trim paths — so what the
 * eye follows back is him. On the ground either side of his boots, a burst
 * that blows outwards and flickers, inked round, with shock-arcs sliding away
 * along the turf, specks of dirt thrown out and a few sparks thrown up.
 *
 * The burst comes in five styles, each with its own pen, and the focus lines,
 * arcs and sparks are drawn in that pen too: see `POWER_STYLES`. Everything
 * but the burst is the same drawing in every style.
 *
 * Wordless, because the ball is still in the air and the call for it is still
 * to come: this is the shot, not the score.
 */

/**
 * The five bursts. Comic teeth is the one the flash was made with; flame is
 * the fire the ball burns with, on the ground; lightning strikes, a crack
 * running off along the turf; the dust puff is the cloud a cartoon runner
 * leaves behind; the starburst is a comic POW squashed flat on the grass.
 */
export const POWER_STYLES = ['teeth', 'flame', 'bolt', 'puff', 'star'] as const;
export type PowerStyle = typeof POWER_STYLES[number];

/**
 * Each style's pen: `a` the bright inner band, `b` the body, `ink` what both
 * are outlined in. The ground is grey while the flash is up, so every pair is
 * saturated and every ink dark: a pastel would sink into it.
 */
const POWER: Record<PowerStyle, { a: string; b: string; ink: string }> = {
  teeth: { a: '#43ffb1', b: '#9c78ff', ink: '#170d33' },
  flame: { a: '#ffd53a', b: '#ff6a1f', ink: '#2a0906' },
  bolt: { a: '#eafcff', b: '#22cbff', ink: '#06123a' },
  puff: { a: '#ffe53b', b: '#ff3d9a', ink: '#14061a' },
  star: { a: '#ff9f1c', b: '#2f5bff', ink: '#070b2e' },
};

/** A burst's shape, the same call for every style: see `groundBurst`. */
type BurstShape = (base: Point, w: number, h: number, side: number, seed: number, band?: number) => string;

/**
 * A comic burst on the ground, the way a hit is drawn in a cartoon: low and
 * wide, sat on the turf beside his boot, its top a row of jagged teeth blown
 * outwards from `side` (-1 left, 1 right) — mostly small, two of them tall —
 * and a long spike skidding along the ground at the far end. `w` and `h` are
 * its width and the height its teeth are measured in.
 *
 * `band` draws the same teeth lower, for the band inside it: the random
 * draws are the same for both, so the teeth line up the way a cel-shaded
 * flame's colours do.
 */
function groundBurst(base: Point, w: number, h: number, side: number, seed: number, band = 1) {
  const random = seeded(seed);
  const at = (x: number, y: number): Point => ({ x: base.x + side * x * w, y: base.y - y * h });
  const points: Point[] = [at(.02, 0)];
  // Seven teeth, spaced unevenly, peaking a third of the way out and running
  // down to the far end; every tip raked hard outwards, the far ones nearly
  // flat, as though the burst were blown along the ground.
  const spots = [.07, .19, .31, .45, .58, .71, .84];
  spots.forEach((spot, i) => {
    const x = spot + (random() - .5) * .04;
    const hump = .34 * Math.exp(-(((x - .3) / .34) ** 2)) + .05;
    const tall = i === 2 ? .9 : i === 4 ? .55 : .12 + random() * .2;
    const reach = tall * (1 - x * .45);
    const lean = .1 + x * .26 + random() * .04;
    points.push(at(x - .04, hump * band * .55));
    points.push(at(x + lean * band, (hump + reach) * band));
  });
  // The long one along the ground, and back under.
  points.push(at(.92, .1 * band));
  points.push(at(1.1 + .1 * band, .2 * band));
  points.push(at(1, .07 * band));
  points.push(at(1.28 + .12 * band, .05 * band));
  points.push(at(.9, 0));
  const under = at(.45, -.1);
  return `${line(points)}Q${f(under.x)} ${f(under.y)} ${f(points[0].x)} ${f(points[0].y)}Z`;
}

/**
 * Flame on the ground: seven tongues, each an S drawn up from the turf to a
 * tip curled outwards, tallest near his boot and dying away along the grass.
 * `band` draws the inner colour lower and leaning less, off the same draws, so
 * the bands line up the way the fire up the screen's edges does.
 */
function flameBurst(base: Point, w: number, h: number, side: number, seed: number, band = 1) {
  const random = seeded(seed);
  const at = (x: number, y: number): Point => ({ x: base.x + side * x * w, y: base.y - y * h });
  const p = (point: Point) => `${f(point.x)} ${f(point.y)}`;
  const tongues = [[.02, .16, .7], [.16, .15, 1.25], [.3, .15, .9], [.44, .14, 1.05], [.57, .13, .6], [.69, .12, .42], [.8, .12, .26]];
  const hump = (x: number) => .12 * Math.exp(-(((x - .25) / .4) ** 2)) + .02;
  let d = `M${p(at(0, 0))}`;
  for (const [x, wide, tall] of tongues) {
    const x0 = x + (random() - .5) * .02;
    const t = tall * (.85 + random() * .3) * band * (1 - x0 * .35);
    const lean = (.12 + x0 * .28 + random() * .05) * (.7 + band * .3);
    const v = hump(x0) * band, next = hump(x0 + wide) * band;
    d += `C${p(at(x0 - .03, v + t * .35))} ${p(at(x0 + lean * .1 - .02, v + t * .8))} ${p(at(x0 + lean, v + t))}`;
    d += `C${p(at(x0 + lean * .75, v + t * .5))} ${p(at(x0 + wide - .03, next + t * .22))} ${p(at(x0 + wide, next))}`;
  }
  d += `L${p(at(.95, .03 * band))}Q${p(at(1.12, .1 * band))} ${p(at(1.2 + .1 * band, .02))}L${p(at(.9, 0))}`;
  return `${d}Q${p(at(.45, -.1))} ${p(at(0, 0))}Z`;
}

/**
 * Lightning out of the ground: three forked bolts fanned outwards from beside
 * his boot, each a zig-zag that thins to a point, and a crack skidding off
 * along the turf. `band` is the white-hot core, the same bolts drawn thinner.
 */
function boltBurst(base: Point, w: number, h: number, side: number, seed: number, band = 1) {
  const random = seeded(seed);
  const at = (x: number, y: number): Point => ({ x: base.x + side * x * w, y: base.y - y * h });
  const shapes: string[] = [];
  const bolt = (from: Point, angle: number, length: number, thick: number, kinks: number, fork: number) => {
    const ax = Math.cos(angle), ay = Math.sin(angle);
    const points = [from];
    for (let i = 1; i <= kinks; i++) {
      const k = i / kinks;
      const jitter = (i % 2 ? 1 : -1) * (.25 + random() * .35) * length / kinks;
      points.push({ x: from.x + side * (ax * length * k - ay * jitter), y: from.y - ay * length * k - ax * jitter * .6 });
    }
    // Outlined either side of its spine, thinning to nothing at the tip.
    const left: Point[] = [], right: Point[] = [];
    points.forEach((point, i) => {
      const ahead = points[Math.min(i + 1, points.length - 1)], behind = points[Math.max(i - 1, 0)];
      const dx = ahead.x - behind.x, dy = ahead.y - behind.y, length = Math.hypot(dx, dy) || 1;
      const half = thick * band * (1 - i / (points.length - 1)) ** .8 + (i === points.length - 1 ? 0 : .6);
      left.push({ x: point.x - dy / length * half, y: point.y + dx / length * half });
      right.push({ x: point.x + dy / length * half, y: point.y - dx / length * half });
    });
    shapes.push(`${line([...left, ...right.reverse()])}Z`);
    if (fork) bolt(points[Math.floor(points.length / 2)], angle + fork, length * .42, thick * .55, 3, 0);
  };
  const thick = h * .18;
  bolt(at(.05, 0), 1.25, h * 1.9, thick, 6, -.7);
  bolt(at(.18, 0), .72, h * 1.6, thick * .85, 6, .6);
  bolt(at(.3, 0), .3, w * .9, thick * .7, 5, .55);
  const crack = [at(.1, .02)];
  for (let i = 1; i <= 6; i++) crack.push(at(.1 + i * .19, (i % 2 ? .1 : -.02) * (.6 + random() * .6)));
  const over = crack.map(point => ({ x: point.x, y: point.y - h * .065 * band }));
  const under = crack.map((point, i) => ({ x: point.x, y: point.y + (i === crack.length - 1 ? 0 : h * .045 * band) })).reverse();
  shapes.push(`${line([...over, ...under])}Z`);
  return shapes.join('');
}

/**
 * A dust cloud on the ground, the one a cartoon runner leaves behind: a mound
 * tallest a third of the way out, its top a run of scallops. `band` is the
 * smaller cloud inside it, set a little further out.
 */
function puffBurst(base: Point, w: number, h: number, side: number, seed: number, band = 1) {
  const random = seeded(seed);
  const at = (x: number, y: number): Point => ({ x: base.x + side * x * w, y: base.y - y * h });
  const sweep = side > 0 ? 1 : 0;
  const tops: Point[] = [];
  for (let i = 0; i <= 9; i++) {
    const x = -.05 + i / 9 * 1.1;
    const y = (.25 + 1.05 * Math.exp(-(((x - .35) / .36) ** 2))) * (.88 + random() * .24);
    tops.push(at(band === 1 ? x : x * .86 + .06, y * band));
  }
  const start = at(-.05, 0), end = at(1.08, 0);
  let d = `M${f(start.x)} ${f(start.y)}L${f(tops[0].x)} ${f(tops[0].y)}`;
  for (let i = 1; i < tops.length; i++) {
    const r = Math.hypot(tops[i].x - tops[i - 1].x, tops[i].y - tops[i - 1].y) * (.55 + random() * .12);
    d += `A${f(r)} ${f(r)} 0 0 ${sweep} ${f(tops[i].x)} ${f(tops[i].y)}`;
  }
  const r = Math.abs(end.x - tops[tops.length - 1].x) * .7 + 4;
  return `${d}A${f(r)} ${f(r)} 0 0 ${sweep} ${f(end.x)} ${f(end.y)}Z`;
}

/**
 * A comic POW star, squashed flat onto the turf beside his boot, its spikes
 * longest on the side facing away from him. `band` is the star inside it.
 */
function starBurst(base: Point, w: number, h: number, side: number, seed: number, band = 1) {
  const random = seeded(seed);
  const c = { x: base.x + side * w * .42, y: base.y - h * .42 };
  const points: Point[] = [];
  for (let i = 0; i < 22; i++) {
    const a = Math.PI + i / 22 * Math.PI * 2 + (random() - .5) * .12;
    const outward = .75 + .45 * Math.max(0, Math.cos(a) * side);
    const r = i % 2 ? .42 + random() * .08 : (.8 + random() * .35) * outward;
    points.push({ x: c.x + Math.cos(a) * w * .55 * r * band, y: c.y + Math.sin(a) * h * .95 * r * band });
  }
  return `${line(points)}Z`;
}

/** Each style's burst, and how deep its inner band sits. */
const BURSTS: Record<PowerStyle, { shape: BurstShape; band: number }> = {
  teeth: { shape: groundBurst, band: .44 },
  flame: { shape: flameBurst, band: .44 },
  bolt: { shape: boltBurst, band: .45 },
  puff: { shape: puffBurst, band: .62 },
  star: { shape: starBurst, band: .6 },
};

/** A crescent: the swoosh drawn under a burst, thick in the middle, pointed at both ends. */
function crescent(c: Point, w: number, side: number, bulge: number) {
  const p = (x: number, y: number) => `${f(c.x + side * x)} ${f(c.y + y)}`;
  return `M${p(-w, -w * .12)}Q${p(0, w * bulge)} ${p(w, -w * .2)}Q${p(0, w * bulge * .45)} ${p(-w, -w * .12)}Z`;
}

/**
 * The focus lines: a dozen strokes of marker, in two unhurried waves, each
 * starting on an oval that clears him and running out past the edge of the
 * screen. A length of each travels out along it and is gone — a trim path —
 * inked like every other mark in this pen: a dark stroke under the colour, a
 * hand's bend in it, and the whole lot shivering the way drawn lines do. Not
 * straight down, where the burst on the ground is doing the talking.
 *
 * Drawn off `random`, which the caller goes on drawing from: the same stream,
 * in the same order, is what keeps a flash the same every time.
 */
function focusLines(at: BatterOnScreen, c: Point, s: number, random: () => number) {
  const rays: string[] = [];
  for (const [count, from, spread] of [[8, 0, 180], [5, 320, 140]] as const) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + ((i + (from ? .5 : 0)) / count) * Math.PI * 2 + (random() - .5) * .3;
      if (Math.sin(a) > .75) continue;
      const start = { x: c.x + Math.cos(a) * s * (.75 + random() * .15), y: c.y + Math.sin(a) * s * (1.2 + random() * .2) };
      // To just past the edge of the screen, so the whole of its run is seen.
      const dx = Math.cos(a), dy = Math.sin(a);
      const reach = Math.min(
        dx > 0 ? (at.width - start.x) / dx : dx < 0 ? -start.x / dx : Infinity,
        dy > 0 ? (at.height - start.y) / dy : dy < 0 ? -start.y / dy : Infinity,
      ) + s * .6;
      const end = { x: start.x + dx * reach, y: start.y + dy * reach };
      // A bend a third of the way along, to one side or the other.
      const bend = (random() - .5) * s * .7;
      const mid = { x: start.x + dx * reach * .35 - dy * bend, y: start.y + dy * reach * .35 + dx * bend };
      const d = `M${f(start.x)} ${f(start.y)}Q${f(mid.x)} ${f(mid.y)} ${f(end.x)} ${f(end.y)}`;
      const len = (.22 + random() * .14).toFixed(3);
      const width = Math.max(2.5, s * (.045 + random() * .03));
      const tone = i % 2 ? 'is-b' : 'is-a';
      const timing = `style="--delay:${Math.round(from + random() * spread)}ms;--dur:${Math.round(760 + random() * 200)}ms"`;
      const dash = `pathLength="1" stroke-dasharray="${len} 2" stroke-dashoffset="${len}"`;
      rays.push(`<g class="pw-stroke" ${timing}>`
        + `<path class="pw-ray-ink" d="${d}" ${dash} stroke-width="${f(width + 3)}" transform="translate(1.5 2)"/>`
        + `<path class="pw-ray ${tone}" d="${d}" ${dash} stroke-width="${f(width)}"/></g>`);
    }
  }
  return `<g class="cy-boil">${rays.join('')}</g>`;
}

/**
 * How long the flash's doodle is up: a little longer than the grey, so the
 * second wave of lines can run out after the colour has started to come back.
 */
export const POWER_DOODLE_MS = 1400;

export function powerDoodle(at: BatterOnScreen, lasts: number, style: PowerStyle = 'teeth') {
  const random = seeded(77);
  const s = Math.max(40, (at.feet.y - at.head.y) / 1.78);
  const c = { x: at.head.x, y: at.head.y + (at.feet.y - at.head.y) * .48 };
  const out: string[] = [];

  out.push(focusLines(at, c, s, random));

  // The bursts either side of his boots: an ink outline, the body and a
  // brighter band inside it, each two hands flicked between. The dust puff
  // has halftone dots over its band, the way a comic prints a cloud.
  const w = s * .95, h = s * .55;
  const { shape: drawn, band } = BURSTS[style];
  const defs = style === 'puff'
    ? `<defs><pattern id="pw-halftone" width="${f(s * .08)}" height="${f(s * .08)}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">`
      + `<circle class="pw-dot" cx="${f(s * .04)}" cy="${f(s * .04)}" r="${f(s * .019)}"/></pattern></defs>`
    : '';
  // Lightning strikes with a white flash over the whole picture, gone in a blink.
  if (style === 'bolt') out.unshift(`<rect class="pw-strike" width="${f(at.width)}" height="${f(at.height)}"/>`);
  for (const side of [-1, 1]) {
    const base = { x: at.feet.x + side * s * .2, y: at.feet.y + s * .03 };
    const frames = [0, 1].map(k => {
      const seed = 900 + (side + 1) * 10 + k;
      const shape = (depth: number) => drawn(base, w, h, side, seed, depth);
      return `<g class="pw-frame"><path class="pw-burst-ink" d="${shape(1)}" stroke-width="${f(Math.max(3, s * .07))}"/>`
        + `<path class="pw-burst-b" d="${shape(1)}"/><path class="pw-burst-a" d="${shape(band)}"/>`
        + (style === 'puff' ? `<path class="pw-halftone" d="${shape(band)}"/>` : '') + '</g>';
    }).join('');
    const drift = style === 'puff' ? `;--drift:${f(side * s * .08)}px;--drift-out:${f(side * s * .3)}px` : '';
    out.push(`<g class="pw-burst is-${style}" style="transform-origin:${f(base.x)}px ${f(base.y)}px${drift}">${frames}</g>`);
    // Crescents under it, in ink and the body's colour, sliding away along the turf.
    for (const [k, dx, dy, cw, bulge] of [[0, .3, .14, .34, .75], [1, .85, .1, .18, .8], [2, .05, .26, .14, .8]] as const) {
      out.push(`<path class="pw-arc${k === 1 ? ' is-b' : ''}" d="${crescent({ x: base.x + side * w * dx, y: base.y + s * dy }, s * cw, side, bulge)}" `
        + `style="--dx:${f(side * s * .3)}px;--delay:${40 + k * 60}ms"/>`);
    }
  }

  // Dirt thrown out along the ground, and sparks thrown up.
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const x = at.feet.x + side * s * (.2 + random() * .9), y = at.feet.y - s * (random() * .5);
    const size = s * (.02 + random() * .03);
    // Thrown by the group, tilted by the shape: an animated transform on the
    // shape itself would replace its tilt.
    out.push(`<g class="pw-thrown" style="--dx:${f(side * s * (.4 + random() * .8))}px;--dy:${f(-s * (.1 + random() * .6))}px;--delay:${Math.round(random() * 140)}ms">`
      + `<rect class="pw-speck${i % 4 === 0 ? ' is-b' : ''}" x="${f(x)}" y="${f(y)}" width="${f(size)}" height="${f(size * .7)}" `
      + `transform="rotate(${Math.round(random() * 90)} ${f(x)} ${f(y)})"/></g>`);
  }
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1;
    const x = at.feet.x + side * s * (.5 + random() * .6), y = at.feet.y - s * (.3 + random() * .5);
    const len = s * (.14 + random() * .08), tilt = side * (30 + random() * 40);
    const d = `M${f(x)} ${f(y - len)}Q${f(x + len * .35)} ${f(y)} ${f(x)} ${f(y + len * .35)}Q${f(x - len * .35)} ${f(y)} ${f(x)} ${f(y - len)}Z`;
    out.push(`<g class="pw-thrown is-spark" style="--dx:${f(side * s * (.3 + random() * .5))}px;--dy:${f(-s * (.5 + random() * .6))}px;--delay:${Math.round(40 + random() * 200)}ms">`
      + `<path class="pw-spark" d="${d}" transform="rotate(${Math.round(tilt)} ${f(x)} ${f(y)})"/></g>`);
  }

  const svg = `<svg class="cy-svg" viewBox="0 0 ${f(at.width)} ${f(at.height)}" width="${f(at.width)}" height="${f(at.height)}" aria-hidden="true">`
    + defs + out.join('') + '</svg>';
  const element = document.createElement('div');
  element.className = 'milestone is-power';
  element.dataset.style = style;
  for (const [name, value] of Object.entries(POWER[style])) element.style.setProperty(`--pw-${name}`, value);
  element.style.setProperty('--out', `${lasts - 260}ms`);
  element.innerHTML = svg;
  return element;
}

/**
 * The pull's pens: the focus lines are drawn in `a` and `b` and inked in
 * `ink`, and the swoosh behind the bat runs from `swish.head` at the bat to
 * `swish.tail` behind it (see `GameScene.pull`). The ball's streak is red
 * whichever pen is up.
 *
 * White and blue is the one it plays with. Blue is as far from the ball's
 * red as a colour gets, so the bat's swoosh and the ball's streak read as two
 * things going two ways rather than one red smear; red is also already the
 * wicket's colour, and a pull for six is not a warning. Its swoosh runs blue
 * into white, the other way round from its lines, because a white head
 * vanished into the pale strip right where the eye was. The others stay to
 * be tried side by side, through `?pullpen=` (see Game's `pullPen`).
 */
export const PULL_PENS = {
  ice: { a: '#ffffff', b: '#2f8bff', ink: '#071433', swish: { head: '#2f8bff', tail: '#ffffff' } },
  gold: { a: '#ffd23f', b: '#12e0c4', ink: '#062a2a', swish: { head: '#ffd23f', tail: '#12e0c4' } },
  neon: { a: '#c6ff3d', b: '#ff2bd6', ink: '#1d0628', swish: { head: '#c6ff3d', tail: '#ff2bd6' } },
  red: { a: '#ffffff', b: '#ff2d3d', ink: '#1a0508', swish: { head: '#ffffff', tail: '#ff2d3d' } },
  royal: { a: '#ffb000', b: '#7a3cff', ink: '#14082e', swish: { head: '#ffb000', tail: '#7a3cff' } },
} as const;
export type PullPen = keyof typeof PULL_PENS;

/** How long a pulled bouncer's doodle is up: long enough for the second wave of lines. */
export const PULL_DOODLE_MS = 1300;

/**
 * A bouncer pulled and hit: an ordinary stroke, but the hardest one in the
 * game to land — only middled does it — so it gets a flash of its own. Only
 * the focus lines are drawn here: no burst on the ground, no grey, because it
 * is a great shot rather than a special one. The rest of it is in the ground's
 * renderer: a swoosh following the bat through its swing and a red streak
 * behind the ball (see `GameScene.pull`).
 */
export function pullDoodle(at: BatterOnScreen, lasts: number, pen: PullPen = 'ice') {
  const random = seeded(41);
  const s = Math.max(40, (at.feet.y - at.head.y) / 1.78);
  const c = { x: at.head.x, y: at.head.y + (at.feet.y - at.head.y) * .48 };
  const svg = `<svg class="cy-svg" viewBox="0 0 ${f(at.width)} ${f(at.height)}" width="${f(at.width)}" height="${f(at.height)}" aria-hidden="true">`
    + focusLines(at, c, s, random) + '</svg>';
  const element = document.createElement('div');
  element.className = 'milestone is-pull';
  element.dataset.pen = pen;
  const { a, b, ink } = PULL_PENS[pen];
  for (const [name, value] of Object.entries({ a, b, ink })) element.style.setProperty(`--pw-${name}`, value);
  element.style.setProperty('--out', `${lasts - 260}ms`);
  element.innerHTML = svg;
  return element;
}
