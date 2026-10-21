/**
 * Super10, played a few thousand times by nobody.
 *
 * The player is `marathon-sim.ts`'s: a spread of timing error that widens on
 * the quicker ball and a lateness that rises with pace, playing the stroke
 * that best suits the line and pulling the odd bouncer. The ball is bowled by
 * `SUPER10_PLAN` and resolved by the Blast's `resolveShot` with the windows
 * the game grades it on (`windowsAt`), and the field is the game's own:
 * `steer` reads the swipe, `fieldRules` answers the ball, `plug` moves a man
 * into a gap a boundary went through, and Power Surge goes on by itself in the
 * ninth over. All of it imported, none of it restated.
 *
 * Each player reads the field some of the time: aiming at the middle of the
 * widest gap in the stroke's arc rather than at the arc's middle, with a thumb
 * that lands some degrees off where it meant. The board the design aims for
 * is a very good innings of 140–160 and the top of it 200–230. It plays no
 * meter strokes, which go where they are hit and which the field never
 * stops, so anyone who uses the meter scores more than this. `--blind` plays
 * without a field, for the ceiling.
 *
 *   npx vite-node scripts/super10-sim.ts [innings] [--blind]
 */
import { COMPATIBILITY, SHOTS } from '../src/config/gameplay.js';
import { SUPER10, windowsAt } from '../src/config/super10.js';
import { DeliveryGenerator, SUPER10_PLAN } from '../src/game/DeliveryGenerator.js';
import { effectiveLine } from '../src/game/DeliveryTrajectory.js';
import { SeededRandom } from '../src/game/SeededRandom.js';
import { resolveShot } from '../src/game/ShotResolver.js';
import {
  DEEP_REACH, PLUG, RING_REACH, bowlerOf, fieldFor, fieldRules, nearest, plug, steer, steerOf, surgeAuto, type FieldSet, type Steer,
} from '../src/game/super10-field.js';
import type { Delivery, ShotType } from '../src/game/types.js';
import { sectorOf } from '../src/scene/flight.js';

/** `reads`: how often they aim for the gap. `thumb`: how far, in degrees of swipe, a thumb lands off its aim. */
interface Player { name: string; sigma: number; pressure: number; reads: number; thumb: number }
const BLIND = process.argv.includes('--blind');

