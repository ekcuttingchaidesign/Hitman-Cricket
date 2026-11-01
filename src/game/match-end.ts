/**
 * The end of a challenge's chase, said (Rivals, a challenge from a profile).
 *
 * A chase is over on the ball that passes the setter's total, or when the
 * balls or the wickets run out (`ended` in `ball-string.ts`, with the total as
 * its `target`). Then two moments: on the gameplay screen, what happened
 * (`chaseEndOf`: TARGET CHASED, FELL SHORT, or SCORES LEVEL when sixes and
 * fours are left to decide it); and for a chase won only, the victory that
 * hands over to the room's result (`victoryOf`, drawn by `Victory` in
 * `src/ui/MatchEnd.ts`).
 */

export type ChaseEndKind = 'won' | 'short' | 'level';

export interface ChaseEnd {
  kind: ChaseEndKind;
  /** The stamp, big: TARGET CHASED. */
  title: string;
  /** The plate under it: WITH 17 BALLS TO SPARE, BY 4 RUNS. */
  chip: string;
  /** One line under both. */
  line: string;
}

export interface ChaseFigures {
  runs: number;
  balls: number;
  wickets: number;
  /** The innings' size: thirty balls and three wickets, or Super10's sixty and five. */
  limits: { balls: number; wickets: number };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** What the gameplay screen says on the ball a chase ends, against the setter's total. */
export function chaseEndOf(figures: ChaseFigures, target: number, them: string): ChaseEnd {
  const { runs, balls, wickets, limits } = figures;
  if (runs > target) {
    const spare = Math.max(0, limits.balls - balls);
    return {
      kind: 'won', title: 'TARGET CHASED',
      chip: spare ? `WITH ${plural(spare, 'ball').toUpperCase()} TO SPARE` : 'OFF THE LAST BALL',
      line: `${runs} off ${plural(balls, 'ball')} · ${them}’s ${target} beaten`,
    };
  }
  const how = wickets >= limits.wickets ? `All out for ${runs}` : `${runs} off ${plural(balls, 'ball')}`;
  if (runs === target) return { kind: 'level', title: 'SCORES LEVEL', chip: `BOTH ON ${runs}`, line: 'Sixes, then fours, settle it' };
  return { kind: 'short', title: 'FELL SHORT', chip: `BY ${plural(target - runs, 'run').toUpperCase()}`, line: `${how} · ${them} needed ${target + 1}` };
}

export interface VictoryView {
  you: { avatar: number };
  them: { name: string; avatar: number };
  /** The lockup's line: You beat Kabir · 35–31. */
  sub: string;
  /** Under it, how: TARGET CHASED WITH 17 BALLS TO SPARE. */
  how: string;
  /** The mode's colour, for the bloom. */
  colour: string;
  mode: 'classic' | 'super10';
}

/** The victory after a chase won, or null for any other end. */
export function victoryOf(end: ChaseEnd, view: { runs: number; target: number; you: { avatar: number }; them: { name: string; avatar: number }; mode: 'classic' | 'super10' }): VictoryView | null {
  if (end.kind !== 'won') return null;
  return {
    you: view.you, them: view.them, mode: view.mode,
    sub: `You beat ${view.them.name} · ${view.runs}–${view.target}`,
    how: `${end.title} ${end.chip}`,
    colour: view.mode === 'super10' ? '#8b5cf6' : '#3f88f2',
  };
}
