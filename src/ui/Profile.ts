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
}

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
    : `<button id="profile-close" class="k-icon-button welcome-back" type="button" aria-label="Back to My Stats">${icon('arrow-left')}</button>`;
  const go = cta({ kind: 'primary', label: sending ? 'SAVING…' : gate ? 'LET’S BAT' : 'SAVE', id: 'profile-send', wide: true, disabled: sending || !named(name) });
  return `
    <section class="welcome ${gate ? 'is-gate' : 'is-edit'}" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <img class="welcome-haze" src="${art('haze.svg')}" alt="" aria-hidden="true">
      <img class="welcome-lights" src="${art('floodlights.svg')}" alt="" aria-hidden="true">
      <span class="welcome-grain" aria-hidden="true"></span>
      <form id="profile-form" class="welcome-body" novalidate>
        <div class="welcome-top">${back}</div>
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
        <div class="welcome-step">
          <p class="welcome-label" id="profile-hand-label">HOW DO YOU BAT?</p>
          <div class="welcome-hands" role="radiogroup" aria-labelledby="profile-hand-label">${handKey('right')}${handKey('left')}
          </div>
        </div>
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
