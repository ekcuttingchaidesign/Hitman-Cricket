import { surviveGoal } from '../game/chase';
import type { BlastCareer, CareerMode, MarathonCareer, SurviveCareer } from '../game/career';
import { emptyBlast, emptyMarathon, emptySurvive } from '../game/career';
import { statsExplain, statsFacts, type StatsFacts } from '../game/StatsCard';
import { measureName } from '../game/tier';
import type { ProfilePayload } from '../game/profile-api';
import { cta, icon, tierBadge } from './Kit';
import { escape, kitMarkup } from './Leaderboard';
import { TILES } from './StatsSheet';

/**
 * Another player's profile (the handover's section 14, lane A): the sheet that
 * rises over a board when a named row is tapped.
 *
 * Stats only, and the face is the hero: no card round it, the top half of the
 * sheet in the metal of their rung — matte navy, brushed bronze, graphite with
 * the Star card's star, black and gold with the Hitman rings, the Dukes red of
 * the Test Marathon's EMERGING — lit by a soft spotlight in the rung's own
 * colour and melting into the dark where the figures start. Under the face:
 * the rung and what is left to the next, their line about themselves, three
 * figures at a glance, a switch between the modes, the mode's six, and CHASE.
 *
 * Everything the row already knew — the name, the kit, the place, the best —
 * is drawn at once (`PlayerSeed`), so the sheet is never empty while the rest
 * is asked for, and CHASE works off the row even when the store cannot be
 * reached. HTML from figures, as the rest of the interface is written.
 */

/** What the row that was tapped already knows. */
export interface PlayerSeed {
  handle: string;
  name: string;
  avatar: number | null;
  /** The mode of the board it was on. */
  mode: CareerMode;
  /** Its place on that board, when the board was an innings board. */
  place: number | null;
  /** Their best innings in that mode, off an innings board: what CHASE aims at before the profile arrives. */
  best: number | null;
}

export interface PlayerSheetView {
  seed: PlayerSeed;
  /** The mode on show. */
  mode: CareerMode;
  /** The modes the switch offers, in its order. */
  modes: readonly CareerMode[];
  state: 'loading' | 'ready' | 'offline';
  profile: ProfilePayload | null;
}

/** The switch's words, and what the figures call each mode's board. */
const SHORT: Record<CareerMode, string> = { classic: 'Blast', marathon: 'Marathon', survive: 'Survival', super10: 'Super10' };
const BOARD_NAME: Record<CareerMode, string> = { classic: 'The Blast', marathon: 'Marathon team', survive: 'Test Survival', super10: 'Super10' };
const IN_MODE: Record<CareerMode, string> = { classic: 'the Blast', marathon: 'the Test Marathon', survive: 'Test Survival', super10: 'Super10' };
const DOT: Record<CareerMode, string> = { classic: '#3f88f2', marathon: '#1f8a55', survive: '#ff5a4e', super10: '#8b5cf6' };

const STAR = new URL('../assets/kit/card-star.svg', import.meta.url).href;

const grouped = (n: number) => n.toLocaleString('en-US');

/** What CHASE aims at in a mode: the best on the profile, or the row's before it has come. */
export function chaseTarget(view: Pick<PlayerSheetView, 'seed' | 'mode' | 'state' | 'profile'>): number | null {
  if (view.state === 'ready' && view.profile) {
    const best = view.profile.modes[view.mode].best;
    // Survival chases a result, which only the profile carries.
    return best && (view.mode !== 'survive' || best.result) ? best.runs : null;
  }
  return view.seed.mode === view.mode && view.mode !== 'survive' ? view.seed.best : null;
}

/** The key: CHASE KABIR’S 187, or in Survival what beating their result asks — OUTLAST KABIR. */
function keyLabel(view: PlayerSheetView, target: number): { label: string; short: string } {
  const result = view.mode === 'survive' ? view.profile?.modes.survive.best?.result : null;
  const name = view.profile?.name ?? view.seed.name;
  if (result) {
    const goal = surviveGoal(name, result);
    return { label: goal.key, short: goal.short };
  }
  return { label: chaseLabel(name, target), short: chaseShort(target) };
}

