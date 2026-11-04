import type { Super10KitId } from './super10-kits';
import { SUPER10_NUMBERS } from './super10-kits';

/**
 * Who bats with the player in Super10. The opener is the player, by the name
 * they gave at the gate; the other four come from the squad of the team whose
 * kit the innings is batted in (`Game.super10Kit`), each with the number on
 * his back for the place he bats in (`SUPER10_NUMBERS`: 17, 9, 23, 77 after
 * the player's 10).
 *
 * A squad is a pool of nine — five batters, two pace bowlers, two spinners —
 * and each innings draws its four from it (`lineupOf`): two batters at No. 2
 * and No. 3, then a pace bowler and a spinner as the tail, either way round,
 * which suits the last two batting on the tailender's windows (`BATTERS` in
 * `src/config/super10.ts`). Forty sides a team, a hundred and sixty batting
 * orders, so the card is not the same four every innings, as it was with one
 * squad of four.
 *
 * The names sound like real players and are never one: a first name and a
 * surname each a little off the real one, so a fan knows who is meant and the
 * card names nobody. Every team has overseas players, every surname is used
 * once, and every name fits the card in fifteen letters. The card prints the
 * whole name, not the surname a scorecard would: a made-up surname alone
 * (KOHLE, DHARAN) says nobody, and the joke is in the pair.
 */
export interface Squad {
  batters: readonly [string, string, string, string, string];
  pace: readonly [string, string];
  spin: readonly [string, string];
}

export const SQUADS: Record<Super10KitId, Squad> = {
  's10-purple': {
    batters: ['Josh Butlin', 'Shubh Gilani', 'Rishav Panth', 'Henrik Klassen', 'Tilok Varman'],
    pace: ['Jaspreet Bumra', 'Pat Cummings'],
    spin: ['Rasheed Khaan', 'Washy Sunder'],
  },
  's10-neon': {
    batters: ['Yashas Jaiswar', 'Travis Hedd', 'Glen Maxfield', 'Ishan Kishore', 'Phil Sault'],
    pace: ['Mitch Stark', 'Harshit Raana'],
    spin: ['Kuldeepak Yadav', 'Adam Zamper'],
  },
  's10-yellow': {
    batters: ['Cain Williams', 'Mahesh Dhoney', 'Rachit Ravindra', 'Hardeep Pandiya', 'Rinkesh Singh'],
    pace: ['Trent Bolte', 'Mohd Shammi'],
    spin: ['Akshar Patil', 'Ish Sodhee'],
  },
  's10-cherry': {
    batters: ['BroHit Sharma', 'K.L. Rahil', 'Davey Warnes', 'Shikhar Dhavan', 'Quentin de Kok'],
    pace: ['Kagiso Rabadi', 'Bhuvan Kumaar'],
    spin: ['Ravi Ashwath', 'Ravinder Jadeya'],
  },
  's10-orange': {
    batters: ['Don Bavuma', 'Suraj Yaadav', 'Kris Gale', 'Kieran Pollock', 'Shimon Hetmeyer'],
    pace: ['Andrel Rassel', 'Jofra Archar'],
    spin: ['Kishav Maharaj', 'Sunel Narain'],
  },
  's10-violet': {
    batters: ['AJ de Viljoen', 'Viraj Kohle', 'Sourav Gangli', 'Yuvan Singhal', 'Baz McCallan'],
    pace: ['DSP Siraj', 'Lasith Malingo'],
    spin: ['Wani Hasaranga', 'Varun Chakra'],
  },
};

/** Everybody in a squad, batters first. */
export const squadNames = (squad: Squad): string[] => [...squad.batters, ...squad.pace, ...squad.spin];

/** Where each of the five comes in, as the walk-out says it. */
const PLACES = ['OPENER', 'NO. 2', 'NO. 3', 'NO. 4', 'NO. 5'] as const;

export interface LinedUp {
  /** The batting card's name: the whole name, the player's with (c). */
  card: string;
  /** What the walk-out says: NO. 3 · SHUBH GILANI #9. */
  walkOut: string;
}

/** One of a list, by a roll in [0, 1). */
const pick = <T>(list: readonly T[], roll: number): T => list[Math.min(list.length - 1, Math.floor(roll * list.length))];

/**
 * The four a squad sends out this innings, in order: two of its batters, then
 * a pace bowler and a spinner, either way round. `roll` is the page's dice,
 * never the innings' seed, so no ball moves.
 */
export function drawFrom(squad: Squad, roll: () => number = Math.random): string[] {
  const first = pick(squad.batters, roll());
  const second = pick(squad.batters.filter(one => one !== first), roll());
  const pace = pick(squad.pace, roll()), spin = pick(squad.spin, roll());
  return [first, second, ...(roll() < 0.5 ? [pace, spin] : [spin, pace])];
}

/**
 * The five in batting order. A player with no name opens as OPENER, as every
 * Super10 opener did before the squads.
 */
export function lineupOf(kit: Super10KitId, player: string | null, roll: () => number = Math.random): LinedUp[] {
  const you = player?.trim() || null;
  const opener: LinedUp = you
    ? { card: `${you.toUpperCase()} (c)`, walkOut: `OPENER · ${you.toUpperCase()} #${SUPER10_NUMBERS[0]}` }
    : { card: 'OPENER', walkOut: `OPENER IN · TAKE YOUR GUARD` };
  return [opener, ...drawFrom(SQUADS[kit], roll).map((name, i) => ({
    card: name.toUpperCase(),
    walkOut: `${PLACES[i + 1]} · ${name.toUpperCase()} #${SUPER10_NUMBERS[i + 1]}`,
  }))];
}
