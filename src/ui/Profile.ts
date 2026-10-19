/**
 * Who is batting: the name, the kit and the hand, asked before an innings.
 *
 * Before the first innings it is a gate, for a new player and an old one alike.
 * A player with no name was the most common player there was — the board only
 * asked the ones who made its top fifty, and a strip at the end of an innings is
 * easy to walk past — so the name is asked for where nobody walks past it. A
 * player who already has one sees theirs filled in, and carries on in one tap.
 *
 * From My Stats it is the same sheet with a way out, for changing any of the
 * three. The name changes once a month, which it says before anybody types; the
 * kit and the hand change whenever the player likes.
 *
 * Nothing about a password is asked here: a new player is asked for one once
 * their career is worth keeping (`src/game/password-nudge.ts`). What this screen
 * carries is the way back for a player the browser forgot — Played before?, top
 * right on a new player's gate — and, from My Stats, the password row that sets
 * or changes it.
 */

import { BIO_MAX, BIO_NEAR, bioChars } from '../server/bio-rules';
import type { Hand } from '../game/player';
import { avatarSrc, kitName } from '../config/board';
import { escape } from './Leaderboard';
import { cta, icon } from './Kit';
import { RESTORE_TAKEN, restoreLinkMarkup } from './Restore';

export interface ProfileView {
  name: string;
  avatar: number;
  hand: Hand;
  /** The order the kits are dealt in for this player: see `kitDeal`. */
  order: readonly number[];
  /** Before an innings, with no way past but answering. */
  gate: boolean;
  /** No name yet, so this is the one that claims it. */
  fresh: boolean;
  sending?: boolean;
  /** Why the last try was turned down, in words the player can act on. */
  error?: string | null;
  /** A name held by somebody else — usually them, on a phone that forgot. */
  held?: string | null;
  /**
   * The board could not be reached. The one refusal the player can do nothing
   * about, so the gate opens for it: they bat, and are asked again next time.
   */
  offline?: boolean;
  /** The rung their Blast career is on, for the chip under the name. Debutant unless told. */
  tier?: { key: string; name: string };
  /** Played before?, top right: on a new player's gate, for a browser that forgot them. */
  played?: boolean;
  /** The password row on the edit from My Stats, where a password can be kept. */
  password?: PasswordRow | null;
  /**
   * The bio, on the edit from My profile for a player with a name: what it says
   * now, empty for none. Absent on the gate, which asks nothing it need not.
   */
  bio?: string;
}

/** Lines to start from, for a bio left empty: the design's three. */
export const BIO_IDEAS = ['Six or nothing.', 'Here for the long haul.', 'Hooks everything short.'] as const;

/**
 * The bio field (section 14, lane D): eighty characters, said as a count until
 * seventy and then as what is left, held to `bioProblem` half a second after
 * the typing stops, with three lines to start from while it is empty.
 */
export function bioFieldMarkup(bio: string): string {
  const count = bioChars(bio).length;
  return `<div class="welcome-field bio-field">
          <label class="welcome-label" for="profile-bio">BIO · OPTIONAL</label>
          <textarea id="profile-bio" rows="2" enterkeyhint="done" autocapitalize="sentences" placeholder="e.g. Leg-side bully. Never blocks."
            aria-describedby="bio-under bio-problem">${escape(bio)}</textarea>
          <p id="bio-under" class="bio-under"><span id="bio-note">Shown on your profile to anyone who opens it.</span><span id="bio-count" class="bio-count">${bioCount(count)}</span></p>
          <div id="bio-ideas" class="bio-ideas${bio ? ' hidden' : ''}"><p>Need an idea?</p>${BIO_IDEAS.map(idea =>
            `<button type="button" class="bio-idea" data-idea="${escape(idea)}">${escape(idea)}</button>`).join('')}</div>
          <p id="bio-problem" class="bio-problem hidden" role="alert"></p>
        </div>`;
}

