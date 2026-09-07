import { GAME } from '../config/gameplay';
import type { ShotOutcome } from './types';
export class ScoreManager {
  runs = 0; wickets = 0; balls = 0; fours = 0; sixes = 0;
  history: ShotOutcome[] = [];
  get overs() { return `${Math.floor(this.balls / GAME.ballsPerOver)}.${this.balls % GAME.ballsPerOver}`; }
  get ended() { return this.balls >= GAME.totalBalls || this.wickets >= GAME.maxWickets; }
  get strikeRate() { return this.balls ? Math.round(this.runs / this.balls * 100) : 0; }
  record(outcome: ShotOutcome) {
    if (this.ended) return;
    this.runs += outcome.runs; this.wickets += Number(outcome.isWicket); this.balls++;
    this.fours += Number(outcome.runs === 4); this.sixes += Number(outcome.runs === 6);
    this.history.push(outcome);
  }
}
