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

/**
 * The faint mark behind the two top cards, drawn the way the handover's trophy
 * art is: flat, each shape split into a lit half and a shaded half. A faceted
 * star for Star, a two-handled cup on its plinth for Hitman.
 */
const STAR_MARK = `<svg viewBox="0 0 200 190" aria-hidden="true"><g class="is-lit"><path d="M100 100L76.5 67.6L100 4ZM100 100L123.5 67.6L191.3 70.3ZM100 100L138 112.4L156.4 177.7ZM100 100L100 140L43.6 177.7ZM100 100L62 112.4L8.7 70.3Z"/></g><g class="is-shade"><path d="M100 100L100 4L123.5 67.6ZM100 100L191.3 70.3L138 112.4ZM100 100L156.4 177.7L100 140ZM100 100L43.6 177.7L62 112.4ZM100 100L8.7 70.3L76.5 67.6Z"/></g></svg>`;
const CUP_MARK = `<svg viewBox="0 0 200 240" aria-hidden="true"><g class="is-lit"><path d="M40 20H160V70C160 115 130 140 100 145C70 140 40 115 40 70Z"/><path d="M88 145H112L118 185H82Z"/><rect x="60" y="185" width="80" height="16" rx="3"/><rect x="48" y="201" width="104" height="28" rx="4"/></g><g class="is-shade"><path d="M100 20H160V70C160 115 130 140 100 145Z"/><path d="M100 145H112L118 185H100Z"/><rect x="100" y="185" width="40" height="16"/><rect x="100" y="201" width="52" height="28"/></g><g class="is-handle" fill="none" stroke-width="11" stroke-linecap="round"><path d="M42 36C8 36 6 92 48 100"/><path d="M158 36C192 36 194 92 152 100"/></g><path class="is-gleam" d="M60 34C58 72 66 100 82 120" fill="none" stroke-width="7" stroke-linecap="round"/></svg>`;
const MARKS: Record<string, string> = { star: STAR_MARK, hitman: CUP_MARK };

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
          <i class="st-card-grain" aria-hidden="true"></i>${MARKS[tier] ? `<i class="st-card-mark" aria-hidden="true">${MARKS[tier]}</i>` : ''}<i class="st-card-sheen" aria-hidden="true"></i>
          <div class="st-card-top"><img class="st-card-logo" src="${TITLE}" alt="" decoding="async"><span class="st-card-tier">${escape(facts.tier.name)}</span></div>
          <div class="st-card-who">${face}<span class="st-card-name"><b>${escape(who?.name ?? 'Guest')}</b><small>${escape(facts.modeName.toUpperCase())} &middot; CAREER</small></span>${edit}</div>
          <div class="st-card-figure"><b>${measure}</b><span>${unit}</span></div>
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
