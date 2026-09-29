/**
 * The doodles that go up round a hundred.
 *
 * After the street-racing games that draw on their own screens: the moment is
 * marked in marker pen over the picture rather than in a panel in front of it.
 * A crown on the helmet, strokes of energy up both sides of him, a burst behind,
 * stars, and a big hand-drawn 100 with the word under it — drawn on stroke by
 * stroke, held with the slight shiver of a hand-drawn frame, and wiped. Fire
 * comes up the edges of the screen round all of it, cel-shaded flames that
 * flicker between two drawn frames the way drawn animation does, and sink
 * away again with the rest.
 *
 * Everything is placed off where the batter actually is on screen, so it
 * follows him from a phone held upright to a monitor. Everything is SVG
 * strokes and CSS: nothing here touches the ground's renderer, and none of it
 * outlives the second and a half it is up for.
 *
 * The marks are drawn with a seeded wobble, so they look inked rather than
 * plotted and look the same every time. The 100 is drawn rather than set in a
 * face: it is the only type on the screen, and a figure somebody wrote reads
 * as a moment where a figure in a font reads as a label.
 */

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

/**
 * The picture, laid out round him. `s` is a metre at the batter, in pixels, so
 * every mark is sized to him rather than to the screen.
 */
export function centuryDoodle(at: BatterOnScreen) {
  const random = seeded(100);
  const s = Math.max(40, (at.feet.y - at.head.y) / 1.78);
  const x = at.head.x;
  const pen = Math.max(3, s * .045);
  const marks: string[] = [];

  // The burst behind him: strokes out from the chest in every direction but
  // down into the turf, drawn one after another.
  const chest = { x, y: at.head.y + s * .5 };
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * (.05 + .9 * i / 8) + (random() - .5) * .12;
    const inner = s * (.95 + random() * .2), outer = s * (1.45 + random() * .45);
    const from = { x: chest.x + Math.cos(a) * inner, y: chest.y + Math.sin(a) * inner * 1.2 };
    const to = { x: chest.x + Math.cos(a) * outer, y: chest.y + Math.sin(a) * outer * 1.2 };
    marks.push(mark(jag(from, to, random, 3, s * .06), pen * .8, 60 + i * 28, 120, false));
  }
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

  // Stars and sparks round the lot.
  const spots: [number, number, number][] = [[-1.05, -.25, .16], [1.1, .35, .12], [-.8, .75, .1], [.35, -1.05, .11], [-1.3, .35, .08]];
  spots.forEach(([dx, dy, r], i) => {
    const c = { x: x + dx * s, y: at.head.y + dy * s };
    marks.push(`<g class="cy-pop" style="--delay:${260 + i * 70}ms;transform-origin:${f(c.x)}px ${f(c.y)}px">${
      mark(star(c, r * s, random), pen * .7, 0, 1, false)}</g>`);
  });

  const svg = `<svg class="cy-svg" viewBox="0 0 ${f(at.width)} ${f(at.height)}" width="${f(at.width)}" height="${f(at.height)}" aria-hidden="true">`
    + `<defs><pattern id="cy-dot" width="${f(h * .09)}" height="${f(h * .09)}" patternUnits="userSpaceOnUse">`
    + `<circle cx="${f(h * .045)}" cy="${f(h * .045)}" r="${f(h * .018)}" fill="var(--cy-paint)"/></pattern></defs>`
    + edges(at.width, at.height)
    + `<g class="cy-boil">${marks.join('')}</g></svg>`;
  const element = document.createElement('div');
  element.className = 'century';
  element.setAttribute('role', 'status');
  element.innerHTML = `<span class="century-said">A hundred.</span>${svg}`;
  return element;
}
