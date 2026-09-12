import { GAME } from '../config/gameplay';
import type { ShotOutcome } from './types';
export class ScoreManager {
  runs = 0; wickets = 0; balls = 0; fours = 0; sixes = 0;
  /** Balls that scored nothing and were not wickets: the board ranks on these,
      and keeping wickets out of the count is what makes the two keys read as
      two different things rather than one thing counted twice. */
  dots = 0;
  history: ShotOutcome[] = [];
  get overs() { return `${Math.floor(this.balls / GAME.ballsPerOver)}.${this.balls % GAME.ballsPerOver}`; }
  get ended() { return this.balls >= GAME.totalBalls || this.wickets >= GAME.maxWickets; }
  get strikeRate() { return this.balls ? Math.round(this.runs / this.balls * 100) : 0; }
  record(outcome: ShotOutcome) {
    if (this.ended) return;
    this.runs += outcome.runs; this.wickets += Number(outcome.isWicket); this.balls++;
    this.fours += Number(outcome.runs === 4); this.sixes += Number(outcome.runs === 6);
    this.dots += Number(outcome.runs === 0 && !outcome.isWicket);
    this.history.push(outcome);
  }
}
