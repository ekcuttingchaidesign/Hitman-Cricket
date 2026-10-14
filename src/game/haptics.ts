/**
 * A buzz in the hand, where the phone will give one.
 *
 * Android's browsers take `navigator.vibrate` and play a whole pattern. Safari
 * on an iPhone has no vibrate at all, but from iOS 18 it gives the system's
 * own tick when a switch is flipped (`<input type="checkbox" switch>`), and a
 * label clicked from script flips it — so on an iPhone each pulse of a pattern
 * is one tick at the pulse's start. Everything else, a desktop included, does
 * nothing, quietly: a buzz is a garnish on a moment, never the moment.
 */

const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Safari on an iPhone or iPad, which is the only place the switch's tick is felt. */
const isApple = () => typeof navigator !== 'undefined'
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** One tick of the system's switch haptic. */
function tick() {
  try {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.append(input);
    document.head.append(label);
    label.click();
    label.remove();
  } catch { /* No tick, then. */ }
}

/**
 * A pattern in `navigator.vibrate`'s shape — on, off, on, … in ms — or one
 * length. Returns whether anything is likely to have been felt, for the checks.
 */
export function buzz(pattern: number | readonly number[]): boolean {
  const steps = typeof pattern === 'number' ? [pattern] : [...pattern];
  if (!steps.length) return false;
  if (canVibrate()) {
    try { return navigator.vibrate(steps); } catch { return false; }
  }
  if (!isApple()) return false;
  let at = 0;
  steps.forEach((ms, i) => {
    if (i % 2 === 0) { if (at === 0) tick(); else setTimeout(tick, at); }
    at += ms;
  });
  return true;
}

/** A pattern stopped short: a screen put away mid-buzz takes the buzz with it. */
export function stopBuzz() {
  if (canVibrate()) { try { navigator.vibrate(0); } catch { /* Nothing to stop. */ } }
}
