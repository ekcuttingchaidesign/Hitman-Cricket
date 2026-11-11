/**
 * Who bats with the player in the Blast. Three wickets, three batters: the
 * player opens, and after a wicket a teammate walks out, not the player again,
 * which made the arrival the same man in the same gear three times running.
 *
 * The two who follow have no names (the owner did not want them named in the
 * Blast): each walks out as NEW BATSMAN IN, by his place, with a number on his
 * back (`BLAST_NUMBERS`). They wear the player's kit, guard and bat, all as
 * picked in the Dressing Room (`Game.mates`): they are his side. Nothing
 * about the batting changes: the same windows, the same hand, the player's
 * career and board.
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

/** No. 2 and No. 3. */
export function blastMates(): [BlastMate, BlastMate] {
  const mate = (i: 0 | 1): BlastMate => {
    const place = `NO. ${i + 2}`, number = BLAST_NUMBERS[i];
    return { place, number, walkOut: `${place} · ${NEW_BATSMAN} #${number}` };
  };
  return [mate(0), mate(1)];
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
