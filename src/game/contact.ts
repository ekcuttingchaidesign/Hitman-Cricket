import type { ShotOutcome } from './types';

/**
 * What the bat meeting the ball feels like: a beat held on it, a knock in the
 * hand, the sound's pitch and weight, the camera pushed in and chips off the
 * blade, all by how well it was hit. An ordinary well-timed stroke had none of
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
  /** How long the game's clock is all but stopped on the ball, on the page's clock. */
  stopMs: number;
  /** The knock in the hand, in `buzz`'s shape: on, off, on. */
  buzz: readonly number[];
  /** The bat's clip played between these two speeds, drawn afresh each ball. */
  rate: readonly [number, number];
  /** The clip's level. */
  gain: number;
  /** The low knock under a middled stroke, none at 0. */
  thock: number;
  /** How far the camera pushes in, in degrees of its field of view. */
  push: number;
  /** How many chips come off the bat. */
  chips: number;
}

/** The clock's pace while a beat is held: all but stopped, so nothing snaps when it goes on. */
export const STOP_PACE = .06;
/** The push in: there by `PUSH_IN_MS`, and let back out over `PUSH_OUT_MS`. */
export const PUSH_IN_MS = 45, PUSH_OUT_MS = 420;

const CONTACTS: Record<ContactKind, Omit<Contact, 'kind' | 'stopMs'>> = {
  sweet: { buzz: [26, 34, 40], rate: [.94, 1], gain: 1, thock: 1, push: 2.4, chips: 14 },
  clean: { buzz: [16], rate: [.98, 1.05], gain: .9, thock: .45, push: 1.1, chips: 7 },
  soft: { buzz: [10], rate: [1.04, 1.14], gain: .7, thock: 0, push: 0, chips: 0 },
  edge: { buzz: [8, 26, 8], rate: [.97, 1.08], gain: .85, thock: 0, push: 0, chips: 0 },
};

type Struck = Pick<ShotOutcome, 'madeBatContact' | 'timingGrade' | 'runs'> & Pick<Partial<ShotOutcome>, 'edged' | 'advance' | 'defended' | 'padded' | 'hit'>;

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

/**
 * The whole of it for one ball. The beat is held only on a boundary, the
 * longer for a six, and never on the charge, which has its own slow motion
 * through the hit.
 */
export function contactOf(outcome: Struck): Contact | null {
  const kind = contactKind(outcome);
  if (!kind) return null;
  const boundary = outcome.runs >= 4 && !outcome.advance;
  const stopMs = !boundary ? 0 : kind === 'sweet' ? (outcome.runs === 6 ? 70 : 55) : kind === 'clean' ? 35 : 0;
  return { kind, stopMs, ...CONTACTS[kind] };
}

/** How far in the camera is, `since` ms after the ball: 0 to 1 and back, eased out both ways. */
export function pushAt(since: number): number {
  if (since <= 0 || since >= PUSH_IN_MS + PUSH_OUT_MS) return 0;
  if (since < PUSH_IN_MS) { const k = since / PUSH_IN_MS; return 1 - (1 - k) * (1 - k); }
  const k = 1 - (since - PUSH_IN_MS) / PUSH_OUT_MS;
  return k * k * k;
}
