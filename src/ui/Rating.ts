import { RATED_NAME, STAR_WORDS, tierOf, type RatedThing } from '../game/rating';

/**
 * The star prompt, as a screen.
 *
 * A card at the foot of the screen, as the handover draws it (Figma 133:12547
 * and 133:12577): the screen behind dimmed, QUICK ONE by a dot in the colour of
 * the thing asked about, the question, five stars with the two ends of the
 * scale under them, and a line saying one tap is all it takes. It is small and
 * it goes with one tap of the cross, or of the dark round it.
 *
 * One tap is also the whole of rating, and it is not final. The stars stay live
 * while the sticker is up: a second thought is a second tap, and the sticker
 * answers it as it answered the first — the words, the keys and the fuss all
 * follow the new mark. What is sent is the mark the player settled on, once
 * they stop changing it (`SEND_AFTER_MS`), or at once when they move on — Done,
 * the cross, saying more, or leaving the page — so somebody who taps three and
 * then five is one rating of five, not two ratings.
 *
 * The stars are dragged as well as tapped: a thumb laid on the row and slid
 * along it fills them as it goes and rates where it lifts, which is how a phone
 * expects a rating to work. A keyboard walks them with the arrows.
 *
 * How it reacts is decided by the stars, deliberately unevenly. One or two is
 * met quietly — the stars dim and settle, and nothing is thrown in the air for
 * an opinion that the game fell short. Three glows. Four bursts. Five is hit for
 * six: the last star goes up as a ball and off the top of the screen. Every one
 * of these is dropped for a player who has asked for less motion, leaving the
 * stars to fill and nothing else.
 */

export interface RatingPromptOptions {
  root: HTMLElement;
  thing: RatedThing;
  /**
   * The mark the player settled on, to be sent. Called again only if they change
   * it after it has gone, with `changed` set.
   */
  onRate: (stars: number, changed: boolean) => void;
  /** "Tell us more", after a rating. The prompt has already gone. */
  onMore: (stars: number) => void;
  /** Waved away before any star was given. */
  onDismiss: () => void;
}

export interface RatingPrompt {
  close(): void;
  readonly open: boolean;
}

/** What the prompt says once it has been answered, by how it was answered. */
const AFTER = {
  low: { say: 'Ouch — sorry it fell short.', more: 'TELL US WHY' },
  mid: { say: 'Fair. What would make it a five?', more: 'TELL US MORE' },
  high: { say: 'Glad you’re enjoying it.', more: 'WHAT’S NEXT?' },
  top: { say: 'Six over the stands. Thank you!', more: 'WHAT’S NEXT?' },
} as const;

/** How long the stars hold the floor before the prompt asks for more. */
const SETTLE_MS = { low: 700, mid: 800, high: 900, top: 1300 } as const;

/** How long a mark is left alone before it counts as settled and is sent. */
export const SEND_AFTER_MS = 1500;

const TIERS = ['is-low', 'is-mid', 'is-high', 'is-top'];

