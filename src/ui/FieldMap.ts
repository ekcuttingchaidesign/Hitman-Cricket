import { ropeAt, type FieldSet, type Man } from '../game/super10-field';
import type { ShotOutcome } from '../game/types';
import { icon } from './Kit';
import { replayClass } from './replay';

/**
 * Super10's two corners (Figma section 16A, node `422:5003`).
 *
 *  - **The field map**, bottom right, live all innings: only the ground and
 *    the dots, never on a panel — a dark see-through ground, the rope and the
 *    ring as white lines, the fielders red and the batter blue, whatever
 *    either side wears: drawn in the kits' own colours, a kit near the
 *    fielders' shirt or the grass lost its dots. A new field has the men's
 *    dots slide to their places while a ring pulses round the map twice and
 *    its name in the field book floats above it. After a
 *    shot the ball's line is drawn from the batter to where it went, the man
 *    who caught it or got to it lit, and both stay until the next ball. One tap
 *    enlarges it from its corner, and it stays up, live, until it is tapped
 *    again; the ground under it still takes a swipe.
 *  - **Power Surge**, bottom left: locked to the end of the fifth over, gold
 *    and breathing in the breaks it can be taken in, its ring emptying over the
 *    bowler's wait; through its over a ring filling a sixth a ball; a grey tick
 *    once used. Pressed, POWER SURGE fills the screen for a moment, the rope
 *    goes gold on the map, and a SURGE badge sits under the scoreboard.
 *
 * A touch that starts on either and travels as far as a swipe is a swipe: the
 * stroke wins (the input listens on the whole picture and captures the
 * pointer, so a tap is all either answers). A ball out of the picture that a
 * fielder got to lights the side label it went past with his name. Drawn from the batter's end, the leg side
 * on the left for a right-hander, as the ground is.
 */

/** Locked to the end of the fifth over; resting mid-over until it is used; offered in a break; on through its over; used. */
export type SurgeState = 'locked' | 'rest' | 'offer' | 'on' | 'used';

const TAG_MS = 2400;
/** How long the enlarged map takes to shrink back into its corner (`s10-shrink`). */
const CLOSE_MS = 240;
const LIT_MS = 1800;
const TITLE_MS = 1600;

/**
 * Where a thing is drawn on the map, a plan of the ground rather than a scale
 * drawing: inside the dashed ring (`RING_R`) for anything within `CIRCLE_M`
 * of the bat, and beyond it out to the rope in proportion to how far on it
 * is, so a man in the ring is always drawn in the ring and a boundary rider
 * (`deep`) always just inside the rope. Drawn to scale, a ring man and the
 * rider behind him were a few points apart, the ground being only
 * twenty-eight metres square of the bat.
 */
const ROPE_R = 44;
const RING_R = 28;
const CIRCLE_M = 24;
const RIDER_R = ROPE_R - 3;
function onMap(angle: number, distance: number, mirrored: boolean, deep = false) {
  const rope = ropeAt(angle);
  const r = deep ? RIDER_R
    : distance >= rope ? ROPE_R + 2
    : distance <= CIRCLE_M ? RING_R * distance / CIRCLE_M
    : RING_R + (ROPE_R - RING_R) * (distance - CIRCLE_M) / Math.max(1, rope - CIRCLE_M);
  const t = angle * Math.PI / 180;
  return { x: 50 + (mirrored ? -1 : 1) * r * Math.sin(t), y: 50 - r * Math.cos(t) };
}
const f = (v: number) => v.toFixed(1);

/** The map, drawn: the ground, the rope and ring, the pitch, the fielders and the batter. */
export function fieldMapMarkup(field: FieldSet, { mirrored = false }: { mirrored?: boolean } = {}) {
  const men = field.men.map((m, i) => {
    const p = onMap(m.angle, m.distance, mirrored, m.deep);
    return `<g class="s10-man${m.deep ? ' is-deep' : ''}" data-man="${i}" style="transform:translate(${f(p.x)}px,${f(p.y)}px)"><circle class="s10-halo" r="6.2"/><circle r="3.4"/></g>`;
  }).join('');
  return `<svg class="s10-svg" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="s10-ground" cx="50" cy="50" r="${ROPE_R + 2}"/>
    <circle class="s10-rope" cx="50" cy="50" r="${ROPE_R + 2}"/>
    <circle class="s10-ring" cx="50" cy="50" r="${RING_R}"/>
    <rect class="s10-pitch" x="48" y="28" width="4" height="22" rx="1"/>
    <path class="s10-shot-under" pathLength="100" d=""/>
    <path class="s10-shot" pathLength="100" d=""/>
    <g class="s10-men">${men}</g>
    <circle class="s10-bat" cx="50" cy="50" r="3.8"/>
  </svg>`;
}

