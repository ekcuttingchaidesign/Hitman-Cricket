import { keyCardMarkup, type KeyView } from './CareerKey';
import { passwordCardMarkup } from './Password';
import { restoreLinkMarkup } from './Restore';
import { escape, kitMarkup } from './Leaderboard';
import { statsExplain, type StatsFacts } from '../game/StatsCard';
import { measureName } from '../game/tier';
import { super10ArtSvg } from '../game/super10-card-art';
import { recordMarkup, type RivalsRecord } from './Record';
import { cta, icon, roadToHitman, tierBadge } from './Kit';
import { groundMarkup, rungLine, rungName } from './PlayerSheet';
import { activityMarkup } from './Activity';
import type { OwnActivity } from '../game/profile-api';

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
  /** Their place on this mode's innings board, as the store last said. */
  place?: number | null;
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
  /**
   * The Set a password card, above Road to Hitman on every card of the rail,
   * for a named player with none: the career's runs, every mode added up.
   */
  password?: { runs: number } | null;
  /** What their profile has collected — views, who chased and passed them, their bio — once the store has said. */
  activity?: OwnActivity | null;
}

/** The switch's words, shorter than the modes' names: the switch is narrow. */
const SHORT: Record<string, string> = { classic: 'Blast', survive: 'Survival', marathon: 'Marathon', super10: 'Super10' };

const TITLE = new URL('../assets/title.webp', import.meta.url).href;
/** Super10's card carries its own mark (Figma section 22). */
const SUPER10_MARK = new URL('../assets/super10/logo.svg', import.meta.url).href;

/** The Star card's one big star, top right and turned (Figma 152:18122). */
const STAR = new URL('../assets/kit/card-star.svg', import.meta.url).href;
/** The Hitman card's batsman, in gold line, behind the figures (Figma 154:18404). */
const BATSMAN = new URL('../assets/kit/card-batsman.svg', import.meta.url).href;

