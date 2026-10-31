import type { ChallengeMode } from '../game/challenge-api';
import type { FootState } from '../game/invite';
import { MODE_WORD, left } from '../game/invite';
import { cta } from './Kit';
import { escape, kitMarkup } from './Leaderboard';

/**
 * A challenge from a profile (Figma section 23), drawn: the confirm sheet
 * with its two modes, the card before the first ball (the setter's with the
 * record between the two and an aim; the chaser's with the total and the
 * warning), the invite sheet, the leave sheets, and the profile's foot.
 *
 * The chase card's own parts (`.ch-*`, `ChaseUi.ts`) are reused where the
 * two are the same card: the band in the mode's colour, the two faces.
 */

const COLOUR: Record<ChallengeMode, string> = { classic: '#3f88f2', super10: '#8b5cf6' };
const FACTS: Record<ChallengeMode, string> = { classic: '5 OVERS · 30 BALLS', super10: '10 OVERS · 5 WICKETS' };
const LINE: Record<ChallengeMode, string> = { classic: '5 overs · 3 wickets', super10: '10 overs · 5 wickets' };
const face = (avatar: number | null, name: string) =>
  avatar === null ? '<span class="board-kit is-empty" aria-hidden="true"></span>' : kitMarkup(avatar, name);

export interface Them { name: string; avatar: number }

/** The confirm sheet: who, one line, the two modes, BAT FIRST (B1, B2). */
export function confirmSheetMarkup(them: Them, picked: ChallengeMode, super10: boolean): string {
  const tile = (mode: ChallengeMode, open: boolean) => `
      <button type="button" class="cc-mode${mode === picked ? ' is-on' : ''}${open ? '' : ' is-shut'}" data-mode="${mode}" style="--mode:${COLOUR[mode]}"
        aria-pressed="${mode === picked}"${open ? '' : ' disabled'}>
        <span class="cc-mode-top"><i class="cc-dot" aria-hidden="true"></i><i class="cc-tick" aria-hidden="true"></i></span>
        <b>${mode === 'classic' ? 'THE BLAST' : 'SUPER10'}</b><small>${open ? LINE[mode] : 'Coming next'}</small>
      </button>`;
  return `<div class="cc-scrim" data-close></div>
    <section class="cc-sheet" role="dialog" aria-modal="true" aria-labelledby="cc-title">
      <i class="cc-grab" aria-hidden="true"></i>
      <h2 id="cc-title" class="cc-title">CHALLENGE ${escape(them.name.toUpperCase())}</h2>
      <p class="cc-line">You bat first. ${escape(them.name)} gets 24 hours to chase your total.</p>
      <div class="cc-modes" role="group" aria-label="Mode">${tile('classic', true)}${tile('super10', super10)}</div>
      ${cta({ kind: 'primary', label: 'BAT FIRST', id: 'cc-go', wide: true })}
    </section>`;
}

export interface SetView {
  mode: ChallengeMode;
  them: Them;
  you: { avatar: number | null };
  record: { won: number; lost: number; drawn: number; form: ('W' | 'L' | 'D')[] };
  aim: number | null;
  average: number | null;
}

/** The setter's card before the first ball: the record between the two in this mode, and an aim (B3). */
export function setCardMarkup(view: SetView): string {
  const { won, lost, form } = view.record;
  const played = won + lost + view.record.drawn;
  const lead = won > lost ? 'YOU LEAD' : won < lost ? `${escape(view.them.name.toUpperCase())} LEADS` : 'ALL SQUARE';
  const middle = played
    ? `<span class="cs-score">${won} – ${lost}</span><small class="cs-lead is-${won > lost ? 'up' : won < lost ? 'down' : 'level'}" data-short="${won > lost ? 'YOU LEAD' : won < lost ? 'THEY LEAD' : 'ALL SQUARE'}">${lead}</small>`
    : '<span class="ch-vs" aria-hidden="true">VS</span><small class="cs-lead">FIRST MATCH</small>';
  const bar = played
    ? `<span class="cs-bar"><i class="is-won" style="flex:${won || 0.0001}"></i><i class="is-lost" style="flex:${lost || 0.0001}"></i></span>
       <span class="cs-form"><small>${won} won · ${lost} lost</small><span class="cs-chips"><small>LAST ${form.length}</small>${form.map(one => `<i class="is-${one}">${one}</i>`).join('')}</span></span>`
    : `<span class="cs-bar is-none"><i></i></span><span class="cs-form"><small>No matches between you in ${MODE_WORD[view.mode] === 'The Blast' ? 'the Blast' : 'Super10'} yet. This one starts it.</small></span>`;
  const aim = view.aim
    ? `<div class="cs-aim"><i class="cs-aim-icon" aria-hidden="true"></i><span><b>Aim for ${view.aim}</b>
        <small>${escape(view.them.name)} averages ${view.average} in ${view.mode === 'classic' ? 'the Blast' : 'Super10'}. Past ${view.aim} is a tough chase.</small></span></div>`
    : '';
  return `<div class="ch-intro cs-card is-${view.mode}" role="dialog" aria-modal="true" aria-labelledby="cs-title" style="--mode:${COLOUR[view.mode]}">
      <div class="cs-band"><h2 id="cs-title" class="cs-eyebrow">CHALLENGE · ${view.mode === 'classic' ? 'THE BLAST' : '<span class="cs-s10">SUPER<em>10</em></span>'}</h2><small>${FACTS[view.mode]}</small></div>
      <div class="ch-intro-body">
        <div class="ch-versus cs-versus">
          <div class="ch-side is-you">${face(view.you.avatar, 'You')}<b>You</b></div>
          <div class="cs-mid">${middle}</div>
          <div class="ch-side is-them">${face(view.them.avatar, view.them.name)}<b>${escape(view.them.name)}</b></div>
        </div>
        <div class="cs-record">${bar}</div>
        ${aim}
        <div class="ch-intro-keys">
          ${cta({ kind: 'secondary', label: 'BACK', id: 'cs-back' })}
          ${cta({ kind: 'primary', label: 'LET’S BAT', id: 'cs-bat', moving: true })}
        </div>
      </div>
    </div>`;
}

