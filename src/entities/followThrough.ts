/**
 * The follow-through: his trunk, his hips and his head carried a little past
 * where a stroke puts them and let settle, rather than every part of him
 * arriving and stopping on the same frame. The strokes are keyed poses eased
 * one to the next, which is accurate and a little mechanical: a body has
 * weight, so the trunk lags the hips into a stride and rocks on past the
 * finish, the knees give as the weight lands, and the head goes with the
 * shoulders a moment late.
 *
 * It is laid over the pose a stroke asks for, on the way to being drawn, and
 * touches nothing else: the grip and the bat's turn are the stroke's own, the
 * feet stay planted, and the pose the next stroke starts from is the
 * stroke's, never this. From the swing to the ball it is off altogether
 * (`before`, `after`), so the bat meets the ball from exactly the body the
 * stroke drew; after it the bat moves only where a stroke eases it clear of
 * his helmet or his body, which it now does from where they are drawn. Small by design (`most`,
 * `down`, `up`): a few centimetres, which read as weight, not as wobble.
 *
 * Only the game's batter has it (`springy` on `Batter`): the previews, the
 * Dressing Room and the batter tests keep the poses as authored.
 */
export type Triple = readonly [number, number, number];

export const FOLLOW = {
  /** The trunk's lean over the hips: how fast it answers (Hz), how soon it stops rocking, and how much it leads a move. */
  lean: { hz: 3.8, damp: .4, lead: .85 },
  /** How much of the lean's lag is drawn, and the most it may ever be, in metres. */
  share: .8, most: .05,
  /** The hips' height: the knees giving as the weight lands. */
  give: { hz: 4.5, damp: .38, lead: .7 },
  /** The furthest the hips sink below the stroke's own height, and rise above it: a straight leg cannot lengthen. */
  down: .035, up: .012,
  /** The head going with the shoulders, in radians a metre of the trunk's lag. */
  head: 1.5,
  /**
   * Off from the swing to the ball, so the bat meets it from exactly the body
   * the stroke drew: let go over `before` ms as he swings, and back over
   * `after` ms once the bat has met it.
   */
  before: 50, after: 90,
  /** A gap longer than this between frames is a cut (a pause, a replay staged): it starts again at rest. */
  gap: 120,
  /** The longest step the springs take at once, in ms: a slow frame is taken in pieces. */
  step: 8,
} as const;

/**
 * One value followed by a second-order system: it lags a move, overshoots
 * where the move stops and settles. `lead` feeds the target's own speed in, so
 * the lag is small while the overshoot at a stop is kept.
 */
class Follower {
  private y = 0; private v = 0; private last = 0;
  private readonly k1: number; private readonly k2: number; private readonly k3: number;
  constructor({ hz, damp, lead }: { hz: number; damp: number; lead: number }) {
    const w = 2 * Math.PI * hz;
    this.k1 = 2 * damp / w; this.k2 = 1 / (w * w); this.k3 = lead * damp / w;
  }
  rest(x: number) { this.y = this.last = x; this.v = 0; }
  /** On by `dt` seconds toward `x`. */
  to(x: number, dt: number) {
    const speed = (x - this.last) / dt; this.last = x;
    // Held stable whatever the step: see the semi-implicit Euler's bound.
    const k2 = Math.max(this.k2, dt * dt / 2 + dt * this.k1 / 2, dt * this.k1);
    this.y += dt * this.v;
    this.v += dt * (x + this.k3 * speed - this.y - this.k1 * this.v) / k2;
    return this.y;
  }
  get value() { return this.y; }
  /** The target as it was last given. */
  get seen() { return this.last; }
}

export interface Followed { hip: Triple; chest: Triple; nod: number; tilt: number }

export class FollowThrough {
  private lean = [new Follower(FOLLOW.lean), new Follower(FOLLOW.lean), new Follower(FOLLOW.lean)];
  private give = new Follower(FOLLOW.give);
  private at = NaN;
  /** How far the trunk and the hips are drawn from the stroke's own, in metres: for the checks. */
  shown = { lean: 0, give: 0 };
  /** At rest where he is: a new innings, a film, a fall. */
  reset() { this.at = NaN; this.shown = { lean: 0, give: 0 }; }
  /**
   * The stroke's hips and chest at `now`, as they are drawn. `weight` is how
   * much of it shows: the springs run on under it, so it comes in without a jump.
   */
  step(now: number, hip: Triple, chest: Triple, weight = 1): Followed {
    const rel = [chest[0] - hip[0], chest[1] - hip[1], chest[2] - hip[2]];
    const gap = now - this.at;
    this.at = now;
    if (Number.isNaN(gap) || gap < 0 || gap > FOLLOW.gap) {
      // The first frame or a cut: at rest where the stroke has him.
      this.lean.forEach((f, i) => f.rest(rel[i])); this.give.rest(hip[1]);
      this.shown = { lean: 0, give: 0 };
      return { hip, chest, nod: 0, tilt: 0 };
    }
    if (gap > 0) {
      // The target is walked across the frame, so a slow frame is not one great jolt at its end.
      const from = [...this.lean.map(f => f.seen), this.give.seen], to = [...rel, hip[1]];
      const steps = Math.ceil(gap / FOLLOW.step), dt = gap / steps / 1000;
      for (let n = 1; n <= steps; n++) {
        const at = (i: number) => from[i] + (to[i] - from[i]) * n / steps;
        this.lean.forEach((f, i) => f.to(at(i), dt));
        this.give.to(at(3), dt);
      }
    }
    const off = this.lean.map((f, i) => (f.value - rel[i]) * FOLLOW.share * weight);
    const size = Math.hypot(off[0], off[1], off[2]);
    if (size > FOLLOW.most) off.forEach((_, i) => off[i] *= FOLLOW.most / size);
    // Leant, not stretched: the trunk keeps the length the stroke gave it.
    const long = Math.hypot(rel[0], rel[1], rel[2]), leant = rel.map((r, i) => r + off[i]);
    const now_ = Math.hypot(leant[0], leant[1], leant[2]) || 1;
    const sink = Math.min(FOLLOW.up, Math.max(-FOLLOW.down, this.give.value - hip[1])) * weight;
    const drawnHip: Triple = [hip[0], hip[1] + sink, hip[2]];
    const drawnChest: Triple = [drawnHip[0] + leant[0] * long / now_, drawnHip[1] + leant[1] * long / now_, drawnHip[2] + leant[2] * long / now_];
    this.shown = { lean: Math.min(size, FOLLOW.most), give: sink };
    return { hip: drawnHip, chest: drawnChest, nod: off[2] * FOLLOW.head, tilt: -off[0] * FOLLOW.head };
  }
}

