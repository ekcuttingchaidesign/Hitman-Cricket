/// <reference types="vite/client" />

/**
 * The build-time settings this game has, and there are only two.
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
 */
interface ImportMetaEnv {
  readonly VITE_BOARD_API?: string;
  readonly VITE_SURVIVE_ONLY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