/** The chaser's card before the first ball: their total, and that leaving is a loss (C3). */
export function chaseCardMarkup(mode: ChallengeMode, them: Them, total: number, you: { avatar: number | null }): string {
  return `<div class="ch-intro cs-card is-${mode}" role="dialog" aria-modal="true" aria-labelledby="cs-title" style="--mode:${COLOUR[mode]}">
      <div class="ch-intro-head">
        <i class="ch-chevrons" aria-hidden="true"></i>
        <p class="ch-intro-eyebrow"><span>CHALLENGE · ${mode === 'classic' ? 'THE BLAST' : 'SUPER10'}</span><small>${FACTS[mode]}</small></p>
        <h2 id="cs-title" class="ch-intro-target"><b class="ch-count" data-to="${total}">${total}</b><span><em>TO BEAT</em><small data-short="Their total, same balls">${escape(them.name)}’s total, same balls</small></span></h2>
      </div>
      <div class="ch-intro-body">
        <div class="ch-versus">
          <div class="ch-side is-you">${face(you.avatar, 'You')}<b>You</b></div>
          <span class="ch-vs" aria-hidden="true">VS</span>
          <div class="ch-side is-them">${face(them.avatar, them.name)}<b>${escape(them.name)}</b></div>
        </div>
        <p class="ch-intro-line">Pass ${total} and it’s yours. <b class="cs-warn">Once you start, leaving or closing the game counts as a loss.</b></p>
        <div class="ch-intro-keys">
          ${cta({ kind: 'secondary', label: 'BACK', id: 'cs-back' })}
          ${cta({ kind: 'primary', label: 'LET’S BAT', id: 'cs-bat', moving: true })}
        </div>
      </div>
    </div>`;
}

export interface InviteSheetView {
  mode: ChallengeMode;
  them: Them;
  total: number;
  answerBy: number | null;
  nudged: boolean;
  record: { won: number; lost: number };
  ranOut: boolean;
}

/** The invite: who, their total in the open, time left, and the three ways out (C2, C6). */
export function inviteSheetMarkup(view: InviteSheetView, now = Date.now()): string {
  const title = view.ranOut ? 'THIS ONE RAN OUT' : `${escape(view.them.name.toUpperCase())} CHALLENGED YOU`;
  const line = view.ranOut
    ? `${escape(view.them.name)}’s challenge wasn’t answered in time, so nothing counts.`
    : `${escape(view.them.name)} set ${view.total} for you to chase on the same balls. ${LINE[view.mode].replace(/^./, c => c.toUpperCase())}.`;
  const record = view.record.won + view.record.lost ? `Head to head  ${view.record.won} – ${view.record.lost}` : 'First match between you';
  return `<div class="cc-scrim" data-close></div>
    <section class="cc-sheet is-invite" role="dialog" aria-modal="true" aria-labelledby="iv-title">
      <i class="cc-grab" aria-hidden="true"></i>
      <div class="iv-who" data-handle-face>${face(view.them.avatar, view.them.name)}<span><h2 id="iv-title" class="cc-title">${title}</h2></span>${view.nudged && !view.ranOut ? '<i class="iv-chip">NUDGED</i>' : ''}</div>
      <div class="iv-card" style="--mode:${COLOUR[view.mode]}">
        <small>${view.mode === 'classic' ? 'THE BLAST' : 'SUPER10'} · ${escape(view.them.name.toUpperCase())} SET</small>
        <b>${view.total}</b>
        <p>${line}</p>
      </div>
      ${view.ranOut ? '' : `<p class="iv-meta"><span>${record}</span><span class="iv-left">${left((view.answerBy ?? now) - now)} left</span></p>`}
      ${view.ranOut
        ? `${cta({ kind: 'primary', label: `CHALLENGE ${view.them.name.toUpperCase()} BACK`, short: 'CHALLENGE THEM BACK', id: 'iv-back', wide: true })}<button id="iv-close" type="button" class="cc-link">Close</button>`
        : `${cta({ kind: 'primary', label: 'ACCEPT AND CHASE', id: 'iv-accept', wide: true })}
           <button id="iv-decline" type="button" class="cc-ghost">DECLINE</button>
           <button id="iv-later" type="button" class="cc-link">Not now</button>`}
    </section>`;
}

