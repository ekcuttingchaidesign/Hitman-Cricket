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
 */

import type { Hand } from '../game/player';
import { avatarSrc, kitColour } from '../config/board';
import { escape, pickerMarkup } from './Leaderboard';
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
}

/** The cover's own title, so the welcome is the game's front door and not a form over it. */
const TITLE = new URL('../assets/title.webp', import.meta.url).href;

/** A bat, blade down and to the right: a right-hander's. A left-hander's is the same, mirrored. */
const BAT = `<svg class="welcome-bat" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.2 8.4 19.6 3a1.4 1.4 0 0 1 2 2l-5.4 5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="m14.6 7.6 1.8 1.8a1 1 0 0 1 0 1.4l-8.9 8.9a3 3 0 0 1-2.8.8l-1.9-.5-.5-1.9a3 3 0 0 1 .8-2.8l8.9-8.9a1 1 0 0 1 1.4 0Z" fill="currentColor" fill-opacity=".22" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

export function profileMarkup(view: ProfileView): string {
  const { name, avatar, hand, order, gate, fresh, sending = false, error = null, held = null, offline = false } = view;
  const handKey = (which: Hand, label: string) => `
              <button type="button" class="welcome-hand-key profile-hand-option is-${which}${hand === which ? ' is-chosen' : ''}"
                role="radio" aria-checked="${hand === which}" data-hand="${which}">${BAT}<span>${label}</span></button>`;
  const eyebrow = fresh ? 'WELCOME' : gate ? 'WELCOME BACK' : '';
  const heading = fresh ? 'Who\u2019s walking out to bat?' : gate ? 'Is this still you?' : 'Your details';
  return `
    <section class="welcome ${gate ? 'is-gate' : 'is-edit'}" role="dialog" aria-modal="true" aria-labelledby="profile-title"
      style="--kit:${kitColour(avatar)}">
      <div class="welcome-sky" aria-hidden="true"></div>
      ${gate ? '' : `<button id="profile-close" class="welcome-back" type="button" aria-label="Back to My Stats">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Back</span></button>`}
      <form id="profile-form" class="welcome-body" novalidate>
        <img class="welcome-title" src="${TITLE}" alt="Hitman Cricket" decoding="async">
        ${eyebrow ? `<p class="welcome-eyebrow">${eyebrow}</p>` : ''}
        <h2 id="profile-title" class="welcome-heading">${heading}</h2>
        <section class="welcome-step welcome-avatar" aria-label="Your avatar">
          <span class="welcome-face"><img id="welcome-face" src="${avatarSrc(avatar)}" alt=""></span>
          <div id="profile-picker" class="welcome-kits">${pickerMarkup(avatar, order)}</div>
        </section>
        <label class="welcome-step welcome-field"><span class="welcome-label">Your name</span>
          <input id="profile-name" type="text" maxlength="14" autocomplete="nickname" autocapitalize="words"
            enterkeyhint="done" placeholder="Up to 14 letters or numbers" value="${escape(name)}" required>
        </label>
        <div class="welcome-step">
          <p class="welcome-label" id="profile-hand-label">How do you bat?</p>
          <div class="welcome-hands" role="radiogroup" aria-labelledby="profile-hand-label">${
  handKey('right', 'RIGHT-HANDED')}${handKey('left', 'LEFT-HANDED')}
          </div>
        </div>
        ${error ? `<p id="profile-error" class="welcome-error" role="alert">${escape(error)}</p>` : ''}
        ${held ? `<p class="welcome-back-link">${restoreLinkMarkup('profile-restore', RESTORE_TAKEN)}</p>` : ''}
        <div class="welcome-foot">
          <button id="profile-send" type="submit" class="welcome-go"${sending ? ' disabled' : ''}>${
  sending ? 'SAVING\u2026' : gate ? 'LET\u2019S BAT' : 'SAVE'}</button>
          ${gate && offline ? '<button id="profile-skip" class="welcome-skip" type="button">Bat now, save my name next time</button>' : ''}
          <p class="welcome-fine">You can change your name once every 30 days.<br>Your avatar and the way you bat, whenever you like.</p>
        </div>
      </form>
    </section>`;
}
