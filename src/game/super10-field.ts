import type { OverKind } from '../config/marathon';
import { SOLID_SHOT } from '../config/gameplay';
import { SUPER10, type Bowler } from '../config/super10';
import type { ShotOutcome, ShotType } from './types';

/**
 * Super10's field: nine men, set by the bowler from the fields T20 sides use
 * (the claude.ai artifact "The T20 Field Book"), two of them a bowler, chosen
 * at the top of his over and kept for it; moved within an over by nothing but
 * Power Surge; and the rules that make it matter. A ball is fielded by how far it passes the nearest man:
 * along the ground at a man in the ring it is stopped (half the time; a
 * middled one beats him three times in four), at a boundary rider it is cut
 * off for one or two or saved for two or three, and a six that was not
 * middled is caught on the rope if he is under it. A middled six clears
 * everybody. The player steers the ball inside each stroke's arc (`steer`),
 * so the gaps are theirs to find.
 *
 * Nothing here touches a scene or the page: the field is a list of positions,
 * the rules are a function of an outcome and a direction, and the scene, the
 * map and the call are drawn from them (`tests/super10-field.test.ts`).
 *
 * Angles are degrees off straight as the batter looks down the pitch, the off
 * side positive, as `SHOT_ANGLES` has them; distances are metres from the bat.
 */

export interface Man {
  name: string;
  angle: number;
  distance: number;
  /** On the rope: a boundary rider. */
  deep: boolean;
}

/** What changed this field from the bowler's first: Power Surge, his other plan, or nothing. */
export type FieldChange = null | 'surge' | 'plan';

export interface FieldSet {
  /** The same for the same field, so the map can tell a field it has shown before. */
  id: string;
  /** The field book's name for it, as the map's tag says it: `WIDE YORKER`. */
  name: string;
  bowler: Bowler;
  men: Man[];
  change: FieldChange;
  /** What moved, as the map says it: `DEEP POINT BACK`, `LONG-ON IN`. */
  moved: string[];
}

/** How far either side of himself a boundary rider gets to a ball before it reaches the rope. */
export const DEEP_REACH = 7;
/** Within this he is right behind it: cut off for one or two. */
export const DEEP_CLEAN = 3;
/** How far either side a man in the ring stops a ball along the ground; a middled one is past him sooner. */
export const RING_REACH = 3.5;
export const RING_REACH_MIDDLED = 2.5;
/**
 * The softened ring: a four along the ground at a man in the ring is stopped
 * this often, and a middled one a quarter of the time, so the ring is a
 * fielder to beat rather than a wall.
 */
export const RING_STOPS = .5;
export const RING_STOPS_MIDDLED = .25;
/** A four a boundary rider gets to without being right behind it: saved this often, middled less. */
export const DEEP_SAVES = .6;
export const DEEP_SAVES_MIDDLED = .35;
/** Where the ring is: men brought up from the rope stand here. */
export const RING = 23;
/** How far inside the rope a boundary rider stands. */
const INSIDE_ROPE = 4;

/**
 * The rope: thirty metres round a point ten up the pitch — the same ground
 * `ropeAlong` in `src/scene/field.ts` measures — so forty metres straight,
 * twenty-eight square and twenty behind.
 */
export function ropeAt(angle: number) {
  const c = Math.cos(angle * Math.PI / 180);
  return 10 * c + Math.sqrt(100 * c * c + 800);
}
const deepAt = (angle: number) => Math.max(15, ropeAt(angle) - INSIDE_ROPE);

/**
 * The positions the game uses, from the field chart and the field book's
 * angles. Mid-off and mid-on stand eighteen degrees off straight, a little
 * inside the picture the camera behind the bat sees on a phone (about
 * seventeen either side at the distance they stand, less nearer the bat):
 * at the book's twenty-four they were never seen. The men back stand no
 * nearer straight than `SIGHT_SCREEN`, nobody in front of the sight screen,
 * so long-off and long-on are at twenty-six, just out of the picture and off
 * the line of the man in front of them. No slips, gully, short leg or leg
 * slip: the keeper takes every edge, and nobody fields close in a ten-over
 * game, so the book's slip is a backward point or point.
 */