/** The counter under the field: so many of eighty, and from seventy, what is left. */
export function bioCount(count: number): string {
  return count >= BIO_NEAR ? `${Math.max(0, BIO_MAX - count)} left` : `${count}/${BIO_MAX}`;
}

/** What the store said about this player's password, for the row that sets or changes it. */
export interface PasswordRow {
  set: boolean;
  at: number | null;
  question: boolean;
}

/** "Set on 16 Oct": the day, in India's time like the rest of the store's dates. */
export function setOn(at: number | null): string {
  if (!at) return 'Set';
  return `Set on ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`;
}

/** The row itself: a lock, what is set, and the key that sets or changes it. */
export function passwordRowMarkup(row: PasswordRow): string {
  const head = row.set ? setOn(row.at) : 'Not set yet';
  const sub = row.set ? (row.question ? 'Security question set too' : 'No security question') : 'Brings this career back on any phone';
  return `
        <div class="welcome-step welcome-password">
          <p class="welcome-label">YOUR PASSWORD</p>
          <div class="welcome-pass${row.set ? ' is-set' : ''}">
            <span class="welcome-pass-mark" aria-hidden="true">${LOCK}</span>
            <span class="welcome-pass-say"><b>${escape(head)}</b><small>${escape(sub)}</small></span>
            ${cta({ kind: 'save', label: row.set ? 'CHANGE' : 'SET', id: 'profile-password-go' })}
          </div>
        </div>`;
}

const LOCK = '<svg viewBox="0 0 24 24" fill="none"><path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="16" r="1.5" fill="currentColor"/></svg>';
const KEY = '<svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="15.5" r="4" stroke="currentColor" stroke-width="2"/><path d="m11 12.5 8-8M15.5 8l2.5 2.5M13.5 10l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const art = (file: string) => new URL(`../assets/entry/${file}`, import.meta.url).href;

/** A bat, blade up, turned the way the hand it stands for holds it. */
const bat = (hand: Hand) => `<span class="welcome-bat is-${hand}" aria-hidden="true"><i></i><b></b></span>`;

/**
 * Whether there is a name to go with yet: a letter or a number in it. Until
 * there is, the key to go is drawn asleep and does nothing; whether the name
 * is a good one is for the rules to say once it is pressed.
 */
export function named(name: string): boolean {
  return /[\p{L}\p{N}]/u.test(name);
}

/** The name as the plate over the avatar shows it: in capitals, or a placeholder until there is one. */
export function plateName(name: string): string {
  return named(name) ? name.trim().toUpperCase() : 'YOUR NAME';
}

/** "LEFT-HANDED" or "RIGHT-HANDED", for the chip and the keys. */
export const handWord = (hand: Hand) => (hand === 'left' ? 'LEFT-HANDED' : 'RIGHT-HANDED');

/**
 * The name screen, as UI v1 draws it: the batter walking out — the kit in
 * rings of light, the name in capitals with the hand and the tier under it —
 * the tray of kits, the name, the hand, and LET'S BAT.
 *
 * Before an innings it is a gate with a way back to the cover and no way past
 * but answering (`#profile-leave`): nobody bats without a name. From My Stats
 * it is the same screen with a way back there (`#profile-close`).
 */
