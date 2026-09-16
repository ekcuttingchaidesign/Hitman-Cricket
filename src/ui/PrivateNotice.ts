import { track } from '../game/analytics';

/**
 * The screen a private window gets instead of the game.
 *
 * The poster is the screen. It already says the thing in its own type — "you
 * naughty you, don't try in incognito, play in normal tab" — so nothing here
 * repeats it in HTML; what goes over the art is the pair of keys the cover
 * stands over its own art, in the same white-on-orange and navy, because this
 * is a screen of the game and not a browser warning.
 *
 * Nothing here is a lock. The check that put this screen up is a guess (see
 * `game/private-mode.ts`), so the key lets a player it guessed wrong about carry
 * on, and one it guessed right about bat anyway with the register key turned off
 * for the innings. That is what the second line inside the key is for: it is the
 * cost of pressing it, not a paragraph about private browsing.
 *
 * The artwork sits in `public/` rather than being bundled, so a missing file
 * costs a headline rather than a build — the words the poster carries are in the
 * page too, hidden, and take its place if it never loads.
 */
const ARTWORK = 'incognito.webp';

/** What the poster says, for a screen reader and for a browser with no picture. */
const ALT = 'You naughty you — don’t try in incognito, play in normal tab.';

/**
 * Puts the screen up and settles when the player asks to bat anyway. The node
 * takes itself off the page first, so what the game is handed is the empty root
 * it would have had.
 */
export function privateNotice(root: HTMLElement): Promise<void> {
  track('private-window', 'Opened in a private window');
  const gate = document.createElement('div');
  gate.className = 'private-gate';
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-label', ALT);
  gate.innerHTML = `
    <div class="private-poster">
      <img class="private-art" src="${ARTWORK}" alt="${ALT}" decoding="async" fetchpriority="high">
      <div class="private-words" hidden aria-hidden="true">
        <h1>You naughty you</h1>
        <p>Don’t try in incognito, play in normal tab</p>
      </div>
      <div class="private-keys">
        <button id="private-anyway" class="play-button" type="button">PLAY ANYWAY<small>SCORE WON’T COUNT</small></button>
        <button id="private-copy" class="learn-button" type="button">COPY LINK</button>
      </div>
    </div>`;
  const art = gate.querySelector<HTMLImageElement>('.private-art')!;
  const words = gate.querySelector<HTMLElement>('.private-words')!;
  // No artwork, no blank screen: the headline it carries, set in the game's own
  // type, stands in for it.
  art.onerror = () => { art.remove(); words.hidden = false; words.removeAttribute('aria-hidden'); gate.classList.add('is-wordless'); };
  root.appendChild(gate);
  document.body.classList.add('private-window');
  const copy = gate.querySelector<HTMLButtonElement>('#private-copy')!;
  copy.onclick = () => {
    // The link, to paste into an ordinary tab. A browser that will not hand over
    // the clipboard says so rather than pretending it worked.
    void navigator.clipboard?.writeText(location.href)
      .then(() => { copy.textContent = 'LINK COPIED'; })
      .catch(() => { copy.textContent = 'COPY FROM THE ADDRESS BAR'; });
  };
  return new Promise<void>(resolve => {
    gate.querySelector<HTMLButtonElement>('#private-anyway')!.onclick = () => {
      track('private-play-anyway', 'Played on in a private window');
      gate.remove();
      document.body.classList.remove('private-window');
      resolve();
    };
  });
}