export const POSITIONS = {
  'mid-off': { angle: 18, distance: 22 },
  'extra cover': { angle: 50, distance: 23 },
  cover: { angle: 66, distance: 22 },
  point: { angle: 92, distance: 21 },
  'backward point': { angle: 112, distance: 19 },
  'short third man': { angle: 135, distance: 20 },
  'mid-on': { angle: -18, distance: 22 },
  midwicket: { angle: -62, distance: 22 },
  'square leg': { angle: -90, distance: 20 },
  'short fine leg': { angle: -146, distance: 16 },
  'long-off': { angle: 26, deep: true },
  'deep cover': { angle: 60, deep: true },
  'deep point': { angle: 102, deep: true },
  'third man': { angle: 142, deep: true },
  'long-on': { angle: -26, deep: true },
  'deep midwicket': { angle: -50, deep: true },
  'deep square leg': { angle: -80, deep: true },
  'deep backward square leg': { angle: -112, deep: true },
  'fine leg': { angle: -156, deep: true },
} as const satisfies Record<string, { angle: number; distance?: number; deep?: boolean }>;
export type Position = keyof typeof POSITIONS;
/**
 * The closest straight a man back stands, and a man in the ring; the closest
 * two men at the same depth stand; and the closest a man in the ring stands to
 * the line of a man behind him.
 */
export const SIGHT_SCREEN = 20;
export const STRAIGHT_RING = 16;
export const APART = 15;
export const IN_LINE = 6;

/** A field from the book, as this game stands it. */
interface Plan { name: string; men: Position[] }
/**
 * The field book's fields, the slip turned into a man square of the wicket.
 * Two men back in each Powerplay field and five in the rest but the spinner's
 * attacking one, which keeps three. The new-ball attack keeps its deep third
 * and has long-off for the other where the book has deep fine leg: two men
 * back, both behind the bat, made no sense to anyone batting, and the swing
 * bowler's ball outside off is driven there.
 */
const PLANS = {
  'new-ball': { name: 'New-ball attack', men: ['point', 'backward point', 'cover', 'mid-off', 'mid-on', 'midwicket', 'square leg', 'third man', 'long-off'] },
  'square-riders': { name: 'Square riders', men: ['short third man', 'cover', 'extra cover', 'mid-off', 'mid-on', 'midwicket', 'short fine leg', 'deep point', 'deep square leg'] },
  'hard-length': { name: 'Hard length', men: ['backward point', 'point', 'cover', 'mid-off', 'mid-on', 'midwicket', 'short fine leg', 'deep square leg', 'third man'] },
  cutters: { name: 'Cutters', men: ['point', 'cover', 'mid-off', 'mid-on', 'third man', 'deep point', 'long-on', 'deep midwicket', 'deep square leg'] },
  straight: { name: 'Straight field', men: ['short third man', 'point', 'mid-off', 'short fine leg', 'long-on', 'deep midwicket', 'deep square leg', 'long-off', 'deep cover'] },
  'leg-spin': { name: 'Leg-spin strike', men: ['point', 'cover', 'midwicket', 'short fine leg', 'long-on', 'long-off', 'deep midwicket', 'deep square leg', 'deep cover'] },
  'spin-attack': { name: 'Spinner attacking', men: ['backward point', 'point', 'cover', 'mid-off', 'midwicket', 'short fine leg', 'long-on', 'deep midwicket', 'deep square leg'] },
  'short-ball': { name: 'Short-ball field', men: ['point', 'cover', 'mid-off', 'mid-on', 'fine leg', 'deep backward square leg', 'deep midwicket', 'long-on', 'third man'] },
  'wide-yorker': { name: 'Wide yorker', men: ['point', 'extra cover', 'mid-on', 'short fine leg', 'third man', 'deep point', 'deep cover', 'long-off', 'long-on'] },
} as const satisfies Record<string, Plan>;
export type PlanId = keyof typeof PLANS;
/**
 * Each bowler's two fields, his first and his other: the swing bowler with
 * the new ball, the seamer in the Powerplay and after it, the spinner, the
 * sling bowler banging it in, and the death bowler's wide yorker.
 */
