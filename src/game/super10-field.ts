import type { OverKind } from '../config/marathon';
import { SUPER10, type Bowler } from '../config/super10';
import { sectorOf } from '../scene/flight';
import type { ShotOutcome, ShotType } from './types';

/**
 * Super10's field: nine men, set by the bowler and moved by the captain and
 * by Power Surge, and the rules that make it matter — a four struck at a
 * boundary rider is cut off for one or two, and a six struck at one is caught
 * on the rope three times in ten. A player who reads the field and hits the
 * gaps keeps their boundaries; one who hits the same lane whoever bowls does
 * not. That is what brings a strong player's totals down from the Blast's
 * towards a very good innings of 140 to 160 without narrowing a timing window
 * any further.
 *
 * Nothing here touches a scene or the page: the field is a list of angles and
 * distances, the rules are a function of an outcome, and the scene, the map
 * and the call are drawn from them (`tests/super10-field.test.ts`).
 *
 * Angles are degrees off straight as the batter looks down the pitch, the off
 * side positive, as `SHOT_ANGLES` has them; distances are metres from the bat.
 */

export interface Man {
  angle: number;
  distance: number;
  /** On the rope: a boundary rider. */
  deep: boolean;
  /** The captain, at mid-off in every field: he is the one who points the changes. */
  captain?: boolean;
}

/** What changed this field from the bowler's own: the captain's call, Power Surge, or nothing. */
export type FieldChange = null | 'captain' | 'surge';
export type CaptainCall = null | 'tight' | 'attack';

export interface FieldSet {
  /** The same for the same field, so the HUD can tell a field it has shown before. */
  id: string;
  bowler: Bowler;
  men: Man[];
  /** One line about it, for the field card. */
  note: string;
  change: FieldChange;
  /** What moved from the bowler's own field, as the chip says it: `DEEP POINT BACK`, `LONG-ON IN`. */
  moved: string[];
}

/** How far either side of a boundary rider a ball is his. */
export const GUARD = 14;
/** A four struck at him: a single this often, two otherwise. */
export const CUT_SINGLE = .6;
/** A six struck at him: caught on the rope this often. */
export const ROPE_CATCH = .3;
/** Where the ring is: men brought in from the rope stand here. */
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

interface Plan { deep: number[]; ring: [number, number][]; note: string }

/**
 * Each bowler's field. The swing bowler and the seamer have a Powerplay
 * field of their own for the first three overs, two men back at most; after
 * it four. Every field has the captain at mid-off, the first of its ring:
 * fifteen degrees off straight, which is as wide as the camera behind the bat
 * still sees him, because the point of him is to be seen moving the others.
 */
const PLANS: Record<string, Plan> = {
  // The swing bowler bowls only in the Powerplay; out of it, were the
  // schedule ever to give him an over there, he has the seamer's field.
  'SWING-pp': { deep: [-160, 150], ring: [[15, 25], [160, 15], [95, 22], [50, 23], [-18, 24], [-60, 23], [-100, 21]],
    note: 'Fine leg and third man back. Everything in front is open.' },
  'SEAM-pp': { deep: [-100, 150], ring: [[15, 25], [95, 22], [50, 23], [-18, 24], [-58, 23], [-150, 18], [130, 19]],
    note: 'Deep square leg and third man back. Hit it straight.' },
  SEAM: { deep: [-60, 98, -20, 150], ring: [[15, 25], [50, 23], [-100, 21], [-150, 18], [125, 20]],
    note: 'Deep midwicket, deep point, long-on and third man. Straight and through cover are open.' },
  get SWING() { return this.SEAM; },
  SPIN: { deep: [-18, 18, -60, -100], ring: [[15, 25], [95, 22], [50, 23], [-150, 18], [-35, 20]],
    note: 'Leg side packed. Straight and square on the off side are open.' },
  SLING: { deep: [-160, -100, 150, 18], ring: [[15, 25], [95, 22], [50, 23], [-18, 24], [-60, 23]],
    note: 'Three back behind square for the bouncer, and long-off. Straight and to leg are open.' },
  DEATH: { deep: [-15, 15, -58, 98], ring: [[15, 25], [45, 23], [-150, 20], [-95, 22], [125, 21]],
    note: 'Both long boundaries, deep midwicket and deep point. Find the gaps either side of straight.' },
};

/** What a position is called, by where it is. */
export function nameOf(angle: number, deep: boolean) {
  if (deep) {
    if (Math.abs(angle) <= 25) return angle < 0 ? 'long-on' : 'long-off';
    if (angle < -125) return 'fine leg';
    if (angle < -75) return 'deep square leg';
    if (angle < -25) return 'deep midwicket';
    if (angle > 125) return 'third man';
    if (angle > 75) return 'deep point';
    return 'deep cover';
  }
  if (Math.abs(angle) <= 30) return angle < 0 ? 'mid-on' : 'mid-off';
  if (angle < -125) return 'short fine leg';
  if (angle < -75) return 'square leg';
  if (angle < -30) return 'midwicket';
  if (angle > 150) return 'slip';
  if (angle > 115) return 'backward point';
  if (angle > 75) return 'point';
  return 'cover';
}

