/// <reference types="vite/client" />

/**
 * The build-time settings this game has, and there are only three.
 *
 * `VITE_BOARD_API` is empty when Vercel serves both the game and its endpoints,
 * and set to the API's origin when the game is published somewhere that cannot
 * run them.
 *
 * `VITE_SURVIVE_ONLY` is set by the GitHub Pages workflow. A bundle built with
 * it plays Survive and nothing else: no mode picker, and no way to wander into
 * an innings whose leaderboard that host has no way to serve. That is what makes
 * publishing to Pages worth doing at all — the objection to a second copy of
 * this game has always been that it would be a copy with a dead board behind it,
 * and a mode that never asks the board anything does not have that problem.
 *
 * `VITE_SHOW_SURVIVE` is the other half of that, and it is off unless a build
 * asks for it. Survive is still in playtest: it belongs on the Pages build,
 * where people are being handed the link to give an opinion on the batting, and
 * not yet on the production ground where somebody arriving for the five-over
 * innings would be offered it. Without it the picker never opens and Play goes
 * straight to the classic innings — which is what production wants, and what
 * `?mode=SURVIVE` is still there to override for anyone testing.
 */
interface ImportMetaEnv {
  readonly VITE_BOARD_API?: string;
  readonly VITE_SURVIVE_ONLY?: string;
  readonly VITE_SHOW_SURVIVE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
