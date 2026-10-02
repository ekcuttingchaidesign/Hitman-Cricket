import { COMMIT, REST, markUnveiled, settle } from '../game/unveil';
import { track } from '../game/analytics';

/**
 * The covers coming off: the old ground over the new one, and a line to drag.
 *
 * Two photographs of the same ball — the same seed, the same moment in its
 * flight, on the ground before and the ground after — so
 * the line moving across is the only thing that changes and every difference
 * under it is the update's. They are photographs rather than the live ground
 * because two still pictures cost nothing a frame on a phone that is about to
 * bat; `scripts/unveil-shots.mjs` takes them.
 *
 * A pair for a phone held upright and a pair for a wider screen, picked by the
 * browser, so each only ever downloads the two it shows. Imported rather than
 * served from `public/`, so the build fingerprints them.
 */
const SHOTS = {
  before: {
    phone: new URL('../assets/unveil/old-phone.webp', import.meta.url).href,
    wide: new URL('../assets/unveil/old-wide.webp', import.meta.url).href,
  },
  after: {
    phone: new URL('../assets/unveil/new-phone.webp', import.meta.url).href,
    wide: new URL('../assets/unveil/new-wide.webp', import.meta.url).href,
  },
};

/** How long to wait for the pictures before letting the player bat without them. */
const LOAD_MS = 6000;

const ARROWS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 4 12l6 6M14 6l6 6-6 6"/></svg>';
const LEFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6"/></svg>';