const PENCIL = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="1.8"/></svg>`;

export function statsSheetMarkup(view: StatsSheetView): string {
  const { cards, at = 0, where = 'page' } = view;
  const many = cards.length > 1;
  const played = cards.some(card => card.facts.played);
  const who = view.who ?? null;
  const bio = view.activity?.bio ?? null;
  return `
    <div class="stats-sheet-inner st-page mp-page is-${where}" role="document">
      <div class="mp-stages" aria-hidden="true">${cards.map((card, i) => stageMarkup(card, i, i === at)).join('')}</div>
      <header class="st-head">${where === 'page' ? `
        <button id="stats-back" class="k-icon-button" type="button" aria-label="Back">${icon('arrow-left')}</button>` : ''}
        <h2 class="st-title">MY PROFILE</h2>
        ${who ? `<button id="stats-edit" class="k-icon-button st-edit" type="button" aria-label="Edit your name, kit, batting hand and bio">${PENCIL}</button>` : ''}
      </header>
      <div class="mp-heroes">${cards.map((card, i) => heroMarkup(card, who, bio, i, i === at)).join('')}</div>
      <div id="mp-activity" class="mp-activity">${who ? activityMarkup(view.activity ?? null) : ''}</div>
      ${many ? switchMarkup(cards, at) : ''}
      <div id="stats-rail" class="stats-stage${many ? ' is-rail' : ''}"${many ? ' role="group" aria-label="Your careers, one a mode"' : ''}>${
  cards.map((card, i) => slideMarkup(card, i === 0, i === at, view.password ?? null)).join('')}</div>
      ${view.rivals && view.rivals.won + view.rivals.lost + view.rivals.drawn > 0 ? recordMarkup(view.rivals, 'RIVALS RECORD', 'is-stats') : ''}
      ${view.careerKey ? keyCardMarkup(view.careerKey) : ''}
      ${view.offerRestore ? `<p class="stats-note">Played before? ${restoreLinkMarkup('stats-restore', 'Bring your record back')}</p>` : ''}
      <p id="stats-status" class="stats-status hidden" role="status" aria-live="polite"></p>
      <div id="stats-toast" class="stats-toast" role="status" aria-live="polite"></div>
      <div class="st-foot">${played
        ? cta({ kind: 'share-wide', label: 'SHARE MY CARD', id: 'stats-brag' })
        : cta({ kind: 'primary', label: 'PLAY YOUR FIRST INNINGS', id: 'stats-play', wide: true })}</div>
    </div>`;
}

/** The rung's ground behind the page, one a mode; the one in front shows, and the others wait to crossfade in. */
function stageMarkup(card: StatsSlide, i: number, on: boolean): string {
  const { facts } = card;
  return `<div class="mp-stage tier-${escape(facts.tier.key)} is-${escape(facts.mode)}${on ? ' is-on' : ''}" data-slide="${i}">${groundMarkup(facts.tier.key)}</div>`;
}

/**
 * The hero, one a mode: their face free on the rung's ground with its badge,
 * the name, the rung and what is left to the next, their line about
 * themselves — or the way to write one — and three figures at a glance.
 */
function heroMarkup(card: StatsSlide, who: { name: string; avatar: number } | null, bio: string | null, i: number, on: boolean): string {
  const { facts } = card;
  const face = who ? kitMarkup(who.avatar, who.name) : '<span class="board-kit is-empty" aria-hidden="true"></span>';
  const line = bio ? `<p class="ps-bio">“${escape(bio)}”</p>`
    : who ? `<button type="button" class="mp-bio-add" data-bio-add><span aria-hidden="true">+</span><span>Add a line about you</span></button>` : '';
  const place = (n: number | null | undefined) => (n ? `#${n}` : '—');
  const glance = (value: string, label: string, tone = '') => `<div class="ps-glance-one${tone}"><b>${escape(value)}</b><span>${escape(label)}</span></div>`;
  return `<header class="ps-hero mp-hero tier-${escape(facts.tier.key)} is-${escape(facts.mode)}${on ? ' is-on' : ''}" data-slide="${i}"${on ? '' : ' aria-hidden="true"'}>
        <span class="ps-face">${face}<span class="ps-badge">${tierBadge(facts.tier.key, true, facts.tier.name)}</span></span>
        <h3 class="ps-name">${escape(who?.name ?? 'Guest')}</h3>
        <p class="ps-rung"><span class="ps-pill">${escape(rungName(facts.mode, facts))}</span><span>${escape(rungLine(facts.mode, facts))}</span></p>
        ${line}
        <div class="ps-glance">
          ${glance(facts.ladder.measure.toLocaleString('en-US'), facts.mode === 'survive' ? 'balls faced' : `career ${measureName(facts.mode)}`)}
          ${glance(place(card.place), BOARD_NAME[facts.mode] ?? facts.modeName, card.place ? ' is-place' : '')}
          ${glance(place(card.rank), 'best rank')}
        </div>
      </header>`;
}

/** What the glance calls each mode's board. */
const BOARD_NAME: Record<string, string> = { classic: 'The Blast', marathon: 'Marathon team', survive: 'Test Survival', super10: 'Super10' };

/**
 * The mode switch as quiet tabs: the rung's badge and the mode's name, the
 * one picked underlined in its colour. No figures: the hero and the six under
 * it carry them, and a big one only crowded a tab. They keep the old dots'
 * class and slide numbers, so the rail answers them as it always did.
 */
function switchMarkup(cards: StatsSlide[], at: number): string {
  return `<div class="st-switch stats-dots mp-modes" role="tablist" aria-label="Which mode">${cards.map((card, i) => {
    const { facts } = card;
    return `
          <button class="stats-dot mp-mode${i === at ? ' is-on' : ''}" type="button" role="tab" data-slide="${i}" aria-selected="${i === at}"
            aria-label="${escape(facts.modeName)}" style="--dot:${DOT[facts.mode] ?? DOT.classic}">
            <span class="mp-mode-name">${tierBadge(facts.tier.key, true, facts.tier.name)}${escape((SHORT[facts.mode] ?? facts.modeName).toUpperCase())}</span>
          </button>`;
  }).join('')}
        </div>`;
}

