/**
 * The end of a challenge's chase, said (Rivals, a challenge from a profile).
 *
 * A chase is over on the ball that passes the setter's total, or when the
 * balls or the wickets run out (`ended` in `ball-string.ts`, with the total as
 * its `target`). Then two moments: on the gameplay screen, what happened
 * (`chaseEndOf`: TARGET CHASED, FELL SHORT, or SCORES LEVEL when sixes and
 * fours are left to decide it). Then, the first time either player opens the
 * settled match, its verdict over the result: VICTORY, DEFEAT or DRAW
 * (`verdictOf`, drawn by `Verdict` in `src/ui/MatchEnd.ts`).
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

export type VerdictKind = 'won' | 'lost' | 'drawn';

export interface VerdictView {
  kind: VerdictKind;
  /** The lockup: VICTORY, DEFEAT, DRAW. */
  title: string;
  /** Under it: You beat Kabir · 35–31. */
  sub: string;
  /** Under that, how: CHASED WITH 17 BALLS TO SPARE. */
  how: string;
  you: { avatar: number };
  them: { name: string; avatar: number };
  /** The mode's colour, for the bloom. */
  colour: string;
  mode: 'classic' | 'super10';
  /** A defeat's one line from the winner, in a bubble over their face: a little sting to bat again on. */
  taunt: string | null;
}

/**
 * What the winner says on a defeat. Cheeky, never cruel: about the cricket,
 * never the player, and every one an invitation to come back.
 */
export const TAUNTS = ['TOO EASY', 'IS THAT ALL?', 'SEE YOU IN THE NETS', 'THANKS FOR THE RUNS', 'BETTER LUCK NEXT TIME', 'COME BACK STRONGER'] as const;

/** One innings on a settled match, as much of it as the verdict reads. */
export interface VerdictRow { name: string; avatar: number; runs: number; balls: number; status: string; at: number }

const TITLE: Record<VerdictKind, string> = { won: 'VICTORY', lost: 'DEFEAT', drawn: 'DRAW' };

/**
 * The verdict a player is shown the first time they open a settled match:
 * the setter opening Rival Matches later, or the chaser straight off the
 * gameplay screen. Won, lost or drawn, by runs or by a walkout, said from
 * this player's side.
 */
export function verdictOf(result: {
  outcome: 'W' | 'L' | 'D'; forfeit: boolean; mine: VerdictRow; them: VerdictRow; mode: 'classic' | 'super10'; balls: number; youAvatar: number;
}): VerdictView {
  const { mine, them } = result;
  const kind: VerdictKind = result.outcome === 'W' ? 'won' : result.outcome === 'L' ? 'lost' : 'drawn';
  const margin = Math.abs(mine.runs - them.runs);
  const runsWord = plural(margin, 'run').toUpperCase();
  const spare = (row: VerdictRow) => {
    const left = Math.max(0, result.balls - row.balls);
    return left ? `WITH ${plural(left, 'ball').toUpperCase()} TO SPARE` : 'OFF THE LAST BALL';
  };
  // Who set it: whoever finished first.
  const first = mine.at <= them.at;
  let sub: string, how: string;
  if (kind === 'won') {
    sub = them.status === 'declined' ? `${them.name} declined` : them.status === 'forfeit' ? `${them.name} walked out` : `You beat ${them.name} · ${mine.runs}–${them.runs}`;
    how = result.forfeit ? 'BY FORFEIT' : !margin ? 'ON BOUNDARIES' : first ? `DEFENDED BY ${runsWord}` : `CHASED ${spare(mine)}`;
  } else if (kind === 'lost') {
    sub = mine.status === 'forfeit' ? `You walked out on ${them.name}` : mine.status === 'declined' ? `You declined ${them.name}` : `${them.name} beat you · ${them.runs}–${mine.runs}`;
    how = result.forfeit ? 'BY FORFEIT' : !margin ? 'ON BOUNDARIES' : first ? `CHASED DOWN ${spare(them)}` : `SHORT BY ${runsWord}`;
  } else {
    sub = `Level with ${them.name} · ${mine.runs}–${them.runs}`;
    how = 'LEVEL ON RUNS, SIXES AND FOURS';
  }
  return {
    kind, title: TITLE[kind], sub, how, mode: result.mode,
    you: { avatar: result.youAvatar }, them: { name: them.name, avatar: them.avatar },
    colour: result.mode === 'super10' ? '#8b5cf6' : '#3f88f2',
    // Picked off the scores, so a match always says the same thing to the same player.
    taunt: kind === 'lost' ? TAUNTS[(mine.runs * 7 + them.runs * 3 + mine.balls) % TAUNTS.length] : null,
  };
}
