/**
 * Practice: an innings played from a link carrying one of the switches that
 * change the game.
 *
 * The switches are how a bowler, a stroke or a stage of an innings gets tried
 * without batting twenty overs to reach it — `?nets=1` puts on whichever
 * bowler the player likes, `?settled=1` walks every batter out with a full
 * meter, `?charge=1` fills the meter for the charge every ball. They are
 * tools, and an innings played with one is not an innings anybody else could
 * have played. So it is kept off everything that compares one player with
 * another: the boards are not offered it, the career does not count it, and
 * this browser's own best does not move for it. In a Rival Match the switches
 * do nothing at all, since a match has to send its innings to finish.
 *
 * Read off the link once, by name and by the value that turns each one on,
 * so a link that merely mentions one (`?wear=slow`) is not practice.
 */
const ON: Record<string, (value: string) => boolean> = {
  spin: v => v === '1',
  charge: v => v !== '',
  slowmo: v => Number(v) > 0,
  bouncers: v => v === '1',
  swing: v => v === '1',
  express: v => v === '1',
  reverse: v => v === '1',
  wear: v => v === 'fast',
  round: v => v === '1',
  nets: v => v === '1',
  settled: v => v === '1',
};

/** Every switch the game reads that changes how an innings plays, by its name in the link. */
export const PRACTICE_SWITCHES = Object.keys(ON);

/**
 * The switches this link turns on, plus the two the build can set for a
 * preview (`VITE_SPIN_ONLY`, `VITE_CHARGE_ONLY`). Empty for an ordinary game.
 */
export function practiceSwitches(search: string, build: { spinOnly?: boolean; chargeOnly?: string } = {}): string[] {
  const params = new URLSearchParams(search);
  const on = PRACTICE_SWITCHES.filter(name => {
    const value = params.get(name);
    return value !== null && ON[name](value);
  });
  if (build.spinOnly && !on.includes('spin')) on.push('spin');
  if (build.chargeOnly && !on.includes('charge')) on.push('charge');
  return on;
}