export function unveilMarkup(): string {
  const shot = (which: 'before' | 'after', alt: string) => `
      <picture class="unveil-shot">
        <source media="(min-aspect-ratio: 1/1)" srcset="${SHOTS[which].wide}">
        <img src="${SHOTS[which].phone}" alt="${alt}" draggable="false">
      </picture>`;
  return `
    <div class="unveil is-loading" style="--at:${REST * 100}%">
      <div class="unveil-layer is-after">${shot('after',
    'The ground now: a cream pavilion with two green-roofed towers and its balconies behind the bowler, a white sightscreen, and white two-tier stands with tent roofs.')}
        <span class="unveil-tag">NEW GROUND</span>
      </div>
      <div class="unveil-layer is-before">${shot('before',
    'The ground as it was: a low clubhouse with three flags behind the bowler, and one tier of stands in a ring under flat roofs.')}
        <span class="unveil-tag">OLD GROUND</span>
      </div>
      <div id="unveil-line" class="unveil-line" role="slider" tabindex="0"
        aria-label="Pull the covers off the new ground" aria-valuemin="0" aria-valuemax="100"
        aria-valuenow="${Math.round((1 - REST) * 100)}" aria-valuetext="The old ground">
        <span class="unveil-grip">${ARROWS}</span>
      </div>
      <div class="unveil-foot">
        <p class="unveil-nudge" aria-hidden="true">${LEFT}<span>Swipe to pull the covers off</span></p>
        <div class="unveil-done" aria-live="polite">
          <p class="unveil-eyebrow">NEW PAVILION · NEW STANDS</p>
          <h2 class="unveil-title">Covers off. Play on.</h2>
          <button id="unveil-play" class="key-button unveil-key" type="button" tabindex="-1">PLAY</button>
        </div>
      </div>
    </div>`;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Puts the covers up in `host` and hands back a way to take them down.
 *
 * `done` is called once, when the player presses play on the new ground — or
 * straight away, without the reveal being counted, if the pictures never
 * arrive: a slow connection is not a reason to stand between anybody and an
 * innings, and the covers can come off next time.
 */
export function openUnveil(host: HTMLElement, done: () => void): () => void {
  host.innerHTML = unveilMarkup();
  host.classList.remove('hidden');
  const root = host.querySelector<HTMLElement>('.unveil')!;
  const line = host.querySelector<HTMLElement>('#unveil-line')!;
  const play = host.querySelector<HTMLButtonElement>('#unveil-play')!;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let at = REST;
  let open = false;
  let closed = false;
  let frame = 0;
  let nudging = 0;

  const place = (to: number) => {
    at = to;
    root.style.setProperty('--at', `${(to * 100).toFixed(2)}%`);
    const shown = Math.round((1 - to) * 100);
    line.setAttribute('aria-valuenow', String(shown));
    line.setAttribute('aria-valuetext', to <= COMMIT ? 'The new ground' : `The old ground, ${shown}% pulled back`);
  };

  /** The line eased to `to`, and whatever comes after it. */
  const slide = (to: number, ms: number, then?: () => void) => {
    cancelAnimationFrame(frame);
    const from = at, start = performance.now();
    const step = (now: number) => {
      const t = clamp((now - start) / ms, 0, 1);
      place(from + (to - from) * easeOut(t));
      if (t < 1) frame = requestAnimationFrame(step);
      else then?.();
    };
    frame = requestAnimationFrame(step);
  };

  /**
   * The nudge: the line leans in and back every couple of seconds until it is
   * touched, which is what says it can be moved at all. Not for somebody who
   * has asked for less motion; the arrow under it says the same thing still.
   */
  const nudge = (delay = 900) => {
    window.clearTimeout(nudging);
    if (still || open) return;
    nudging = window.setTimeout(() => slide(REST - 0.08, 420, () => slide(REST, 520, () => nudge(1500))), delay);
  };
  const quiet = () => { window.clearTimeout(nudging); cancelAnimationFrame(frame); };

  const reveal = () => {
    if (open) return;
    open = true;
    quiet();
    markUnveiled();
    track('unveil-open', 'Pulled the covers off the new ground');
    slide(0, 420, () => {
      root.classList.add('is-open');
      line.setAttribute('tabindex', '-1');
      play.tabIndex = 0;
      play.focus({ preventScroll: true });
    });
  };

  const close = (seen: boolean) => {
    if (closed) return;
    closed = true;
    teardown();
    if (!seen) track('unveil-skipped', 'The new ground did not load in time');
    done();
  };

  // Dragging: anywhere on the picture, not only the grip, and relative to
  // where the finger came down, so a swipe from the middle of the screen is
  // as good as one that starts on the line. The line follows the finger to the
  // right as far as its rest and a little beyond, which is what makes it feel
  // held rather than stuck.
  let drag: { id: number; x: number; from: number; width: number; lastX: number; lastT: number; speed: number } | null = null;
  const down = (event: PointerEvent) => {
    if (open || drag || root.classList.contains('is-loading')) return;
    quiet();
    root.classList.add('is-dragging');
    const width = root.clientWidth || 1;
    drag = { id: event.pointerId, x: event.clientX, from: at, width, lastX: event.clientX, lastT: event.timeStamp, speed: 0 };
    try { root.setPointerCapture(event.pointerId); } catch { /* Then it follows while it is over the picture. */ }
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dt = Math.max(1, event.timeStamp - drag.lastT);
    // Widths a second, smoothed a little so one late sample does not decide it.
    drag.speed = drag.speed * 0.4 + ((event.clientX - drag.lastX) / drag.width / (dt / 1000)) * 0.6;
    drag.lastX = event.clientX; drag.lastT = event.timeStamp;
    place(clamp(drag.from + (event.clientX - drag.x) / drag.width, 0, REST + 0.06));
  };
  const up = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const { speed } = drag;
    drag = null;
    root.classList.remove('is-dragging');
    if (settle(at, speed) === 'open') reveal();
    else slide(REST, 360, () => nudge(1800));
  };

  // The keys, for whoever is not holding a mouse or a phone: the arrows move
  // it a tenth at a time, and Enter, Space or End take it all the way.
  const keys = (event: KeyboardEvent) => {
    if (open) return;
    const key = event.key;
    if (key === 'Enter' || key === ' ' || key === 'End') { event.preventDefault(); return reveal(); }
    if (key === 'ArrowLeft' || key === 'ArrowDown') {
      event.preventDefault(); quiet();
      const to = at - 0.1;
      return to <= COMMIT ? reveal() : slide(to, 160);
    }
    if (key === 'ArrowRight' || key === 'ArrowUp' || key === 'Home') {
      event.preventDefault(); quiet();
      slide(key === 'Home' ? REST : Math.min(REST, at + 0.1), 160);
    }
  };

  root.addEventListener('pointerdown', down);
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', up);
  line.addEventListener('keydown', keys);
  play.onclick = () => close(true);

  // Nothing goes up until both pictures can be drawn: a line dragged across a
  // blank would reveal nothing, and a half-loaded picture tearing in under the
  // thumb is the opposite of the moment this is for.
  const pictures = [...host.querySelectorAll('img')].map(img => img.decode());
  const late = new Promise<'late'>(resolve => window.setTimeout(() => resolve('late'), LOAD_MS));
  void Promise.race([Promise.all(pictures).then(() => 'ready' as const), late])
    .catch(() => 'late' as const)
    .then(state => {
      if (closed) return;
      if (state === 'late') return close(false);
      root.classList.remove('is-loading');
      line.focus({ preventScroll: true });
      nudge(700);
    });

  function teardown() {
    quiet();
    root.removeEventListener('pointerdown', down);
    root.removeEventListener('pointermove', move);
    root.removeEventListener('pointerup', up);
    root.removeEventListener('pointercancel', up);
    host.classList.add('hidden');
    host.innerHTML = '';
  }
  return () => { closed = true; teardown(); };
}
