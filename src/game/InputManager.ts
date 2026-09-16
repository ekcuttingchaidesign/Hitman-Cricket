import { GAME } from '../config/gameplay';
import type { ShotType } from './types';
/**
 * The three shot keys, with the arrow keys as the same three. Normalising here
 * rather than in `mapKeys` means combos, held keys and every downstream rule
 * work the same whichever pair of keys a player reaches for.
 */
export function shotKey(key: string): 'A' | 'W' | 'D' | 'S' | null {
  const upper = key.toUpperCase();
  if (upper === 'A' || upper === 'ARROWLEFT') return 'A';
  if (upper === 'W' || upper === 'ARROWUP') return 'W';
  if (upper === 'D' || upper === 'ARROWRIGHT') return 'D';
  if (upper === 'S' || upper === 'ARROWDOWN') return 'S';
  return null;
}
export function mapKeys(keys: string[]): ShotType | null {
  const normalized = [...new Set(keys.map(k => k.toUpperCase()))];
  // Defence beats anything it is pressed with: a player reaching for the block
  // has decided not to play a stroke.
  if (normalized.includes('S')) return 'DEFEND';
  if (normalized.includes('A') && normalized.includes('W')) return 'LONG_ON';
  if (normalized.includes('W') && normalized.includes('D')) return 'COVER_LONG_OFF';
  if (normalized.includes('A') && normalized.includes('D')) return null;
  return normalized[0] === 'A' ? 'LEG' : normalized[0] === 'W' ? 'STRAIGHT' : normalized[0] === 'D' ? 'SQUARE_CUT' : null;
}
const SWIPE_SHOTS = ['LEG', 'LONG_ON', 'STRAIGHT', 'COVER_LONG_OFF', 'SQUARE_CUT'] as const;
/**
 * Five scoring sectors measured from straight up, and a 90-degree fan straight
 * down for the block. Straight out to the off is the cut: one flick of the
 * thumb, the same as every other stroke.
 *
 * There used to be a dead sliver either side of the block's fan — between 112.5
 * and 135 degrees — on the reasoning that a sideways drag should be no shot at
 * all. It was a bug in practice. A thumb flicking left across a phone arcs
 * downward as it goes, so a perfectly ordinary leg-side swipe of sixty pixels
 * across and thirty down came out at 117 degrees and played nothing: the batter
 * simply stood there. Twenty-two degrees of drift is nothing to ask of a thumb.
 *
 * The two outer sectors now run all the way to the fan, so every gesture past
 * the minimum distance plays something. The block is untouched — it is the one
 * stroke that has to be reliable, and its fan is exactly where it was.
 */
export function mapSwipe(dx: number, dy: number): ShotType | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < GAME.swipeDistance) return null;
  const angle = Math.atan2(dx, -dy) * 180 / Math.PI;
  if (Math.abs(angle) >= 135) return 'DEFEND';
  return SWIPE_SHOTS[Math.min(4, Math.max(0, Math.round(angle / 45) + 2))];
}
export class InputManager {
  private held = new Set<string>();
  private pending: { keys: string[]; time: number } | null = null;
  private used = false;
  private gesture: { id: number; x: number; y: number } | null = null;
  /**
   * `now` is handed the event's own `timeStamp` so the shot is timed by when the
   * player actually pressed rather than by the frame that noticed. A rounded
   * timestamp costs nothing while the tightest window is forty milliseconds
   * wide, but Survive's is half that and a sixty-hertz frame is sixteen — so
   * without this the narrow windows would read as a lottery rather than as a
   * demand on the player.
   */
  constructor(private active: () => boolean, private now: (at?: number) => number, private shoot: (shot: ShotType, time: number) => void, private surface?: HTMLElement) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    surface?.addEventListener('pointerdown', this.pointerDown);
    surface?.addEventListener('pointermove', this.pointerMove, { passive: false });
    surface?.addEventListener('pointerup', this.pointerUp);
    surface?.addEventListener('pointercancel', this.pointerCancel);
    surface?.addEventListener('lostpointercapture', this.pointerCancel);
  }
  private pointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (!event.isPrimary) { this.cancelGesture(); return; }
    if (!this.active() || this.used || this.pending) return;
    if (event.target instanceof Element && event.target.closest('button, a, dialog, .modal-overlay, .intro-panel')) return;
    this.gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.surface?.setPointerCapture(event.pointerId);
  };
  private pointerMove = (event: PointerEvent) => {
    if (!this.gesture || event.pointerId !== this.gesture.id) return;
    if (!this.active() || this.used) { this.cancelGesture(); return; }
    event.preventDefault();
    const shot = mapSwipe(event.clientX - this.gesture.x, event.clientY - this.gesture.y);
    if (!shot) return;
    // Commit at recognition: resting a thumb cannot bank an earlier shot, and
    // a longer swipe adds no delay after its direction is already clear.
    const time = this.now(event.timeStamp);
    this.used = true; this.pending = null; this.cancelGesture(); this.shoot(shot, time);
  };
  private pointerUp = (event: PointerEvent) => {
    this.pointerMove(event); // Some devices coalesce a quick flick into pointerup.
    if (event.pointerId === this.gesture?.id) this.cancelGesture();
  };
  private pointerCancel = () => this.cancelGesture();
  private cancelGesture() {
    const id = this.gesture?.id; this.gesture = null;
    if (id !== undefined && this.surface?.hasPointerCapture(id)) this.surface.releasePointerCapture(id);
  }
  private down = (event: KeyboardEvent) => {
    const key = shotKey(event.key);
    if (!key || !this.active()) return;
    event.preventDefault();
    if (event.repeat || this.held.has(key) || this.used) return;
    this.held.add(key);
    const time = this.now(event.timeStamp);
    if (this.pending && time - this.pending.time > GAME.comboMs) this.flush(time);
    if (this.used) return;
    if (!this.pending) {
      this.pending = { keys: [key], time };
      // Defence pairs with nothing, so it commits at once rather than waiting
      // out the combo window. A block is a late decision by nature, and those
      // hundred milliseconds were enough to miss the ball being judged.
      if (key === 'S') this.resolve('DEFEND');
    }
    else {
      const pair = [...this.pending.keys, key];
      const mapped = mapKeys(pair);
      if (mapped) this.resolve(mapped);
    }
  };
  private up = (event: KeyboardEvent) => { const key = shotKey(event.key); if (key) this.held.delete(key); };
  private resolve(shot: ShotType) {
    if (!this.pending) return;
    const time = this.pending.time; // Preserve initial press; combo recognition adds no timing penalty.
    this.used = true; this.pending = null; this.shoot(shot, time);
  }
  flush(time: number) {
    if (this.pending && time - this.pending.time >= GAME.comboMs) this.resolve(mapKeys(this.pending.keys)!);
  }
  cancel() { this.held.clear(); this.pending = null; this.cancelGesture(); }
  reset() { this.cancel(); this.used = false; }
  dispose() {
    this.cancel(); window.removeEventListener('keydown', this.down); window.removeEventListener('keyup', this.up);
    this.surface?.removeEventListener('pointerdown', this.pointerDown);
    this.surface?.removeEventListener('pointermove', this.pointerMove);
    this.surface?.removeEventListener('pointerup', this.pointerUp);
    this.surface?.removeEventListener('pointercancel', this.pointerCancel);
    this.surface?.removeEventListener('lostpointercapture', this.pointerCancel);
  }
}