export const BOOK: Record<Bowler | 'SEAM-pp', readonly [PlanId, PlanId]> = {
  SWING: ['new-ball', 'square-riders'],
  'SEAM-pp': ['hard-length', 'square-riders'],
  SEAM: ['cutters', 'straight'],
  SPIN: ['leg-spin', 'spin-attack'],
  SLING: ['short-ball', 'cutters'],
  DEATH: ['wide-yorker', 'straight'],
};

/** What a position is called, by where it is: for a man moved off the chart's own places. */
export function nameOf(angle: number, deep: boolean) {
  if (deep) {
    if (Math.abs(angle) <= 35) return angle < 0 ? 'long-on' : 'long-off';
    if (angle < -130) return 'fine leg';
    if (angle < -96) return 'deep backward square leg';
    if (angle < -65) return 'deep square leg';
    if (angle < -35) return 'deep midwicket';
    if (angle > 122) return 'third man';
    if (angle > 81) return 'deep point';
    return 'deep cover';
  }
  if (Math.abs(angle) <= 42) return angle < 0 ? 'mid-on' : 'mid-off';
  if (angle < -125) return 'short fine leg';
  if (angle < -76) return 'square leg';
  if (angle < -42) return 'midwicket';
  if (angle > 124) return 'short third man';
  if (angle > 102) return 'backward point';
  if (angle > 79) return 'point';
  if (angle > 58) return 'cover';
  return 'extra cover';
}

const placed = (name: Position): Man => {
  const p: { angle: number; distance?: number; deep?: boolean } = POSITIONS[name];
  return { name, angle: p.angle, distance: p.deep ? deepAt(p.angle) : p.distance!, deep: !!p.deep };
};
const up = (man: Man): Man => ({ ...man, name: nameOf(man.angle, false), distance: RING, deep: false });

export interface FieldAsk {
  bowler: Bowler;
  /** The over, from nought. */
  over: number;
  surge?: boolean;
  /** His first field or his other (`planFor`). */
  plan?: 0 | 1;
}

/** Which of a bowler's two fields is his for an over: the seamer's own pair in the Powerplay. */
export function bookOf(bowler: Bowler, over: number): readonly [PlanId, PlanId] {
  return BOOK[bowler === 'SEAM' && over < SUPER10.powerplay ? 'SEAM-pp' : bowler];
}

/** The bowler's field for an over, with Power Surge laid on it if this is the surge over. */
export function fieldFor({ bowler, over, surge = false, plan = 0 }: FieldAsk): FieldSet {
  const key = bookOf(bowler, over)[plan];
  let men = PLANS[key].men.map(placed);
  // The Powerplay's two men back, whoever is bowling: anyone more comes up, nearest straight first.
  while (over < SUPER10.powerplay && men.filter(m => m.deep).length > 2) {
    const man = men.filter(m => m.deep).sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle))[0];
    men = men.map(m => (m === man ? up(m) : m));
  }
  const field: FieldSet = { id: key, name: PLANS[key].name, bowler, men, change: plan ? 'plan' : null, moved: [] };
  if (!surge) return field;
  // Power Surge: the two men back nearest straight come in.
  const take = men.filter(m => m.deep).sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle)).slice(0, 2);
  return {
    ...field, id: `${key}+surge`, change: 'surge',
    men: men.map(m => (take.includes(m) ? up(m) : m)),
    moved: take.map(m => `${m.name} in`.toUpperCase()),
  };
}

/** How near a boundary passes a man back for him to count as having had it covered. */
export const COVERS = 12;
/** How many of the batter's last boundaries a bowler reads. */
export const READS = 8;

