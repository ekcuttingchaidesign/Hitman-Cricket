import { GAME } from '../config/gameplay.js';
import type { Innings } from './leaderboard.js';

/**
 * An innings as thirty characters, one per ball.
 *
 * This is the whole of what a challenge sends. The game already keeps every
 * ball — `ScoreManager.history` — and the end card already draws its bar chart
 * from it, so nothing new is captured here; it is only written down small
 * enough to travel.
 *
 * Small enough matters more than it sounds. A challenge is fetched once before
 * the first ball and then sat on for five overs, so the opponent's whole innings
 * has to arrive in one breath and cost nothing to store for a week. Thirty bytes
 * does both.
 *
 * Seven characters cover every ball this game can bowl. The runs are typed
 * `0 | 1 | 2 | 3 | 4 | 6` and every wicket in `ShotResolver` spreads an outcome
 * whose runs are nought — a wicket is never worth runs here — so a wicket needs
 * no number beside it and `W` can stand alone.
 *
 * The figures are *derived* from this rather than sent beside it. A client that
 * sent both could disagree with itself; a client that sends only the balls gets
 * whatever score those balls actually make. That is a stronger floor than asking
 * whether six totals could have happened, and it is the same floor on both sides
 * of the wire, because both sides call this file.
 */

/** A wicket. Always nought runs, which is why it needs no digit. */
export const WICKET = 'W';
/** Every character a ball may be: the six run values, and the wicket. */
export const BALL_CHARS = '012346' + WICKET;
/** The longest an innings can be. Shorter means it ended early. */
export const MAX_BALLS = GAME.totalBalls;

/** The one ball this file reads, named structurally so nothing has to import it. */
export interface Ball {
  runs: number;
  isWicket: boolean;
}

/**
 * An innings written down. Anything past the thirtieth ball is dropped rather
 * than trusted: the innings is over by then whatever a caller believes.
 */
export function encodeInnings(history: readonly Ball[]): string {
  return history
    .slice(0, MAX_BALLS)
    .map(ball => (ball.isWicket ? WICKET : String(ball.runs)))
    .join('');
}

/** What one character is worth. A wicket, and anything unreadable, is nought. */
export function runsOf(char: string): number {
  if (char === WICKET) return 0;
  const runs = Number(char);
  return Number.isInteger(runs) && BALL_CHARS.includes(char) ? runs : 0;
}

/** An innings read back, ball by ball, for replaying a ghost against your own. */
export function decodeInnings(balls: string): Ball[] {
  return [...balls].map(char => ({ runs: runsOf(char), isWicket: char === WICKET }));
}

/**
 * Whether this is an innings at all: the right characters, and not longer than
 * one. It says nothing about whether the innings *ended* — see `ended`.
 */
export function readable(balls: unknown): balls is string {
  if (typeof balls !== 'string' || !balls.length || balls.length > MAX_BALLS) return false;
  return [...balls].every(char => BALL_CHARS.includes(char));
}

/**
 * The six figures the board ranks on, worked out from the balls themselves.
 *
 * Nothing here is taken on trust, because nothing here is sent: a caller hands
 * over the balls and is handed back the only score those balls make. The
 * arithmetic is the same the game does live, so a derived innings and the one
 * on the player's own screen are the same innings — which a test holds.
 */
export function figuresOf(balls: string): Innings {
  const figures: Innings = { runs: 0, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: balls.length };
  for (const char of balls) {
    if (char === WICKET) { figures.wickets++; continue; }
    const runs = runsOf(char);
    figures.runs += runs;
    if (runs === 6) figures.sixes++;
    else if (runs === 4) figures.fours++;
    // A dot is a ball that scored nothing and was not a wicket, which is what
    // keeps it a different key from the wickets beside it on the ladder.
    else if (runs === 0) figures.dots++;
  }
  return figures;
}

/**
 * Whether an innings ended the way one can.
 *
 * There are two ways and no others: thirty balls faced, or three wickets down.
 * A player who claims to have finished on twelve balls with a wicket in hand has
 * a score, not a result, and the challenge turns it away — which is the one
 * thing `figuresOf` cannot tell you, because those twelve balls add up perfectly
 * well.
 */
export function ended(figures: Innings): boolean {
  return figures.balls >= MAX_BALLS || figures.wickets >= GAME.maxWickets;
}

/**
 * An innings that is both readable and finished, or null.
 *
 * The one call the endpoint makes: it hands over whatever arrived in the body
 * and gets back either a score it can record or nothing at all.
 */
export function completedInnings(balls: unknown): { balls: string; figures: Innings } | null {
  if (!readable(balls)) return null;
  const figures = figuresOf(balls);
  if (figures.wickets > GAME.maxWickets) return null;
  return ended(figures) ? { balls, figures } : null;
}
