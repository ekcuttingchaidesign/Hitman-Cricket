import type { Bowler } from '../config/super10';
import { guardOf, type FieldSet } from '../game/super10-field';

/**
 * Super10's field on the screen, in the two versions being tried
 * (`?fieldui=`):
 *
 *  - **b**, the default: the field is shown when it is worth showing. A card
 *    at the foot at the top of an over whose field this innings has not shown
 *    yet, or that the captain or Power Surge has changed, held a moment and put
 *    away by a tap; a chip under the scoreboard saying what moved; and the
 *    field on demand, by a tap on the scoreboard or in the pause sheet.
 *  - **a**: the field always there, a see-through map at the foot of the
 *    picture where the batter's legs leave room, every line and dot of it
 *    faint so the ground shows through, brightening for a moment when it
 *    changes. No card.
 *
 * Either way the pause sheet has it drawn solid, and a ball that went out of
 * the picture to a boundary rider lights the side label it went past with
 * his name. Drawn from the batter's end, the leg side on the left for a
 * right-hander, as the ground is.
 */

export type FieldUiVersion = 'a' | 'b';
export function fieldUiOf(search: string): FieldUiVersion {
  return new URLSearchParams(search).get('fieldui') === 'a' ? 'a' : 'b';
}

/** What the card calls each bowler: the batter tells them apart by what they bowl, never by a name. */
export const BOWLER_LABEL: Record<Bowler, string> = {
  SWING: 'SWING BOWLER', SEAM: 'SEAMER', SPIN: 'SPINNER', SLING: 'SLING BOWLER', DEATH: 'DEATH BOWLER',
};
const TONE: Record<Bowler, string> = { SWING: '#3cc9c0', SEAM: '#3f88f2', SPIN: '#f5b83d', SLING: '#ff5a4e', DEATH: '#a98bff' };
/** The lanes drawn on the card: the five strokes up the ground and square, open in green, guarded in pink. */
const LANES = [-52, -24, 0, 24, 100];
/** How long the card holds before it goes by itself. */
export const FIELD_CARD_MS = 1600;
const CHIP_MS = 2600;
const LIT_MS = 1800;

interface MapOptions { solid?: boolean; lanes?: boolean; prev?: FieldSet | null; mirrored?: boolean }

/** The field from above, in a hundred-unit square: the rope, the ring, the pitch, the men. */
export function fieldMapMarkup(field: FieldSet, { solid = false, lanes = false, prev = null, mirrored = false }: MapOptions = {}) {
  const P = (angle: number, r: number) => {
    const t = angle * Math.PI / 180;
    return [50 + (mirrored ? -1 : 1) * r * Math.sin(t), 50 - r * Math.cos(t)].map(v => v.toFixed(1));
  };
  // A boundary rider is drawn on the rope's circle, a man in the ring where he stands.
  const at = (m: { angle: number; distance: number; deep: boolean }) => P(m.angle, m.deep ? 41 : m.distance);
  let s = `<svg class="s10-svg" viewBox="0 0 100 100" aria-hidden="true">`;
  s += `<circle cx="50" cy="50" r="46" class="s10-rope"/><circle cx="50" cy="50" r="26" class="s10-ring"/>`;
  s += `<rect x="48" y="43" width="4" height="14" rx=".8" class="s10-pitch"/>`;
  if (lanes) {
    s += '<g class="s10-lanes">';
    for (const lane of LANES) {
      const [x, y] = P(lane, 44);
      s += `<line x1="50" y1="54" x2="${x}" y2="${y}" class="${guardOf(field, lane) ? 'is-guarded' : 'is-open'}"/>`;
    }
    s += '</g>';
  }
  // Where a man who moved came from.
  if (prev) {
    for (const man of prev.men.filter(m => m.deep && !field.men.some(n => n.deep && Math.abs(n.angle - m.angle) < 3))) {
      const [x, y] = at(man);
      s += `<circle cx="${x}" cy="${y}" r="3.4" class="s10-was"/>`;
    }
  }
  for (const man of field.men) {
    const [x, y] = at(man);
    const fresh = prev && man.deep && !prev.men.some(n => n.deep && Math.abs(n.angle - man.angle) < 3);
    s += `<circle cx="${x}" cy="${y}" r="${man.deep ? (fresh ? 4 : 3.4) : 2.4}" class="${man.deep ? 's10-deep' : 's10-man'}${man.captain ? ' is-captain' : ''}${fresh ? ' is-new' : ''}"/>`;
  }
  s += `<circle cx="50" cy="54" r="2.8" class="s10-bat"/></svg>`;
  return `<span class="s10-map${solid ? ' is-solid' : ''}">${s}</span>`;
}

/** The card at the foot: who is bowling, his field, and a line about it. */
export function fieldCardMarkup(field: FieldSet, over: number, { prev = null, mirrored = false }: { prev?: FieldSet | null; mirrored?: boolean } = {}) {
  const title = field.change === 'surge' ? 'POWER SURGE' : field.change === 'captain' ? 'FIELD CHANGE' : BOWLER_LABEL[field.bowler];
  return `<div class="s10-card" style="--tone:${TONE[field.bowler]}" data-change="${field.change ?? ''}">
    <p class="s10-card-eyebrow"><span>OVER ${over + 1}</span><b>${title}</b></p>
    ${fieldMapMarkup(field, { solid: true, lanes: true, prev, mirrored })}
    <p class="s10-card-note">${field.note}</p>
    <p class="s10-card-key"><span class="s10-key-open">Open</span><span class="s10-key-guarded">On the rope</span><span class="s10-tap">Tap to bat</span></p>
  </div>`;
}

export interface FieldUiHandlers {
  /** The Power Surge chip was tapped. */
  surge(): void;
  /** The card went, by a tap or by itself: the bowler can come in. */
  closed(): void;
}

