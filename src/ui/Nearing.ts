import type { Nearing, NearingEnd } from '../game/milestone';

/**
 * The wait, drawn: a small card under the score bar while he is close to a
 * fifty, a hundred, or six sixes, in the same marker pen as the doodles that
 * go up when he gets there — so the one reads as the promise of the other.
 *
 * For the runs, a dial drawn round the number he still needs, filling as he
 * closes, beside what he has made and a line that tightens with it: the
 * nervous nineties, then a six does it, then a four does it, then one run.
 * For the sixes, six balls in a row, the ones he has hit stamped with a 6 and
 * the rest dashed in, waiting.
 *
 * It runs hotter as the gap closes. The pen boils faster, tension marks crowd
 * round the dial, the ink turns from orange to red, and at the last it beats
 * like a pulse. A dot ball on 96 makes it flinch; a scoring shot winds the
 * dial on and slams the new number in. Getting there fills it and bursts it;
 * getting out, or the sixes stopping, scribbles it out and it goes.
 *
 * Built once when a wait begins and then changed in place, so the dial can be
 * seen to move rather than be redrawn somewhere new.
 */

interface Point { x: number; y: number }

/** Same marks, same wobble, every time. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const f = (n: number) => n.toFixed(1);

/** A loop round (cx, cy), a little rough, starting at twelve o'clock. */
function loop(cx: number, cy: number, r: number, random: () => number, turns = 1) {
  const steps = 22;
  const points: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + i / steps * Math.PI * 2 * turns;
    const wobble = 1 + (random() - .5) * .08;
    points.push({ x: cx + Math.cos(a) * r * wobble, y: cy + Math.sin(a) * r * wobble });
  }
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += `Q${f(points[i].x)} ${f(points[i].y)} ${f(mid.x)} ${f(mid.y)}`;
  }
  return `${d}L${f(points.at(-1)!.x)} ${f(points.at(-1)!.y)}`;
}

/** A box drawn round the card by hand: corners that overshoot, sides that bow. */
function frame(w: number, h: number, random: () => number) {
  const j = (n: number) => n + (random() - .5) * 1.8;
  const r = 9;
  return `M${f(j(r))} ${f(j(2))}L${f(j(w - r))} ${f(j(2))}Q${f(j(w - 2))} ${f(j(2))} ${f(j(w - 2))} ${f(j(r))}`
    + `L${f(j(w - 2))} ${f(j(h - r))}Q${f(j(w - 2))} ${f(j(h - 2))} ${f(j(w - r))} ${f(j(h - 2))}`
    + `L${f(j(r))} ${f(j(h - 2))}Q${f(j(2))} ${f(j(h - 2))} ${f(j(2))} ${f(j(h - r))}`
    + `L${f(j(2))} ${f(j(r))}Q${f(j(2))} ${f(j(2))} ${f(j(r + 6))} ${f(j(3))}`;
}

/** Two hands drawing the same box, flicked between: the boil. */
function frames(w: number, h: number, seed: number) {
  return [0, 1].map(k => {
    const d = frame(w, h, seeded(seed + k * 97));
    return `<g class="nr-frame"><path class="nr-ink" d="${d}" pathLength="1"/><path class="nr-pen" d="${d}" pathLength="1"/></g>`;
  }).join('');
}

/**
 * The scribble that crosses it out: back and forth across the card, from
 * `top` down, as fractions of its height — kept off a line of words above it
 * where they are saying what happened.
 */
function scribble(w: number, h: number, top = .26, step = .11) {
  const random = seeded(13);
  let d = `M${f(w * .06)} ${f(h * (top + .04))}`;
  for (let i = 0; i < 5; i++) {
    const right = i % 2 === 0;
    d += `L${f(right ? w * (.9 + random() * .06) : w * (.06 + random() * .06))} ${f(h * (top + i * step + random() * .06))}`;
  }
  return `<path class="nr-scratch" d="${d}" pathLength="1"/>`;
}

/**
 * Short strokes out from the dial, like the lines a cartoonist draws round a
 * head that is sweating. How many show is the heat's business, in the styles.
 */
function tension(cx: number, cy: number, r: number) {
  const random = seeded(7);
  return Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI * (.95 - i * .16) + (random() - .5) * .1;
    const inner = r + 3.5, outer = r + 8 + random() * 2.5;
    return `<path class="nr-tick" style="--i:${i}" d="M${f(cx + Math.cos(a) * inner)} ${f(cy + Math.sin(a) * inner)}L${f(cx + Math.cos(a) * outer)} ${f(cy + Math.sin(a) * outer)}"/>`;
  }).join('');
}

