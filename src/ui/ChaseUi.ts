import {
  chaseProgress, chipLine, close, introLine, mineLine, surviveChip, surviveGoal, surviveSaid, type Chase, type ChaseVerdict, type Mine,
} from '../game/chase';
import { cta, icon } from './Kit';
import { escape, kitMarkup } from './Leaderboard';

/**
 * The chase on the screen (section 14, lane B): the card before the first
 * ball, the chip under the scoreboard, the moment the target is passed, and
 * the strip on the end card. HTML from figures; the words are `chase.ts`'s.
 */

const MODE: Record<Chase['mode'], { name: string; facts: string; colour: string }> = {
  classic: { name: 'THE BLAST', facts: '5 OVERS · 30 BALLS', colour: '#3f88f2' },
  marathon: { name: 'TEST MARATHON', facts: 'THREE BATTERS · ALL DAY', colour: '#1f8a55' },
  survive: { name: 'TEST SURVIVAL', facts: '10 OVERS · ONE WICKET', colour: '#ff5a4e' },
};

const grouped = (n: number) => n.toLocaleString('en-US');
const face = (avatar: number | null, name: string) => avatar === null ? '<span class="board-kit is-empty" aria-hidden="true"></span>' : kitMarkup(avatar, name);

/** B1: the card that stands before the first ball. Nothing is bowled until it is put away. */
export function chaseIntroMarkup(chase: Chase, mine: Mine, you: { avatar: number | null }): string {
  const mode = MODE[chase.mode];
  const them = [chase.theirPlace ? `#${chase.theirPlace}` : '', chase.theirRung ?? ''].filter(Boolean).join(' · ');
  return `<div class="ch-intro" role="dialog" aria-modal="true" aria-labelledby="chase-intro-title" style="--mode:${mode.colour}">
      <div class="ch-intro-head">
        <i class="ch-chevrons" aria-hidden="true"></i>
        <p class="ch-intro-eyebrow"><span>CHASE · ${mode.name}</span><small>${mode.facts}</small></p>
        ${chase.result ? surviveTargetMarkup(chase) : `<h2 id="chase-intro-title" class="ch-intro-target"><b class="ch-count" data-to="${chase.target}">${grouped(chase.target)}</b><span><em>TO BEAT</em><small${short(`Their ${chase.ladder === 'solo' ? 'best batter' : 'best innings'}`)}>${escape(chase.name)}’s ${chase.ladder === 'solo' ? 'best batter' : 'best innings'}</small></span></h2>`}
      </div>
      <div class="ch-intro-body">
        <div class="ch-versus">
          <div class="ch-side is-you">${face(you.avatar, 'You')}<b>You</b><small>${escape(mineLine(mine))}</small></div>
          <span class="ch-vs" aria-hidden="true">VS</span>
          <div class="ch-side is-them">${face(chase.avatar, chase.name)}<b>${escape(chase.name)}</b><small>${escape(them)}</small></div>
        </div>
        <p class="ch-intro-line">${introMarkup(chase, mine)}</p>
        <div class="ch-intro-keys">
          ${cta({ kind: 'secondary', label: 'BACK', id: 'chase-back' })}
          ${cta({ kind: 'primary', label: 'LET’S BAT', id: 'chase-bat', moving: true })}
        </div>
      </div>
    </div>`;
}

/** Survival's intro figure: what beating their result asks, and their result under it. */
function surviveTargetMarkup(chase: Chase): string {
  const goal = surviveGoal(chase.name, chase.result!);
  return `<h2 id="chase-intro-title" class="ch-intro-target"><b class="ch-count" data-to="${goal.figure}">${grouped(goal.figure)}</b><span><em>${goal.unit} ${goal.aim}</em><small${short(goal.theirsShort)}>${escape(goal.theirs)}</small></span></h2>`;
}