const near = (a: number, b: number, within = GUARD) => Math.abs(a - b) < within;
const backOf = (angle: number): Man => ({ angle, distance: deepAt(angle), deep: true });

/**
 * The lanes a player can hit, for choosing which one the captain closes: the
 * five strokes up the ground and square, and the two behind.
 */
const LANES = [-112, -52, -24, 0, 24, 100, 138];

export interface FieldAsk {
  bowler: Bowler;
  /** The over, from nought. */
  over: number;
  surge?: boolean;
  captain?: CaptainCall;
  /** Where the boundaries this innings have gone, in degrees: the captain reads them. */
  scored?: readonly number[];
}

/** The field for an over. */
export function fieldFor({ bowler, over, surge = false, captain = null, scored = [] }: FieldAsk): FieldSet {
  const key = over < SUPER10.powerplay && PLANS[`${bowler}-pp`] ? `${bowler}-pp` : bowler;
  const plan = PLANS[key];
  const men: Man[] = [
    ...plan.ring.map(([angle, distance], i) => ({ angle, distance, deep: false, ...(i === 0 ? { captain: true } : {}) })),
    ...plan.deep.map(backOf),
  ];
  let id = key, note = plan.note, change: FieldChange = null;
  const moved: string[] = [];
  const powerplay = over < SUPER10.powerplay;
  const deep = () => men.filter(m => m.deep);
  const hits = (angle: number) => scored.filter(a => near(a, angle, 20)).length;
  // The Powerplay's two men back, whoever is bowling: a bowler with no field
  // of his own for it brings the rest up, nearest straight first.
  while (powerplay && deep().length > 2) {
    Object.assign(deep().sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle))[0], { distance: RING, deep: false });
  }
  if (captain === 'tight' && !powerplay && deep().length < 5) {
    // He spreads it where the runs are going: the open lane hit most, and
    // the man in the ring nearest it drops back to the rope there.
    const open = LANES.filter(lane => !deep().some(m => near(m.angle, lane)));
    const lane = open.sort((a, b) => hits(b) - hits(a) || Math.abs(a - 95) - Math.abs(b - 95))[0];
    const ring = men.filter(m => !m.deep && !m.captain);
    if (lane !== undefined && ring.length) {
      const man = ring.reduce((a, b) => (Math.abs(b.angle - lane) < Math.abs(a.angle - lane) ? b : a));
      Object.assign(man, backOf(lane));
      id += `+tight${lane}`; change = 'captain';
      moved.push(`${nameOf(lane, true)} back`);
      note = `The captain spreads the field: a man goes back to ${nameOf(lane, true)}.`;
    }
  } else if (captain === 'attack' && !powerplay && deep().length > 2) {
    // He attacks: the man on the rope the batter has hit least past comes up.
    const man = deep().sort((a, b) => hits(a.angle) - hits(b.angle) || Math.abs(b.angle) - Math.abs(a.angle))[0];
    const from = man.angle;
    Object.assign(man, { distance: RING, deep: false });
    id += `+attack${from}`; change = 'captain';
    moved.push(`${nameOf(from, true)} in`);
    note = `The captain attacks: ${nameOf(from, true)} comes up into the ring.`;
  }
  if (surge) {
    // Power Surge: the two men back nearest straight come in.
    const take = deep().sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle)).slice(0, 2);
    for (const man of take) { moved.push(`${nameOf(man.angle, true)} in`); Object.assign(man, { distance: RING, deep: false }); }
    id += '+surge'; change = 'surge';
    note = `Power Surge: ${take.map(m => nameOf(m.angle, false)).join(' and ')} up. Only ${deep().length} left on the rope.`;
  }
  return { id, bowler, men, note, change, moved: moved.map(m => m.toUpperCase()) };
}

/** The boundary rider a ball struck along `angle` goes to, if it goes to one. */
export function guardOf(field: FieldSet, angle: number): Man | null {
  let best: Man | null = null;
  for (const man of field.men) {
    if (!man.deep || !near(man.angle, angle)) continue;
    if (!best || Math.abs(man.angle - angle) < Math.abs(best.angle - angle)) best = man;
  }
  return best;
}

/**
 * A ball the field has a say in: a four or a six off the bat, played as an
 * ordinary stroke. The special strokes a full meter buys — the charge, the
 * sweeps, the scoops — are the meter's reward and go where they are hit.
 */
function answerable(outcome: ShotOutcome) {
  return outcome.madeBatContact && !outcome.isWicket && (outcome.runs === 4 || outcome.runs === 6)
    && !outcome.advance && !outcome.swept && !outcome.sweptFlat && !outcome.scooped && !outcome.edged;
}

/**
 * The field's answer to a ball: a four at a boundary rider cut off for one or
 * two, a six at one caught on the rope three times in ten, anything else as it
 * was hit. `rng` is drawn from only for a ball a rider is under.
 */
