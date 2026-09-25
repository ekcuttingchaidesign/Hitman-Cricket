import { GAME } from '../config/gameplay';
import { decodeInnings, encodeInnings, type Ball } from './ball-string';
import { decidedBy, type Innings } from './leaderboard';
import {
  answerChallenge, challengeLink, challengeText, challengeWhatsapp, clearUnsent, closed,
  codeFromLocation, fetchChallenge, forgetChallenge, holdUnsent, markChallenge, openChallenges,
  readUnsent, rememberChallenge, resultText, setChallenge,
  type Challenge, type ChallengeRow, type Kept,
} from './challenge-api';
import type { ScoreManager } from './ScoreManager';
import type { ChallengeResultView } from '../ui/HUD';

/**
 * The challenge, as the game plays it.
 *
 * Everything about *rules* lives on the server and everything about *screens*
 * lives in the HUD; this is the bit in between — which challenge is being
 * chased, which ball of the ghost is next, and what the reveal should say. It
 * is kept out of `Game.ts` because the innings does not change at all: the same
 * thirty balls, the same bowler, the same resolver. A challenge only changes who
 * the score is measured against afterwards, and what flashes up in the gaps.
 */

/** How the innings about to be played relates to a challenge. */
export type ChallengeRole = 'none' | 'chasing' | 'setting';

export class ChallengeRun {
  /** What this innings is for. */
  role: ChallengeRole = 'none';
  /** The challenge being chased, once its innings is in memory. */
  private held: Challenge | null = null;
  /** The ghost, ball by ball. Read from memory during the innings, never fetched. */
  private ghost: Ball[] = [];
  /** The code being chased or just set. */
  code: string | null = null;

  /** Who the ghost is, for the flash and the reveal. */
  get opponent(): ChallengeRow | null {
    return this.held?.players.find(row => row.challenger) ?? null;
  }

  /**
   * The code this page was opened with, if any, and the challenge behind it.
   *
   * This is the one fetch the whole innings makes. Once it answers, the ghost is
   * in memory and five overs can be played in a tunnel.
   */
  async fromLink(): Promise<{ challenge: Challenge; already: ChallengeRow | null } | { error: string } | null> {
    const code = codeFromLocation();
    if (!code) return null;
    const answer = await fetchChallenge(code);
    if (!answer.ok || !answer.challenge) return { error: answer.reason ?? 'That challenge could not be found.' };
    this.held = answer.challenge;
    this.code = answer.challenge.code;
    return { challenge: answer.challenge, already: null };
  }

  /** Whether this browser has already batted in the challenge it just opened. */
  answeredBy(playerId: string): ChallengeRow | null {
    return this.held?.players.find(row => row.playerId === playerId && !row.challenger) ?? null;
  }

  /** Whether the opener is the one who set it. They cannot chase themselves. */
  isMine(playerId: string): boolean {
    return this.held?.host === playerId;
  }

  /** Takes the ghost into memory and marks the innings as a chase. */
  beginChase() {
    const from = this.opponent;
    this.ghost = from ? decodeInnings(from.card) : [];
    this.role = 'chasing';
  }

  /** Marks an innings that will be offered as a challenge when it ends. */
  beginSetting() { this.role = 'setting'; this.held = null; this.code = null; this.ghost = []; }

  /** Back to an ordinary innings. */
  clear() { this.role = 'none'; this.held = null; this.code = null; this.ghost = []; }

  /**
   * The ghost's ball at this point of the innings, or null.
   *
   * Null means one of two things and the caller tells them apart by the ball
   * number: before the ghost's innings ended there is always a ball, so a null
   * inside their innings cannot happen, and a null past it means they were all
   * out. That is worth saying out loud once — see `ghostEndedAt`.
   */
  ballAt(index: number): Ball | null {
    return this.ghost[index] ?? null;
  }

  /** Which ball the ghost was out on, or null if they batted the full thirty. */
  get ghostEndedAt(): number | null {
    return this.ghost.length < GAME.totalBalls ? this.ghost.length : null;
  }