export type SurgeState = 'offer' | 'armed' | 'on' | null;

/** The field's pieces on the page, for one game; `show(false)` takes them all away outside Super10. */
export class FieldUi {
  private readonly chips: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly pause: HTMLElement;
  private field: FieldSet | null = null;
  private over = 0;
  private mirrored = false;
  private cardTimer = 0;
  private chipTimer = 0;
  private litTimer = 0;
  private on = false;

  constructor(private readonly root: HTMLElement, readonly version: FieldUiVersion, private readonly handlers: FieldUiHandlers) {
    this.chips = this.made('div', 's10-chips hidden', root.querySelector('.score-stack') ?? root);
    this.chips.innerHTML = '<span class="s10-chip" id="s10-chip" hidden></span><button class="s10-surge" id="s10-surge" type="button" hidden></button>';
    this.layer = this.made('div', 's10-layer hidden', root);
    this.layer.id = 's10-card';
    this.foot = this.made('div', 's10-foot hidden', root);
    this.foot.id = 's10-foot';
    const keys = root.querySelector('.pause-keys');
    this.pause = this.made('div', 's10-pause hidden', keys?.parentElement ?? root);
    this.pause.id = 's10-pause';
    if (keys) keys.after(this.pause);
    this.layer.addEventListener('click', () => this.closeCard());
    this.chips.querySelector('#s10-surge')!.addEventListener('click', event => { event.stopPropagation(); this.handlers.surge(); });
  }

  private made(tag: string, className: string, parent: Element) {
    const element = document.createElement(tag);
    element.className = className;
    parent.appendChild(element);
    return element;
  }

  /** Whether this innings has a field to show: Super10's does, and nothing else does. */
  show(on: boolean, mirrored = false) {
    this.on = on; this.mirrored = mirrored;
    this.chips.classList.toggle('hidden', !on);
    this.foot.classList.toggle('hidden', !on || this.version !== 'a');
    this.pause.classList.toggle('hidden', !on);
    if (!on) { this.closeCard(false); this.surge(null); this.field = null; this.light(null); }
  }

  get cardOpen() { return !this.layer.classList.contains('hidden'); }

  /**
   * The top of an over. Answers whether a card went up, which the bowler
   * waits for: in version b, for a field not shown before this innings or one
   * just changed; never in version a, whose map is always there.
   */
  overBegins(field: FieldSet, over: number, { prev, fresh }: { prev: FieldSet | null; fresh: boolean }) {
    this.field = field; this.over = over;
    this.pause.innerHTML = `<p class="s10-pause-head"><span>FIELD · OVER ${over + 1}</span><b>${field.change === 'surge' ? 'POWER SURGE' : BOWLER_LABEL[field.bowler]}</b></p>
      ${fieldMapMarkup(field, { solid: true, lanes: true, mirrored: this.mirrored })}<p class="s10-pause-note">${field.note}</p>`;
    const changed = !!field.change && !!prev;
    this.foot.innerHTML = fieldMapMarkup(field, { mirrored: this.mirrored, prev: changed ? prev : null });
    if (changed) {
      this.chip(field.change === 'surge' ? `POWER SURGE · ${field.men.filter(m => m.deep).length} ON THE ROPE` : `FIELD CHANGE · ${field.moved.slice(0, 2).join(', ')}`);
      this.foot.classList.remove('is-lit'); void this.foot.offsetWidth; this.foot.classList.add('is-lit');
    }
    if (this.version === 'a' || !(fresh || changed)) return false;
    this.openCard(changed ? prev : null);
    return true;
  }

  /** The card for the field in play, asked for: a tap on the scoreboard. */
  look() {
    if (!this.on || !this.field || this.cardOpen) return false;
    this.openCard(null);
    return true;
  }

  private openCard(prev: FieldSet | null) {
    this.layer.innerHTML = fieldCardMarkup(this.field!, this.over, { prev, mirrored: this.mirrored });
    this.layer.classList.remove('hidden', 'is-leaving');
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => this.closeCard(), FIELD_CARD_MS);
  }

  closeCard(tell = true) {
    clearTimeout(this.cardTimer);
    if (this.layer.classList.contains('hidden')) return;
    this.layer.classList.add('hidden');
    if (tell) this.handlers.closed();
  }

  private chip(text: string) {
    const chip = this.chips.querySelector<HTMLElement>('#s10-chip')!;
    chip.textContent = text; chip.hidden = false;
    chip.classList.remove('is-in'); void chip.offsetWidth; chip.classList.add('is-in');
    clearTimeout(this.chipTimer);
    this.chipTimer = window.setTimeout(() => { chip.hidden = true; }, CHIP_MS);
  }

  /** Power Surge's chip: offered to take next over, taken for it, on now, or gone. */
  surge(state: SurgeState) {
    const key = this.chips.querySelector<HTMLButtonElement>('#s10-surge')!;
    key.hidden = !state;
    key.dataset.state = state ?? '';
    key.disabled = state !== 'offer';
    key.innerHTML = state === 'offer' ? '<b>POWER SURGE</b><span>TAKE IT NEXT OVER</span><kbd class="keyboard-only">P</kbd>'
      : state === 'armed' ? '<b>POWER SURGE</b><span>NEXT OVER</span>'
      : state === 'on' ? '<b>POWER SURGE</b><span>TWO MEN UP</span>' : '';
  }

  /**
   * A ball out of the picture that a boundary rider got to: the side label it
   * went past says who, lit, for a moment.
   */
  light(where: { side: 'left' | 'right'; name: string } | null) {
    clearTimeout(this.litTimer);
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
    if (where) this.litTimer = window.setTimeout(() => this.light(null), LIT_MS);
  }
}