export function profileMarkup(view: ProfileView): string {
  const { name, avatar, hand, order, gate, fresh, sending = false, error = null, held = null, offline = false } = view;
  const tier = view.tier ?? { key: 'debutant', name: 'DEBUTANT' };
  const heading = fresh ? 'WHO’S WALKING OUT TO BAT?' : gate ? 'IS THIS STILL YOU?' : 'YOUR DETAILS';
  const handKey = (which: Hand) => `
              <button type="button" class="welcome-hand-key profile-hand-option is-${which}${hand === which ? ' is-chosen' : ''}"
                role="radio" aria-checked="${hand === which}" data-hand="${which}">${bat(which)}<span>${handWord(which)}</span></button>`;
  const kits = order.map(kit => `
            <button type="button" class="kit-option${kit === avatar ? ' is-chosen' : ''}" role="radio" aria-checked="${kit === avatar}" data-kit="${kit}" aria-label="${escape(kitName(kit))}">
              <img src="${avatarSrc(kit)}" alt="" draggable="false">
            </button>`).join('');
  const back = gate
    ? `<button id="profile-leave" class="k-icon-button welcome-back" type="button" aria-label="Back to the cover">${icon('arrow-left')}</button>`
    : `<button id="profile-close" class="k-icon-button welcome-back" type="button" aria-label="Back to My profile">${icon('arrow-left')}</button>`;
  const go = cta({ kind: 'primary', label: sending ? 'SAVING…' : gate ? 'LET’S BAT' : 'SAVE', id: 'profile-send', wide: true, disabled: sending || !named(name) });
  return `
    <section class="welcome ${gate ? 'is-gate' : 'is-edit'}" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <img class="welcome-haze" src="${art('haze.svg')}" alt="" aria-hidden="true">
      <img class="welcome-lights" src="${art('floodlights.svg')}" alt="" aria-hidden="true">
      <span class="welcome-grain" aria-hidden="true"></span>
      <form id="profile-form" class="welcome-body" novalidate>
        <div class="welcome-top">${back}${view.played ? `<button id="profile-played" class="welcome-played" type="button"><span aria-hidden="true">${KEY}</span>Played before?</button>` : ''}</div>
        <h2 id="profile-title" class="welcome-heading">${heading}</h2>
        <div class="welcome-walkout" aria-hidden="true">
          <img class="welcome-ring is-glow" src="${art('ring-220.svg')}" alt="">
          <img class="welcome-ring is-outer" src="${art('ring-170.svg')}" alt="">
          <img class="welcome-ring is-inner" src="${art('ring-150.svg')}" alt="">
          <img class="welcome-ring is-kit" src="${art('ring-136.svg')}" alt="">
          <span class="welcome-face"><img id="welcome-face" src="${avatarSrc(avatar)}" alt=""></span>
          <div class="welcome-plate">
            <p id="welcome-name" class="welcome-name${named(name) ? '' : ' is-empty'}">${escape(plateName(name))}</p>
            <div class="welcome-chips"><span id="welcome-hand" class="welcome-chip">${handWord(hand)}</span><span class="welcome-chip is-tier tier-${escape(tier.key)}">${escape(tier.name)}</span></div>
          </div>
        </div>
        <div id="profile-picker" class="welcome-kits" role="radiogroup" aria-label="Choose your avatar">${kits}
        </div>
        <label class="welcome-field"><span class="welcome-label">YOUR NAME</span>
          <input id="profile-name" type="text" maxlength="14" autocomplete="nickname" autocapitalize="words"
            enterkeyhint="done" placeholder="Enter your name" value="${escape(name)}" required>
        </label>
        ${!gate && view.bio !== undefined ? bioFieldMarkup(view.bio) : ''}
        <div class="welcome-step">
          <p class="welcome-label" id="profile-hand-label">HOW DO YOU BAT?</p>
          <div class="welcome-hands" role="radiogroup" aria-labelledby="profile-hand-label">${handKey('right')}${handKey('left')}
          </div>
        </div>
        ${!gate && view.password ? passwordRowMarkup(view.password) : ''}
        ${error ? `<p id="profile-error" class="welcome-error" role="alert">${escape(error)}</p>` : ''}
        ${held ? `<p class="welcome-back-link">${restoreLinkMarkup('profile-restore', RESTORE_TAKEN)}</p>` : ''}
        <div class="welcome-foot">
          ${go.replace('type="button"', 'type="submit"')}
          ${gate && offline ? '<button id="profile-skip" class="welcome-skip" type="button">Bat now, save my name next time</button>' : ''}
          <p class="welcome-fine">You can change your name once every 30 days.<br>Your avatar and the way you bat, whenever you like.</p>
        </div>
      </form>
    </section>`;
}
