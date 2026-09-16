import { track } from '../game/analytics';

/**
 * The screen a private window gets instead of the game.
 *
 * It is one picture, one sentence and one way past it. The picture carries the
 * message — it is the artwork the game is shipped with — so the words under it
 * say the part the artwork cannot: what is actually lost by batting here, which
 * is the board and only the board. Nothing here is a lock. The check that put
 * this screen up is a guess (see `game/private-mode.ts`), so the key at the
 * bottom lets a player it guessed wrong about carry on, and one it guessed right
 * about bat anyway with the register key turned off for the innings.
 *
 * The artwork sits in `public/` rather than being bundled: a missing file then
 * costs a fallback headline rather than a build, and the headline below says the
 * same thing in text for anybody whose browser never loads the picture.
 */
const ARTWORK = 'incognito.webp';

/** The message, for a screen reader and for a browser with no picture. */
const ALT = 'You naughty you — don’t try in incognito, play in a normal tab.';

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
  gate.setAttribute('aria-labelledby', 'private-head');
  gate.innerHTML = `
    <div class="private-sheet">
      <img class="private-art" src="${ARTWORK}" alt="${ALT}" decoding="async">
      <div class="private-words" id="private-head" hidden>
        <h1>You naughty you</h1>
        <p class="private-line">Don’t try in incognito, play in normal tab</p>
      </div>
      <p class="private-note">A private window forgets everything the moment you close it — including who the leaderboard thinks you are. Play here and the innings still counts for you, but it can’t be registered on the board.</p>
      <div class="private-keys">
        <button id="private-copy" class="secondary-button" type="button">COPY LINK</button>
        <button id="private-anyway" class="primary-button" type="button">PLAY ANYWAY <small>SCORE WON’T COUNT</small></button>
      </div>
    </div>`;
  const art = gate.querySelector<HTMLImageElement>('.private-art')!;
  const words = gate.querySelector<HTMLElement>('.private-words')!;
  // No artwork, no blank screen: the headline it carries, set in the game's own
  // type, stands in for it.
  art.onerror = () => { art.remove(); words.hidden = false; };
  root.appendChild(gate);
  document.body.classList.add('private-window');
  const copy = gate.querySelector<HTMLButtonElement>('#private-copy')!;
  copy.onclick = () => {
    // The link, to paste into an ordinary tab. A browser that will not hand over
    // the clipboard says so rather than pretending it worked.
    void navigator.clipboard?.writeText(location.href)
      .then(() => { copy.textContent = 'LINK COPIED'; })
      .catch(() => { copy.textContent = 'COPY IT FROM THE ADDRESS BAR'; });
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
