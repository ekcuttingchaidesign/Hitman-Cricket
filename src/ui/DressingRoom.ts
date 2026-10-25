import { cta, icon, iconButton } from './Kit';
import { escape } from './Leaderboard';
import {
  BATS, OUTFITS, batSteps, done, nextUp, outfitSteps, ready, shareOf,
  type BatId, type BatSkin, type DressingRecord, type Outfit, type OutfitId, type Step, type StepMode,
} from '../game/dressing';
import type { DressingStage } from '../scene/DressingStage';
import { GLOVES, gloveOf, type GloveDesign, type GuardId } from '../entities/gloves';

/**
 * The Dressing Room: the batter on his pedestal, the shelf of kits or bats
 * a rail down the right of him, and at the foot what the one picked takes,
 * or what earned it. The rail stands beside him rather than under him so the
 * pedestal has the height of the screen down to the foot.
 *
 * Picking anything puts it on him at once, earned or not, so a locked kit
 * is tried on rather than read about. Only an earned one can be worn out to
 * bat; a locked one's key plays the game its next line is won in. The guard
 * — the gloves and the pads in one colourway — is a third shelf with nothing
 * to earn: every one is free to wear.
 */
export type Shelf = 'kit' | 'bat' | 'guard';

export interface DressingView {
  shelf: Shelf;
  /** What is picked on each shelf: on show, not necessarily worn. */
  kit: OutfitId; bat: BatId; guard: GuardId;
  /** What the batter goes out in. */
  wearing: OutfitId; holding: BatId; wearingGuard: GuardId;
  record: DressingRecord;
  /** The shelf's small pictures, `kit:home` to `bat:hitman`, once they are drawn. */
  pictures: Record<string, string>;
}

/** The key for a locked item: the game its first open line is played in. */
export const PLAY: Record<StepMode, string> = { blast: 'PLAY THE BLAST', survival: 'PLAY TEST SURVIVAL', marathon: 'PLAY TEST MARATHON', super10: 'PLAY SUPER10', rivals: 'START A RIVAL MATCH' };

const fmt = (n: number) => Math.floor(n).toLocaleString('en-IN');
const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8" fill="currentColor"/><path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#0B0F14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const OPEN = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5.5a3 3 0 0 1 6 0V7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><rect x="3.5" y="7" width="9" height="6.5" rx="1.6" fill="currentColor"/></svg>';

const stepsOf = (shelf: Shelf, id: string, record: DressingRecord) =>
  shelf === 'kit' ? outfitSteps(id as OutfitId, record) : shelf === 'bat' ? batSteps(id as BatId, record) : null;
const itemOf = (shelf: Shelf, id: string): Outfit | BatSkin | GloveDesign =>
  shelf === 'guard' ? gloveOf(id) : (shelf === 'kit' ? OUTFITS : BATS).find(one => one.id === id)!;
const idsOf = (shelf: Shelf): readonly string[] => shelf === 'kit' ? OUTFITS.map(o => o.id) : shelf === 'bat' ? BATS.map(b => b.id) : GLOVES.map(g => g.id);
const pickedOn = (view: DressingView) => view.shelf === 'kit' ? view.kit : view.shelf === 'bat' ? view.bat : view.guard;
const wornOn = (view: DressingView) => view.shelf === 'kit' ? view.wearing : view.shelf === 'bat' ? view.holding : view.wearingGuard;
/** Something waits in the room only on the kit and bat shelves; nothing on the guard's is earned. */
const waits = (shelf: Shelf, id: string, record: DressingRecord) => shelf !== 'guard' && ready(shelf, id, record);
const WEAR: Record<Shelf, [string, string]> = { kit: ['WEAR IT', 'WEARING'], bat: ['PICK IT UP', 'IN HAND'], guard: ['WEAR IT', 'WEARING'] };

