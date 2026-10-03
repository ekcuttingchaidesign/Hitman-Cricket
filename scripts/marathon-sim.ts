/**
 * The Marathon, played a few thousand times by nobody.
 *
 * `survive-sim.ts` with three batters in it. The player is modelled exactly as
 * he is there — a spread of timing error that widens on the quicker ball, a
 * lateness that rises with pace, and a policy for what he plays at — and the
 * ball is resolved by the same pure function the game calls, with the windows
 * of whichever batter is in. The bowling is `MARATHON_PLAN`, imported rather
 * than restated, for the reason that file gives.
 *
 * Two things are reported:
 *
 *   - **The innings**: how long it lasts, what it makes, how it ends, and what
 *     each of the three batters contributes — the drop in skill should show as
 *     a drop in runs, not vanish into the noise.
 *   - **The express over against a fresh opener**: one over of the Level 3
 *     bowler to a batter with a full meter, played over and over. The spec's
 *     bar is that it carries him off **no more than about one over in six**.
 *
 *   npx vite-node scripts/marathon-sim.ts [innings]
 */
import { COMPATIBILITY, SHOTS } from '../src/config/gameplay.js';
import { BATTERS, MARATHON, type MarathonEnding } from '../src/config/marathon.js';
import { DeliveryGenerator, MARATHON_PLAN } from '../src/game/DeliveryGenerator.js';
import { effectiveLine } from '../src/game/DeliveryTrajectory.js';
import { Health } from '../src/game/Health.js';
import { MarathonInnings } from '../src/game/Marathon.js';
import { SeededRandom } from '../src/game/SeededRandom.js';
import { resolveSurvive } from '../src/game/Survive.js';
import type { Delivery, ShotType } from '../src/game/types.js';

interface Player {
  name: string;
  sigma: number;
  pressure: number;
  policy: 'CHASE' | 'MEASURED';
}