/**
 * Smaller than the score bar it hangs under, so it reads as a note on the
 * score rather than a second one: about two thirds of it on a phone.
 */
const RUNS = { w: 158, h: 48, dial: { x: 24, y: 24, r: 15 } };
const SIXES = { w: 156, h: 50, slot: { x: 17, y: 33, r: 8.5, gap: 24.5 } };

/** How hot the wait is running, one to three. */
export function heatOf(n: Nearing) {
  if (n.kind === 'six-sixes') return n.sixes - 2;
  return n.need <= 4 ? 3 : n.need <= 6 ? 2 : 1;
}

/** The line beside the number, which is what a commentator would be saying. */
export function nearingLine(n: Nearing) {
  if (n.kind === 'six-sixes') return n.sixes === 5 ? 'One more. Yuvi?' : `Six 6s? ${6 - n.sixes} more`;
  if (n.need === 1) return 'One run away';
  if (n.need <= 4) return 'A four does it';
  if (n.need <= 6) return 'A six does it';
  return n.kind === 'fifty' ? 'Fifty in sight' : n.kind === 'century' ? 'Nervous nineties'
    : n.kind === 'raise' ? `${n.mark} in sight` : `Nervous ${n.mark - 10}s`;
}

/** The mark, said: fifty, a hundred, a double hundred, or just the number. */
function markSaid(n: Exclude<Nearing, { kind: 'six-sixes' }>) {
  return n.kind === 'fifty' ? 'fifty' : n.kind === 'century' ? 'a hundred'
    : n.kind === 'double' ? 'a double hundred' : n.kind === 'triple' ? 'a triple hundred' : String(n.mark);
}

/** The whole of it as a sentence, for a screen reader. */
export function nearingSaid(n: Nearing) {
  if (n.kind === 'six-sixes') return `${n.sixes} sixes in a row. ${6 - n.sixes} more for six sixes.`;
  return `On ${n.runs}, ${n.need} short of ${markSaid(n)}.`;
}

/** What the card says as it goes. */
export function endLine(before: Nearing, end: NearingEnd) {
  if (end.how === 'reached') {
    return before.kind === 'six-sixes' ? 'Six 6s!' : before.kind === 'fifty' ? 'Fifty!' : before.kind === 'century' ? 'Hundred!'
      : before.kind === 'double' ? 'Double hundred!' : before.kind === 'triple' ? 'Triple hundred!' : `${before.mark}!`;
  }
  if (end.how === 'out') return `Out for ${end.runs}`;
  return 'Streak over';
}

/** How much of the dial is inked: a sliver at ten short, nearly all at one. */
export function dialFill(n: Nearing) {
  return n.kind === 'six-sixes' ? n.sixes / 6 : 1 - n.need / 11;
}