const DOT: Record<string, string> = { classic: '#3f88f2', marathon: '#1f8a55', survive: '#ff5a4e', super10: '#8b5cf6' };

/** One mode: the password card where it is asked for, the road to the next tier, and six figures. */
function slideMarkup(card: StatsSlide, first: boolean, live: boolean, password: { runs: number } | null): string {
  const { facts } = card;
  return `
      <div class="stats-slide" data-mode="${escape(facts.mode)}" role="group" aria-label="${escape(facts.modeName)}"${live ? ' data-live="1"' : ''}>
        ${password ? passwordCardMarkup({ place: 'stats', runs: password.runs, first }) : ''}
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
  // Behind the words: the star or the gold batsman on the top two rungs; Super10's its own shapes (`SUPER10_CARD_ART`).
  const s10 = facts.mode === 'super10';
  const rim = tier === 'hitman' ? '<i class="st-card-rim" aria-hidden="true"></i>' : '';
  const art = s10 ? `${super10ArtSvg(tier)}${rim}`
    : tier === 'star' ? `<img class="st-card-star" src="${STAR}" alt="" aria-hidden="true">`
      : tier === 'hitman' ? `<img class="st-card-batsman" src="${BATSMAN}" alt="" aria-hidden="true">${rim}` : '';
  return `<article class="st-card tier-${escape(tier)} is-${escape(facts.mode)}" aria-label="${escape(`${who?.name ?? 'Guest'}, ${facts.tier.name}, ${facts.modeName}: ${measure} ${unit}`)}">
          <i class="st-card-grain" aria-hidden="true"></i>${art}<i class="st-card-sheen" aria-hidden="true"></i>
          <div class="st-card-top"><img class="st-card-logo" src="${s10 ? SUPER10_MARK : TITLE}" alt="" decoding="async"><span class="st-card-tier">${escape(facts.tier.name)}</span></div>
          <div class="st-card-who">${face}<span class="st-card-name"><b>${escape(who?.name ?? 'Guest')}</b><small>${escape(facts.modeName.toUpperCase())} &middot; CAREER</small></span>${edit}</div>
          <div class="st-card-foot"><div class="st-card-figure"><b>${measure}</b><span>${unit}</span></div>${tier === 'star' || tier === 'hitman' ? progressMarkup(facts) : ''}</div>
        </article>`;
}

/** Which six figures each mode puts under its card, in the drawing's order. */
export const TILES: Record<string, readonly string[]> = {
  classic: ['Innings', 'Sixes', 'Highest', 'Fours', 'Balls', 'Best rank'],
  survive: ['Innings', 'Survived', 'Won', 'Runs', 'Blows', 'Best rank'],
  marathon: ['Innings', 'Highest', 'Best ind.', 'Hundreds', 'Fifties', 'Best rank'],
  super10: ['Innings', 'Highest', 'Sixes', '100+ totals', '200+ totals', 'Best rank'],
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

/** The line to the next rung under the figure, as the Star and Hitman cards draw it; full at the top. */
function progressMarkup(facts: StatsFacts): string {
  const { progress, toNext, next } = facts.ladder;
  if (!next || toNext === null) {
    return `<div class="st-card-progress"><span class="st-card-track"><i style="width:100%"></i></span><small>${facts.mode === 'super10' ? 'Top of Super10' : 'Top of the game'}</small></div>`;
  }
  return `<div class="st-card-progress"><span class="st-card-track"><i style="width:${Math.round(progress * 100)}%"></i></span>
          <small>${toNext.toLocaleString('en-US')} ${measureName(facts.mode)} to ${escape(next.short)}</small></div>`;
}