function gauss(rng: SeededRandom): number {
  const u = Math.max(1e-9, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

const NOMINAL_MS = 830;
function readOf(player: Player, delivery: Delivery) {
  const rush = (NOMINAL_MS - delivery.durationMs) / 100;
  return { sigma: player.sigma + Math.max(0, rush) * player.pressure, bias: rush * 6.0 };
}

function bestShot(delivery: Delivery): ShotType {
  const line = effectiveLine(delivery);
  return SHOTS.reduce((a, b) => (COMPATIBILITY[line][a] >= COMPATIBILITY[line][b] ? a : b));
}

/** As in Survival: duck the bouncer, block the yorker, and the measured player leaves the quick ones alone. */
const OFF_LIMITS: Partial<Record<Delivery['style'], true>> = { YORKER: true, EXPRESS: true, RIB: true };
function chooseShot(delivery: Delivery, policy: Player['policy'], rng: SeededRandom): ShotType {
  if (delivery.style === 'SHORT') return policy === 'CHASE' && rng.next() < 0.25 ? 'LEG' : 'DEFEND';
  if (delivery.style === 'YORKER') return 'DEFEND';
  if (policy === 'MEASURED') return OFF_LIMITS[delivery.style] ? 'DEFEND' : bestShot(delivery);
  if (delivery.style === 'EXPRESS' && rng.next() > 0.3) return 'DEFEND';
  return bestShot(delivery);
}

function swing(player: Player, delivery: Delivery, batter: typeof BATTERS[number], rng: SeededRandom) {
  const shot = chooseShot(delivery, player.policy, rng);
  const { sigma, bias } = readOf(player, delivery);
  return resolveSurvive(delivery, { shotType: shot, inputTimeMs: delivery.idealContactTimeMs + bias + gauss(rng) * sigma }, rng, batter);
}

/**
 * The meters, alongside: balls faced settled, and how often the meter filled.
 * The simulated batter plays no special strokes, so a full meter is spent the
 * moment it fills — which is what makes this the rate a special is *offered*,
 * the number `CONFIDENCE` was tuned on.
 */
let settledBalls = 0, fills = 0, settledBatters = 0;
function playInnings(player: Player, seed: number) {
  const rng = new SeededRandom(seed);
  const generator = new DeliveryGenerator(rng, MARATHON_PLAN);
  const innings = new MarathonInnings();
  while (!innings.ended) {
    const delivery = generator.next(0);
    const outcome = swing(player, delivery, innings.current.batter, rng);
    generator.record(outcome);
    if (innings.current.confidence !== null) settledBalls++;
    innings.record(outcome);
    if (innings.justSettled) settledBatters++;
    if (innings.confident) { fills++; innings.spend(); }
  }
  return innings;
}

/** One express over to a fresh batter, `trials` times: how often is he carried off, and how often out? */
function expressOver(player: Player, order: number, trials: number) {
  // Find the express bowler's first over in a long innings and bowl it again and again.
  let retired = 0, dismissed = 0, runs = 0;
  for (let t = 0; t < trials; t++) {
    const rng = new SeededRandom((t * 2654435761 + 99) >>> 0);
    const generator = new DeliveryGenerator(rng, MARATHON_PLAN);
    while (!generator.expressOn) generator.next(0);
    const health = new Health();
    for (let b = 0; b < MARATHON.ballsPerOver; b++) {
      const outcome = swing(player, generator.next(0), BATTERS[order], rng);
      health.record(outcome);
      runs += outcome.runs;
      if (outcome.isWicket) { dismissed++; break; }
      if (health.spent) { retired++; break; }
    }
  }
  return { retired: retired / trials, dismissed: dismissed / trials, runs: runs / trials };
}

function run(player: Player, count: number) {
  settledBalls = 0; fills = 0; settledBatters = 0;
  let walkedOut = 0;
  const endings: Record<MarathonEnding, number> = { ALL_OUT: 0, RETIRED: 0, BALLS: 0, DECLARED: 0 };
  const by = BATTERS.map(() => ({ runs: 0, balls: 0, innings: 0, retired: 0 }));
  let runs = 0, balls = 0, sixes = 0, fours = 0, best = 0, express = 0, longest = 0;
  for (let i = 0; i < count; i++) {
    const innings = playInnings(player, (i * 2654435761) >>> 0);
    endings[innings.ending!]++;
    runs += innings.runs; balls += innings.balls; sixes += innings.sixes; fours += innings.fours;
    best = Math.max(best, innings.runs);
    longest = Math.max(longest, innings.balls);
    express += Number(innings.balls > 20 * MARATHON.ballsPerOver);
    walkedOut += innings.batters.length;
    for (const b of innings.batters) {
      by[b.order].runs += b.runs; by[b.order].balls += b.balls; by[b.order].innings++;
      by[b.order].retired += Number(b.retired);
    }
  }
  const pct = (n: number) => `${(n / count * 100).toFixed(0)}%`.padStart(5);
  const each = by.map(b => b.innings ? `${(b.runs / b.innings).toFixed(0)}/${(b.balls / b.innings).toFixed(0)}`.padStart(8) : '       —');
  return [
    player.name.padEnd(22),
    (runs / count).toFixed(0).padStart(5),
    (balls / count).toFixed(0).padStart(6),
    String(best).padStart(5),
    String(longest).padStart(5),
    ...each,
    pct(endings.ALL_OUT), pct(endings.RETIRED), pct(endings.BALLS),
    pct(express),
    `${(by.reduce((t, b) => t + b.retired, 0) / count).toFixed(2)}`.padStart(6),
    (fours ? `1/${Math.round(balls / fours)}` : '—').padStart(6),
    (sixes ? `1/${Math.round(balls / sixes)}` : '—').padStart(6),
    `${Math.round(settledBatters / walkedOut * 100)}%`.padStart(7),
    (fills ? (settledBalls / fills / MARATHON.ballsPerOver).toFixed(1) : '—').padStart(7),
  ].join(' ');
}

const INNINGS = Number(process.argv[2] ?? 4000);
const PLAYERS: Player[] = [
  { name: 'expert · chasing', sigma: 34, pressure: 5, policy: 'CHASE' },
  { name: 'competent · chasing', sigma: 52, pressure: 8, policy: 'CHASE' },
  { name: 'novice · chasing', sigma: 82, pressure: 12, policy: 'CHASE' },
  { name: 'expert · measured', sigma: 34, pressure: 5, policy: 'MEASURED' },
  { name: 'competent · measured', sigma: 52, pressure: 8, policy: 'MEASURED' },
  { name: 'novice · measured', sigma: 82, pressure: 12, policy: 'MEASURED' },
];

console.log(`\nTest Marathon — ${INNINGS.toLocaleString()} innings each (runs/balls per batter)\n`);
console.log(['player'.padEnd(22), ' runs', ' balls', ' best', ' long', '  opener', '    no.3', '    tail',
  ' out', ' hurt', '  500', ' ov20', ' hurts', '    4s', '    6s', 'settled', 'ov/spcl'].join(' '));
console.log('-'.repeat(134));
for (const player of PLAYERS) console.log(run(player, INNINGS));

console.log('\nOne express over to a fresh batter (retired · out · runs an over)\n');
for (const player of PLAYERS) {
  const line = BATTERS.map((b, order) => {
    const o = expressOver(player, order, INNINGS);
    return `${b.title.padEnd(9)} ${(o.retired * 100).toFixed(1).padStart(5)}% ${(o.dismissed * 100).toFixed(1).padStart(5)}% ${o.runs.toFixed(1).padStart(4)}`;
  }).join('   ');
  console.log(`${player.name.padEnd(22)} ${line}`);
}
console.log('\nTargets: a fresh opener carried off in no more than about one express over in six (≤ 17%);\na settled good player offered a special about every four to six overs.\n');