/** The key's words: CHASE KABIR’S 187. */
/** The same without the name, which stands big over it: CHASE THEIR 187. */
export function chaseShort(target: number): string {
  return `CHASE THEIR ${grouped(target)}`;
}

export function chaseLabel(name: string, target: number): string {
  return `CHASE ${name.toUpperCase()}’S ${grouped(target)}`;
}

export function playerSheetMarkup(view: PlayerSheetView): string {
  const target = chaseTarget(view);
  return `<div class="lb-scrim ps-scrim" data-close></div>
    <section id="player-sheet" class="ps-sheet ${stageClass(view)} is-${view.mode} is-${view.state}" role="dialog" aria-modal="true" aria-labelledby="player-name">
      ${playerStageMarkup(view)}
      <div class="ps-scroll">
        ${heroMarkup(view)}
        ${view.modes.length > 1 ? switchMarkup(view) : ''}
        <div id="player-body" class="ps-body">${bodyMarkup(view)}</div>
        ${soloLinkMarkup(view)}
      </div>
      <div class="ps-foot">${target !== null ? cta({ kind: 'primary', ...keyLabel(view, target), id: 'player-chase', wide: true, moving: true }) : ''}</div>
    </section>`;
}

/** The rung's ground behind the face: its material, its light, and its mark. */
export function playerStageMarkup(view: PlayerSheetView): string {
  return `${groundMarkup(tierOf(view))}
      <i class="lb-grab ps-grab" aria-hidden="true"></i>
      <button id="player-close" type="button" class="k-icon-button ps-close" aria-label="Close">${icon('close')}</button>`;
}

/**
 * A rung's ground: its material, its light and its mark, melting into the dark.
 * The colours are the rung's, set on whatever holds it (`.ps-sheet` here, a
 * stage of My profile there) by its `tier-` and mode classes.
 */
export function groundMarkup(tier: string): string {
  const art = tier === 'star' ? `<img class="ps-star" src="${STAR}" alt="" aria-hidden="true">`
    : tier === 'hitman' ? '<i class="ps-rings" aria-hidden="true"></i>'
    : tier === 'emerging' ? '<i class="ps-brush" aria-hidden="true"></i>' : '';
  return `<div class="ps-stage" aria-hidden="true"><i class="ps-ground"></i>${art}<i class="ps-light"></i><i class="ps-sheen"></i><i class="ps-melt"></i></div>`;
}

/** The career of the mode on show, as the stats card reads it, or null before the profile is in. */
function factsOf(view: Pick<PlayerSheetView, 'seed' | 'mode' | 'state' | 'profile'>): StatsFacts | null {
  if (view.state !== 'ready' || !view.profile) return null;
  const shown = view.profile.modes[view.mode];
  const career = shown.career ?? (view.mode === 'survive' ? emptySurvive() : view.mode === 'marathon' ? emptyMarathon() : emptyBlast());
  return statsFacts(view.mode, career as BlastCareer & SurviveCareer & MarathonCareer,
    { name: view.profile.name, avatar: view.profile.avatar, granted: shown.granted }, null);
}

function tierOf(view: PlayerSheetView): string {
  return factsOf(view)?.tier.key ?? 'none';
}

/** The class that sets the ground: the rung, and the Marathon's own for EMERGING. */
function stageClass(view: PlayerSheetView): string {
  return `tier-${tierOf(view)}`;
}

/** The rung's name on the pill: the Marathon's carry TEST. */
export function rungName(mode: CareerMode, facts: StatsFacts): string {
  return mode === 'marathon' ? `TEST ${facts.tier.short.toUpperCase()}` : facts.tier.name;
}

/** What is left to the next rung, in the mode's own figure. */
export function rungLine(mode: CareerMode, facts: StatsFacts): string {
  if (facts.ladder.granted) return facts.ladder.granted.reason;
  const { next, toNext } = facts.ladder;
  if (!next || toNext === null) return 'Top of the game';
  return `${grouped(toNext)} ${measureName(mode)} to ${mode === 'marathon' ? 'Test ' : ''}${next.short}`;
}