export function nearingMarkup(n: Nearing): string {
  if (n.kind === 'six-sixes') {
    const { w, h, slot } = SIXES;
    const random = seeded(66);
    const slots = Array.from({ length: 6 }, (_, i) => {
      const x = slot.x + i * slot.gap;
      return `<g class="nr-slot" data-slot="${i}" style="--at:${f(x)}px ${f(slot.y)}px">`
        + `<path class="nr-empty" d="${loop(x, slot.y, slot.r, random, 1.04)}"/>`
        + `<g class="nr-ball"><circle class="nr-ball-ink" cx="${f(x + 1.2)}" cy="${f(slot.y + 1.5)}" r="${slot.r}"/>`
        + `<circle class="nr-ball-body" cx="${f(x)}" cy="${f(slot.y)}" r="${slot.r}"/>`
        + `<path class="nr-ball-seam" d="M${f(x - slot.r * .55)} ${f(slot.y - slot.r * .72)}Q${f(x - slot.r * .15)} ${f(slot.y)} ${f(x - slot.r * .55)} ${f(slot.y + slot.r * .72)}"/>`
        + `<text class="nr-ball-six" x="${f(x + 1.2)}" y="${f(slot.y + 4.2)}">6</text></g></g>`;
    }).join('');
    return `<div class="nr-body"><svg class="nr-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
      + `<g class="nr-boil">${frames(w, h, 3)}</g>${slots}${scribble(w, h, .5, .085)}</svg>`
      + `<span class="nr-say nr-say-top" aria-hidden="true">${nearingLine(n)}</span></div><span class="nr-said">${nearingSaid(n)}</span>`;
  }
  const { w, h, dial } = RUNS;
  const random = seeded(n.mark);
  const ring = loop(dial.x, dial.y, dial.r, random);
  return `<div class="nr-body"><svg class="nr-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`
    + `<g class="nr-boil">${frames(w, h, n.mark >= 100 ? 5 : 9)}</g>`
    + `<g class="nr-ticks">${tension(dial.x, dial.y, dial.r)}</g>`
    + `<path class="nr-track" d="${ring}"/>`
    + `<path class="nr-arc-ink" d="${ring}" pathLength="1" transform="translate(1.2 1.6)"/>`
    + `<path class="nr-arc" d="${ring}" pathLength="1"/>`
    + `<text class="nr-need" x="${dial.x}" y="${dial.y + 6}">${n.need}</text>`
    + `${scribble(w, h)}</svg>`
    + `<span class="nr-text" aria-hidden="true"><b class="nr-runs"><span class="nr-count">${n.runs}</span><i>*</i></b>`
    + `<span class="nr-say">${nearingLine(n)}</span></span></div><span class="nr-said">${nearingSaid(n)}</span>`;
}

/** Inks `fill` of the dial, from twelve o'clock round. */
function ink(card: HTMLElement, fill: number) {
  card.querySelectorAll<SVGPathElement>('.nr-arc,.nr-arc-ink').forEach(arc => { arc.style.strokeDashoffset = String(1 - fill); });
}

/** Restarts a one-shot animation class on `node`. */
function kick(node: Element | null, name: string) {
  if (!node) return;
  node.classList.remove(name);
  void (node as HTMLElement).getBoundingClientRect();
  node.classList.add(name);
}

/**
 * Moves a card already up to `n`, from `was`: the dial winds on, the numbers
 * that changed are slammed in, a sixth ball is stamped — or, if nothing
 * changed at all, the card flinches.
 */
export function applyNearing(card: HTMLElement, n: Nearing, was: Nearing | null) {
  card.dataset.heat = String(heatOf(n));
  ink(card, dialFill(n));
  const say = card.querySelector('.nr-say');
  if (say) say.textContent = nearingLine(n);
  card.querySelector('.nr-said')!.textContent = nearingSaid(n);
  if (n.kind === 'six-sixes') {
    const before = was?.kind === 'six-sixes' ? was.sixes : 0;
    card.querySelectorAll<SVGGElement>('.nr-slot').forEach((slot, i) => {
      slot.classList.toggle('is-filled', i < n.sixes);
      slot.classList.toggle('is-next', i === n.sixes);
      // Stamped in one after another when the card first goes up, and only
      // the new one after that.
      slot.style.setProperty('--stamp', `${Math.max(0, i - before) * 110}ms`);
      if (i >= before && i < n.sixes) kick(slot, 'is-new');
    });
    return;
  }
  const count = card.querySelector('.nr-count'), need = card.querySelector('.nr-need');
  const moved = was?.kind === n.kind && was.runs !== n.runs;
  if (count) count.textContent = String(n.runs);
  if (need) need.textContent = String(n.need);
  const body = card.querySelector('.nr-body');
  if (moved) { kick(count, 'is-new'); kick(need, 'is-new'); kick(body, 'is-moved'); }
  else if (was?.kind === n.kind) kick(body, 'is-stuck');
}

/** The card as it comes off: filled and burst, or crossed out. */
export function endNearing(card: HTMLElement, before: Nearing, end: NearingEnd) {
  const say = card.querySelector('.nr-say');
  if (say) say.textContent = endLine(before, end);
  card.querySelector('.nr-said')!.textContent = endLine(before, end);
  if (end.how === 'reached') {
    ink(card, 1);
    if (before.kind === 'six-sixes') {
      const last = card.querySelector('.nr-slot[data-slot="5"]');
      last?.classList.add('is-filled');
      last?.classList.remove('is-next');
      (last as SVGGElement | null)?.style.setProperty('--stamp', '0ms');
      kick(last, 'is-new');
    } else {
      const count = card.querySelector('.nr-count');
      // What he has, which a six can take past the mark.
      if (count) count.textContent = String(end.runs);
      kick(count, 'is-new');
      const need = card.querySelector('.nr-need');
      if (need) {
        need.textContent = before.kind === 'century' ? '100' : '50';
        // Three figures in a ring drawn for two.
        if (before.kind === 'century') need.setAttribute('font-size', '12');
      }
      kick(need, 'is-new');
    }
  }
  card.classList.add(end.how === 'reached' ? 'is-reached' : 'is-crossed');
}
