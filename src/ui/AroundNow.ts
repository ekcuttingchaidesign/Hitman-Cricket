import type { LivePlayer } from '../game/live-api';
import { icon } from './Kit';
import { escape, kitMarkup } from './Leaderboard';
import { liveLine } from './LiveMarks';

/**
 * Who is around, on Rival Matches (Figma section 23, A4 and A5): a card at the
 * top with the faces of those batting and then those online, your rivals
 * first, and See all, which opens the whole list as a sheet. A face or a row
 * opens that player's profile, where CHALLENGE is.
 *
 * Drawn from the live list (`live-api.ts`) less the player themselves; the
 * faces take their marks from `LiveMarks.ts` like every other face.
 */

export type AroundFilter = 'everyone' | 'rivals';
/** How many faces the card shows before "+N". */
export const AROUND_FACES = 5;

/** The list as the screen orders it: batting first, then online, your rivals first within each. */
export function aroundOrder(players: readonly LivePlayer[], rivals: ReadonlySet<string>, own: string | null): LivePlayer[] {
  const rank = (p: LivePlayer) => (p.state === 'batting' ? 0 : 2) + (rivals.has(p.handle) ? 0 : 1);
  return players.filter(p => p.handle !== own).map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(({ p }) => p);
}

function countLine(players: readonly LivePlayer[]): string {
  const playing = players.filter(p => p.state === 'batting').length;
  const online = players.length - playing;
  return [playing ? `${playing} playing` : '', online ? `${online} online` : ''].filter(Boolean).join(' · ');
}

function face(p: LivePlayer, extra = ''): string {
  return `<button type="button" class="ar-face${extra}" data-handle="${escape(p.handle)}" aria-label="${escape(`${p.name}, ${liveLine(p) ?? ''}`)}">${kitMarkup(p.avatar, p.name)}<span>${escape(p.name)}</span></button>`;
}

/** The card at the top of Rival Matches. */
export function aroundCardMarkup(players: readonly LivePlayer[]): string {
  if (!players.length) {
    return `<section class="ar-card is-empty" aria-label="Around now"><div class="ar-head"><span class="ar-title"><i class="ar-dot" aria-hidden="true"></i>AROUND NOW</span></div>
      <p class="ar-quiet">Nobody else is around right now. Anyone with a name can still be challenged: they get a day to answer.</p></section>`;
  }
  const shown = players.slice(0, AROUND_FACES);
  const more = players.length - shown.length;
  return `<section class="ar-card" aria-label="Around now">
      <div class="ar-head"><span class="ar-title"><i class="ar-dot" aria-hidden="true"></i>AROUND NOW<small>${escape(countLine(players))}</small></span>
        <button id="around-all" type="button" class="ar-all">See all ›</button></div>
      <div class="ar-faces">${shown.map(p => face(p)).join('')}${more > 0 ? `<button id="around-more" type="button" class="ar-face is-more" aria-label="See all ${players.length}"><span class="ar-more">+${more}</span><span>More</span></button>` : ''}</div>
    </section>`;
}

function rowMarkup(p: LivePlayer, rival: boolean): string {
  const line = [liveLine(p), rival ? 'your rival' : ''].filter(Boolean).join(' · ');
  return `<li class="ar-row is-${p.state}" data-handle="${escape(p.handle)}" role="button" tabindex="0" aria-label="${escape(`See ${p.name}’s profile`)}">
      ${kitMarkup(p.avatar, p.name)}
      <span class="ar-who"><b>${escape(p.name)}</b><small>${escape(line)}</small></span>
      <span class="ar-go" aria-hidden="true">›</span>
    </li>`;
}

/** The whole list, as a sheet over Rival Matches. */
export function aroundSheetMarkup(players: readonly LivePlayer[], rivals: ReadonlySet<string>, filter: AroundFilter): string {
  const shown = filter === 'rivals' ? players.filter(p => rivals.has(p.handle)) : players;
  const playing = shown.filter(p => p.state === 'batting'), online = shown.filter(p => p.state !== 'batting');
  const group = (title: string, list: LivePlayer[]) => list.length
    ? `<h3 class="ar-group">${title} · ${list.length}</h3><ul class="ar-list">${list.map(p => rowMarkup(p, rivals.has(p.handle))).join('')}</ul>` : '';
  const tab = (key: AroundFilter, label: string, n: number) =>
    `<button type="button" class="ar-tab${filter === key ? ' is-on' : ''}" data-around="${key}" aria-pressed="${filter === key}">${label} · ${n}</button>`;
  const rivalsHere = players.filter(p => rivals.has(p.handle)).length;
  const body = shown.length ? group('PLAYING NOW', playing) + group('ONLINE', online)
    : `<p class="ar-quiet">${filter === 'rivals' ? 'None of your rivals is around right now.' : 'Nobody else is around right now.'}</p>`;
  return `<i class="rv-grab" aria-hidden="true"></i>
    <div class="ar-sheet-head"><h2 id="around-title" class="mode-heading">Around now</h2>
      <button id="around-close" class="k-icon-button" type="button" aria-label="Close">${icon('close')}</button></div>
    <div class="ar-tabs" role="group" aria-label="Who to show">${tab('everyone', 'Everyone', players.length)}${tab('rivals', 'Your rivals', rivalsHere)}</div>
    <div class="ar-body">${body}</div>`;
}
