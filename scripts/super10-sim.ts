/**
 * Super10, played a few thousand times by nobody.
 *
 * The player is `marathon-sim.ts`'s: a spread of timing error that widens on
 * the quicker ball and a lateness that rises with pace, playing the stroke
 * that best suits the line and pulling the odd bouncer. The ball is bowled by
 * `SUPER10_PLAN` and resolved by the Blast's `resolveShot` with the windows
 * the game grades it on (`windowsAt`), both imported rather than restated.
 *
 * It plays no special strokes, and there is no field yet: the boundary riders
 * still to come are what is meant to bring the strong player's totals down to
 * the board the design aims for (a very good innings 140–160, the top of the
 * board 200–230). Until then, read these as the ceiling.
 *
 *   npx vite-node scripts/super10-sim.ts [innings]
 */
import { COMPATIBILITY, SHOTS } from '../src/config/gameplay.js';
import { SUPER10, windowsAt } from '../src/config/super10.js';
import { DeliveryGenerator, SUPER10_PLAN } from '../src/game/DeliveryGenerator.js';
import { effectiveLine } from '../src/game/DeliveryTrajectory.js';
import { SeededRandom } from '../src/game/SeededRandom.js';
import { resolveShot } from '../src/game/ShotResolver.js';
import type { Delivery, ShotType } from '../src/game/types.js';

interface Player { name: string; sigma: number; pressure: number }

function gauss(rng: SeededRandom): number {
  const u = Math.max(1e-9, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}
const NOMINAL_MS = 830;
function bestShot(delivery: Delivery): ShotType {
  const line = effectiveLine(delivery);
  return SHOTS.reduce((a, b) => (COMPATIBILITY[line][a] >= COMPATIBILITY[line][b] ? a : b));
}

function play(player: Player, seed: number) {
  const rng = new SeededRandom(seed);
  const generator = new DeliveryGenerator(rng, SUPER10_PLAN);
  let runs = 0, wickets = 0, balls = 0, sixes = 0, fours = 0;
  const byBowler: Record<string, { runs: number; balls: number; wickets: number }> = {};
  while (balls < SUPER10.totalBalls && wickets < SUPER10.maxWickets) {
    const over = Math.floor(balls / SUPER10.ballsPerOver);
    const kind = generator.overKind(over) ?? 'PACE';
    const who = kind === 'PACE' ? (over === 0 || over === 2 ? 'SWING' : 'SEAM') : kind === 'EXPRESS' ? 'SLING' : kind;
    const delivery = generator.next(0);
    const rush = (NOMINAL_MS - delivery.durationMs) / 100;
    const shot: ShotType = delivery.style === 'SHORT' ? (rng.next() < 0.4 ? 'LEG' : 'DEFEND') : bestShot(delivery);
    const input = delivery.idealContactTimeMs + rush * 6 + gauss(rng) * (player.sigma + Math.max(0, rush) * player.pressure);
    const outcome = resolveShot(delivery, { shotType: shot, inputTimeMs: input }, rng, false, windowsAt(wickets, balls));
    generator.record(outcome);
    runs += outcome.runs; wickets += Number(outcome.isWicket); balls++;
    sixes += Number(outcome.runs === 6); fours += Number(outcome.runs === 4);
    const tally = byBowler[who] ??= { runs: 0, balls: 0, wickets: 0 };
    tally.runs += outcome.runs; tally.balls++; tally.wickets += Number(outcome.isWicket);
  }
  return { runs, wickets, balls, sixes, fours, byBowler };
}

const INNINGS = Number(process.argv[2] ?? 4000);
const PLAYERS: Player[] = [
  { name: 'expert', sigma: 34, pressure: 5 },
  { name: 'competent', sigma: 52, pressure: 8 },
  { name: 'novice', sigma: 82, pressure: 12 },
];

console.log(`\nSuper10 — ${INNINGS.toLocaleString()} innings each, no field yet, no special strokes\n`);
console.log(['player'.padEnd(11), ' mean', '  p50', '  p90', '  p99', ' best', 'all out', '  6s', '  4s', '  runs an over by bowler'].join(' '));
for (const player of PLAYERS) {
  const all = Array.from({ length: INNINGS }, (_, i) => play(player, (i * 2654435761 + 1) >>> 0));
  const runs = all.map(i => i.runs).sort((a, b) => a - b);
  const q = (f: number) => String(runs[Math.floor(f * (runs.length - 1))]).padStart(5);
  const mean = (pick: (i: ReturnType<typeof play>) => number) => all.reduce((t, i) => t + pick(i), 0) / all.length;
  const bowlers = ['SWING', 'SEAM', 'SPIN', 'SLING', 'DEATH'].map(who => {
    const r = all.reduce((t, i) => t + (i.byBowler[who]?.runs ?? 0), 0), b = all.reduce((t, i) => t + (i.byBowler[who]?.balls ?? 0), 0);
    return `${who.toLowerCase()} ${b ? (r / b * 6).toFixed(1) : '—'}`;
  }).join(' · ');
  console.log([
    player.name.padEnd(11), mean(i => i.runs).toFixed(0).padStart(5), q(.5), q(.9), q(.99), String(runs[runs.length - 1]).padStart(5),
    `${(all.filter(i => i.wickets >= SUPER10.maxWickets).length / all.length * 100).toFixed(0)}%`.padStart(7),
    mean(i => i.sixes).toFixed(1).padStart(4), mean(i => i.fours).toFixed(1).padStart(4), '  ' + bowlers,
  ].join(' '));
}
console.log('');
