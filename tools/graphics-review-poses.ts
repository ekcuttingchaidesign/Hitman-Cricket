import { Batter, CHARGE_CLOCK, CHARGE_CONTACT_MS, CHARGE_MEETS_AT, PULL_CONTACT_MS, PULL_LOAD_MS, STROKE_CONTACT_MS, STROKE_DURATION_MS } from '../src/entities/Batter';
import { ADVANCE, GAME } from '../src/config/gameplay';

export const ACTIONS = ['guard', 'drive', 'pull', 'charge'] as const;
export type ReviewAction = typeof ACTIONS[number];
export const FRAMES = { reference: [390, 660], phone: [390, 844], landscape: [1280, 720] } as const;
export type ReviewFrame = keyof typeof FRAMES;
export type ReviewKit = 'blast' | 'survive';

export const PLAYS = {
  guard: { label: 'Guard', duration: 0, note: 'Resting guard, held at the same moment every time.', phases: [['Guard', 0]] },
  drive: { label: 'Straight drive', duration: STROKE_DURATION_MS, note: 'The current straight drive. The camera stays at the batting end.', phases: [['Backlift', 0], ['Contact', STROKE_CONTACT_MS], ['Extension', 220], ['Finish', 410], ['Recovered', STROKE_DURATION_MS]] },
  pull: { label: 'Pull', duration: STROKE_DURATION_MS, note: 'The current backfoot pull at a chest-high ball.', phases: [['Backlift', 0], ['Loaded', PULL_LOAD_MS], ['Contact', PULL_CONTACT_MS], ['Through', 400], ['Recovered', STROKE_DURATION_MS]] },
  charge: { label: 'Advance charge', duration: STROKE_DURATION_MS + ADVANCE.walkBackMs, note: 'The existing production charge, including its walk back. No shot keys are changed.', phases: [['Backlift', 0], ['Plant', CHARGE_CLOCK.plant], ['Contact', CHARGE_CONTACT_MS], ['Finish', CHARGE_CLOCK.finish], ['Walking back', STROKE_DURATION_MS], ['Recovered', STROKE_DURATION_MS + ADVANCE.walkBackMs]] },
} as const;

export interface ReviewState { action: ReviewAction; time: number; kit: ReviewKit; frame: ReviewFrame; reference: boolean }
export function readState(search: string): ReviewState {
  const p = new URLSearchParams(search);
  const action = ACTIONS.find(a => a === p.get('action')) ?? 'guard';
  const rawTime = Number(p.get('time') ?? 0);
  return {
    action, time: Number.isFinite(rawTime) ? Math.round(Math.max(0, Math.min(PLAYS[action].duration, rawTime))) : 0,
    kit: p.get('kit') === 'survive' ? 'survive' : 'blast',
    frame: p.get('frame') === 'phone' ? 'phone' : p.get('frame') === 'landscape' ? 'landscape' : 'reference',
    reference: p.get('reference') !== '0',
  };
}
export function stateQuery(state: ReviewState) {
  return new URLSearchParams({ action: state.action, time: String(state.time), kit: state.kit, frame: state.frame, reference: state.reference ? '1' : '0' }).toString();
}

/** Reconstruct from guard on every seek, so scrubbing backwards never inherits
 * a previous stroke's root travel, anticipation or grip orientation. */
export function prepareReviewPose(batter: Batter, action: ReviewAction) {
  batter.reset();
  if (action === 'guard') return;
  batter.prepare(1); batter.update(0);
  const charge = action === 'charge';
  batter.swing(action === 'pull' ? 'LEG' : 'STRAIGHT', 0,
    action === 'pull' ? -.02 : 0, action === 'pull' ? 1.12 : .54,
    GAME.contactZ + (charge ? CHARGE_MEETS_AT : 0), charge);
}
