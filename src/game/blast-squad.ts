import { SQUADS } from './super10-squads';

/**
 * Who bats with the player in the Blast. Three wickets, three batters: the
 * player opens, and after a wicket a teammate walks out, not the player again,
 * which made the arrival the same man in the same gear three times running.
 *
 * The two who follow are drawn once an innings from every Super10 squad's
 * batters (`SQUADS`): the same names the owner chose, sounding like real
 * players and never one. Each has a number on his back (`BLAST_NUMBERS`), and
 * his own guard and bat, picked by the game (`Game.mates`) so he is told apart
 * from the man before him. They wear the player's kit: they are his side.
 * Nothing about the batting changes: the same windows, the same hand, the
 * player's career and board, as Super10's squad bats for the player's.
 * `roll` is the page's dice, never the innings' seed, so no ball moves.
 */
export const BLAST_POOL: readonly string[] = Object.values(SQUADS).flatMap(squad => squad.batters);

/** The numbers on the backs of No. 2 and No. 3. */
export const BLAST_NUMBERS = ['17', '9'] as const;

export interface BlastMate {
  /** The whole name. */
  name: string;
  /** NO. 2 or NO. 3. */
  place: string;
  number: string;
  /** What the walk-out says: NO. 2 · SHUBH GILANI #17. */
  walkOut: string;
}

const pick = <T>(list: readonly T[], roll: number): T => list[Math.min(list.length - 1, Math.floor(roll * list.length))];

/** No. 2 and No. 3 for one innings, two different men. */
export function blastMates(roll: () => number = Math.random): [BlastMate, BlastMate] {
  const first = pick(BLAST_POOL, roll());
  const second = pick(BLAST_POOL.filter(one => one !== first), roll());
  const mate = (name: string, i: 0 | 1): BlastMate => {
    const place = `NO. ${i + 2}`, number = BLAST_NUMBERS[i];
    return { name, place, number, walkOut: `${place} · ${name.toUpperCase()} #${number}` };
  };
  return [mate(first, 0), mate(second, 1)];
}

/**
 * Which of `choices` a teammate wears: never what the man before him wore
 * (`avoid`), so each one in looks different, where there is anything else.
 */
export function gearFor<T extends { id: string }>(choices: readonly T[], avoid: readonly string[], roll: number): T {
  const fresh = choices.filter(one => !avoid.includes(one.id));
  return pick(fresh.length ? fresh : choices, roll);
}

/**
 * The avatars a teammate's name card may show (`KITS` in `config/board.ts`,
 * by index): the men's, india blue, purple and teal, since every name in the
 * squads is a man's.
 */
export const MATE_FACES = [1, 2, 4] as const;

/**
 * A teammate's face on his name card: one of `MATE_FACES`, the same for the
 * same name every time, and never the player's own (`yours`) where there is
 * another.
 */
export function mateFace(name: string, yours: number): number {
  const faces = MATE_FACES.filter(face => face !== yours);
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return faces[hash % faces.length];
}