function gauss(rng: SeededRandom): number {
  const u = Math.max(1e-9, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}
const NOMINAL_MS = 830;
function bestShot(delivery: Delivery): ShotType {
  const line = effectiveLine(delivery);
  return SHOTS.reduce((a, b) => (COMPATIBILITY[line][a] >= COMPATIBILITY[line][b] ? a : b));
}
/** The middle of the widest gap in a stroke's arc, as a player reading the map would aim. */
function gapIn(field: FieldSet, [a0, a1]: readonly [number, number]) {
  const open = (a: number) => (nearest(field, a, true)?.by ?? Infinity) > DEEP_REACH && (nearest(field, a, false)?.by ?? Infinity) > RING_REACH;
  let best: [number, number] | null = null, from: number | null = null;
  for (let a = a0; a <= a1 + 1e-9; a++) {
    const here = a <= a1 && open(a);
    if (here && from === null) from = a;
    if (!here && from !== null) { if (!best || a - 1 - from > best[1] - best[0]) best = [from, a - 1]; from = null; }
  }
  return best ? (best[0] + best[1]) / 2 : (a0 + a1) / 2;
}
/** The swipe that aims a stroke at `angle`: the inverse of `steer`, before the thumb has its say. */
const swipeFor = ({ arc: [a0, a1], zone: [z0, z1] }: Steer, angle: number) => z0 + (angle - a0) / (a1 - a0) * (z1 - z0);

function play(player: Player, seed: number) {
  const rng = new SeededRandom(seed);
  const generator = new DeliveryGenerator(rng, SUPER10_PLAN);
  let runs = 0, wickets = 0, balls = 0, sixes = 0, fours = 0, fielded = 0;
  let field: FieldSet | null = null, surged = false, plugAt: number | null = null;
  while (balls < SUPER10.totalBalls && wickets < SUPER10.maxWickets) {
    const over = Math.floor(balls / SUPER10.ballsPerOver);
    if (balls % SUPER10.ballsPerOver === 0) {
      const surge = surgeAuto(over, surged);
      surged ||= surge;
      field = fieldFor({ bowler: bowlerOf(generator.overKind(over), over), over, surge });
      plugAt = null;
    } else if (plugAt !== null) { field = plug(field!, plugAt) ?? field; plugAt = null; }
    const delivery = generator.next(0);
    const rush = (NOMINAL_MS - delivery.durationMs) / 100;
    const shot: ShotType = delivery.style === 'SHORT' ? (rng.next() < 0.4 ? 'LEG' : 'DEFEND') : bestShot(delivery);
    const input = delivery.idealContactTimeMs + rush * 6 + gauss(rng) * (player.sigma + Math.max(0, rush) * player.pressure);
    const flicked = shot === 'LEG' && delivery.style !== 'SHORT';
    const attempt = { shotType: shot, inputTimeMs: input, flicked, grounded: shot === 'COVER_LONG_OFF' && rng.next() < .6 };
    let outcome = resolveShot(delivery, attempt, rng, false, windowsAt(wickets, balls));
    const lane = BLIND ? null : steerOf(shot, outcome, flicked);
    if (lane && field) {
      const aim = rng.next() < player.reads ? gapIn(field, lane.arc) : (lane.arc[0] + lane.arc[1]) / 2;
      const steered = steer(lane, swipeFor(lane, aim) + gauss(rng) * player.thumb);
      outcome = { ...outcome, angle: steered.angle };
      const line = sectorOf(outcome, shot), before = outcome.runs;
      outcome = fieldRules(outcome, line, field, rng, steered.stretch);
      fielded += Number(!!outcome.fielder);
      if (before >= 4 && outcome.runs >= 4 && !outcome.fielder && rng.next() < PLUG) plugAt = line;
    }
    generator.record(outcome);
    runs += outcome.runs; wickets += Number(outcome.isWicket); balls++;
    sixes += Number(outcome.runs === 6); fours += Number(outcome.runs === 4);
  }
  return { runs, wickets, balls, sixes, fours, fielded };
}

const INNINGS = Number(process.argv.find(a => /^\d+$/.test(a)) ?? 3000);
const PLAYERS: Player[] = [
  { name: 'pro', sigma: 34, pressure: 5, reads: .8, thumb: 10 },
  { name: 'regular', sigma: 52, pressure: 8, reads: .5, thumb: 14 },
  { name: 'beginner', sigma: 82, pressure: 12, reads: .15, thumb: 18 },
];

console.log(`\nSuper10 — ${INNINGS.toLocaleString()} innings each, ${BLIND ? 'no field' : 'against the field, steering'}, no meter strokes\n`);
console.log(['player'.padEnd(9), ' mean', '  p10', '  p50', '  p90', ' best', 'all out', '  6s', '  4s', 'no boundary', 'balls', 'fielded'].join(' '));
for (const player of PLAYERS) {
  const all = Array.from({ length: INNINGS }, (_, i) => play(player, (i * 2654435761 + 7) >>> 0));
  const runs = all.map(i => i.runs).sort((a, b) => a - b);
  const q = (f: number) => String(runs[Math.floor(f * (runs.length - 1))]).padStart(5);
  const mean = (pick: (i: ReturnType<typeof play>) => number) => all.reduce((t, i) => t + pick(i), 0) / all.length;
  console.log([
    player.name.padEnd(9), mean(i => i.runs).toFixed(0).padStart(5), q(.1), q(.5), q(.9), String(runs[runs.length - 1]).padStart(5),
    `${(all.filter(i => i.wickets >= SUPER10.maxWickets).length / all.length * 100).toFixed(0)}%`.padStart(7),
    mean(i => i.sixes).toFixed(1).padStart(4), mean(i => i.fours).toFixed(1).padStart(4),
    `${(all.filter(i => i.sixes + i.fours === 0).length / all.length * 100).toFixed(0)}%`.padStart(11),
    mean(i => i.balls).toFixed(0).padStart(5), mean(i => i.fielded).toFixed(1).padStart(7),
  ].join(' '));
}
console.log('');
