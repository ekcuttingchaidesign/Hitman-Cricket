import type { OwnActivity } from '../game/profile-api';
import { icon } from './Kit';
import { escape, kitMarkup } from './Leaderboard';

/**
 * What a player's own profile has collected (section 14, lane C): the
 * headline card on My profile — the one thing worth knowing, or a quiet line
 * when nothing was taken — and the Your profile sheet behind it, with every
 * event of the last thirty days and WIN IT BACK on what can be. Looking is
 * private and acting is public: a view is only ever a count.
 */

type Event = OwnActivity['events'][number];

const MODE: Record<Event['mode'], { word: string; colour: string }> = {
  classic: { word: 'BLAST', colour: '#3f88f2' },
  marathon: { word: 'MARATHON', colour: '#1f8a55' },
  survive: { word: 'SURVIVAL', colour: '#ff5a4e' },
};

const HOUR = 3_600_000, DAY = 24 * HOUR;

/** How long ago, as a sheet row says it: now, 5m, 1h, 3d. */
export function agoOf(at: number, now = Date.now()): string {
  const gap = Math.max(0, now - at);
  if (gap < 60_000) return 'now';
  if (gap < HOUR) return `${Math.floor(gap / 60_000)}m`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)}h`;
  return `${Math.floor(gap / DAY)}d`;
}

/** What one event says, in a line. */
export function eventTitle(event: Event): string {
  // A Survival chase is of a result: said the way beating that result was asked.
  if (event.result && event.kind === 'beat') {
    const theirs = event.result.theirs.kind;
    return theirs === 'won' ? `${event.name} won faster than you` : theirs === 'drawn' ? `${event.name} beat your draw` : `${event.name} outlasted you`;
  }
  if (event.result && event.kind === 'short') return `${event.name} chased your result`;
  if (event.kind === 'beat') return `${event.name} beat your ${event.target} with ${event.runs}`;
  if (event.kind === 'short') return `${event.name} chased your ${event.target}`;
  return `${event.name} passed you`;
}

/** The line under it: where it left you, or how it fell short. */
function eventSub(event: Event): string {
  if (event.result && event.kind === 'short') return 'Fell short';
  if (event.kind === 'short') return `Fell ${Math.max(1, event.target - event.runs)} short`;
  return event.place ? `You’re #${event.place} now` : 'Off your place';
}

/** Whether WIN IT BACK is offered: a beat or a pass not yet answered. */
export function winnable(event: Event): boolean {
  return (event.kind === 'beat' || event.kind === 'passed') && !event.wonBack;
}

/**
 * The one thing My profile leads with: the newest thing taken from the player
 * that they have not won back. Null when nothing was taken.
 */
export function headline(activity: OwnActivity): Event | null {
  return activity.events.find(winnable) ?? null;
}

/** The headline card or the quiet line, or nothing at all for a profile nobody has touched. */
export function activityMarkup(activity: OwnActivity | null, now = Date.now()): string {
  if (!activity) return '';
  const lead = headline(activity);
  const week = activity.events.filter(one => now - one.at < 7 * DAY);
  if (lead) {
    const more = week.filter(one => one !== lead).length;
    const verb = lead.kind === 'beat' ? (lead.result ? eventTitle(lead) : `${lead.name} beat your ${lead.target}`) : `${lead.name} passed you`;
    const sub = [lead.place ? `You’re #${lead.place} now` : null, more ? `and ${more} more this week` : null].filter(Boolean).join(' · ');
    return `<button id="mp-activity-open" type="button" class="mp-news is-taken" aria-haspopup="dialog">
        <span class="mp-news-face">${kitMarkup(lead.avatar, lead.name)}<i aria-hidden="true">${ARROW_UP}</i></span>
        <span class="mp-news-text"><b>${escape(verb)}</b><small>${escape(sub)}</small></span>
        <i class="mp-news-dot" aria-hidden="true"></i>${icon('chevron-right')}</button>`;
  }
  const chased = week.filter(one => one.kind === 'short').length;
  if (!activity.views && !week.length) return '';
  const faces = [...new Map(week.map(one => [one.handle, one])).values()].slice(0, 3);
  const said = [activity.views ? `${activity.views} looked at you` : null, chased ? `${chased} chased` : null].filter(Boolean).join(' · ');
  return `<button id="mp-activity-open" type="button" class="mp-news is-quiet" aria-haspopup="dialog">
      ${faces.length ? `<span class="mp-faces" aria-hidden="true">${faces.map(one => kitMarkup(one.avatar, one.name)).join('')}</span>` : `<span class="mp-eye" aria-hidden="true">${EYE}</span>`}
      <span class="mp-news-text"><b>${escape(said || 'Nobody yet')}</b><small>This week · nothing taken from you</small></span>${icon('chevron-right')}</button>`;
}

