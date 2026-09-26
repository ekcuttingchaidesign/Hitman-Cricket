/**
 * The little films: a trophy going up, the bails coming off, two bats crossed,
 * a ball bouncing while somebody waits.
 *
 * They are Lottie files in `public/lotties/`, drawn by `scripts/lottie-art.mjs`
 * in the game's own colours, and played by lottie-web's light build. The
 * player is a hundred and sixty kilobytes, which is why it is fetched the first
 * time a film is asked for and not a byte before: most innings never reach a
 * match room, and the ground should not pay for a trophy it will not show.
 *
 * Reduced motion is honoured by showing the last frame: the picture still says
 * what happened, it just does not move to say it.
 */

export type Film = 'win' | 'lose' | 'draw' | 'waiting' | 'joined';

export interface Playing {
  /** Takes the film down and frees what it was holding. */
  destroy(): void;
}

type Lottie = typeof import('lottie-web/build/player/lottie_light').default;
let player: Promise<Lottie> | null = null;

function load(): Promise<Lottie> {
  player ??= import('lottie-web/build/player/lottie_light').then(module => module.default);
  return player;
}

/** Where the films live. A bare relative path, for the same reason the kits use one. */
const src = (film: Film) => `lotties/${film}.json`;

/**
 * Plays a film into an element. The element is emptied first, so playing a
 * second film into the same slot replaces the first rather than stacking on it.
 * Nothing here throws: a film that cannot load leaves an empty slot, and every
 * screen that carries one reads without it.
 */
export function playFilm(host: HTMLElement, film: Film, options: { loop?: boolean } = {}): Playing {
  host.innerHTML = '';
  host.dataset.film = film;
  let gone = false;
  let animation: { destroy(): void; goToAndStop(frame: number, isFrame?: boolean): void; totalFrames: number } | null = null;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  void load().then(lottie => {
    if (gone) return;
    animation = lottie.loadAnimation({
      container: host,
      renderer: 'svg',
      loop: options.loop ?? false,
      autoplay: !still,
      path: src(film),
      rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true },
    });
    if (still) animation.goToAndStop(Math.max(0, animation.totalFrames - 1), true);
  }).catch(() => { /* No film. The words above it still say what happened. */ });
  return {
    destroy() {
      gone = true;
      animation?.destroy();
      animation = null;
      host.innerHTML = '';
    },
  };
}
