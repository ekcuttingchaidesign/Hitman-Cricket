/**
 * Survive, played a few hundred thousand times by nobody.
 *
 * The mode has two win conditions, five ways to lose and about a dozen numbers
 * that trade against each other, and the target — a chase that comes off twice
 * in ten for a player already good at the classic innings — is not something
 * anyone can feel their way to by playing it. So this plays it instead.
 *
 * `resolveSurvive` is a pure function of a delivery, an attempt and a source of
 * randomness, which is the whole reason this is possible: no browser, no scene,
 * no three.js. What is modelled here is the *player*, and only two things about
 * him:
 *
 *   - `sigma`, the spread of his timing error in milliseconds, widened for a
 *     ball that gives him less time to see it. This is the whole of his skill.
 *   - a systematic lateness that rises with pace. Everybody is late on the
 *     quick ball and early on the one held back, and because this mode reads
 *     the *sign* of a timing error, that bias is not a detail: it is what
 *     decides whether an innings ends caught behind or caught at mid-on.
 *
 * His judgement is modelled as a policy rather than as a skill — he always
 * picks the right stroke for the line and only his timing betrays him, which is
 * what isolates the thing being tuned. Two policies are run, because the mode
 * has two ways to win and they want opposite things: the chaser goes after
 * everything he could score off, the blocker is batting for the draw and plays
 * at nothing he does not have to.
 *
 *   npx vite-node scripts/survive-sim.ts [innings]
 */
import { COMPATIBILITY, SHOTS } from '../src/config/gameplay.js';
import { HEALTH, SPECIALS, SPIN, STYLES, SURVIVE } from '../src/config/survive.js';
import { DeliveryGenerator } from '../src/game/DeliveryGenerator.js';
import { effectiveLine } from '../src/game/DeliveryTrajectory.js';
import { SeededRandom } from '../src/game/SeededRandom.js';
import { endingOf, resolveSurvive } from '../src/game/Survive.js';
import type { Delivery, Ending, ShotType } from '../src/game/types.js';

const PLAN = {
  styles: STYLES, specials: SPECIALS, travelScale: SURVIVE.travelScale, aimed: true,
  spin: { ...SPIN, ofOvers: SURVIVE.totalBalls / SURVIVE.ballsPerOver, ballsPerOver: SURVIVE.ballsPerOver },
};

/** A player, as two numbers and an intention. */
interface Player {
  name: string;
  /** Timing spread on a length ball, in milliseconds. The whole of his skill. */
  sigma: number;
  /** How much that spread widens per 100ms the ball is quicker than a length ball. */
  pressure: number;
  policy: 'CHASE' | 'MEASURED' | 'BLOCK';
}

