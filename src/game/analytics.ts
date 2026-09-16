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
 * Whether the innings being played is one the dashboard counts.
 *
 * Survive is not. It shares this loop with the classic innings but almost
 * nothing else — no board, no best score, and two win conditions the bands
 * below cannot describe — so an innings of it reporting `innings-start` and
 * then never reporting an end would read as a five-over innings somebody
 * abandoned. The distinction the dashboard is for is between a player who
 * finished and one who walked off, and Survive would put thousands of false
 * walk-offs on the wrong side of it.
 *
 * So it says nothing at all rather than saying something wrong. The cost is
 * real and worth naming: the mode being actively playtested is the one there
 * is no data for, and the Pages build is Survive end to end, so that whole
 * deployment is silent.
 */
let suspended = false;

/** Turn counting on for the classic innings, off for Survive. */
export function reporting(on: boolean) { suspended = !on; }

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
  if (!enabled || suspended) return;
  pending.push({ path: name, title, event: true });
  drain();
}

/** The same, but only the first time it happens in this session. */
export function trackOnce(name: string, title = name) {
  if (suspended || fired.has(name)) return;
  fired.add(name);
  track(name, title);
}

/**
 * How long an innings took, in bands.
 *
 * A counter cannot be told "this one took 104 seconds" any more than it can be
 * told how many runs were scored, so the average comes out of a histogram: the
 * bands are narrow where the innings actually fall — thirty balls is around two
 * minutes — and open-ended at both ends, where an innings is either three
 * wickets inside an over or somebody who wandered off mid-over.
 */
export function inningsBand(ms: number) {
  const seconds = ms / 1000;
  if (seconds < 30) return 'innings-under-30s';
  if (seconds < 60) return 'innings-30-60s';
  if (seconds < 90) return 'innings-60-90s';
  if (seconds < 120) return 'innings-90-120s';
  if (seconds < 180) return 'innings-2-3m';
  if (seconds < 300) return 'innings-3-5m';
  return 'innings-over-5m';
}

/**
 * The marks a session is counted past, in minutes.
 *
 * Reported as they are reached rather than totted up at the end, which is the
 * whole trick: there is no reliable moment to measure a session's length in,
 * because a browser closing a tab will not be waited on to send anything. A mark
 * passed is sent while the page is alive and cannot be lost, and the counts
 * falling away across the marks are the distribution — a hundred sessions past
 * one minute and thirty past ten says more than an average would.
 */
export const PLAY_MARKS = [1, 3, 5, 10, 20, 30] as const;

/** The mark names this many milliseconds of play has passed. */
export function marksPassed(playedMs: number) {
  return PLAY_MARKS.filter(minutes => playedMs >= minutes * 60_000).map(minutes => `played-${minutes}m`);
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
