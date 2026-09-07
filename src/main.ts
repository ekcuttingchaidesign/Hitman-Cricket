import './styles.css';
import { Game } from './Game';
const game = new Game(document.querySelector<HTMLDivElement>('#app')!);
window.addEventListener('pagehide', () => game.dispose(), { once: true });
// A back/forward-cache restore must not reuse a disposed WebGL renderer.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