/** The screen's frame, drawn once; its parts are filled by `DressingRoom.draw`. */
export function dressingMarkup(): string {
  return `<div class="dr-screen" id="dressing-screen">
    <div class="dr-top">
      ${iconButton({ icon: 'arrow-left', label: 'Back', id: 'dressing-back' })}
      <div class="dr-tabs" role="group" aria-label="Kits, bats or guards">
        <button type="button" id="dressing-tab-kit" aria-pressed="true">KIT</button><button type="button" id="dressing-tab-bat" aria-pressed="false">BAT</button><button type="button" id="dressing-tab-guard" aria-pressed="false">GUARD</button>
      </div>
    </div>
    <h2 class="dr-name" id="dressing-name"></h2>
    <div class="dr-space" id="dressing-space"><div class="dr-items" id="dressing-items" role="list" aria-label="On the shelf"></div></div>
    <div class="dr-foot" id="dressing-foot"></div>
  </div>`;
}

/** The shelf: a tile a kit or bat, the picture and a lock or a tick, nothing else. */
export function shelfMarkup(view: DressingView): string {
  const ids = idsOf(view.shelf), picked = pickedOn(view), worn = wornOn(view);
  return ids.map(id => {
    const item = itemOf(view.shelf, id), owned = (stepsOf(view.shelf, id, view.record) ?? []).every(done), waiting = waits(view.shelf, id, view.record);
    const picture = view.pictures[`${view.shelf}:${id}`];
    // One waiting to be unlocked has a dot where the lock would be, and a light round it: tap me.
    const badge = waiting ? '<span class="dr-badge is-ready" aria-hidden="true"></span>'
      : id === worn ? `<span class="dr-badge is-on" aria-hidden="true">${TICK}</span>` : owned ? ''
      : `<span class="dr-badge is-lock" aria-hidden="true">${LOCK}</span>`;
    return `<button type="button" role="listitem" class="dr-item${id === picked ? ' is-picked' : ''}${owned ? '' : ' is-locked'}${waiting ? ' is-ready' : ''}" data-id="${id}" aria-pressed="${id === picked}" aria-label="${escape(item.name)}${waiting ? ', ready to unlock' : owned ? '' : ', locked'}${id === worn ? ', on' : ''}">`
      + `${picture ? `<img src="${picture}" alt="">` : '<i class="dr-item-blank"></i>'}${badge}</button>`;
  }).join('');
}

const valueOf = (step: Step) => done(step) ? 'Done' : step.best ? `Best ${fmt(step.now)}` : `${fmt(step.now)}<span>/${fmt(step.of)}</span>`;

/**
 * The foot. A locked item: TO UNLOCK, and one goal large with a bar or a
 * checklist with a tick a line, above the key to the game it is played in.
 * An earned one: what earned it, Next up (the nearest locked one on the same
 * shelf, a tap from being looked at) and the key to wear it.
 */