/** The intro's line, with the name and place set bold as the design has them. */
function introMarkup(chase: Chase, mine: Mine): string {
  return escape(introLine(chase, mine))
    .replace(escape(chase.name), `<b>${escape(chase.name)}</b>`)
    .replace(/#\d+/, place => `<b class="is-place">${place}</b>`);
}

/** A line's form without the name, put in when the name will not fit (`fitLabels`). */
const short = (words: string) => ` data-short="${escape(words)}"`;

/** B2: the chip under the scoreboard. The scoreboard itself is never touched. */
export function chaseChipMarkup(chase: Chase, runs: number, ballsLeft: number | null, place: number | null, balls = 0): string {
  if (chase.result) {
    const said = surviveChip(chase.name, chase.result, { balls, runs });
    if (said.done) {
      return `<span class="ch-chip is-done" role="status">${face(chase.avatar, chase.name)}
        <span class="ch-chip-text"><b${short(`${said.needShort}${place ? ` \u00b7 now #${place}` : ''}`)}>${escape(said.need)}${place ? ` \u00b7 now #${place}` : ''}</b><small>\u2713 ${balls} BALLS AND COUNTING</small></span></span>`;
    }
    return `<span class="ch-chip" role="status">${face(chase.avatar, chase.name)}
      <span class="ch-chip-text"><b class="ch-need">${escape(said.need)}</b><small${short(said.smallShort)}>${escape(said.small)}</small></span>
      <i class="ch-bar" aria-hidden="true"><i style="width:${(said.progress * 100).toFixed(1)}%"></i></i></span>`;
  }
  const line = chipLine(chase, runs, ballsLeft);
  const progress = chaseProgress(chase, runs);
  if (line.done) {
    return `<span class="ch-chip is-done" role="status">${face(chase.avatar, chase.name)}
        <span class="ch-chip-text"><b${short(`Passed them${place ? ` · now #${place}` : ''}`)}>Passed ${escape(chase.name)}${place ? ` · now #${place}` : ''}</b><small>✓ ${grouped(runs)} BEATS ${grouped(chase.target)}</small></span></span>`;
  }
  return `<span class="ch-chip${close(chase, runs) ? ' is-close' : ''}" role="status">${face(chase.avatar, chase.name)}
      <span class="ch-chip-text"><b>Need <em class="ch-need">${line.need}</em>${line.off !== null ? ` off ${line.off}` : ''}</b><small${short(`TO BEAT THEIR ${grouped(chase.target)}`)}>TO BEAT ${escape(chase.name.toUpperCase())}’S ${grouped(chase.target)}</small></span>
      <i class="ch-bar" aria-hidden="true"><i style="width:${(progress * 100).toFixed(1)}%"></i></i></span>`;
}

/** B3: the target passed, between balls, as a milestone is. */
export function passedMarkup(chase: Chase, runs: number, you: { avatar: number | null }, place: number | null, modeName: string): string {
  return `<div class="ch-passed" role="status" aria-label="${escape(`Passed ${chase.name}`)}">
      <i class="ch-rays" aria-hidden="true"></i><i class="ch-wave" aria-hidden="true"></i>
      <div class="ch-stamp"><b>PASSED</b><span>${escape(chase.name.toUpperCase())}</span></div>
      <div class="ch-swap">
        <span class="ch-place is-you">${face(you.avatar, 'You')}<span><b>${place ? `#${place}` : 'You'}</b><small>YOU · ${grouped(runs)}</small></span><i class="is-up" aria-hidden="true">↑</i></span>
        <span class="ch-place is-them">${face(chase.avatar, chase.name)}<span><b>${place ? `#${place + 1}` : escape(chase.name)}</b><small>${escape(chase.name.toUpperCase())} · ${grouped(chase.target)}</small></span><i aria-hidden="true">↓</i></span>
      </div>
      <p class="ch-passed-line">${chase.result ? `${grouped(runs)} balls and counting \u00b7 ${escape(chase.name)} ${surviveSaid(chase.result)}` : `${grouped(runs)} beats ${grouped(chase.target)}`}${place ? ` · <em>now #${place}</em> on ${escape(modeName)}` : ''}</p>
    </div>`;
}

/** B4 and B5: the strip on the end card. Beaten, the place it took them; short, how far, on a bar. */
export function chaseStripMarkup(view: {
  chase: Chase; runs: number; verdict: ChaseVerdict; place: number | null; modeName: string;
  you: { avatar: number | null }; best: number | null;
  next: { name: string; avatar: number; runs: number; place: number } | null;
}): string {
  const { chase, verdict } = view;
  const head = `<div class="ch-strip-head">${face(view.you.avatar, 'You')}
        <span class="ch-strip-text"><small>${chase.result ? `${escape(surviveGoal(chase.name, chase.result).key)}` : `CHASE · ${escape(chase.name.toUpperCase())}’S ${grouped(chase.target)}`}</small><b>${escape(verdict.title)}</b>
        <span class="ch-strip-line">${icon('trophy')}${escape(verdict.line)}</span></span>
        ${verdict.beat && view.place ? `<span class="ch-strip-place"><b>#${view.place}</b><small>${escape(view.modeName.toUpperCase())}</small></span>` : ''}</div>`;
  const bar = verdict.beat || chase.result ? '' : barMarkup(view);
  const next = verdict.beat && view.next
    ? `<button id="chase-next" type="button" class="ch-strip-row">${kitMarkup(view.next.avatar, view.next.name)}<span>Next: <b>${escape(view.next.name)}</b> · <em>beat ${grouped(view.next.runs)}</em></span><small>#${view.next.place}</small>${icon('chevron-right')}</button>`
    : '';
  return `<section class="ch-strip${verdict.beat ? ' is-beat' : ' is-short'}" aria-label="The chase">
      ${head}${bar}${next}
      <div class="ch-strip-links">
        <button id="chase-board" type="button" class="ch-strip-link">${icon('chart')}<span>Leaderboard</span>${icon('chevron-right')}</button>
        <button id="chase-profile" type="button" class="ch-strip-link">${icon('user')}<span>My profile</span>${icon('chevron-right')}</button>
      </div>
    </section>`;
}

/** B5's bar: nought to their best, the innings filled along it, the player's own best marked. */
function barMarkup(view: { chase: Chase; runs: number; best: number | null }): string {
  const { chase, runs, best } = view;
  const at = (n: number) => `${Math.min(100, Math.max(0, (n / chase.target) * 100)).toFixed(1)}%`;
  return `<div class="ch-strip-bar">
        ${best !== null && best > runs && best < chase.target ? `<span class="ch-best${best / chase.target < 0.5 ? ' is-left' : ''}" style="left:${at(best)}"><small>YOUR BEST ${grouped(best)}</small></span>` : ''}
        <i class="ch-track"><i style="width:${at(runs)}"></i></i>
        <span class="ch-goal">${face(chase.avatar, chase.name)}</span>
        <span class="ch-ends"><small>0</small><b style="left:${at(runs)}">${grouped(runs)}</b><small>${grouped(chase.target)}</small></span>
      </div>`;
}