/** C4: the Your profile sheet. */
export function activitySheetMarkup(activity: OwnActivity, now = Date.now()): string {
  const groups: { title: string; events: Event[] }[] = [
    { title: 'TODAY', events: activity.events.filter(one => now - one.at < DAY) },
    { title: 'THIS WEEK', events: activity.events.filter(one => now - one.at >= DAY && now - one.at < 7 * DAY) },
    { title: 'EARLIER', events: activity.events.filter(one => now - one.at >= 7 * DAY) },
  ].filter(group => group.events.length);
  const rows = (events: Event[]) => events.map(event => {
    const at = activity.events.indexOf(event);
    const mode = MODE[event.mode];
    const end = winnable(event)
      ? `<button type="button" class="mp-win" data-event="${at}">WIN IT BACK</button>`
      : event.wonBack ? `<span class="mp-won">${icon('check')}You won it back</span>` : '';
    return `<li class="mp-row${event.wonBack ? ' is-won' : ''}">${kitMarkup(event.avatar, event.name)}
        <span class="mp-row-text"><b>${escape(eventTitle(event))}</b>
        <small><i class="mp-chip" style="--tone:${mode.colour}">${mode.word}</i>${escape(eventSub(event))} · ${agoOf(event.at, now)}</small></span>${end}</li>`;
  }).join('');
  return `<div class="lb-scrim" data-close></div>
    <section id="activity-sheet" class="lb-pick mp-sheet" role="dialog" aria-modal="true" aria-labelledby="activity-title">
      <i class="lb-grab" aria-hidden="true"></i>
      <header class="mp-sheet-head"><span class="mp-eye" aria-hidden="true">${EYE}</span><h3 id="activity-title" class="lb-pick-title">YOUR PROFILE</h3>
        <button id="activity-close" type="button" class="k-icon-button" aria-label="Close">${icon('close')}</button></header>
      <div class="mp-views"><span class="mp-eye" aria-hidden="true">${EYE}</span><b>${activity.views.toLocaleString('en-US')}</b>
        <span><span>view${activity.views === 1 ? '' : 's'} in the last 7 days</span><small>${icon('lock')}Who looked stays private</small></span></div>
      <div class="mp-rows">${groups.length ? groups.map(group => `<h4>${group.title}</h4><ul>${rows(group.events)}</ul>`).join('')
        : '<p class="mp-none">Nobody has chased or passed you yet. When they do, it lands here.</p>'}</div>
      ${activity.bio ? '' : `<button id="activity-bio" type="button" class="mp-bio-nudge">${icon('user')}<span>Add a bio.${activity.views ? ` ${activity.views} ${activity.views === 1 ? 'person' : 'people'} looked this week.` : ''}</span>${icon('chevron-right')}</button>`}
      <p class="mp-foot">The last 10, from the last 30 days</p>
    </section>`;
}

const EYE = '<svg viewBox="0 0 24 24" fill="none"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>';
const ARROW_UP = '<svg viewBox="0 0 12 12" fill="none"><path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