export function footMarkup(view: DressingView): string {
  const { shelf, record } = view;
  const id = pickedOn(view), item = itemOf(shelf, id);
  const steps = stepsOf(shelf, id, record);
  // Waiting in the room, earned or not: nothing to play for, only its key.
  if (waits(shelf, id, record))
    return `<div class="dr-had"><span class="dr-eye dr-eye-ready">Ready to unlock</span><p>${escape(item.line)}</p></div>`
      + cta({ kind: 'primary', label: `UNLOCK ${item.name.toUpperCase()}`, id: 'dressing-key', wide: true, moving: true });
  if (!steps || steps.every(done)) {
    const on = id === wornOn(view);
    const ids = idsOf(shelf);
    // One waiting to be unlocked comes before anything still to be played for.
    const waiting = ids.find(one => waits(shelf, one, record));
    const next = waiting ?? nextUp<string>(ids, one => stepsOf(shelf, one, record));
    let card = '';
    if (next) {
      const nextSteps = stepsOf(shelf, next, record)!, line = nextSteps.find(step => !done(step))!, picture = view.pictures[`${shelf}:${next}`];
      card = `<button type="button" class="dr-next${waiting ? ' is-ready' : ''}" id="dressing-next" data-id="${next}">`
        + `${picture ? `<img src="${picture}" alt="">` : '<i class="dr-item-blank"></i>'}`
        + `<span class="dr-next-text"><span class="dr-eye">${waiting ? 'Ready to unlock' : 'Next up'}</span><b>${escape(itemOf(shelf, next).name)}</b><span class="dr-next-step">${escape(waiting ? 'Tap to take a look' : line.text)}</span>`
        + `${waiting ? '' : `<span class="dr-track"><i style="width:${Math.round(shareOf(nextSteps) * 100)}%"></i></span>`}</span>`
        + `<span class="dr-next-value">${waiting ? '' : valueOf(line)}</span>${icon('chevron-right')}</button>`;
    }
    const key = on
      ? `<button type="button" class="dr-worn" id="dressing-key" disabled>${WEAR[shelf][1]}</button>`
      : cta({ kind: 'primary', label: WEAR[shelf][0], id: 'dressing-key', wide: true });
    return `<div class="dr-had"><span class="dr-eye">${steps ? 'Earned' : 'Free'}</span><p>${escape(item.line)}</p></div>${card}${key}`;
  }
  const first = steps.find(step => !done(step))!;
  let body: string;
  if (steps.length === 1) {
    // One goal has the room to itself: the figure large, how many to go, a bar.
    const [one] = steps;
    body = `<p class="dr-one">${escape(one.text)}</p>`
      + `<div class="dr-big"><b>${fmt(one.now)}<span> / ${fmt(one.of)}</span></b><em>${one.best ? 'Best so far' : `${fmt(one.of - one.now)} to go`}</em></div>`
      + `<span class="dr-track is-big"><i style="width:${Math.round(Math.min(1, one.now / one.of) * 100)}%"></i></span>`;
  } else {
    body = `<ul class="dr-steps">${steps.map(step => `<li class="${done(step) ? 'is-done' : ''}">${done(step) ? TICK : OPEN}<span>${escape(step.text)}</span><b>${valueOf(step)}</b></li>`).join('')}</ul>`;
  }
  return `<div class="dr-goal"><span class="dr-eye">To unlock</span>${body}</div>`
    + cta({ kind: 'primary', label: first.mode ? PLAY[first.mode] : 'PLAY', id: 'dressing-key', wide: true });
}

export interface DressingHandlers {
  /** The player put something on, or took it up: it is theirs and goes out to bat. */
  wear(shelf: Shelf, id: string): void;
  /** A locked item's key: go and play for it. */
  play(mode: StepMode | null): void;
  /** The key of one waiting in the room (`ready`): its unlock goes up. Never the guard: nothing on that shelf is earned. */
  claim(shelf: 'kit' | 'bat', id: string): void;
  close(): void;
}

/**
 * The screen itself, laid over the game's viewport while it is open. The stage
 * is made on opening and thrown away on closing.
 */
export class DressingRoom {
  private readonly root: HTMLElement;
  private stage: DressingStage | null = null;
  private view: DressingView;

  constructor(host: HTMLElement, view: DressingView, private readonly handlers: DressingHandlers, makeStage: () => DressingStage) {
    this.view = view;
    this.root = document.createElement('div');
    this.root.id = 'dressing-overlay'; this.root.className = 'dr-overlay';
    this.root.setAttribute('role', 'dialog'); this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-label', 'Dressing room');
    this.root.innerHTML = dressingMarkup();
    host.appendChild(this.root);
    const stage = this.stage = makeStage();
    this.root.querySelector('.dr-screen')!.prepend(stage.canvas);
    stage.dress(this.outfit(view.wearing), this.bat(view.holding), gloveOf(view.wearingGuard));
    this.layout.observe(this.root);
    this.dragShelf();
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('keydown', this.key);
    this.draw();
    void stage.thumbnails(OUTFITS, BATS, this.bat(view.holding), GLOVES, gloveOf(view.wearingGuard)).then(pictures => {
      if (!this.stage) return;
      // Drawing them dressed him in every kit in turn: dressed again in the one on show.
      this.view = { ...this.view, pictures }; this.draw();
    });
    (this.root.querySelector('#dressing-back') as HTMLElement | null)?.focus();
  }

