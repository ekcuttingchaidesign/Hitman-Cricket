/**
 * The doodles that go up for the moments an innings stops for: a fifty, a
 * hundred, and six sixes in a row.
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
 * Everything is placed off where the batter actually is on screen, so it
 * follows him from a phone held upright to a monitor. Everything is SVG
 * strokes and CSS: nothing here touches the ground's renderer, and none of it
 * outlives the moment it is up for.
 *
 * The marks are drawn with a seeded wobble, so they look inked rather than
 * plotted and look the same every time. The figures are drawn rather than set
 * in a face: a number somebody wrote reads as a moment where a number in a
 * font reads as a label. The words are set, in the cover's display face,
 * because they are shouted rather than written.
 */

import type { Milestone } from '../game/milestone';

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
function edges(width: number, height: number) {
  const unit = Math.min(width, height);
  const out: string[] = [];
  const ink = Math.max(2, unit * .005);
  let seed = 1;
  for (const side of [-1, 1]) {
    const edge = side < 0 ? 0 : width;
    // The corner bank: wide, low flames along the bottom from the edge in.
    for (let i = 0; i < 3; i++) {
      const w = unit * (.24 - i * .04), h = unit * (.30 - i * .05);
      const x = edge - side * (w * .35 + i * w * .55);
      out.push(fire({ x, y: height + unit * .02 }, w, h, side * -.12, seed++, 40 + i * 50, ink));
    }
    // And up the side, smaller as they climb, leaning in towards him — the
    // lower half of it only, clear of the score bar and the keys.
    for (let i = 0; i < 2; i++) {
      const w = unit * (.15 - i * .03), h = unit * (.22 - i * .05);
      const y = height - unit * (.30 + i * .19);
      out.push(fire({ x: edge - side * w * .15, y }, w, h, side * -.45, seed++, 120 + i * 60, ink));
    }
  }
  // Embers off the top of it all, drifting up.
  const random = seeded(55);
  for (let i = 0; i < 14; i++) {
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

/** The figure 50, written: a five in one stroke, flag first, and a nought. */
function fifty(x: number, y: number, h: number, random: () => number, delay: number, stroke: number) {
  const f5 = (px: number, py: number) => `${f(x + px * h)} ${f(y + py * h)}`;
  const five = `M${f5(.52, 0)}L${f5(.12, .02)}L${f5(.08, .44)}Q${f5(.62, .26)} ${f5(.56, .70)}Q${f5(.48, 1.04)} ${f5(.04, .90)}`;
  return mark(five, stroke, delay, 170)
    + mark(loop(x + h * .92, y + h * .5, h * .27, h * .5, random, 1.08), stroke, delay + 150, 170);
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

type Layout = { marks: string[]; dots: number; fire: boolean; said: string };

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
  const cw = s * .46, ch = s * .3, cx = x - cw / 2, cy = at.head.y - s * .16;
  marks.push(mark(line([
    { x: cx, y: cy }, { x: cx - cw * .06, y: cy - ch }, { x: cx + cw * .28, y: cy - ch * .45 },
    { x: cx + cw * .5, y: cy - ch * 1.15 }, { x: cx + cw * .72, y: cy - ch * .45 },
    { x: cx + cw * 1.06, y: cy - ch }, { x: cx + cw, y: cy }, { x: cx - cw * .04, y: cy + ch * .08 },
  ]), pen * 1.1, 120, 260));

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

const LAYOUTS: Record<Milestone, (at: BatterOnScreen, s: number, pen: number, random: () => number) => Layout> = {
  century, fifty: halfCentury, 'six-sixes': yuvi,
};

/**
 * The picture for one moment, laid out round him. `s` is a metre at the
 * batter, in pixels, so every mark is sized to him rather than to the screen.
 * `lasts` is how long it is up; it wipes over the last quarter second of it.
 */
export function milestoneDoodle(kind: Milestone, at: BatterOnScreen, lasts: number) {
  const random = seeded(kind === 'fifty' ? 50 : kind === 'century' ? 100 : 66);
  const s = Math.max(40, (at.feet.y - at.head.y) / 1.78);
  const pen = Math.max(3, s * .045);
  const { marks, dots, fire: burning, said } = LAYOUTS[kind](at, s, pen, random);
  const svg = `<svg class="cy-svg" viewBox="0 0 ${f(at.width)} ${f(at.height)}" width="${f(at.width)}" height="${f(at.height)}" aria-hidden="true">`
    + `<defs><pattern id="cy-dot" width="${f(dots * .09)}" height="${f(dots * .09)}" patternUnits="userSpaceOnUse">`
    + `<circle cx="${f(dots * .045)}" cy="${f(dots * .045)}" r="${f(dots * .018)}" fill="var(--cy-paint)"/></pattern>`
    + '<linearGradient id="cy-yuvi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fe0ff"/>'
    + '<stop offset=".45" stop-color="#3fa0ff"/><stop offset="1" stop-color="#1d4fd8"/></linearGradient></defs>'
    + (burning ? edges(at.width, at.height) : '')
    + `<g class="cy-boil">${marks.join('')}</g></svg>`;
  const element = document.createElement('div');
  element.className = `milestone is-${kind}`;
  element.style.setProperty('--out', `${lasts - 300}ms`);
  element.setAttribute('role', 'status');
  element.innerHTML = `<span class="milestone-said">${said}</span>${svg}`;
  return element;
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
 * How long the flash's doodle is up: a little longer than the grey, so the
 * second wave of lines can run out after the colour has started to come back.
 */
export const POWER_DOODLE_MS = 1400;

export function powerDoodle(at: BatterOnScreen, lasts: number, style: PowerStyle = 'teeth') {
  const random = seeded(77);
  const s = Math.max(40, (at.feet.y - at.head.y) / 1.78);
  const c = { x: at.head.x, y: at.head.y + (at.feet.y - at.head.y) * .48 };
  const out: string[] = [];

  // The focus lines: a dozen strokes of marker, in two unhurried waves, each
  // starting on an oval that clears him and running out past the edge of the
  // screen. A length of each travels out along it and is gone — a trim path —
  // inked like every other mark in this pen: a dark stroke under the colour,
  // a hand's bend in it, and the whole lot shivering the way drawn lines do.
  // Not straight down, where the burst on the ground is doing the talking.
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
  out.push(`<g class="cy-boil">${rays.join('')}</g>`);

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
