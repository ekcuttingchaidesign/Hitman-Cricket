import { describe, expect, it } from 'vitest';
import { GAME, SHOTS } from '../src/config/gameplay';
import { DeliveryGenerator } from '../src/game/DeliveryGenerator';
import { SeededRandom } from '../src/game/SeededRandom';
import { ScoreManager } from '../src/game/ScoreManager';
import { resolveShot } from '../src/game/ShotResolver';
import { plausible } from '../src/game/leaderboard';
import {
  BALL_CHARS, MAX_BALLS, WICKET, completedInnings, decodeInnings, encodeInnings,
  ended, figuresOf, readable, runsOf,
} from '../src/game/ball-string';

/**
 * An innings, played for real.
 *
 * The point of this file is the round trip below, and it is only worth anything
 * if the innings going into it came out of the actual engine rather than out of
 * a fixture somebody wrote by hand. A hand-written innings proves the sums in
 * `figuresOf`; a played one proves that the seven characters cover every ball
 * `resolveShot` can produce — which is the thing that would quietly break the
 * day a new outcome is added.
 */
function playAnInnings(seed: number) {
  const rng = new SeededRandom(seed);
  const generator = new DeliveryGenerator(rng);
  const score = new ScoreManager();
  let elapsed = 0;
  while (!score.ended) {
    const delivery = generator.next(elapsed);
    // A swing at almost every ball, at a spread of timings and strokes, so the
    // innings collects sixes, fours, run-outs of every size, dots and wickets
    // rather than thirty of one thing.
    const swing = rng.next() < 0.88;
    const attempt = swing
      ? {
        shotType: SHOTS[Math.floor(rng.next() * SHOTS.length)],
        inputTimeMs: delivery.idealContactTimeMs + rng.range(-160, 160),
      }
      : null;
    const outcome = resolveShot(delivery, attempt, rng);
    score.record(outcome);
    generator.record(outcome);
    elapsed += 2000;
  }
  return score;
}

describe('the alphabet', () => {
  it('is the six run values and the wicket, and nothing else', () => {
    expect(BALL_CHARS).toBe('012346W');
    // Five is not a thing this game can score, so it is not a character.
    expect(BALL_CHARS).not.toContain('5');
    expect(MAX_BALLS).toBe(GAME.totalBalls);
  });

  it('reads a wicket as nought runs', () => {
    expect(runsOf(WICKET)).toBe(0);
    expect(runsOf('6')).toBe(6);
    expect(runsOf('0')).toBe(0);
  });
});

describe('reading an innings', () => {
  it('takes the characters it knows and refuses the rest', () => {
    expect(readable('1046W0')).toBe(true);
    expect(readable('10456')).toBe(false);   // five is not a ball
    expect(readable('104-6')).toBe(false);
    expect(readable('w')).toBe(false);       // the wicket is capital
    expect(readable('')).toBe(false);
    expect(readable(null)).toBe(false);
  });

  it('refuses an innings longer than one', () => {
    expect(readable('6'.repeat(MAX_BALLS))).toBe(true);
    expect(readable('6'.repeat(MAX_BALLS + 1))).toBe(false);
  });
});

describe('working the score out', () => {
  it('counts every key off the balls themselves', () => {
    // 6 0 4 1 W 2 3 0 6 — two sixes, one four, one wicket, two dots, 22 runs.
    const figures = figuresOf('6041W2306');
    expect(figures).toEqual({ runs: 22, sixes: 2, fours: 1, wickets: 1, dots: 2, balls: 9 });
  });

  it('keeps wickets out of the dot count, because the ladder ranks them apart', () => {
    expect(figuresOf('WWW')).toEqual({ runs: 0, sixes: 0, fours: 0, wickets: 3, dots: 0, balls: 3 });
    expect(figuresOf('000')).toEqual({ runs: 0, sixes: 0, fours: 0, wickets: 0, dots: 3, balls: 3 });
  });

  it('knows the two ways an innings ends, and no third', () => {
    expect(ended(figuresOf('6'.repeat(30)))).toBe(true);        // thirty balls
    expect(ended(figuresOf('6'.repeat(10) + 'WWW'))).toBe(true); // three down
    expect(ended(figuresOf('6'.repeat(10) + 'WW'))).toBe(false); // neither
  });
});

describe('what the endpoint accepts', () => {
  it('takes a finished innings and hands back its score', () => {
    const taken = completedInnings('6'.repeat(30));
    expect(taken?.figures).toMatchObject({ runs: 180, sixes: 30, balls: 30 });
  });

  it('refuses a score that is not a result', () => {
    // Twelve balls, a wicket in hand: the sums are fine, the innings is not over.
    expect(completedInnings('664466446644')).toBeNull();
  });

  it('refuses more wickets than there are', () => {
    expect(completedInnings('WWWW')).toBeNull();
  });

  it('refuses anything that is not an innings', () => {
    expect(completedInnings('not an innings')).toBeNull();
    expect(completedInnings(42)).toBeNull();
    expect(completedInnings(undefined)).toBeNull();
  });
});

describe('the round trip', () => {
  /**
   * The test this file exists for. An innings is played through the real
   * generator and the real resolver, written down, and read back — and the score
   * that comes out has to be the score the player watched being made. If these
   * two ever disagree, somebody's challenge is decided on figures they did not
   * score, which is the worst bug this feature could have.
   */
  it('gives back exactly the innings the engine played, over many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const score = playAnInnings(seed);
      const balls = encodeInnings(score.history);
      const derived = figuresOf(balls);

      expect(derived.runs, `seed ${seed} runs`).toBe(score.runs);
      expect(derived.sixes, `seed ${seed} sixes`).toBe(score.sixes);
      expect(derived.fours, `seed ${seed} fours`).toBe(score.fours);
      expect(derived.wickets, `seed ${seed} wickets`).toBe(score.wickets);
      expect(derived.dots, `seed ${seed} dots`).toBe(score.dots);
      expect(derived.balls, `seed ${seed} balls`).toBe(score.balls);

      // And the innings the board would rank is the innings that was played.
      expect(plausible(derived), `seed ${seed} plausible`).toBe(true);
      expect(completedInnings(balls), `seed ${seed} accepted`).not.toBeNull();
    }
  });

  it('never writes a character outside the alphabet, over many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const balls = encodeInnings(playAnInnings(seed).history);
      for (const char of balls) {
        expect(BALL_CHARS, `seed ${seed} wrote ${JSON.stringify(char)}`).toContain(char);
      }
    }
  });

  it('replays ball for ball, which is what the ghost reads', () => {
    const score = playAnInnings(7);
    const replayed = decodeInnings(encodeInnings(score.history));
    expect(replayed).toHaveLength(score.history.length);
    replayed.forEach((ball, i) => {
      expect(ball.isWicket).toBe(score.history[i].isWicket);
      // A wicket carries no runs in this game, so the pair survives the trip.
      expect(ball.runs).toBe(score.history[i].runs);
    });
  });

  it('drops anything past the thirtieth ball rather than trusting it', () => {
    const tooMany = Array.from({ length: 40 }, () => ({ runs: 6, isWicket: false }));
    expect(encodeInnings(tooMany)).toHaveLength(MAX_BALLS);
  });
});
