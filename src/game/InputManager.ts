import { GAME } from '../config/gameplay';
import type { ShotType } from './types';
export function mapKeys(keys: string[]): ShotType | null {
  const normalized = [...new Set(keys.map(k => k.toUpperCase()))];
  if (normalized.includes('A') && normalized.includes('W')) return 'LONG_ON';
  if (normalized.includes('W') && normalized.includes('D')) return 'COVER_LONG_OFF';
  if (normalized.includes('A') && normalized.includes('D')) return null;
  return normalized[0] === 'A' ? 'LEG' : normalized[0] === 'W' ? 'STRAIGHT' : normalized[0] === 'D' ? 'OFF' : null;
}
export class InputManager {
  private held = new Set<string>();
  private pending: { keys: string[]; time: number } | null = null;
  private used = false;
  constructor(private active: () => boolean, private now: () => number, private shoot: (shot: ShotType, time: number) => void) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
  }
  private down = (event: KeyboardEvent) => {
    const key = event.key.toUpperCase();
    if (!['A', 'W', 'D'].includes(key) || !this.active()) return;
    event.preventDefault();
    if (event.repeat || this.held.has(key) || this.used) return;
    this.held.add(key);
    const time = this.now();
    if (this.pending && time - this.pending.time > GAME.comboMs) this.flush(time);
    if (this.used) return;
    if (!this.pending) this.pending = { keys: [key], time };
    else {
      const pair = [...this.pending.keys, key];
      const mapped = mapKeys(pair);
      if (mapped) this.resolve(mapped);
    }
  };
  private up = (event: KeyboardEvent) => { this.held.delete(event.key.toUpperCase()); };
  private resolve(shot: ShotType) {
    if (!this.pending) return;
    const time = this.pending.time; // Preserve initial press; combo recognition adds no timing penalty.
    this.used = true; this.pending = null; this.shoot(shot, time);
  }
  flush(time: number) {
    if (this.pending && time - this.pending.time >= GAME.comboMs) this.resolve(mapKeys(this.pending.keys)!);
  }
  reset() { this.held.clear(); this.pending = null; this.used = false; }
  dispose() { window.removeEventListener('keydown', this.down); window.removeEventListener('keyup', this.up); }
}
