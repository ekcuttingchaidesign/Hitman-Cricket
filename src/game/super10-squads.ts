import type { Super10KitId } from './super10-kits';
import { SUPER10_NUMBERS } from './super10-kits';

/**
 * Who bats with the player in Super10. The opener is the player, by the name
 * they gave at the gate; the other four are the squad of the team whose kit
 * the innings is batted in (`Game.super10Kit`), each with the number already
 * on his back (`SUPER10_NUMBERS`: 17, 9, 23, 77 after the player's 10).
 *
 * The names sound like real players and are never one: a first name and a
 * surname each a little off the real one, so a fan knows who is meant and the
 * card names nobody. Two batters, then two bowlers as the tail, one pace and
 * one spin, which suits the last two batting on the tailender's windows
 * (`BATTERS` in `src/config/super10.ts`). Every surname is used once.
 *
 * The card prints the whole name, not the surname a scorecard would: a made-up
 * surname alone (KOHLE, DHARAN) says nobody, and the joke is in the pair.
 */
export interface SquadMan {
  name: string;
}

const man = (name: string): SquadMan => ({ name });

export const SQUADS: Record<Super10KitId, readonly [SquadMan, SquadMan, SquadMan, SquadMan]> = {
  's10-purple': [man('Josh Butlin'), man('Shubh Gilani'), man('Rasheed Khaan'), man('Jaspreet Bumra')],
  's10-neon': [man('Yashas Jaiswar'), man('Travis Hedd'), man('Mitch Stark'), man('Kuldeepak Yadav')],
  's10-yellow': [man('Cain Williams'), man('Mahesh Dhoney'), man('Akshar Patil'), man('Trent Bolte')],
  's10-cherry': [man('BroHit Sharma'), man('K.L. Rahil'), man('Ravi Ashwath'), man('Kagiso Rabadi')],
  's10-orange': [man('Don Bavuma'), man('Suraj Yaadav'), man('Andrel Rassel'), man('Kishav Maharaj')],
  's10-violet': [man('AJ de Viljoen'), man('Viraj Kohle'), man('Murali Dharan'), man('DSP Siraj')],
};

/** Where each of the five comes in, as the walk-out says it. */
const PLACES = ['OPENER', 'NO. 2', 'NO. 3', 'NO. 4', 'NO. 5'] as const;

export interface LinedUp {
  /** The batting card's name: the whole name, the player's with (c). */
  card: string;
  /** What the walk-out says: NO. 3 · SHUBH GILANI #9. */
  walkOut: string;
}

/**
 * The five in batting order. A player with no name opens as OPENER, as every
 * Super10 opener did before the squads.
 */
export function lineupOf(kit: Super10KitId, player: string | null): LinedUp[] {
  const you = player?.trim() || null;
  const opener: LinedUp = you
    ? { card: `${you.toUpperCase()} (c)`, walkOut: `OPENER · ${you.toUpperCase()} #${SUPER10_NUMBERS[0]}` }
    : { card: 'OPENER', walkOut: `OPENER IN · TAKE YOUR GUARD` };
  return [opener, ...SQUADS[kit].map((one, i) => ({
    card: one.name.toUpperCase(),
    walkOut: `${PLACES[i + 1]} · ${one.name.toUpperCase()} #${SUPER10_NUMBERS[i + 1]}`,
  }))];
}