/**
 * Which of his two fields a bowler sets for an over, read off how the innings
 * has gone, and only ever at the top of his over: the field is kept for all
 * six balls. The spinner attacks a new batter — a wicket in the over before
 * his — with his three-out field. Otherwise a bowler takes his other field
 * only when it has more men back on the lines of the batter's last boundaries
 * than his first does, two of them at least, so one four never moves a man.
 */
export function planFor(bowler: Bowler, over: number, { boundaries, newBatter }: { boundaries: readonly number[]; newBatter: boolean }): 0 | 1 {
  if (bowler === 'SPIN') return newBatter ? 1 : 0;
  const last = boundaries.slice(-READS);
  if (last.length < 2) return 0;
  const covered = (plan: 0 | 1) => {
    const back = fieldFor({ bowler, over, plan }).men.filter(m => m.deep);
    return last.filter(a => back.some(m => Math.abs(m.angle - a) <= COVERS)).length;
  };
  const first = covered(0), other = covered(1);
  return other > first && other >= 2 ? 1 : 0;
}

/** How far to one side of a man a ball struck along `angle` passes him; nobody behind him reaches it. */
export function passes(man: Man, angle: number) {
  const off = Math.abs(angle - man.angle);
  return off >= 90 ? Infinity : man.distance * Math.sin(off * Math.PI / 180);
}
/** The nearest man to a ball struck along `angle`, of the ring or the deep. */
export function nearest(field: FieldSet, angle: number, deep: boolean): { man: Man; by: number } | null {
  let best: { man: Man; by: number } | null = null;
  for (const man of field.men) {
    if (man.deep !== deep) continue;
    const by = passes(man, angle);
    if (!best || by < best.by) best = { man, by };
  }
  return best && Number.isFinite(best.by) ? best : null;
}

/**
 * A ball the field has a say in: off the bat, not out, and played as an
 * ordinary stroke. The special strokes a full meter buys — the charge, the
 * sweeps, the scoops — are the meter's reward and go where they are hit.
 */
function answerable(outcome: ShotOutcome) {
  return outcome.madeBatContact && !outcome.isWicket && outcome.runs > 0 && !outcome.hit
    && !outcome.advance && !outcome.swept && !outcome.scooped && !outcome.edged && !outcome.defended && !outcome.padded;
}

const by = (man: Man, how: Fielded['how']) => ({ fielder: { name: man.name, angle: man.angle, distance: man.distance, deep: man.deep, how } });
export type Fielded = NonNullable<ShotOutcome['fielder']>;

/**
 * The field's answer to a ball struck along `angle`. `stretch` is how far the
 * stroke was steered against itself (`steer`): enough of it turns a clean hit
 * into a mishit half the time. `rng` is drawn from only where a man has a
 * chance at it, so a ball into a gap moves nothing after it.
 */
