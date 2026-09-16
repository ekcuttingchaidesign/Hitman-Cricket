/**
 * What the game tells GoatCounter, and nothing more.
 *
 * GoatCounter has no custom properties: an event is a path and a title, so
 * everything worth knowing has to be in the name. Runs are therefore sent as a
 * band rather than a figure — `score-50-74`, not `score-63` — because fifty
 * thousand distinct paths is not a dashboard, and the board store already holds
 * the exact figures for every innings anybody claimed.
 *
 * Nothing here is fired ball by ball. A thirty-ball innings that reported every
 * delivery would be thirty hits for one player's two minutes, which buys a
 * noisier dashboard and a bill; the dozen-odd moments below are the ones that
 * answer a question about the game.
 */

interface Hit { path: string; title: string; event: true }

interface GoatCounter { count?: (hit: Hit) => void }

/** Hits raised before the counter script finished loading. */
const pending: Hit[] = [];
const fired = new Set<string>();
let drains = 0;

const counter = (): GoatCounter | undefined => (window as unknown as { goatcounter?: GoatCounter }).goatcounter;

/**
 * Whether a run of the game counts. The local dev server does not, and neither
 * does a page opened with a seed or the debug flag on, which is how the browser
 * checks play their innings — a scripted thirty balls is not a player, and a
 * dashboard that cannot tell the two apart is worth nothing.
 */
export function counting(where: { hostname: string; search: string }) {
  const params = new URLSearchParams(where.search);
  if (params.has('seed') || params.get('debug') === '1') return false;
  return !/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(where.hostname);
}

const enabled = (() => { try { return counting(location); } catch { return false; } })();

/**
 * Sends whatever is waiting. The script is loaded async, so the first events of
 * a session can beat it to the page; they queue and go out when it lands.
 * Fifteen seconds of trying is long enough for a slow connection and short
 * enough that a blocked script does not leave a timer running all innings.
 */
function drain() {
  const count = counter()?.count;
  if (!count) {
    if (drains++ < 15 && pending.length) setTimeout(drain, 1000);
    return;
  }
  drains = 0;
  while (pending.length) {
    try { count(pending.shift()!); } catch { /* Analytics never break an innings. */ }
  }
}

/** One moment, named. Unknown to the dashboard until it happens for the first time. */
export function track(name: string, title = name) {
  if (!enabled) return;
  pending.push({ path: name, title, event: true });
  drain();
}

/** The same, but only the first time it happens in this session. */
export function trackOnce(name: string, title = name) {
  if (fired.has(name)) return;
  fired.add(name);
  track(name, title);
}

/**
 * The innings' runs as a band. The cut-offs are the ones a cricketer reads: out
 * for single figures, a start, a thirty, a fifty, and a hundred — which on
 * thirty balls is a very good innings indeed.
 */
export function scoreBand(runs: number) {
  if (runs < 10) return 'score-0-9';
  if (runs < 25) return 'score-10-24';
  if (runs < 50) return 'score-25-49';
  if (runs < 75) return 'score-50-74';
  if (runs < 100) return 'score-75-99';
  return 'score-100-plus';
}