  /** The link and the message, with the score in it only if asked for. */
  share(code: string, runs: number) {
    const url = challengeLink(code);
    return (withScore: boolean) => ({
      text: challengeText(url, withScore ? runs : undefined),
      whatsapp: challengeWhatsapp(url, withScore ? runs : undefined),
    });
  }

  /** An innings offered as a challenge. */
  async set(playerId: string, name: string, avatar: number, score: ScoreManager) {
    const answer = await setChallenge(playerId, name, avatar, encodeInnings(score.history));
    if (answer.ok && answer.code) {
      this.code = answer.code;
      rememberChallenge({ code: answer.code, runs: score.runs, at: Date.now() });
    }
    return answer;
  }

  /**
   * The chase, submitted.
   *
   * The innings is held on the device first and cleared only once the server has
   * it. Thirty balls is four minutes of somebody's attention, and a tunnel, a
   * dead spot or a closed laptop must cost a delay rather than the innings.
   */
  async finish(playerId: string, name: string, avatar: number, score: ScoreManager) {
    const code = this.code;
    if (!code) return { ok: false, reason: 'There is no challenge to answer.' };
    const card = encodeInnings(score.history);
    holdUnsent({ code, card, name, avatar, at: Date.now() });
    const answer = await answerChallenge(code, playerId, name, avatar, card);
    if (answer.ok) {
      clearUnsent();
      this.held = answer.challenge ?? this.held;
    }
    return answer;
  }

  /** An innings held from a failed submit, retried on the next open. */
  static async retryUnsent(playerId: string) {
    const held = readUnsent();
    if (!held) return null;
    const answer = await answerChallenge(held.code, playerId, held.name, held.avatar, held.card);
    if (answer.ok) clearUnsent();
    return answer.ok ? answer : null;
  }

  /**
   * The challenges this browser set that somebody has since answered.
   *
   * One read per open code, and most opens have none at all — the list is only
   * non-empty for somebody who has actually challenged a friend. There is no web
   * push worth having, so this is how a challenger finds out they were beaten;
   * the friend's own WhatsApp message is what actually brings them back.
   */
  static async answered(playerId: string): Promise<Challenge[]> {
    const held = openChallenges().filter(one => !one.answered && !closed(one));
    if (!held.length) return [];
    const reads = await Promise.all(held.map(one => fetchChallenge(one.code)));
    const done: Challenge[] = [];
    reads.forEach((answer, i) => {
      const { code } = held[i];
      // A challenge that has closed is dropped; one that simply could not be
      // reached is left alone, because a dead spot is not an answer.
      if (!answer.ok && !answer.retry) { forgetChallenge(code); return; }
      if (answer.ok && answer.challenge?.state === 'answered') {
        // Noted rather than dropped: the row stays in the list so its owner can
        // look at the scoreline again, and remove it when they are done with it.
        // What happened is noted with it, so the row reads offline too.
        markChallenge(code, { answered: true, beat: beatOf(answer.challenge) });
        if (answer.challenge.host === playerId) done.push(answer.challenge);
      }
    });
    return done;
  }

  /**
   * Every challenge this browser set, with whatever the server says about each.
   *
   * One read per row that might have changed — an answered or closed one is
   * already settled and is not asked about again — so opening the list a second
   * time costs nothing.
   */
  static async list(): Promise<{ kept: Kept; challenge: Challenge | null }[]> {
    const held = openChallenges();
    const rows = await Promise.all(held.map(async one => {
      if (one.answered || closed(one)) return { kept: one, challenge: null };
      const answer = await fetchChallenge(one.code);
      if (!answer.ok || !answer.challenge) {
        // Gone for good rather than unreachable: note it, so the row reads as
        // closed instead of pretending somebody might still answer it.
        if (!answer.retry) markChallenge(one.code, { at: one.at || 1 });
        return { kept: one, challenge: null };
      }
      const answered = answer.challenge.state === 'answered';
      const beat = answered ? beatOf(answer.challenge) : undefined;
      if (answered) markChallenge(one.code, { answered: true, beat });
      return { kept: { ...one, answered, beat }, challenge: answer.challenge };
    }));
    return rows;
  }
}