export function fieldRules(outcome: ShotOutcome, angle: number, field: FieldSet, rng: { next(): number }, stretch = 0): ShotOutcome {
  if (!answerable(outcome)) return outcome;
  if (stretch > 0 && outcome.compatibility >= SOLID_SHOT && outcome.compatibility - stretch < SOLID_SHOT && rng.next() < .5) {
    // Reached for: up off the toe, and somebody gets under it three times in four.
    return rng.next() < .75
      ? { ...outcome, runs: 0, isWicket: true, wicketType: 'CAUGHT', aerial: true, quality: 0, feedback: 'CAUGHT!' }
      : { ...outcome, runs: 4, aerial: true, feedback: 'FOUR!' };
  }
  const middled = outcome.timingGrade === 'PERFECT';
  const deep = nearest(field, angle, true), ring = nearest(field, angle, false);
  if (outcome.runs === 6) {
    // Middled, it clears him. Not middled and still carrying, he is under it.
    if (middled || !deep || deep.by > DEEP_REACH) return outcome;
    return { ...outcome, runs: 0, isWicket: true, wicketType: 'CAUGHT', aerial: true, quality: 0, feedback: 'CAUGHT!', ...by(deep.man, 'caught') };
  }
  if (outcome.runs === 4) {
    if (!outcome.aerial && ring && ring.by <= (middled ? RING_REACH_MIDDLED : RING_REACH) && rng.next() < (middled ? RING_STOPS_MIDDLED : RING_STOPS)) {
      const runs = rng.next() < .5 ? 0 : 1;
      return { ...outcome, runs, feedback: runs ? '1 RUN' : 'DOT BALL', ...by(ring.man, 'stopped') };
    }
    if (deep && deep.by <= DEEP_CLEAN) {
      const runs = rng.next() < .7 ? 1 : 2;
      return { ...outcome, runs, aerial: false, feedback: runs === 1 ? '1 RUN' : '2 RUNS', ...by(deep.man, 'cut') };
    }
    if (deep && deep.by <= DEEP_REACH && rng.next() < (middled ? DEEP_SAVES_MIDDLED : DEEP_SAVES)) {
      const runs = rng.next() < .7 ? 2 : 3;
      return { ...outcome, runs, aerial: false, feedback: `${runs} RUNS`, ...by(deep.man, 'saved') };
    }
    return outcome;
  }
  // Ones, twos and threes: a man in the ring on its line takes one off half the time.
  if (!outcome.aerial && ring && ring.by <= RING_REACH && rng.next() < .5) {
    const runs = (outcome.runs - 1) as ShotOutcome['runs'];
    return { ...outcome, runs, feedback: runs ? `${runs} RUN${runs > 1 ? 'S' : ''}` : 'DOT BALL', ...by(ring.man, 'stopped') };
  }
  return outcome;
}

/** What the call says under the result for a ball a fielder got to. */
export function fieldLine(outcome: ShotOutcome) {
  const f = outcome.fielder;
  if (!f) return null;
  const name = f.name.toUpperCase();
  return f.how === 'caught' ? `${name} · ON THE ROPE` : f.how === 'cut' ? `CUT OFF · ${name}` : f.how === 'saved' ? `SAVED · ${name}` : `STOPPED · ${name}`;
}

/**
 * Power Surge: one over of two men in. It lights up at the end of the fifth
 * over and can be taken in the break before the sixth, seventh or eighth
 * (`surgeOffered`, overs from nought); not taken by the ninth, it goes on by
 * itself then (`surgeAuto`). The tenth never has it.
 */
export const SURGE = { from: 5, last: 7, auto: 8 } as const;
export const surgeOffered = (over: number, used: boolean) => !used && over >= SURGE.from && over <= SURGE.last;
export const surgeAuto = (over: number, used: boolean) => !used && over === SURGE.auto;

/**
 * Who is bowling, from the kind of over the generator planned: the swing
 * bowler has the first and third, the seamer the pace overs besides.
 */
export function bowlerOf(kind: OverKind | null, over: number): Bowler {
  return kind === 'SPIN' ? 'SPIN' : kind === 'EXPRESS' ? 'SLING' : kind === 'DEATH' ? 'DEATH' : over === 0 || over === 2 ? 'SWING' : 'SEAM';
}

/**
 * The six men the scene draws, out of the nine: the ones nearest straight,
 * which are the ones the camera behind the bat can see.
 */
export function drawnOf(field: FieldSet): Man[] {
  return [...field.men].sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle)).slice(0, 6);
}

/**
 * What the bowler signals as a field changes, and to whom: a man sent back to
 * the rope is waved back there, one brought up from it beckoned in, and
 * otherwise the man who moves furthest is pointed to his new place. Nothing
 * moves, nothing is signalled.
 */