function heroMarkup(view: PlayerSheetView): string {
  const facts = factsOf(view);
  const profile = view.state === 'ready' ? view.profile : null;
  const name = profile?.name ?? view.seed.name;
  const avatar = profile?.avatar ?? view.seed.avatar;
  const badge = facts ? `<span class="ps-badge">${tierBadge(facts.tier.key, true, facts.tier.name)}</span>` : '';
  const face = `<span class="ps-face" data-handle="${escape(view.seed.handle)}">${avatar === null ? '<span class="board-kit is-empty" aria-hidden="true"></span>' : kitMarkup(avatar, name)}${badge}</span>`;
  const rung = facts
    ? `<p class="ps-rung"><span class="ps-pill">${escape(rungName(view.mode, facts))}</span><span>${escape(rungLine(view.mode, facts))}</span></p>`
    : view.state === 'loading' ? '<p class="ps-rung"><i class="lb-bone ps-bone is-pill"></i></p>' : '';
  const bio = profile?.bio ? `<p class="ps-bio">“${escape(profile.bio)}”</p>`
    : view.state === 'loading' ? '<p class="ps-bio"><i class="lb-bone ps-bone is-bio"></i></p>' : '';
  return `<header class="ps-hero">
          ${face}
          <h2 id="player-name" class="ps-name">${escape(name)}</h2>
          ${rung}${bio}
          ${glanceMarkup(view, facts)}
        </header>`;
}

/** The three figures at a glance: the career's measure, the place on the mode's board, and the best rank. */
function glanceMarkup(view: PlayerSheetView, facts: StatsFacts | null): string {
  const seedHere = view.seed.mode === view.mode;
  const place = (n: number | null | undefined) => (n ? `#${n}` : '—');
  const one = (value: string, label: string, tone = '') => `<div class="ps-glance-one${tone}"><b>${escape(value)}</b><span>${escape(label)}</span></div>`;
  if (view.state === 'ready' && view.profile && facts) {
    const shown = view.profile.modes[view.mode];
    return `<div class="ps-glance">${[
      one(grouped(facts.ladder.measure), view.mode === 'survive' ? 'balls faced' : 'career runs'),
      one(place(shown.best?.place), BOARD_NAME[view.mode], shown.best ? ' is-place' : ''),
      one(place(shown.bestRank), 'best rank'),
    ].join('')}</div>`;
  }
  if (view.state === 'offline') {
    return `<div class="ps-glance">${[
      one(seedHere && view.seed.best !== null ? grouped(view.seed.best) : '—', 'best innings'),
      one(place(seedHere ? view.seed.place : null), BOARD_NAME[view.mode], seedHere && view.seed.place ? ' is-place' : ''),
      one('—', 'best rank'),
    ].join('')}</div>`;
  }
  const bone = '<div class="ps-glance-one"><i class="lb-bone ps-bone is-figure"></i></div>';
  return `<div class="ps-glance">${bone}${seedHere && view.seed.place
    ? one(`#${view.seed.place}`, BOARD_NAME[view.mode], ' is-place') : bone}${bone}</div>`;
}

function switchMarkup(view: PlayerSheetView): string {
  return `<div class="ps-switch" role="tablist" aria-label="Which mode">${view.modes.map(mode => `
          <button type="button" class="ps-tab${mode === view.mode ? ' is-on' : ''}" role="tab" aria-selected="${mode === view.mode}" data-mode="${mode}" style="--dot:${DOT[mode]}">
            <i aria-hidden="true"></i><span>${SHORT[mode]}</span></button>`).join('')}
        </div>`;
}

