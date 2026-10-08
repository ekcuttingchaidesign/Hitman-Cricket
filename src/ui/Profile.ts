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

export function profileMarkup(view: ProfileView): string {
  const { name, avatar, hand, order, gate, fresh, sending = false, error = null, held = null, offline = false } = view;
  const handKey = (which: Hand, label: string) => `
            <button type="button" class="profile-hand-option${hand === which ? ' is-chosen' : ''}" role="radio"
              aria-checked="${hand === which}" data-hand="${which}">${label}</button>`;
  return `
    <div class="key-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <div class="key-sheet restore-sheet profile-sheet">
        <form id="profile-form" class="key-face">
          <h2 id="profile-title">${fresh ? 'Who’s batting?' : 'Is this you?'}</h2>
          <p class="key-sheet-say">${fresh
    ? 'Your name goes on the boards, and keeps your runs, rank and career on any phone.'
    : 'Your name, your kit and the way you bat. Change anything, or carry on.'}</p>
          <label class="restore-field"><span>What’s your name?</span>
            <input id="profile-name" type="text" maxlength="14" autocomplete="nickname"
              enterkeyhint="done" placeholder="Up to 14 characters" value="${escape(name)}" required>
          </label>
          <div id="profile-picker" class="profile-picker">${pickerMarkup(avatar, order)}</div>
          <p class="claim-label" id="profile-hand-label">You bat</p>
          <div class="profile-hand" role="radiogroup" aria-labelledby="profile-hand-label">${
  handKey('right', 'RIGHT-HANDED')}${handKey('left', 'LEFT-HANDED')}
          </div>
          ${error ? `<p id="profile-error" class="claim-error" role="alert">${escape(error)}</p>` : ''}
          ${held ? `<p class="claim-back">${restoreLinkMarkup('profile-restore', RESTORE_TAKEN)}</p>` : ''}
          <button id="profile-send" type="submit" class="key-sheet-key is-whatsapp"${sending ? ' disabled' : ''}>${
  sending ? 'SAVING…' : gate ? 'LET’S BAT' : 'SAVE'}</button>
          ${gate && offline ? '<button id="profile-skip" class="key-ghost" type="button">Bat now, save my name next time</button>' : ''}
          <p class="key-fine">You can change your name once every 30 days. Your kit and the way
            you bat, whenever you like.</p>
          ${gate ? '' : '<button id="profile-close" class="key-ghost" type="button">Close</button>'}
        </form>
      </div>
    </div>`;
}