/** Box-Muller, so the timing error is a real normal and not a sum of rolls. */
function gauss(rng: SeededRandom): number {
  const u = Math.max(1e-9, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

/** A length ball's flight, which is the pace he is set for and the crossover of the bias. */
const NOMINAL_MS = 830;

function readOf(player: Player, delivery: Delivery) {
  const rush = (NOMINAL_MS - delivery.durationMs) / 100;
  return {
    sigma: player.sigma + Math.max(0, rush) * player.pressure,
    // Late on what hurries him, early on what is held back.
    bias: rush * 6.0,
  };
}

/** The stroke the line actually allows, which he always finds. */
function bestShot(delivery: Delivery): ShotType {
  const line = effectiveLine(delivery);
  return SHOTS.reduce((a, b) => (COMPATIBILITY[line][a] >= COMPATIBILITY[line][b] ? a : b));
}

/**
 * What he decides to do with the ball. Ducking a bouncer and blocking a yorker
 * are not choices — there is no other answer — so the only real decision in
 * here is whether a chaser takes on the express ball, and he mostly does not.
 */
const OFF_LIMITS: Partial<Record<Delivery['style'], true>> = { YORKER: true, EXPRESS: true, RIB: true };
function chooseShot(delivery: Delivery, policy: Player['policy'], rng: SeededRandom): ShotType {
  if (delivery.style === 'SHORT') return policy === 'CHASE' && rng.next() < 0.25 ? 'LEG' : 'DEFEND';
  if (delivery.style === 'YORKER') return 'DEFEND';
  if (policy === 'BLOCK') return 'DEFEND';
  // The measured player picks his moments: he plays at the length ball and the
  // swinging one and leaves the rest alone. This is what an actual person does,
  // and the two pure policies either side of it are the bounds rather than the
  // expectation.
  if (policy === 'MEASURED') return OFF_LIMITS[delivery.style] ? 'DEFEND' : bestShot(delivery);
  if (delivery.style === 'EXPRESS' && rng.next() > 0.3) return 'DEFEND';
  return bestShot(delivery);
}

function playInnings(player: Player, seed: number) {
  const rng = new SeededRandom(seed);
  const generator = new DeliveryGenerator(rng, PLAN);
  let runs = 0, balls = 0, wickets = 0, health = HEALTH.full, blows = 0, attacked = 0, sixes = 0, aerials = 0;
  let ending: Ending | null = null;
  let cause = '';

  while (!ending) {
    const delivery = generator.next(0);
    const shot = chooseShot(delivery, player.policy, rng);
    if (shot !== 'DEFEND') attacked++;
    const { sigma, bias } = readOf(player, delivery);
    const outcome = resolveSurvive(
      delivery,
      { shotType: shot, inputTimeMs: delivery.idealContactTimeMs + bias + gauss(rng) * sigma },
      rng,
    );
    runs += outcome.runs;
    wickets += Number(outcome.isWicket);
    balls++;
    if (outcome.runs === 6) sixes++;
    if (outcome.aerial) aerials++;
    if (outcome.hit) { health -= outcome.hit.damage; blows++; }
    if (outcome.isWicket) cause = outcome.feedback;
    generator.record(outcome);
    ending = endingOf(runs, balls, wickets, health <= 0);
  }
  return { ending, runs, balls, health: Math.max(0, health), blows, attacked, cause, sixes, aerials };
}

function run(player: Player, innings: number) {
  const tally: Record<Ending, number> = { CHASED: 0, DRAWN: 0, BOWLED_OUT: 0, RETIRED: 0 };
  let runs = 0, balls = 0, blows = 0, health = 0, sixes = 0, aerials = 0;
  const causes = new Map<string, number>();
  for (let i = 0; i < innings; i++) {
    const played = playInnings(player, (i * 2654435761) >>> 0);
    tally[played.ending]++;
    if (played.cause) causes.set(played.cause, (causes.get(played.cause) ?? 0) + 1);
    runs += played.runs; balls += played.balls; blows += played.blows; health += played.health;
    sixes += played.sixes; aerials += played.aerials;
  }
  if (process.env.CAUSES) {
    const top = [...causes].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, n]) => `${k} ${(n / innings * 100).toFixed(0)}%`).join(', ');
    console.log(`    ${player.name}: ${top}`);
  }
  const pct = (n: number) => `${(n / innings * 100).toFixed(1)}%`.padStart(6);
  return [
    player.name.padEnd(22),
    pct(tally.CHASED), pct(tally.DRAWN), pct(tally.BOWLED_OUT), pct(tally.RETIRED),
    (runs / innings).toFixed(1).padStart(7),
    (balls / innings).toFixed(1).padStart(7),
    (blows / innings).toFixed(1).padStart(7),
    (health / innings).toFixed(0).padStart(7),
    // The two the playtest complained about: a six should be one ball in
    // twenty-five, and a ball in the air should be a rare event rather than a
    // thing that happens twice an over.
    (sixes ? `1/${Math.round(balls / sixes)}` : '—').padStart(8),
    (aerials ? `1/${Math.round(balls / aerials)}` : '—').padStart(8),
  ].join(' ');
}

const INNINGS = Number(process.argv[2] ?? 20000);
const PLAYERS: Player[] = [
  { name: 'expert · chasing', sigma: 34, pressure: 5, policy: 'CHASE' },
  { name: 'competent · chasing', sigma: 52, pressure: 8, policy: 'CHASE' },
  { name: 'novice · chasing', sigma: 82, pressure: 12, policy: 'CHASE' },
  { name: 'expert · measured', sigma: 34, pressure: 5, policy: 'MEASURED' },
  { name: 'competent · measured', sigma: 52, pressure: 8, policy: 'MEASURED' },
  { name: 'novice · measured', sigma: 82, pressure: 12, policy: 'MEASURED' },
  { name: 'expert · blocking', sigma: 34, pressure: 5, policy: 'BLOCK' },
  { name: 'competent · blocking', sigma: 52, pressure: 8, policy: 'BLOCK' },
  { name: 'novice · blocking', sigma: 82, pressure: 12, policy: 'BLOCK' },
];

console.log(`\nSurvive — ${INNINGS.toLocaleString()} innings each\n`);
console.log(['player'.padEnd(22), '   won', ' drawn', 'bowled', 'retire', '   runs', '  balls', '  blows', ' health', '     six', '  aerial'].join(' '));
console.log('-'.repeat(112));
for (const player of PLAYERS) console.log(run(player, INNINGS));
console.log('\nTargets: a good player won ≈ 20%, six ≈ 1/25 balls, blows ≥ 2 an innings.\n');
