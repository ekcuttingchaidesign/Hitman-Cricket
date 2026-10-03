/**
 * The speed gun: what the screen says a ball was bowled at.
 *
 * The speeds the game bowls are tuned for play rather than for a broadcast —
 * Test Survival's express ball is 172 to 186 internally — and they decide how
 * fast the ball arrives and, squared, what a blow costs, so they stay as they
 * are. This reads them the way a real gun would have: anything up to 140 as it
 * is, and the quicks above it folded into 140 to 160, so an express ball still
 * always reads faster than a fast one and nothing reads like a cartoon. Never
 * under 70, never over 160.
 *
 * Only the HUD calls it. Flight time and injury keep the internal speed.
 */
export const GUN = { floor: 70, fold: 140, top: 160, fastest: 186 } as const;

export function shownKph(kph: number): number {
  const folded = kph <= GUN.fold ? kph : GUN.fold + (kph - GUN.fold) * (GUN.top - GUN.fold) / (GUN.fastest - GUN.fold);
  return Math.round(Math.min(GUN.top, Math.max(GUN.floor, folded)));
}
