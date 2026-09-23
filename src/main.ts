import './styles.css';
import { feedbackRoute } from './game/feedback';
import { markNoticeSeen, noticeSeen, privateWindow } from './game/private-mode';
import { clearThisDevice, forgetFreshFlag, freshWanted } from './game/fresh-start';
import { privateNotice } from './ui/PrivateNotice';
import { freshNotice } from './ui/FreshNotice';
const root = document.querySelector<HTMLDivElement>('#app')!;
/**
 * Nothing is built until it is known whether this is a private window: a game
 * that started and was then covered over would have loaded the ground, opened
 * an audio context and begun an innings behind a screen asking the player to go
 * somewhere else. The check is capped at a few hundred milliseconds and defaults
 * to letting the player through, so an ordinary tab waits on it once and barely.
 */
void (async () => {
  /**
   * The shared feedback link is a page, not a game, and it is decided here —
   * before anything is imported — because of what the game costs to import. A
   * friend who tapped a link to answer ten questions about a cricket game should
   * not be made to download three.js, the ground, the crowd and five megabytes
   * of cover art to do it. `Game` is behind a dynamic import for that one
   * reason: it keeps the form to the handful of kilobytes it actually is.
   *
   * The private-window check is skipped too. It exists to protect a place on the
   * board, and there is no board on this page.
   */
  if (feedbackRoute(location)) {
    const { feedbackPage } = await import('./ui/Feedback');
    feedbackPage(root);
    return;
  }
  // Before anything reads who is playing, because that is the point: `Game` is
  // imported below and asks for the player id on the way up, so a slate cleared
  // after that would be a slate the game had already seen the old version of.
  if (freshWanted()) {
    forgetFreshFlag();
    if (await freshNotice(root)) await clearThisDevice();
  }
  const hidden = await privateWindow();
  // Asked once a session: a player who has read the notice and chosen to bat on
  // should not meet it again every time the page reloads.
  if (hidden && !noticeSeen()) { await privateNotice(root); markNoticeSeen(); }
  const { Game } = await import('./Game');
  // A forgetful window can still bat; what it cannot do is take a place on the
  // board, so the card offers it nothing to claim.
  const game = new Game(root, { canRegister: !hidden });
  window.addEventListener('pagehide', () => game.dispose(), { once: true });
})();
// A back/forward-cache restore must not reuse a disposed WebGL renderer.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
