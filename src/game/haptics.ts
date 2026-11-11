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

/**
 * The switch the tick is played on, made once and kept hidden in the head.
 * It used to be built, clicked and thrown away on every tick: two elements
 * added to the page and taken off it on the very frame the bat met the ball,
 * which on an iPhone is a style pass at the worst moment.
 */
let tickLabel: HTMLLabelElement | null = null;
/** One tick of the system's switch haptic. */
function tick() {
  try {
    if (!tickLabel || !tickLabel.isConnected) {
      tickLabel = document.createElement('label');
      tickLabel.setAttribute('aria-hidden', 'true');
      tickLabel.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      tickLabel.append(input);
      document.head.append(tickLabel);
    }
    tickLabel.click();
  } catch { /* No tick, then. */ }
}

/**
 * Whether the player wants the buzz at all: the pause sheet's Vibration
 * switch, kept in this browser (`hitman-haptics`). A player felt their phone
 * buzz on every stroke and asked for a way to stop it; off, nothing in the
 * game buzzes, the bat meeting the ball, Level Up, New #1 or a verdict.
 */
export const HAPTICS_KEY = 'hitman-haptics';
let hapticsOn = (() => { try { return localStorage.getItem(HAPTICS_KEY) !== 'off'; } catch { return true; } })();
export const hapticsWanted = () => hapticsOn;
export function setHaptics(on: boolean) {
  hapticsOn = on;
  try { localStorage.setItem(HAPTICS_KEY, on ? 'on' : 'off'); } catch { /* For this visit, then. */ }
  if (!on) stopBuzz();
}

/**
 * A pattern in `navigator.vibrate`'s shape — on, off, on, … in ms — or one
 * length. Returns whether anything is likely to have been felt, for the checks.
 */
export function buzz(pattern: number | readonly number[]): boolean {
  const steps = typeof pattern === 'number' ? [pattern] : [...pattern];
  if (!steps.length || !hapticsOn) return false;
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