/** The mode's six, the empty mode, the six still coming, or the store out of reach. */
export function bodyMarkup(view: PlayerSheetView): string {
  if (view.state === 'offline') {
    return `<div class="ps-message is-offline" role="status"><span class="ps-message-icon" aria-hidden="true">${icon('alert')}</span>
          <h3>Couldn’t load ${escape(view.seed.name)}’s figures</h3>
          <p>Check your connection.${chaseTarget(view) !== null ? ' The chase still works: its target came from the board.' : ''}</p>
          <button id="player-retry" type="button" class="k-cta k-cta--secondary ps-retry"><span class="k-cta-face"><span>RETRY</span></span></button></div>`;
  }
  const facts = factsOf(view);
  if (view.state === 'ready' && view.profile && facts && !facts.played && !view.profile.modes[view.mode].best) {
    return `<div class="ps-message" role="status"><span class="ps-message-icon" aria-hidden="true">${icon('scan')}</span>
          <h3>No ${SHORT[view.mode]} innings yet</h3>
          <p>${escape(view.profile.name)} hasn’t batted in ${IN_MODE[view.mode]}. Nothing to chase in this mode.</p></div>`;
  }
  const labels = TILES[view.mode] ?? TILES.classic;
  const target = view.mode === 'survive' ? null : 'Highest';
  if (!facts || !view.profile) {
    const seedBest = view.seed.mode === view.mode ? view.seed.best : null;
    return `<div class="ps-tiles">${labels.map((label, i) => label === target && seedBest !== null
      ? tileMarkup(grouped(seedBest), label, true, i)
      : `<div class="ps-tile is-bone" style="--i:${i}"><i class="lb-bone ps-bone is-tile"></i><i class="lb-bone ps-bone is-label"></i></div>`).join('')}</div>`;
  }
  const shown = view.profile.modes[view.mode];
  const known = new Map([...facts.hero, ...facts.figures].map(one => [one.label, one.value] as const));
  const value = (label: string): string => {
    if (label === 'Innings') return grouped(facts.innings);
    if (label === 'Best rank') return shown.bestRank ? `#${shown.bestRank}` : '—';
    if (label === target && shown.best) return grouped(shown.best.runs);
    const got = known.get(label);
    if (got === undefined || (!facts.played && (label === 'Highest' || label === 'Best ind.'))) return '—';
    return typeof got === 'number' ? grouped(got) : String(got);
  };
  return `<div class="ps-tiles">${labels.map((label, i) =>
    tileMarkup(value(label), label, label === target && !!shown.best, i, label === 'Best rank' && !!shown.bestRank)).join('')}</div>`;
}

function tileMarkup(value: string, label: string, target: boolean, i: number, rank = false): string {
  const said = statsExplain(label);
  const tag = said ? 'button' : 'div';
  const classes = ['ps-tile', target ? 'is-target' : '', rank ? 'is-rank' : ''].filter(Boolean).join(' ');
  return `<${tag} class="${classes}" style="--i:${i}"${said ? ` type="button" data-stat="${escape(label)}"` : ''}>
          ${target ? `<i class="ps-aim" aria-label="What a chase aims at">${AIM}</i>` : ''}<b>${escape(value)}</b><span>${escape(label)}</span></${tag}>`;
}

/** The Test Marathon's second target, under its six: their best by one batter. */
export function soloOf(view: Pick<PlayerSheetView, 'mode' | 'state' | 'profile'>): { runs: number; out: boolean } | null {
  return view.mode === 'marathon' && view.state === 'ready' ? view.profile?.modes.marathon.solo ?? null : null;
}
function soloLinkMarkup(view: PlayerSheetView): string {
  const solo = soloOf(view);
  if (!solo) return '';
  return `<button id="player-chase-solo" type="button" class="ps-alt">or chase the best batter, ${grouped(solo.runs)}${solo.out ? '' : '*'}</button>`;
}

/** The crosshair on the figure a chase aims at. */
const AIM = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1.6" fill="currentColor"/><path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

/**
 * The mode a profile opens on: the board's own, unless they have never batted
 * there — a Blast board's row opened on a player's empty Marathon would say
 * nothing — and then the first they have.
 */
export function playedMode(profile: ProfilePayload, view: Pick<PlayerSheetView, 'mode' | 'modes'>): CareerMode {
  const batted = (mode: CareerMode) => !!profile.modes[mode].best || (profile.modes[mode].career?.innings ?? 0) > 0;
  return batted(view.mode) ? view.mode : view.modes.find(batted) ?? view.mode;
}

/** Where the player being chased stands, for the intro: their place on the mode's board, and their rung. */
export function chaseStanding(view: PlayerSheetView): { theirPlace: number | null; theirRung: string | null } {
  const facts = factsOf(view);
  const place = view.state === 'ready' && view.profile ? view.profile.modes[view.mode].best?.place ?? null
    : view.seed.mode === view.mode ? view.seed.place : null;
  return { theirPlace: place, theirRung: facts ? (view.mode === 'marathon' ? `Test ${facts.tier.short}` : facts.tier.short) : null };
}