export function fieldRules(outcome: ShotOutcome, shot: ShotType | undefined, field: FieldSet,
  rng: { next(): number }): ShotOutcome {
  if (!answerable(outcome)) return outcome;
  const man = guardOf(field, sectorOf(outcome, shot));
  if (!man) return outcome;
  const rope = { angle: man.angle, distance: man.distance, name: nameOf(man.angle, true) };
  if (outcome.runs === 4) {
    const runs = rng.next() < CUT_SINGLE ? 1 : 2;
    return { ...outcome, runs, aerial: false, quality: Math.min(outcome.quality, .6), feedback: runs === 1 ? '1 RUN' : '2 RUNS', rope };
  }
  if (rng.next() >= ROPE_CATCH) return outcome;
  return { ...outcome, runs: 0, isWicket: true, wicketType: 'CAUGHT', aerial: true, quality: 0, feedback: 'CAUGHT!', rope };
}

/** What the call says under the result for a ball a rider got to. */
export function ropeLine(outcome: ShotOutcome) {
  if (!outcome.rope) return null;
  const name = outcome.rope.name.toUpperCase();
  return outcome.isWicket ? `${name} · ON THE ROPE` : `CUT OFF · ${name}`;
}

/**
 * The captain's read of the innings, at the top of the sixth over and again
 * at the eighth: well ahead of a par of `PAR` an over he spreads the field,
 * well behind it he attacks, and in between he leaves it. A strong innings is
 * made to find new gaps; one that is struggling is given a man up to hit over.
 */
export const PAR = 14.4;
export const CAPTAIN_OVERS: Readonly<Record<number, number>> = { 5: 12, 7: 10 };
export function captainCall(runs: number, over: number, was: CaptainCall): CaptainCall {
  const margin = CAPTAIN_OVERS[over];
  if (margin === undefined) return was;
  const par = PAR * over;
  return runs > par + margin ? 'tight' : runs < par - margin ? 'attack' : null;
}

/**
 * Power Surge: one over of two men in, taken by the player from the fifth
 * over to the ninth and switched on by itself in the ninth if it is still
 * there. It is offered from the fourth over, to be armed for the next.
 */
export const SURGE = { offerFrom: 3, from: 4, last: 8 } as const;
/** Whether this over is the surge: armed for it, or the last over it can be taken in. */
export function surgeOn(over: number, armed: number | null) {
  return armed === over || (armed === null && over === SURGE.last);
}
/** Whether the key that arms the surge for the next over is offered during this one. */
export function surgeOffered(over: number, armed: number | null) {
  return armed === null && over >= SURGE.offerFrom && over < SURGE.last;
}

/**
 * The six men the scene draws, out of the nine: the captain and the five
 * nearest straight, which are the ones the camera behind the bat can see.
 * The captain first.
 */
export function drawnOf(field: FieldSet): Man[] {
  const captain = field.men.find(m => m.captain)!;
  const rest = field.men.filter(m => m !== captain).sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle)).slice(0, 5);
  return [captain, ...rest];
}

/** Whether a ball struck along `angle` is out of the picture, and which side of it. */
export function offScreen(angle: number): 'leg' | 'off' | null {
  return Math.abs(angle) <= 22 ? null : angle < 0 ? 'leg' : 'off';
}

/**
 * Who is bowling, from the kind of over the generator planned: the swing
 * bowler has the first and third, the seamer the pace overs besides.
 */
export function bowlerOf(kind: OverKind | null, over: number): Bowler {
  return kind === 'SPIN' ? 'SPIN' : kind === 'EXPRESS' ? 'SLING' : kind === 'DEATH' ? 'DEATH' : over === 0 || over === 2 ? 'SWING' : 'SEAM';
}

/**
 * What the captain signals as a new field is set, and to whom: a man sent
 * back to the rope is waved back there, one brought up from it is beckoned
 * in, and otherwise the man who moves furthest is pointed to his new place.
 * Nothing moves, nothing is signalled.
 */
export function signalFor(prev: FieldSet | null, field: FieldSet): { kind: 'point' | 'back' | 'in'; man: Man } | null {
  if (!prev) return null;
  const back = field.men.find(m => m.deep && !prev.men.some(n => n.deep && near(n.angle, m.angle, 3)));
  const came = prev.men.find(m => m.deep && !field.men.some(n => n.deep && near(n.angle, m.angle, 3)));
  const up = came && field.men.find(m => !m.deep && near(m.angle, came.angle, 3));
  if (field.change !== 'surge' && back) return { kind: 'back', man: back };
  if (up) return { kind: 'in', man: up };
  if (back) return { kind: 'back', man: back };
  let best: { man: Man; moved: number } | null = null;
  for (const man of field.men.filter(m => !m.captain)) {
    const moved = Math.min(...prev.men.map(n => distanceBetween(n, man)));
    if (!best || moved > best.moved) best = { man, moved };
  }
  return best && best.moved > 3 ? { kind: 'point', man: best.man } : null;
}
const distanceBetween = (a: Man, b: Man) => {
  const ax = Math.sin(a.angle * Math.PI / 180) * a.distance, az = Math.cos(a.angle * Math.PI / 180) * a.distance;
  const bx = Math.sin(b.angle * Math.PI / 180) * b.distance, bz = Math.cos(b.angle * Math.PI / 180) * b.distance;
  return Math.hypot(ax - bx, az - bz);
};