const BOLT = '<svg class="s10-bolt" viewBox="0 0 18 26" aria-hidden="true"><path d="M11.5 0 0 14.8h7.3L5.4 26 18 10.4h-7.4z"/></svg>';
/** A ring round the icon, drawn on a length of a hundred so its share is a dash offset. */
const ring = (cls: string) => `<svg class="s10-ring-svg ${cls}" viewBox="0 0 68 68" aria-hidden="true"><circle cx="34" cy="34" r="30" pathLength="100"/></svg>`;

export interface FieldUiHandlers {
  /** Power Surge was pressed. */
  surge(): void;
}

/** The corners on the page, for one game; `show(false)` takes them away outside Super10. */
export class FieldUi {
  private readonly map: HTMLButtonElement;
  private readonly surgeKey: HTMLButtonElement;
  private readonly tag: HTMLElement;
  private readonly enlarged: HTMLElement;
  private readonly title: HTMLElement;
  private readonly badge: HTMLElement;
  private field: FieldSet | null = null;
  private over = 0;
  private mirrored = false;
  private on = false;
  private taught = false;
  private timers = { tag: 0, lit: 0, title: 0, close: 0 };

  constructor(private readonly root: HTMLElement, private readonly handlers: FieldUiHandlers) {
    this.map = this.made('button', 's10-corner s10-map hidden', root) as HTMLButtonElement;
    this.map.id = 's10-map'; this.map.type = 'button'; this.map.setAttribute('aria-label', 'The field');
    this.surgeKey = this.made('button', 's10-corner s10-surge hidden', root) as HTMLButtonElement;
    this.surgeKey.id = 's10-surge'; this.surgeKey.type = 'button'; this.surgeKey.setAttribute('aria-label', 'Power Surge');
    this.tag = this.made('div', 's10-tag hidden', root);
    this.tag.id = 's10-tag'; this.tag.setAttribute('role', 'status');
    this.enlarged = this.made('div', 's10-big hidden', root);
    this.enlarged.id = 's10-big';
    this.title = this.made('div', 's10-title hidden', root);
    this.title.id = 's10-title'; this.title.setAttribute('aria-hidden', 'true');
    this.badge = this.made('div', 's10-badge hidden', root.querySelector('.score-stack') ?? root);
    this.badge.id = 's10-badge';
    this.map.addEventListener('click', () => this.enlarge());
    this.enlarged.addEventListener('click', () => this.shrink());
    this.surgeKey.addEventListener('click', () => { if (this.surgeKey.dataset.state === 'offer') this.handlers.surge(); });
  }

  private made(tag: string, className: string, parent: Element) {
    const element = document.createElement(tag);
    element.className = className;
    parent.appendChild(element);
    return element;
  }

  /** Whether this innings has a field: Super10's does, and nothing else does. */
  show(on: boolean, mirrored = false) {
    this.on = on; this.mirrored = mirrored;
    for (const el of [this.map, this.surgeKey]) el.classList.toggle('hidden', !on);
    // Every innings starts with the map in its corner: left enlarged, it stood over the end card and the next innings.
    clearTimeout(this.timers.close);
    this.enlarged.classList.add('hidden'); this.enlarged.classList.remove('is-closing'); this.map.classList.remove('is-away');
    if (!on) {
      for (const el of [this.tag, this.enlarged, this.title, this.badge]) el.classList.add('hidden');
      this.field = null; this.light(null);
    }
  }

  /** Up, and not on its way back into the corner. */
  get enlargedOpen() { return !this.enlarged.classList.contains('hidden') && !this.enlarged.classList.contains('is-closing'); }

