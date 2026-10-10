import { keyCardMarkup, type KeyView } from './CareerKey';
import { restoreLinkMarkup } from './Restore';
import { escape, kitMarkup } from './Leaderboard';
import { statsExplain, type StatsFacts } from '../game/StatsCard';
import { measureName } from '../game/tier';
import { recordMarkup, type RivalsRecord } from './Record';
import { cta, icon, roadToHitman } from './Kit';

/**
 * My Stats, as UI v1 draws it (the handover's section 07).
 *
 * The tier card leads: the player's career in the material of the rung they
 * stand on — matte navy, brushed bronze, black with a chrome edge, black and
 * gold foil — then Road to Hitman for what is next, six figures, and the career
 * key as a ticket stub. A switch at the head moves between the modes, and so
 * does a swipe: the cards are a rail, one a mode.
 *
 * The card on the screen is drawn here, in the page. The painted picture of
 * it (`StatsCard.ts`) is still what SHARE MY CARD sends — a picture rather
 * than a link, which is what the player shares today — painted behind the
 * screen as before, so the key has it ready the moment it is pressed.
 */

/**
 * Where the card is being shown. `page` is the screen the cover's profile
 * chip and the innings card's Career stats door open, with a way back. `sheet`
 * was the My Stats tab on the old leaderboard and is kept for anything still
 * drawing it there; it carries no way back of its own.
 */
export type StatsWhere = 'sheet' | 'page';

/** One card on the rail: the figures, and the picture of them once it exists. */
export interface StatsSlide {
  facts: StatsFacts;
  /** The painted card, for sharing, once it has been painted. */
  picture?: string | null;
  /** Set where the picture could not be painted at all. */
  failed?: boolean;
  /** The best place this player holds on any of this mode's ladders. */
  rank?: number | null;
}

export interface StatsSheetView {
  /** The cards, one a mode, in the order they are swiped through. */
  cards: StatsSlide[];
  /** Which one the sheet opens on. */
  at?: number;
  where?: StatsWhere;
  /** Whether this browser will hand a file to another app. */
  canShare?: boolean;
  /** The career key, where this player has one: absent for anybody with no name. */
  careerKey?: KeyView | null;
  /** Whether to offer the way back to a record, as a quiet line at the foot. */
  offerRestore?: boolean;
  /** Matches won, lost and drawn against friends, once the store has answered. */
  rivals?: RivalsRecord | null;
  /** Who these figures are, with the way to change it. Absent for a player with no name. */
  who?: { name: string; avatar: number } | null;
}

/** The switch's words, shorter than the modes' names: the switch is narrow. */
const SHORT: Record<string, string> = { classic: 'Blast', survive: 'Survival', marathon: 'Marathon' };

const TITLE = new URL('../assets/title.webp', import.meta.url).href;

/** The Star card's one big star, top right and turned (Figma 152:18122). */
const STAR = new URL('../assets/kit/card-star.svg', import.meta.url).href;
/** The Hitman card's helmet on fire, in gold foil, blended into the card. */
const HITMAN = new URL('../assets/kit/card-hitman.svg', import.meta.url).href;

