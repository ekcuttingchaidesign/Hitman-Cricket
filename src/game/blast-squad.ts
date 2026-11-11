/**
 * Who bats with the player in the Blast. Three wickets, three batters: the
 * player opens, and after a wicket a teammate walks out, not the player again,
 * which made the arrival the same man in the same gear three times running.
 *
 * The two who follow have no names (the owner did not want them named in the
 * Blast): each walks out as NEW BATSMAN IN, by his place, with a number on his
 * back (`BLAST_NUMBERS`) and his own guard and bat, picked by the game
 * (`Game.mates`) so he is told apart from the man before him. They wear the
 * player's kit: they are his side. Nothing about the batting changes: the
 * same windows, the same hand, the player's career and board.
 */

/** The numbers on the backs of No. 2 and No. 3. */
export const BLAST_NUMBERS = ['17', '9'] as const;

/** What the card and the walk-out call him. */
export const NEW_BATSMAN = 'NEW BATSMAN IN';

export interface BlastMate {
  /** NO. 2 or NO. 3. */
  place: string;
  number: string;
  /** What the walk-out says: NO. 2 · NEW BATSMAN IN #17. */
  walkOut: string;
}

const pick = <T>(list: readonly T[], roll: number): T => list[Math.min(list.length - 1, Math.floor(roll * list.length))];

/** No. 2 and No. 3. */
export function blastMates(): [BlastMate, BlastMate] {
  const mate = (i: 0 | 1): BlastMate => {
    const place = `NO. ${i + 2}`, number = BLAST_NUMBERS[i];
    return { place, number, walkOut: `${place} · ${NEW_BATSMAN} #${number}` };
  };
  return [mate(0), mate(1)];
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
