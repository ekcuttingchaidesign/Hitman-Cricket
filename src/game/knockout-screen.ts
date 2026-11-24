/**
 * What Super Knockout puts on the game's own screen between balls (Figma
 * F2, P5 and P6): the line, the player's row and the nearest across it with
 * the knockout dashed between; or, at an over's end, who went and how many
 * are left. Painted by `paintKnockout`.
 */
export type KnockoutScreen =
  | { kind: 'line'; rows: { place: number; name: string; runs: number; you: boolean; out: boolean }[]; cutAfter: number }
  | { kind: 'cut'; out: number; left: number; names: string[] }
  | { kind: 'freehit' };