  /** The record moved on, or the pick changed from outside: drawn again. */
  update(patch: Partial<DressingView>) { this.view = { ...this.view, ...patch }; this.draw(); }

  /** The stage told where the open space is, whenever the screen's shape changes. */
  private readonly layout = new ResizeObserver(() => this.place());
  private place() {
    this.peek(); this.ends();
    const stage = this.stage; if (!stage) return;
    const box = stage.canvas.getBoundingClientRect();
    const name = this.root.querySelector('#dressing-name')!.getBoundingClientRect();
    const foot = this.root.querySelector('#dressing-foot')!.getBoundingClientRect();
    // Under the name and over the foot, in the middle of the screen: the rail stands over the stage's edge.
    stage.frame(name.bottom - box.top + 8, foot.top - box.top - 6, 0, box.width);
  }

  close() {
    this.layout.disconnect();
    this.stage?.dispose(); this.stage = null;
    this.root.remove();
  }

  private outfit = (id: string) => OUTFITS.find(o => o.id === id) ?? OUTFITS[0];
  private bat = (id: string) => BATS.find(b => b.id === id) ?? BATS[0];

  /** The shelf last drawn, so a new one opens on its pick. */
  private shown: Shelf | null = null;
  /** Draws the parts; `stage` puts the pick on the pedestal too, which a new set of pictures does not. */
  private draw(stage = true) {
    const view = this.view, kit = view.shelf === 'kit';
    for (const shelf of ['kit', 'bat', 'guard'] as const) this.root.querySelector(`#dressing-tab-${shelf}`)!.setAttribute('aria-pressed', String(view.shelf === shelf));
    // A dot on a shelf's tab while something on it waits to be unlocked.
    for (const shelf of ['kit', 'bat'] as const) {
      const ids: readonly string[] = shelf === 'kit' ? OUTFITS.map(o => o.id) : BATS.map(b => b.id);
      this.root.querySelector(`#dressing-tab-${shelf}`)!.classList.toggle('has-dot', ids.some(one => ready(shelf, one, view.record)));
    }
    const item = itemOf(view.shelf, pickedOn(view));
    const name = this.root.querySelector<HTMLElement>('#dressing-name')!;
    name.textContent = item.name.toUpperCase(); name.classList.toggle('is-long', item.name.length > 12);
    const shelf = this.root.querySelector<HTMLElement>('#dressing-items')!, scroll = shelf.scrollTop;
    shelf.innerHTML = shelfMarkup(view); shelf.scrollTop = scroll;
    this.root.querySelector('#dressing-foot')!.innerHTML = footMarkup(view);
    this.ends();
    this.place();
    // A shelf just opened shows its pick: the rail goes no further than it takes to.
    if (this.shown !== view.shelf) {
      this.shown = view.shelf;
      const picked = shelf.querySelector<HTMLElement>('.is-picked');
      shelf.scrollTop = picked ? Math.max(0, picked.offsetTop + picked.offsetHeight - shelf.clientHeight + parseFloat(getComputedStyle(shelf).paddingBottom)) : 0;
      this.ends();
    }
    if (!stage || !this.stage) return;
    if (kit) this.stage.dress(this.outfit(view.kit), this.bat(view.holding), gloveOf(view.wearingGuard));
    else if (view.shelf === 'guard') this.stage.dress(this.outfit(view.wearing), this.bat(view.holding), gloveOf(view.guard));
    else this.stage.showcase(this.bat(view.bat));
    this.stage.show(view.shelf, item.glow);
  }

