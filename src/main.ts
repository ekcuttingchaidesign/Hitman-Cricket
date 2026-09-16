import './styles.css';
import { Game } from './Game';
import { markNoticeSeen, noticeSeen, privateWindow } from './game/private-mode';
import { privateNotice } from './ui/PrivateNotice';
const root = document.querySelector<HTMLDivElement>('#app')!;
/**
 * Nothing is built until it is known whether this is a private window: a game
 * that started and was then covered over would have loaded the ground, opened
 * an audio context and begun an innings behind a screen asking the player to go
 * somewhere else. The check is capped at a few hundred milliseconds and defaults
 * to letting the player through, so an ordinary tab waits on it once and barely.
 */
void (async () => {
  const hidden = await privateWindow();
  // Asked once a session: a player who has read the notice and chosen to bat on
  // should not meet it again every time the page reloads.
  if (hidden && !noticeSeen()) { await privateNotice(root); markNoticeSeen(); }
  // A forgetful window can still bat; what it cannot do is take a place on the
  // board, so the card offers it nothing to claim.
  const game = new Game(root, { canRegister: !hidden });
  window.addEventListener('pagehide', () => game.dispose(), { once: true });
})();
// A back/forward-cache restore must not reuse a disposed WebGL renderer.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