/** Who answered, what they made, and whether it was enough. */
function beatOf(challenge: Challenge): Kept['beat'] {
  const them = challenge.players.find(row => !row.challenger);
  if (!them) return undefined;
  return { name: them.name, runs: them.runs, won: challenge.players[0]?.challenger !== true };
}

/**
 * What the reveal says.
 *
 * The strip names the manner, the headline names the result, and the line under
 * it picks whichever is the better story. Normally that is the margin. When the
 * winner was bowled out it is the manner — being three down in two overs and
 * still winning is a flex, not an apology, and the screen should say so.
 */
export function resultView(challenge: Challenge, you: string, link: string): ChallengeResultView {
  const players = challenge.players;
  const mine = players.find(row => row.playerId === you);
  const theirs = players.find(row => row.playerId !== you);
  const won = players[0]?.playerId === you;
  const myRuns = mine?.runs ?? 0;
  const theirRuns = theirs?.runs ?? 0;
  const margin = Math.abs(myRuns - theirRuns);
  const them = theirs?.name ?? 'They';
  const allOut = (row?: ChallengeRow) => (row?.wickets ?? 0) >= GAME.maxWickets;
  const overs = (row?: ChallengeRow) => {
    const balls = row?.balls ?? 0;
    const whole = Math.floor(balls / GAME.ballsPerOver);
    return whole <= 1 ? `${balls} balls` : `${whole} overs`;
  };

  // Which side of it the reader was on. It changes every line below, because
  // "you were twelve short" is a sentence about chasing — and the person who set
  // the challenge never chased anything. They are reading about their score
  // being got past, days later, which is a different feeling and a different
  // sentence.
  const iSetIt = mine?.challenger === true;
  const runsWord = (n: number) => `${n} run${n === 1 ? '' : 's'}`;

  const tag = allOut(mine)
    ? `ALL OUT · BALL ${mine?.balls ?? 0}`
    : iSetIt ? 'YOUR CHALLENGE' : `${them.toUpperCase()}'S CHALLENGE`;
  const title = won ? 'You win' : `${them} wins`;

  let sub: string;
  if (won && allOut(mine)) {
    sub = `Three down inside ${overs(mine)} and still past ${them}'s ${theirRuns}. Reckless. Effective.`;
  } else if (won && iSetIt) {
    sub = `Your ${myRuns} held. ${them} fell ${runsWord(margin)} short of it.`;
  } else if (won) {
    sub = `By ${runsWord(margin)}. ${them} is not going to enjoy this.`;
  } else if (margin === 0) {
    // The one loss that needs explaining, or it reads as a bug: level on runs,
    // and the tiebreak went to whoever set it.
    const split = mine && theirs ? decidedBy(mine, theirs) : null;
    sub = iSetIt
      ? `Level on ${myRuns}, and you set it first — so it stays yours.`
      : split
        ? `Level on ${myRuns}, and ${them} had more ${split}. You had to beat it, not match it.`
        : `Level on ${myRuns}. Ties go to whoever set the challenge, so you had to beat it.`;
  } else if (iSetIt) {
    sub = `${them} got past your ${myRuns} with ${runsWord(margin)} to spare.`;
  } else if (allOut(mine)) {
    sub = `${runsWord(margin)} short, three down inside ${overs(mine)}. Brutal, honestly.`;
  } else {
    sub = `${runsWord(margin)} short. So close it hurts.`;
  }

  return {
    tag,
    title,
    sub,
    players,
    you,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(resultText(myRuns, theirRuns, them, link))}`,
    tell: won ? 'RUB IT IN' : 'SEND AN EXCUSE',
  };
}

/** How long a challenge has left, in the words a screen uses. */
export function closesIn(setAt: number, now = Date.now()): string {
  const left = setAt + 7 * 24 * 3600_000 - now;
  if (left <= 0) return 'closed';
  const days = Math.floor(left / (24 * 3600_000));
  const hours = Math.floor((left % (24 * 3600_000)) / 3600_000);
  return days > 0 ? `closes in ${days}d ${hours}h` : `closes in ${hours}h`;
}

/** The six figures of an innings, for anything that wants them without the card. */
export type { Innings };