  /**
   * A finger swipes the rail by itself, and so does a wheel; a mouse drags
   * it, on the desktop column. A drag is never taken for a tap on a tile.
   */
  private dragShelf() {
    const shelf = this.root.querySelector<HTMLElement>('#dressing-items')!;
    let from = -1, top = 0, dragged = false;
    shelf.addEventListener('pointerdown', event => { if (event.pointerType !== 'mouse') return; from = event.clientY; top = shelf.scrollTop; dragged = false; });
    shelf.addEventListener('pointermove', event => {
      if (from < 0) return;
      const dy = event.clientY - from;
      if (Math.abs(dy) > 4) dragged = true;
      shelf.scrollTop = top - dy;
    });
    const stop = () => { from = -1; };
    shelf.addEventListener('pointerup', stop); shelf.addEventListener('pointerleave', stop);
    shelf.addEventListener('click', event => { if (dragged) { event.stopPropagation(); event.preventDefault(); dragged = false; } }, true);
  }

  /**
   * The rail cut short half-way down a tile when they do not all fit, so the
   * one half seen under the fade says there are more; all of the space when
   * they do.
   */
  private peek() {
    const rail = this.root.querySelector<HTMLElement>('#dressing-items')!, space = rail.parentElement!.clientHeight;
    const tiles = rail.querySelectorAll<HTMLElement>('.dr-item');
    rail.style.height = ''; rail.style.bottom = '';
    if (tiles.length < 2) return;
    const style = getComputedStyle(rail), pad = parseFloat(style.paddingTop), gap = parseFloat(style.rowGap) || 0;
    const tile = tiles[0].offsetHeight, pitch = tile + gap;
    if (pad * 2 + tiles.length * pitch - gap <= space) return;
    const whole = Math.max(1, Math.floor((space - pad - tile / 2) / pitch));
    rail.style.bottom = 'auto'; rail.style.height = `${pad + whole * pitch + tile / 2}px`;
  }

  /** The fade at either end of the rail, where there is more that way. */
  private ends() {
    const shelf = this.root.querySelector<HTMLElement>('#dressing-items')!;
    shelf.classList.toggle('more-up', shelf.scrollTop > 4);
    shelf.classList.toggle('more-down', shelf.scrollTop < shelf.scrollHeight - shelf.clientHeight - 4);
    shelf.onscroll = () => this.ends();
  }

  private pick(id: string) {
    const view = this.view;
    this.view = view.shelf === 'kit' ? { ...view, kit: id as OutfitId } : view.shelf === 'bat' ? { ...view, bat: id as BatId } : { ...view, guard: id as GuardId };
    this.draw();
  }

  private click = (event: MouseEvent) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('button');
    if (!target) return;
    const view = this.view;
    if (target.id === 'dressing-back') { this.handlers.close(); return; }
    const tab = (['kit', 'bat', 'guard'] as const).find(shelf => target.id === `dressing-tab-${shelf}`);
    if (tab) { this.view = { ...view, shelf: tab }; this.draw(); return; }
    if (target.classList.contains('dr-item') || target.id === 'dressing-next') { this.pick(target.dataset.id!); return; }
    if (target.id === 'dressing-key') {
      const id = pickedOn(view), steps = stepsOf(view.shelf, id, view.record);
      if (view.shelf !== 'guard' && ready(view.shelf, id, view.record)) { this.handlers.claim(view.shelf, id); return; }
      if (steps && !steps.every(done)) { this.handlers.play(steps.find(step => !done(step))?.mode ?? null); return; }
      this.handlers.wear(view.shelf, id);
      this.view = view.shelf === 'kit' ? { ...view, wearing: id as OutfitId } : view.shelf === 'bat' ? { ...view, holding: id as BatId } : { ...view, wearingGuard: id as GuardId };
      this.draw();
    }
  };

  private key = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); this.handlers.close(); }
  };
}
