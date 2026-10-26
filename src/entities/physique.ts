/**
 * The batter's build. Both stand on the same rig — the same hips, chest,
 * shoulders, hands and feet in every key of every stroke — so a stroke, its
 * contact and its timing are the same whichever is batting. What changes is
 * the surface drawn over the rig: the shirt's cut, the trousers' hips and
 * seat, the width of the arms and legs, and the hair.
 */
export type Physique = 'male' | 'female';

export const PHYSIQUES: readonly Physique[] = ['male', 'female'];

export interface BodyShape {
  /**
   * The shirt's profile, bottom to top: the half-width across, the height
   * from the chest anchor and the half-depth front to back, through the hem,
   * the waist, the ribs, the chest, the armpits, the shoulders and the neck.
   * The first is the hem, which the trousers' waistband follows.
   */
  jersey: readonly (readonly [number, number, number])[];
  /** How far the shirt stands out in front over the bust, at its fullest. */
  bust: number;
  /** The trousers' ring under the hem, in the hips' frame: half-width, half-depth behind and in front. */
  waist: readonly [number, number, number];
  /** How far the seat stands out behind, and the hips past the thighs at the sides. */
  seat: number;
  hip: number;
  /** Sleeve and trouser-leg radii: at the shoulder or hip, at the elbow or knee, at the wrist or ankle. */
  sleeve: readonly [number, number, number];
  leg: readonly [number, number, number];
  /** The ponytail out from under the back of the helmet, and the hair at the nape. */
  hair: boolean;
}

export const SHAPES: Record<Physique, BodyShape> = {
  male: {
    jersey: [
      [.164, -.337, .124], [.166, -.315, .129], [.156, -.23, .128], [.181, -.12, .141], [.216, -.025, .148],
      [.220, .045, .144], [.184, .105, .121], [.108, .143, .087], [.062, .165, .064],
    ],
    bust: 0,
    waist: [.17, .15, .122],
    seat: .034, hip: .018,
    sleeve: [.09, .062, .046],
    leg: [.109, .072, .059],
    hair: false,
  },
  /**
   * Narrower through the shoulders and the ribs and in at the waist, the
   * hem out over fuller hips; the bust a gentle swell in an athletic shirt;
   * slimmer arms, and the seat and the hips of the trousers fuller. The
   * armholes stay outside the rig's shoulders (.163 either side), so the
   * sleeves join the shirt as they always did.
   */
  female: {
    jersey: [
      [.174, -.337, .130], [.176, -.315, .134], [.147, -.23, .118], [.163, -.12, .126], [.193, -.025, .134],
      [.200, .045, .134], [.170, .105, .113], [.098, .143, .080], [.055, .165, .058],
    ],
    bust: .026,
    waist: [.183, .162, .126],
    seat: .046, hip: .03,
    sleeve: [.082, .055, .041],
    leg: [.112, .07, .056],
    hair: true,
  },
};

/** A build from a link or a saved word, the male one for anything else. */
export function physiqueOf(word: string | null | undefined): Physique {
  return word === 'female' ? 'female' : 'male';
}

/**
 * The build the link asks for, `?batter=female`: how she is looked at in the
 * game and the Dressing Room until a player can choose one. It changes
 * nothing about the batting, so it is not practice.
 */
export function askedPhysique(): Physique {
  return typeof location === 'undefined' ? 'male' : physiqueOf(new URLSearchParams(location.search).get('batter'));
}