const PENCIL = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="1.8"/></svg>`;

export function statsSheetMarkup(view: StatsSheetView): string {
  const { cards, at = 0, where = 'page' } = view;
  const many = cards.length > 1;
  const played = cards.some(card => card.facts.played);
  return `
    <div class="stats-sheet-inner st-page is-${where}" role="document">
      <header class="st-head">${where === 'page' ? `
        <button id="stats-back" class="k-icon-button" type="button" aria-label="Back">${icon('arrow-left')}</button>` : ''}
        <h2 class="st-title">MY STATS</h2>
        ${many ? switchMarkup(cards, at) : ''}
      </header>
      <div id="stats-rail" class="stats-stage${many ? ' is-rail' : ''}"${many ? ' role="group" aria-label="Your careers, one a mode"' : ''}>${
  cards.map((card, i) => slideMarkup(card, view.who ?? null, i === 0, i === at)).join('')}</div>
      ${view.careerKey ? keyCardMarkup(view.careerKey) : ''}
      ${view.rivals && view.rivals.won + view.rivals.lost + view.rivals.drawn > 0 ? recordMarkup(view.rivals, 'RIVALS RECORD', 'is-stats') : ''}
      ${view.offerRestore ? `<p class="stats-note">Played before? ${restoreLinkMarkup('stats-restore', 'Bring your record back')}</p>` : ''}
      <p id="stats-status" class="stats-status hidden" role="status" aria-live="polite"></p>
      <div id="stats-toast" class="stats-toast" role="status" aria-live="polite"></div>
      <div class="st-foot">${played
        ? cta({ kind: 'share-wide', label: 'SHARE MY CARD', id: 'stats-brag' })
        : cta({ kind: 'primary', label: 'PLAY YOUR FIRST INNINGS', id: 'stats-play', wide: true })}</div>
    </div>`;
}

/** The mode switch at the head: which card is in front, and the way to the others. */
function switchMarkup(cards: StatsSlide[], at: number): string {
  return `<div class="st-switch stats-dots" role="tablist" aria-label="Which mode">${cards.map((card, i) => `
          <button class="stats-dot${i === at ? ' is-on' : ''}" type="button" role="tab" data-slide="${i}" aria-selected="${i === at}"
            aria-label="${escape(card.facts.modeName)}"><span>${escape(SHORT[card.facts.mode] ?? card.facts.modeName)}</span></button>`).join('')}
        </div>`;
}

/** One mode: the tier card, the road to the next tier, and six figures. */
function slideMarkup(card: StatsSlide, who: { name: string; avatar: number } | null, first: boolean, live: boolean): string {
  const { facts } = card;
  return `
      <div class="stats-slide" data-mode="${escape(facts.mode)}" role="group" aria-label="${escape(facts.modeName)}"${live ? ' data-live="1"' : ''}>
        ${cardMarkup(facts, who, first)}
        ${roadToHitman(facts.mode, facts.ladder)}
        ${tilesMarkup(card)}
      </div>`;
}

/** The career card, in its tier's material. */
export function cardMarkup(facts: StatsFacts, who: { name: string; avatar: number } | null, first = true): string {
  const tier = facts.tier.key;
  const face = who ? kitMarkup(who.avatar, who.name) : '<span class="board-kit is-empty" aria-hidden="true"></span>';
  // One edit key a rail, on the first card, so the id stays one a page; the
  // others carry the same key by class and do the same thing.
  const edit = who ? `<button${first ? ' id="stats-edit"' : ''} class="st-edit" type="button" aria-label="Edit your name, kit and batting hand">${PENCIL}</button>` : '';
  const measure = facts.ladder.measure.toLocaleString('en-US');
  const unit = facts.mode === 'survive' ? 'balls faced' : `career ${measureName(facts.mode)}`;
  return `<article class="st-card tier-${escape(tier)} is-${escape(facts.mode)}" aria-label="${escape(`${who?.name ?? 'Guest'}, ${facts.tier.name}, ${facts.modeName}: ${measure} ${unit}`)}">
          <i class="st-card-grain" aria-hidden="true"></i>${tier === 'star' ? `<img class="st-card-star" src="${STAR}" alt="" aria-hidden="true">` : ''}${tier === 'hitman' ? `<img class="st-card-helmet" src="${HITMAN}" alt="" aria-hidden="true">` : ''}<i class="st-card-sheen" aria-hidden="true"></i>
          <div class="st-card-top"><img class="st-card-logo" src="${TITLE}" alt="" decoding="async"><span class="st-card-tier">${escape(facts.tier.name)}</span></div>
          <div class="st-card-who">${face}<span class="st-card-name"><b>${escape(who?.name ?? 'Guest')}</b><small>${escape(facts.modeName.toUpperCase())} &middot; CAREER</small></span>${edit}</div>
          <div class="st-card-foot"><div class="st-card-figure"><b>${measure}</b><span>${unit}</span></div>${tier === 'star' ? progressMarkup(facts) : ''}</div>
        </article>`;
}

/** Which six figures each mode puts under its card, in the drawing's order. */
const TILES: Record<string, readonly string[]> = {
  classic: ['Innings', 'Sixes', 'Highest', 'Fours', 'Balls', 'Best rank'],
  survive: ['Innings', 'Survived', 'Won', 'Runs', 'Blows', 'Best rank'],
  marathon: ['Innings', 'Highest', 'Best ind.', 'Hundreds', 'Fifties', 'Best rank'],
};

/** A figure that means nothing before an innings is a dash, not a nought. */
const DASHED = new Set(['Highest', 'Best ind.', 'Best rank']);

function tilesMarkup(card: StatsSlide): string {
  const { facts } = card;
  const known = new Map([...facts.hero, ...facts.figures].map(one => [one.label, one.value] as const));
  const value = (label: string): string => {
    if (label === 'Innings') return facts.innings.toLocaleString('en-US');
    if (label === 'Best rank') return card.rank ? `#${card.rank}` : '—';
    const got = known.get(label);
    if (got === undefined || (!facts.played && DASHED.has(label))) return '—';
    return typeof got === 'number' ? got.toLocaleString('en-US') : String(got);
  };
  return `<div class="st-tiles">${(TILES[facts.mode] ?? TILES.classic).map(label => {
    const said = statsExplain(label);
    const tag = said ? 'button' : 'div';
    return `<${tag} class="st-tile${label === 'Best rank' && card.rank ? ' is-rank' : ''}"${said ? ` type="button" data-stat="${escape(label)}"` : ''}>
          <b>${escape(value(label))}</b><span>${escape(label)}</span></${tag}>`;
  }).join('')}</div>`;
}

/** The Star card's line to the next rung, under the figure, as drawn. */
function progressMarkup(facts: StatsFacts): string {
  const { progress, toNext, next } = facts.ladder;
  if (!next || toNext === null) return '';
  return `<div class="st-card-progress"><span class="st-card-track"><i style="width:${Math.round(progress * 100)}%"></i></span>
          <small>${toNext.toLocaleString('en-US')} ${measureName(facts.mode)} to ${escape(next.short)}</small></div>`;
}