/** Leaving an innings that is part of a challenge: what it costs, said first (B7, D4). */
export function leaveSheetMarkup(kind: 'set' | 'chase', name: string): string {
  const [title, line, go] = kind === 'set'
    ? ['LEAVE THIS INNINGS?', `${escape(name)} won’t get this challenge. Nothing is sent and nothing counts.`, 'Leave']
    : ['LEAVE AND LOSE?', `You accepted ${escape(name)}’s challenge. Leaving now counts as a loss, and ${escape(name)} is told.`, 'Leave and lose'];
  return `<div class="cc-scrim" data-close></div>
    <section class="cc-sheet" role="dialog" aria-modal="true" aria-labelledby="lv-title">
      <i class="cc-grab" aria-hidden="true"></i>
      <h2 id="lv-title" class="cc-title">${title}</h2>
      <p class="cc-line">${line}</p>
      ${cta({ kind: 'primary', label: kind === 'set' ? 'KEEP BATTING' : 'KEEP CHASING', id: 'lv-stay', wide: true })}
      <button id="lv-go" type="button" class="cc-link is-loss">${go}</button>
    </section>`;
}

/**
 * The profile's foot (D3): CHALLENGE beside CHASE, or the one state between
 * the two players that matters, above CHASE.
 */
export function footMarkup(foot: FootState | null, name: string, mode: ChallengeMode, now = Date.now()): { above: string; key: string } {
  const key = (dim = false) => `<button id="player-challenge" type="button" class="k-cta k-cta--secondary ps-challenge${dim ? ' is-dim' : ''}"${dim ? ' aria-disabled="true"' : ''}><span class="k-cta-face"><span>CHALLENGE</span></span></button>`;
  const state = (title: string, sub: string, tone: string, chip = '') => `<div class="ps-state"><span><b>${title}</b><small class="is-${tone}">${sub}</small></span>${chip}</div>`;
  if (!foot) return { above: '', key: key(true) };
  switch (foot.kind) {
    case 'challenge': return { above: '', key: key() };
    case 'full': return { above: '', key: key(true) };
    case 'answer': {
      const invite = foot.room.invite!;
      const total = foot.room.players.find(one => one.host)?.runs ?? 0;
      return { above: state(`${escape(name.toUpperCase())} CHALLENGED YOU`, `Chase ${total} · ${MODE_WORD[foot.room.mode ?? 'classic']} · ${left((invite.answerBy ?? now) - now)} left`, 'gold',
        '<button id="player-answer" type="button" class="ps-state-key is-solid">ANSWER</button>'), key: '' };
    }
    case 'sent': {
      const invite = foot.room.invite!;
      return { above: state('CHALLENGE SENT', `${left((invite.answerBy ?? now) - now)} left to accept · ${MODE_WORD[foot.room.mode ?? 'classic']}`, 'gold',
        `<button id="player-nudge" type="button" class="ps-state-key${foot.nudge.ready ? '' : ' is-off'}"${foot.nudge.ready ? '' : ' disabled'}>${escape(foot.nudge.label.toUpperCase())}</button>`), key: '' };
    }
    case 'batting': return { above: state('BATTING YOUR CHALLENGE', `${MODE_WORD[foot.room.mode ?? 'classic']} · opens the room`, 'amber', '<button id="player-room" type="button" class="ps-state-key">OPEN</button>'), key: '' };
    case 'declined': return { above: state('DECLINED', `Challenge them again in ${left(foot.wait)}`, 'dim'), key: '' };
  }
  void mode;
  return { above: '', key: key() };
}