  /**
   * A field into play: the map redrawn, and for a field that changed — a new
   * over's, the bowler's other field, Power Surge — its men's dots sliding
   * from where they stood to where they now are, a ring pulsing twice and the
   * tag above the map with the field's name.
   */
  overBegins(field: FieldSet, over: number, { prev }: { prev: FieldSet | null }) {
    this.field = field; this.over = over;
    const out = field.men.filter(m => m.deep).length;
    const surge = field.change === 'surge';
    this.map.classList.toggle('is-surge', surge);
    const was = [...this.map.querySelectorAll<SVGGElement>('.s10-man')].map(g => g.style.transform);
    this.map.innerHTML = `${fieldMapMarkup(field, { mirrored: this.mirrored })}<span class="s10-pulse"></span>`;
    if (!prev || !was.length || prev.id === field.id) { this.drawBig(); return; }
    // The men walk: each new place from whoever stood nearest it.
    const from = this.matched(prev.men, field.men);
    // Each from his old place to his new: stood on the old one now, sent on
    // his way at the next frame. Read back with a forced layout between, nine
    // men in a row, it held the frame up.
    const walking: [SVGGElement, string][] = [];
    [...this.map.querySelectorAll<SVGGElement>('.s10-man')].forEach((g, i) => {
      const to = g.style.transform, start = was[from[i]];
      if (!start || start === to) return;
      g.style.transition = 'none'; g.style.transform = start;
      walking.push([g, to]);
    });
    if (walking.length) requestAnimationFrame(() => walking.forEach(([g, to]) => { g.style.transition = ''; g.style.transform = to; }));
    replayClass(this.map.querySelector<HTMLElement>('.s10-pulse')!, 'is-on');
    const name = field.name.toUpperCase();
    this.say(surge ? 'POWER SURGE · TWO FIELDERS IN' : field.change === 'plan' ? `FIELD CHANGE · ${name}` : `${name} · ${out} OUT`, 'map');
    this.drawBig();
  }

  /** For each new man, the old man nearest him, so a man walks to his new place rather than across the ground. */
  private matched(prev: Man[], next: Man[]) {
    const xy = (m: Man) => onMap(m.angle, m.distance, false, m.deep);
    const pairs: [number, number, number][] = [];
    next.forEach((n, i) => prev.forEach((p, j) => { const a = xy(n), b = xy(p); pairs.push([Math.hypot(a.x - b.x, a.y - b.y), i, j]); }));
    pairs.sort((a, b) => a[0] - b[0]);
    const out: number[] = [], usedNew = new Set<number>(), usedOld = new Set<number>();
    for (const [, i, j] of pairs) {
      if (usedNew.has(i) || usedOld.has(j)) continue;
      out[i] = j; usedNew.add(i); usedOld.add(j);
    }
    return out;
  }

  private say(text: string, corner: 'map' | 'surge') {
    // The enlarged map shows the new field itself: a tag over it was one thing too many.
    if (corner === 'map' && this.enlargedOpen) return;
    this.tag.textContent = text;
    this.tag.dataset.corner = corner;
    this.tag.classList.remove('hidden');
    replayClass(this.tag, 'is-in');
    clearTimeout(this.timers.tag);
    this.timers.tag = window.setTimeout(() => this.tag.classList.add('hidden'), TAG_MS);
  }

