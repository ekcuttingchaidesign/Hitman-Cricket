import type { ShotOutcome } from './types';
import { landedSpecial } from './Confidence';

/**
 * What the bat meeting the ball feels like: a knock in the hand, the sound's
 * pitch and weight and chips off the blade, all by how well it was hit, and
 * on a special stroke the camera pushed in. A beat held on a boundary, the
 * game's clock all but stopped for up to 70ms, was taken out: on a phone it
 * read as the game lagging at the shot, the owner found on an Android. An ordinary well-timed stroke had none of
 * this: the doodles, the replays and the catch camera made the rare ball rich
 * and left the common one plain.
 *
 * It is the picture and the sound of a ball already resolved, so it moves no
 * score, no window and no seed, and is not practice. `?contact=0` turns it
 * off, for holding the two side by side.
 */
export type ContactKind = 'sweet' | 'clean' | 'soft' | 'edge';
export interface Contact {
  kind: ContactKind;
  /** The knock in the hand, in `buzz`'s shape: on, off, on. */
  buzz: readonly number[];
  /** The bat's clip played between these two speeds, drawn afresh each ball. */
  rate: readonly [number, number];
  /** The clip's level. */
  gain: number;
  /** The low knock under a middled stroke, none at 0. */
  thock: number;
  /**
   * How far the camera pushes in, in degrees of its field of view: only on a
   * special stroke that came off (`landedSpecial`). On every boundary it read
   * as a camera shake nobody asked for, the owner said.
   */
  push: number;
  /** How many chips come off the bat. */
  chips: number;
}

/** The push in: there by `PUSH_IN_MS`, and let back out over `PUSH_OUT_MS`. */
export const PUSH_IN_MS = 45, PUSH_OUT_MS = 420;

const CONTACTS: Record<ContactKind, Omit<Contact, 'kind'>> = {
  sweet: { buzz: [26, 34, 40], rate: [.94, 1], gain: 1, thock: 1, push: 2.4, chips: 14 },
  clean: { buzz: [16], rate: [.98, 1.05], gain: .9, thock: .45, push: 1.1, chips: 7 },
  soft: { buzz: [10], rate: [1.04, 1.14], gain: .7, thock: 0, push: 0, chips: 0 },
  edge: { buzz: [8, 26, 8], rate: [.97, 1.08], gain: .85, thock: 0, push: 0, chips: 0 },
};

type Struck = Pick<ShotOutcome, 'madeBatContact' | 'timingGrade' | 'runs'> & Pick<Partial<ShotOutcome>, 'edged' | 'advance' | 'defended' | 'padded' | 'hit' | 'swept' | 'scooped' | 'isWicket'>;

/** Which contact a ball was, or null for one the bat never met. */
export function contactKind(outcome: Struck): ContactKind | null {
  if (!outcome.madeBatContact || outcome.hit) return null;
  if (outcome.edged || outcome.padded) return 'edge';
  if (outcome.defended) return 'soft';
  const boundary = outcome.runs >= 4;
  if (outcome.advance && boundary) return 'sweet';
  if (outcome.timingGrade === 'PERFECT') return boundary ? 'sweet' : 'clean';
  if (outcome.timingGrade === 'GOOD') return 'clean';
  return 'soft';
}

/** The whole of it for one ball. */
export function contactOf(outcome: Struck): Contact | null {
  const kind = contactKind(outcome);
  if (!kind) return null;
  const special = landedSpecial({ isWicket: false, ...outcome });
  return { kind, ...CONTACTS[kind], push: special ? CONTACTS[kind].push : 0 };
}

/** How far in the camera is, `since` ms after the ball: 0 to 1 and back, eased out both ways. */
export function pushAt(since: number): number {
  if (since <= 0 || since >= PUSH_IN_MS + PUSH_OUT_MS) return 0;
  if (since < PUSH_IN_MS) { const k = since / PUSH_IN_MS; return 1 - (1 - k) * (1 - k); }
  const k = 1 - (since - PUSH_IN_MS) / PUSH_OUT_MS;
  return k * k * k;
}