/** A star (the design's two): an outline waiting for a tap, and the gold one that fills it. */
const STAR = '<svg viewBox="0 0 52 52" aria-hidden="true">'
  + '<path class="rate-star-edge" d="M23.957 12.2197C24.7613 10.4768 27.2387 10.4768 28.043 12.2197L30.2588 17.0225C30.805 18.2066 31.9267 19.0221 33.2217 19.1758L38.4736 19.7988C40.3803 20.0249 41.146 22.381 39.7363 23.6846L35.8535 27.2754C34.896 28.1609 34.4675 29.4806 34.7217 30.7598L35.7529 35.9473C36.127 37.8304 34.1216 39.2864 32.4463 38.3486L27.832 35.7656C26.694 35.1286 25.306 35.1286 24.168 35.7656L19.5537 38.3486C17.8784 39.2864 15.873 37.8304 16.2471 35.9473L17.2783 30.7598C17.5325 29.4806 17.104 28.1609 16.1465 27.2754L12.2637 23.6846C10.854 22.381 11.6197 20.0249 13.5264 19.7988L18.7783 19.1758C20.0733 19.0221 21.195 18.2066 21.7412 17.0225L23.957 12.2197Z"/>'
  + '<path class="rate-star-fill" d="M23.2758 11.906C24.3481 9.58138 27.6519 9.58138 28.7242 11.906L30.9394 16.7086C31.3764 17.656 32.2742 18.3083 33.3103 18.4312L38.5624 19.0539C41.1046 19.3553 42.1255 22.4974 40.246 24.2356L36.363 27.8264C35.597 28.5348 35.2541 29.5903 35.4574 30.6136L36.4882 35.8011C36.9871 38.312 34.3142 40.2539 32.0803 39.0035L27.4653 36.4202C26.5549 35.9106 25.4451 35.9106 24.5347 36.4202L19.9197 39.0035C17.6858 40.2539 15.0129 38.312 15.5119 35.8011L16.5426 30.6136C16.7459 29.5903 16.403 28.5348 15.637 27.8264L11.754 24.2356C9.87449 22.4974 10.8954 19.3553 13.4376 19.0539L18.6897 18.4312C19.7258 18.3083 20.6236 17.656 21.0606 16.7086L23.2758 11.906Z"/></svg>';
/** The cross on the close key (Figma 133:12555). */
const CROSS = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 4 4 12M4 4l8 8"/></svg>';