  /**
   * The map grown out of its corner, on no panel and with no words over it
   * (the field's name is the tag's, when it changes). It stays up, kept live as the field and the shots change it, until it
   * is tapped again (or F): put back by itself, at the bowler's first stride
   * or after six seconds, it was gone before anybody had read it.
   */
  enlarge() {
    if (!this.on || !this.field || this.enlargedOpen) return false;
    clearTimeout(this.timers.close);
    this.enlarged.classList.remove('hidden', 'is-closing');
    this.map.classList.add('is-away');
    if (this.tag.dataset.corner === 'map') this.tag.classList.add('hidden');
    this.drawBig(true);
    return true;
  }
  /** The enlarged map drawn again from the corner's, while it is up. */
  private drawBig(growing = false) {
    if (!this.field || !this.enlargedOpen) return;
    this.enlarged.innerHTML = `<div class="s10-big-map${this.field.change === 'surge' ? ' is-surge' : ''}${growing ? '' : ' is-up'}">${this.map.querySelector('svg')?.outerHTML ?? ''}</div>`;
  }
  /**
   * Back into its corner, a tap on it or F: it shrinks into the corner map's
   * place as that fades back in under it, rather than vanishing.
   */
  shrink() {
    if (!this.enlargedOpen) return;
    this.map.classList.remove('is-away');
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.enlarged.classList.add('hidden'); return; }
    this.enlarged.classList.add('is-closing');
    clearTimeout(this.timers.close);
    this.timers.close = window.setTimeout(() => { this.enlarged.classList.add('hidden'); this.enlarged.classList.remove('is-closing'); }, CLOSE_MS);
  }
  /** F: the map enlarged, or put back. */
  toggle() {
    if (this.enlargedOpen) { this.shrink(); return false; }
    return this.enlarge();
  }

  /**
   * After a shot, the ball's line from the batter to where it went: over the
   * rope for a boundary, to the man who got to it, or out into the field for
   * the runs it was worth. The man who caught it or stopped it (`taker`, his
   * place in the field's men) is lit until the next ball, a ring round his
   * dot that pops as the line reaches him. The next ball clears both (`angle`
   * null).
   */
  shot(angle: number | null, outcome: ShotOutcome | null, taker: number | null = null) {
    const path = this.map.querySelector<SVGPathElement>('.s10-shot');
    const under = this.map.querySelector<SVGPathElement>('.s10-shot-under');
    this.map.querySelectorAll('.s10-man.is-taker').forEach(g => g.classList.remove('is-taker'));
    if (!path || !under) return;
    if (angle === null || !outcome || !this.field) { path.setAttribute('d', ''); under.setAttribute('d', ''); path.classList.remove('is-on'); under.classList.remove('is-on'); this.drawBig(); return; }
    const man = taker === null ? null : this.field.men[taker] ?? null;
    const distance = outcome.runs >= 4 ? ropeAt(angle) : [6, 14, 22, 28][outcome.runs] ?? 6;
    const end = man ? onMap(man.angle, man.distance, this.mirrored, man.deep) : onMap(angle, distance, this.mirrored);
    path.setAttribute('d', `M50 50L${f(end.x)} ${f(end.y)}`);
    under.setAttribute('d', `M50 50L${f(end.x)} ${f(end.y)}`);
    replayClass(path, 'is-on'); replayClass(under, 'is-on');
    if (man) this.map.querySelector(`.s10-man[data-man="${taker}"]`)?.classList.add('is-taker');
    this.drawBig();
  }

  /**
   * Power Surge's corner. `balls`: how many of the surge over have been
   * bowled, for its ring. The first time it lights up a line above it says
   * what it does; pressed, the screen says so too.
   */
  surge(state: SurgeState, { balls = 0, over = this.over }: { balls?: number; over?: number } = {}) {
    const was = this.surgeKey.dataset.state;
    this.surgeKey.dataset.state = state;
    this.surgeKey.disabled = state !== 'offer';
    this.surgeKey.style.setProperty('--filled', String(Math.min(6, balls) / 6 * 100));
    this.surgeKey.innerHTML = state === 'used'
      ? `<span class="s10-surge-disc">${icon('check')}</span>`
      : `<span class="s10-surge-disc">${BOLT}</span>${state === 'offer' ? ring('is-wait') : state === 'on' ? ring('is-fill') : ''}${state === 'locked' ? '<span class="s10-surge-lock">OV5</span>' : ''}`;
    if (state === 'offer' && was !== 'offer' && !this.taught) { this.taught = true; this.say('POWER SURGE · TWO FIELDERS IN', 'surge'); }
    if (state === 'on' && was !== 'on') this.surged(over);
    this.badge.classList.toggle('hidden', state !== 'on');
  }

  private surged(over: number) {
    this.badge.innerHTML = `${BOLT}<span>SURGE · OVER ${over + 1}</span>`;
    this.title.innerHTML = '<b>POWER SURGE</b><span>TWO FIELDERS IN · THIS OVER</span>';
    this.title.classList.remove('hidden');
    replayClass(this.title, 'is-in');
    clearTimeout(this.timers.title);
    this.timers.title = window.setTimeout(() => this.title.classList.add('hidden'), TITLE_MS);
  }

  /**
   * A ball out of the picture that a fielder got to: the side label it went
   * past says who, lit, for a moment.
   */
  light(where: { side: 'left' | 'right'; name: string } | null) {
    clearTimeout(this.timers.lit);
    for (const side of ['left', 'right'] as const) {
      const label = this.root.querySelector<HTMLElement>(`#side-${side}`);
      if (!label) continue;
      // What it said, kept while it is lit and given back after: a
      // left-hander's labels are the other way round.
      if (where?.side === side) {
        if (label.dataset.was === undefined) label.dataset.was = label.textContent ?? '';
        label.textContent = where.name.toUpperCase();
        label.classList.add('is-rider');
      } else if (label.dataset.was !== undefined) {
        label.textContent = label.dataset.was;
        delete label.dataset.was;
        label.classList.remove('is-rider');
      }
    }
    if (where) this.timers.lit = window.setTimeout(() => this.light(null), LIT_MS);
  }
}
