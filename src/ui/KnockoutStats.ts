/**
 * Super Knockout on My profile (Figma Battle Royale page, section 42, S1 and
 * S2): one more tab on the page's rail, in Knockout red, with points and wins
 * and no tiers. The hero says the matches played and three figures at a
 * glance; under the tabs a card for the week (the points, how far the place
 * above is, the last five finishes) and six figures.
 *
 * It rides the rail the careers ride: its stage, hero, tab and slide carry
 * the next `data-slide` after the careers', and the same classes, so the
 * rail's wiring moves it as it moves them. What it says is `knockoutStats`, a
 * function of the store's answer (`knockoutStanding`), held in
 * `tests/knockout-stats.test.ts`.
 */
import type { KnockoutCareer, KnockoutStanding } from '../server/knockout-ledger';
import { ordinal } from '../game/knockout-points';
import { escape, kitMarkup } from './Leaderboard';
import hero from '../assets/knockout/hero.webp';

/** What the tab is drawn from: the player's standing as the store last said, and what a match needs before it pays. */
export interface KnockoutSlide {
  standing: KnockoutStanding | null;
  pointsFrom: number;
}

export interface KnockoutStatsView {
  played: number;
  /** Under the name, beside the pill. */
  matches: string;
  glance: [{ value: string; label: string; place?: boolean }, { value: string; label: string; place?: boolean }, { value: string; label: string; place?: boolean }];
  /** The week card's line: the points and the place above, or how the first points come. */
  week: string;
  /** The last five finishes, oldest first, padded to five with nothing. */
  five: { word: string; top: boolean; ran: boolean }[];
  tiles: { label: string; value: string; tone?: 'gold' | 'rank' }[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** The best place this player holds on any Knockout ladder. */
export function knockoutBestRank(places: KnockoutStanding['places'] | null | undefined): number | null {
  if (!places) return null;
  const held = [places.points.week, places.points.all, places.wins.week, places.wins.all, places.best, places.rate].filter((n): n is number => n !== null);
  return held.length ? Math.min(...held) : null;
}

export function knockoutStats(slide: KnockoutSlide): KnockoutStatsView {
  const career: KnockoutCareer | null = slide.standing?.career ?? null;
  const places = slide.standing?.places ?? null;
  const played = career?.played ?? 0;
  const week = places?.points.week ?? null, behind = slide.standing?.behind ?? null;
  const rank = knockoutBestRank(places);
  const five = (career?.last ?? []).slice(-5).map(place => ({ word: place > 0 ? ordinal(place) : 'Ran', top: place > 0 && place <= 3, ran: place <= 0 }));
  while (five.length < 5) five.push({ word: '–', top: false, ran: false });
  const weekLine = !played ? `Finish top 3 in a match of ${slide.pointsFrom} or more real players for your first points.`
    : !career!.weekPlayed ? 'No match yet this week'
    : `${plural(career!.weekPoints, 'point')}${week && week > 1 && behind !== null ? (behind > 0 ? ` · ${behind} behind #${week - 1}` : ` · level with #${week - 1}`) : week === 1 ? ' · top of the week' : ''}`;
  return {
    played,
    matches: played ? `${plural(played, 'match', 'matches')} played` : 'Not played yet',
    glance: [
      { value: String(career?.weekPoints ?? 0), label: 'points this week' },
      { value: week ? `#${week}` : '—', label: 'this week', place: !!week },
      { value: String(career?.wins ?? 0), label: career?.wins === 1 ? 'win' : 'wins' },
    ],
    week: weekLine,
    five,
    tiles: [
      { label: 'Matches', value: played.toLocaleString('en-US') },
      { label: 'Wins', value: String(career?.wins ?? 0), tone: 'gold' },
      { label: 'Top 3', value: String(career?.top3 ?? 0) },
      { label: 'Highest total', value: career?.best ? String(career.best) : '—' },
      { label: 'Average finish', value: played ? ordinal(Math.round(career!.places / played)) : '—' },
      { label: 'Best rank', value: rank ? `#${rank}` : '—', tone: rank ? 'rank' : undefined },
    ],
  };
}

/** The ground behind the page while the tab is in front: the knockout's picture under its red, melting into the page. */
export function knockoutStageMarkup(i: number, on: boolean): string {
  return `<div class="mp-stage is-knockout${on ? ' is-on' : ''}" data-slide="${i}"><div class="ps-stage" aria-hidden="true">
        <i class="ps-ground"></i><img class="ko-stats-art" src="${hero}" alt="" decoding="async"><i class="ps-light"></i><i class="ps-melt"></i></div></div>`;
}

/** The hero: the face, the name, SUPER KNOCKOUT and the matches played, the line about them, and three figures. */
export function knockoutHeroMarkup(slide: KnockoutSlide, who: { name: string; avatar: number } | null, bio: string | null, i: number, on: boolean): string {
  const view = knockoutStats(slide);
  const face = who ? kitMarkup(who.avatar, who.name) : '<span class="board-kit is-empty" aria-hidden="true"></span>';
  const line = bio ? `<p class="ps-bio">“${escape(bio)}”</p>`
    : who ? `<button type="button" class="mp-bio-add" data-bio-add><span aria-hidden="true">+</span><span>Add a line about you</span></button>` : '';
  return `<header class="ps-hero mp-hero is-knockout${on ? ' is-on' : ''}" data-slide="${i}"${on ? '' : ' aria-hidden="true"'}>
        <span class="ps-face">${face}</span>
        <h3 class="ps-name">${escape(who?.name ?? 'Guest')}</h3>
        <p class="ps-rung"><span class="ps-pill">SUPER KNOCKOUT</span><span>${escape(view.matches)}</span></p>
        ${line}
        <div class="ps-glance">${view.glance.map(one =>
    `<div class="ps-glance-one${one.place ? ' is-place' : ''}"><b>${escape(one.value)}</b><span>${escape(one.label)}</span></div>`).join('')}</div>
      </header>`;
}

/** Its tab on the switch: a red dot where the careers carry their rung's badge. */
export function knockoutTabMarkup(i: number, on: boolean): string {
  return `
          <button class="stats-dot mp-mode is-knockout${on ? ' is-on' : ''}" type="button" role="tab" data-slide="${i}" aria-selected="${on}" aria-label="Super Knockout" style="--dot:#ee2a2a">
            <span class="mp-mode-name"><i class="ko-tab-dot" aria-hidden="true"></i>KNOCKOUT</span>
          </button>`;
}

/** Its slide on the rail: the week, the last five, and six figures. */
export function knockoutSlideMarkup(slide: KnockoutSlide, live: boolean): string {
  const view = knockoutStats(slide);
  return `
      <div class="stats-slide is-knockout" data-mode="knockout" role="group" aria-label="Super Knockout"${live ? ' data-live="1"' : ''}>
        <section class="ko-week" aria-label="This week">
          <p class="ko-week-top"><i>THIS WEEK</i><small>Resets Monday</small></p>
          <b class="ko-week-line">${escape(view.week)}</b>
          <i class="ko-week-label">LAST FIVE</i>
          <ol class="ko-five" aria-label="Your last five finishes, oldest first">${view.five.map(one =>
    `<li class="${one.top ? 'is-top' : one.ran ? 'is-ran' : one.word === '–' ? 'is-none' : ''}">${escape(one.word)}</li>`).join('')}</ol>
        </section>
        <div class="st-tiles">${view.tiles.map(tile =>
    `<div class="st-tile${tile.tone === 'rank' ? ' is-rank' : tile.tone === 'gold' ? ' is-gold' : ''}"><b>${escape(tile.value)}</b><span>${escape(tile.label)}</span></div>`).join('')}</div>
      </div>`;
}