export function askRating(options: RatingPromptOptions): RatingPrompt {
  const name = RATED_NAME[options.thing];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let given = 0;
  /** What was last sent, so a mark is only sent again when it has changed. */
  let sent = 0;
  let open = true;
  let dragging = false;
  let settle = 0;
  let sending = 0;
  let clearing = 0;

  // The screen behind, dimmed; a tap on it is the cross.
  const scrim = document.createElement('div');
  scrim.className = 'rate-scrim';
  options.root.appendChild(scrim);
  const pop = document.createElement('div');
  pop.className = 'rate-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', `Rate ${name}`);
  pop.dataset.thing = options.thing;
  pop.innerHTML = `
    <svg class="rate-defs" width="0" height="0" aria-hidden="true"><defs><linearGradient id="rate-gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#f2a62e"/>
    </linearGradient></defs></svg>
    <div class="rate-head"><p class="rate-eyebrow"><i aria-hidden="true"></i>QUICK ONE</p>
      <button class="rate-close" type="button" aria-label="Not now">${CROSS}</button></div>
    <h3 class="rate-ask"><span class="rate-ask-lead">${options.thing === 'game' ? 'How are you finding' : 'How was'}</span>
      <span class="rate-ask-name">${name}?</span></h3>
    <div class="rate-stars" role="radiogroup" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `
      <button class="rate-star" type="button" role="radio" aria-checked="false" data-n="${n}" style="--i:${n - 1}"
        aria-label="${n} star${n > 1 ? 's' : ''} — ${STAR_WORDS[n - 1]}" tabindex="${n === 1 ? 0 : -1}">${STAR}</button>`).join('')}
    </div>
    <p class="rate-scale" aria-hidden="true"><span>${STAR_WORDS[0]}</span><span>${STAR_WORDS[4]}</span></p>
    <p class="rate-word" aria-live="polite"></p>
    <p class="rate-hint">Tap a star. That’s all it takes.</p>
    <div class="rate-after" hidden></div>
    <div class="rate-burst" aria-hidden="true"></div>`;
  options.root.appendChild(pop);

  // A mode's question on one line, as drawn, a size or two smaller where its
  // name is long; the game's own question is longer and takes two.
  const ask = pop.querySelector<HTMLElement>('.rate-ask')!;
  if (options.thing !== 'game') {
    ask.classList.add('is-one-line');
    for (let size = parseFloat(getComputedStyle(ask).fontSize); ask.scrollWidth > ask.clientWidth && size > 18; size--) ask.style.fontSize = `${size - 1}px`;
  }

  const row = pop.querySelector<HTMLElement>('.rate-stars')!;
  const stars = [...pop.querySelectorAll<HTMLButtonElement>('.rate-star')];
  const word = pop.querySelector<HTMLElement>('.rate-word')!;
  const burst = pop.querySelector<HTMLElement>('.rate-burst')!;

  scrim.onclick = pop.querySelector<HTMLButtonElement>('.rate-close')!.onclick = () => {
    if (!given) options.onDismiss();
    close();
  };

  /**
   * The stars lit up to `n`, without giving them. Nought puts back whatever is
   * given — nothing, or the mark already chosen.
   */
  const preview = (n: number) => {
    const shown = n || given;
    stars.forEach((star, i) => star.classList.toggle('is-lit', i < shown));
    word.textContent = shown ? STAR_WORDS[shown - 1] : '';
    pop.classList.toggle('is-previewing', n > 0 && n !== given);
  };

  /** Which star a finger or pointer is over, read off the row so a drag between stars still lands. */
  const starAt = (x: number) => {
    const box = row.getBoundingClientRect();
    return Math.max(1, Math.min(5, Math.ceil(((x - box.left) / box.width) * 5)));
  };

  row.addEventListener('pointerdown', event => {
    dragging = true;
    // Kept to the row so a thumb that strays above it while sliding still
    // rates. A pointer the browser no longer knows cannot be captured, and the
    // row works without it.
    try { row.setPointerCapture(event.pointerId); } catch { /* Then it is not held. */ }
    preview(starAt(event.clientX));
  });
  row.addEventListener('pointermove', event => {
    if (!dragging && event.pointerType !== 'mouse') return;
    preview(starAt(event.clientX));
  });
  row.addEventListener('pointerup', event => {
    if (!dragging) return;
    dragging = false;
    rate(starAt(event.clientX));
  });
  row.addEventListener('pointercancel', () => { dragging = false; preview(0); });
  row.addEventListener('pointerleave', event => { if (!dragging && event.pointerType === 'mouse') preview(0); });

  stars.forEach((star, i) => {
    // A click with no pointer behind it is the keyboard's Enter or Space. The
    // pointer's own clicks are already answered by `pointerup`.
    star.addEventListener('click', event => { if (event.detail === 0) rate(i + 1); });
    star.addEventListener('focus', () => { if (star.matches(':focus-visible')) preview(i + 1); });
    star.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = stars[Math.max(0, Math.min(4, i + step))];
      stars.forEach(one => { one.tabIndex = one === next ? 0 : -1; });
      next.focus();
      preview(Number(next.dataset.n));
    });
  });

  function rate(n: number) {
    if (!open || n === given) return;
    given = n;
    const tier = tierOf(n);
    pop.classList.remove('is-previewing', 'is-rated', ...TIERS);
    // Taken off and put back with a layout between, so a second mark plays its
    // own pop rather than leaving the first one's finished frame on screen.
    void pop.offsetWidth;
    pop.classList.add('is-rated', `is-${tier}`);
    pop.dataset.stars = String(n);
    stars.forEach((star, i) => {
      star.classList.toggle('is-lit', i < n);
      star.classList.toggle('is-on', i < n);
      star.classList.toggle('is-picked', i === n - 1);
      star.setAttribute('aria-checked', String(i === n - 1));
    });
    word.textContent = STAR_WORDS[n - 1];
    try { navigator.vibrate?.(n >= 4 ? [12, 50, 22] : 10); } catch { /* No buzz, then. */ }
    if (!calm) celebrate(tier, stars[n - 1]);
    window.clearTimeout(sending);
    sending = window.setTimeout(send, SEND_AFTER_MS);
    // The keys are already up after a change of mind: they are rewritten for
    // the new mark straight away rather than taken down and brought back.
    window.clearTimeout(settle);
    if (pop.classList.contains('is-asking')) after();
    else settle = window.setTimeout(after, calm ? 300 : SETTLE_MS[tier]);
  }

  /** The mark as it stands, sent if it has not been already. */
  function send() {
    window.clearTimeout(sending);
    if (!given || given === sent) return;
    const changed = sent > 0;
    sent = given;
    options.onRate(given, changed);
  }

  /** The offer of more, in words that answer the stars. */
  function after() {
    if (!open) return;
    const tier = tierOf(given);
    const panel = pop.querySelector<HTMLElement>('.rate-after')!;
    panel.innerHTML = `
      <p class="rate-say">${AFTER[tier].say}</p>
      <div class="rate-keys">
        <button class="rate-done" type="button">DONE</button>
        <button class="rate-more" type="button">${AFTER[tier].more}</button>
      </div>`;
    panel.hidden = false;
    pop.classList.add('is-asking');
    panel.querySelector<HTMLButtonElement>('.rate-more')!.onclick = () => { const stars = given; close(); options.onMore(stars); };
    panel.querySelector<HTMLButtonElement>('.rate-done')!.onclick = () => close();
  }

  /**
   * What is thrown up when a star lands. Built here rather than drawn in the
   * stylesheet because each piece needs a direction of its own; the stylesheet
   * moves them, and they are taken away once it has.
   */
  function celebrate(tier: 'low' | 'mid' | 'high' | 'top', star: HTMLElement) {
    window.clearTimeout(clearing);
    burst.innerHTML = '';
    if (tier === 'low') return;
    const from = star.getBoundingClientRect();
    const box = pop.getBoundingClientRect();
    const x = from.left + from.width / 2 - box.left;
    const y = from.top + from.height / 2 - box.top;
    const piece = (cls: string, vars: Record<string, string | number>) => {
      const one = document.createElement('i');
      one.className = cls;
      one.style.left = `${x}px`;
      one.style.top = `${y}px`;
      for (const [key, value] of Object.entries(vars)) one.style.setProperty(`--${key}`, String(value));
      burst.appendChild(one);
    };
    if (tier === 'mid') { piece('rate-ring', {}); return; }
    const sparks = tier === 'top' ? 22 : 12;
    for (let i = 0; i < sparks; i++) {
      const angle = (i / sparks) * Math.PI * 2 + Math.random() * 0.4;
      const reach = (tier === 'top' ? 70 : 44) + Math.random() * 34;
      piece(tier === 'top' ? `rate-confetti c${i % 4}` : 'rate-spark', {
        dx: `${Math.cos(angle) * reach}px`,
        dy: `${Math.sin(angle) * reach - (tier === 'top' ? 20 : 0)}px`,
        r: `${Math.round(Math.random() * 540 - 270)}deg`,
        d: `${Math.round(Math.random() * 120)}ms`,
      });
    }
    if (tier === 'top') {
      piece('rate-ball', {});
      piece('rate-six', {});
      // The whole sticker takes the hit. Played here rather than by a class,
      // because a class that also carried the arrival would play the arrival
      // again every time somebody changed their mind to five.
      pop.animate([
        { transform: 'translateX(-50%)' },
        { transform: 'translate(-50%,6px) scale(1.02) rotate(-1deg)', offset: 0.3 },
        { transform: 'translate(-50%,-2px)', offset: 0.6 },
        { transform: 'translateX(-50%)' },
      ], { duration: 420, delay: 240, easing: 'ease-out' });
    }
    clearing = window.setTimeout(() => { burst.innerHTML = ''; }, 1800);
  }

  // Leaving the page is moving on too: the mark goes with it rather than with
  // a timer that will never fire.
  window.addEventListener('pagehide', send);

  function close() {
    if (!open) return;
    send();
    window.removeEventListener('pagehide', send);
    open = false;
    window.clearTimeout(settle);
    pop.classList.add('is-leaving');
    scrim.classList.add('is-leaving');
    window.setTimeout(() => { pop.remove(); scrim.remove(); }, calm ? 0 : 260);
  }

  return {
    close,
    get open() { return open; },
  };
}
