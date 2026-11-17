/**
 * Super Knockout's practice room, played four hundred times with the player
 * out first ball, so the room is only subs: how many runs win it, and how
 * many balls a room lasts. The subs are tuned by `SKILLS` and `KEEP` in
 * `src/game/knockout.ts`; a room should usually reach sudden death (25 balls
 * and on) and be won by a total a good Blast innings can reach.
 *
 *   npx vite-node scripts/knockout-sim.ts [rooms]
 */
import { DeliveryGenerator, knockoutPlan } from '../src/game/DeliveryGenerator.js';
import { KNOCKOUT, KnockoutRoom } from '../src/game/knockout.js';
import { SeededRandom } from '../src/game/SeededRandom.js';
import type { ShotOutcome } from '../src/game/types.js';

const ROOMS = Number(process.argv.find(a => /^\d+$/.test(a)) ?? 400);
const out = { runs: 0, isWicket: true } as ShotOutcome;
const won: number[] = [], lasted: number[] = [];
for (let seed = 1; seed <= ROOMS; seed++) {
  // Bowled as the room is (`knockoutPlan`): the fourth over's bowler a coin, here every other room.
  const bowler = new DeliveryGenerator(new SeededRandom(seed), knockoutPlan(seed % 2 === 0));
  const room = new KnockoutRoom(seed, { name: 'You', face: 0 });
  room.ball(bowler.next(0), out);
  room.playOut(() => bowler.next(0));
  while (!room.winner && room.bowled < KNOCKOUT.maxBalls) room.ball(bowler.next(0), null);
  won.push(room.winner!.runs); lasted.push(room.bowled);
}
const q = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.floor(f * (a.length - 1))];
console.log(`\n${ROOMS} rooms of subs`);
console.log(`the winner's runs   p10 ${q(won, .1)}  p50 ${q(won, .5)}  p90 ${q(won, .9)}`);
console.log(`balls in the match  p10 ${q(lasted, .1)}  p50 ${q(lasted, .5)}  p90 ${q(lasted, .9)}`);
console.log(`to sudden death     ${(lasted.filter(b => b > 24).length / ROOMS * 100).toFixed(0)}%\n`);