export function signalFor(prev: FieldSet | null, field: FieldSet): { kind: 'point' | 'back' | 'in'; man: Man } | null {
  if (!prev) return null;
  const at = (a: Man, b: Man) => a.deep === b.deep && Math.abs(a.angle - b.angle) < 3;
  const back = field.men.find(m => m.deep && !prev.men.some(n => at(m, n)));
  const came = prev.men.find(m => m.deep && !field.men.some(n => at(m, n)));
  const upMan = came && field.men.find(m => !m.deep && Math.abs(m.angle - came.angle) < 3);
  if (field.change !== 'surge' && back) return { kind: 'back', man: back };
  if (upMan) return { kind: 'in', man: upMan };
  if (back) return { kind: 'back', man: back };
  const xy = (m: Man) => [Math.sin(m.angle * Math.PI / 180) * m.distance, Math.cos(m.angle * Math.PI / 180) * m.distance];
  let best: { man: Man; moved: number } | null = null;
  for (const man of field.men) {
    const [x, z] = xy(man);
    const moved = Math.min(...prev.men.map(n => { const [a, b] = xy(n); return Math.hypot(x - a, z - b); }));
    if (!best || moved > best.moved) best = { man, moved };
  }
  return best && best.moved > 3 ? { kind: 'point', man: best.man } : null;
}

/** Whether a ball struck along `angle` is out of the picture, and which side of it. */
export function offScreen(angle: number): 'leg' | 'off' | null {
  return Math.abs(angle) <= 22 ? null : angle < 0 ? 'leg' : 'off';
}

// ---------------------------------------------------------------------------
// Steering
// ---------------------------------------------------------------------------

/** A stroke's arc on the ground, and the swipe zone it is steered from (its edges, degrees off straight up). */
export interface Steer { arc: readonly [number, number]; zone: readonly [number, number] }

/** The leg side's swipe runs from the on drive's edge round to the block's fan. */
const LEG_ZONE = [-165, -67.5] as const;

/**
 * Where a stroke can be steered, by the stroke and what it came to: the cover
 * swipe is the cover drive, the square drive or the punch by the ball, and the
 * leg-side swipe the flick, the pull, the hook, the pull off the spinner or the
 * sweep (`flicked` is the attempt's). Null for the strokes that are not
 * steered: the block, and the meter's.
 */
export function steerOf(shot: ShotType | undefined, outcome: ShotOutcome, flicked = false): Steer | null {
  if (!shot || outcome.advance || outcome.swept || outcome.scooped) return null;
  switch (shot) {
    case 'STRAIGHT': return { arc: [-12, 12], zone: [-22.5, 22.5] };
    case 'LONG_ON': return { arc: [-45, -12], zone: [-67.5, -22.5] };
    case 'COVER_LONG_OFF': return { arc: outcome.squared ? [42, 78] : outcome.punched ? [35, 72] : [12, 55], zone: [22.5, 67.5] };
    case 'SQUARE_CUT': return { arc: [72, 122], zone: [67.5, 117.5] };
    case 'LATE_CUT': return { arc: [122, 160], zone: [117.5, 165] };
    case 'HOOK': return { arc: [-140, -95], zone: LEG_ZONE };
    case 'LEG': return {
      arc: outcome.hooked ? [-140, -95] : outcome.spinPulled ? [-95, -50] : outcome.sweptFlat ? [-105, -60] : flicked ? [-90, -40] : [-100, -45],
      zone: LEG_ZONE,
    };
    default: return null;
  }
}

/** The most a stroke steered to the end of its arc loses in fit with the ball. */
export const STRETCH = .15;

/**
 * Where a steered ball goes, and what steering it cost. The swipe's place in
 * its zone is its place along the arc, so a swipe further round sends the ball
 * further round; a key (no swipe angle) plays the arc's middle. Steering into
 * the outer third of the arc either side stretches the stroke (`STRETCH` at
 * the very end), which `fieldRules` reads. The timing's bend is laid on after
 * by `sectorOf`, as it always was.
 */
export function steer(steer: Steer, swipe: number | undefined): { angle: number; stretch: number } {
  const [a0, a1] = steer.arc, [z0, z1] = steer.zone;
  const centre = (a0 + a1) / 2, half = (a1 - a0) / 2;
  if (swipe === undefined) return { angle: centre, stretch: 0 };
  const t = Math.max(0, Math.min(1, (swipe - z0) / (z1 - z0)));
  const angle = a0 + t * (a1 - a0);
  const off = Math.abs(angle - centre) - half / 3;
  return { angle, stretch: off > 0 ? STRETCH * off / (half * 2 / 3) : 0 };
}
