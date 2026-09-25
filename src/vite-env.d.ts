/// <reference types="vite/client" />

/**
 * The build-time settings this game has, and there are only six.
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
 * `VITE_SPIN_ONLY` hands the spinner every over instead of one in five. It is
 * a playtest build and nothing else: the two sweeps and the leg-side flick all
 * turn on which way the ball is spinning, and waiting for over three to come
 * round is no way to look at them. `?spin=1` does the same thing at runtime for
 * anyone who has a dev server rather than a bundle.
 *
 * `VITE_CHARGE_ONLY` is the same kind of thing for the advance charge: the
 * meter is full every ball and every ball is one he can walk at, so the stroke
 * can be looked at in the game without scoring four boundaries to earn each
 * look. `?charge=1` does it at runtime. Set to `ball`, only the ball is fixed
 * and the meter is the innings' own, for the sixes a perfect drive plays when
 * there is no charge to play instead. Set to `meter`, only the meter is filled
 * and the ball is the innings' own, for the scoops, which want every line the
 * bowler has.
 *
 * `VITE_CHARGE_SLOWMO` goes with it: how slowly the clock runs through the
 * charge, as a fraction of real time, so two playtest builds can be put side
 * by side. Two thirds unless set; 1 turns the slow motion off. `?slowmo=` at runtime.
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
  readonly VITE_SPIN_ONLY?: string;
  readonly VITE_CHARGE_ONLY?: string;
  readonly VITE_CHARGE_SLOWMO?: string;
  readonly VITE_SHOW_SURVIVE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
