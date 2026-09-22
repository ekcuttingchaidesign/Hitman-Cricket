import {
  CLASSIC_LADDER, SURVIVE_LADDER, cleanName, refused, submitScore, type Submission,
} from '../src/server/board-store.js';
import { nameCareer } from '../src/server/career-store.js';
import { foldName } from '../src/server/board-store.js';
import { keyOnClaim } from '../src/server/recovery-store.js';
import {
  NoDatabase, redisFromEnv, upstashCareer, upstashRecovery, upstashStore,
} from '../src/server/upstash.js';
import {
  BLAST_CAREER, SURVIVE_CAREER, type BlastCareer, type SurviveCareer,
} from '../src/game/career.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';
import type { Innings } from '../src/game/leaderboard.js';
import type { SurviveInnings } from '../src/game/survive-board.js';

/**
 * `POST /api/score` — an innings offered to the board.
 *
 * Everything that decides whether it is taken lives in `submitScore`, which runs
 * the same ladder and the same plausibility floor the browser ran. This file
 * only turns a request into that call and the answer back into a response: the
 * body is read as data and nothing in it is trusted, least of all the clock —
 * the store stamps the submission itself, or a laptop running fast would win
 * tiebreaks.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return failed(res, 405, 'Use POST.');

  const body = parse(req.body);
  if (!body) return failed(res, 400, 'Send an innings as JSON.');

  // Which board is being offered an innings. The two are separate ladders over
  // separate keys, and the figures a row carries differ, so this decides both.
  const survive = String(body.mode ?? '').toLowerCase() === 'survive';
  const who = {
    playerId: String(body.playerId ?? ''),
    name: String(body.name ?? ''),
    avatar: Number(body.avatar),
    address: addressOf(req),
  };

  try {
    const outcome = survive
      ? await submitScore(
        upstashStore<SurviveInnings>(redisFromEnv(), SURVIVE_LADDER.scope),
        SURVIVE_LADDER,
        { ...who, innings: surviveFigures(body.innings) } satisfies Submission<SurviveInnings>,
      )
      : await submitScore(
        upstashStore(redisFromEnv()),
        CLASSIC_LADDER,
        { ...who, innings: figures(body.innings) } satisfies Submission<Innings>,
      );
    if (refused(outcome)) return failed(res, outcome.status, outcome.reason);
    // The name is now this player's, so the career they have already been
    // building under no name at all goes onto the career boards — rather than
    // waiting for the next innings to carry the name across, which is precisely
    // the innings a player who has just registered has not played yet.
    //
    // It must not be able to fail the claim. The place on the board is what
    // they asked for and it is already written; a career board that is a few
    // minutes behind is fixed by the next innings they finish.
    try {
      const name = cleanName(who.name);
      await (survive
        ? nameCareer(upstashCareer<SurviveCareer>(redisFromEnv(), SURVIVE_CAREER.scope), SURVIVE_CAREER,
          who.playerId, name, who.avatar)
        : nameCareer(upstashCareer<BlastCareer>(redisFromEnv(), BLAST_CAREER.scope), BLAST_CAREER,
          who.playerId, name, who.avatar));
    } catch (error) {
      console.error('The career boards did not take the name.', error);
    }
    // The key that brings this record back, minted the first time the name is
    // claimed and handed over once. Only once: registering happens on every
    // innings that improves a score, not only the first, and minting again
    // would quietly stop the key they wrote down from working.
    //
    // Like the career boards above, it must not be able to fail the claim. The
    // place on the board is what they asked for and it is already written; a
    // key that did not mint is offered again by the next innings they register,
    // and by the key screen after that.
    let key: string | null = null;
    try {
      key = await keyOnClaim(upstashRecovery(redisFromEnv()), foldName(cleanName(who.name)));
    } catch (error) {
      console.error('No career key was minted for the name.', error);
    }
    // A submission is never cached, by anyone, ever.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(key ? { ...outcome, key } : outcome);
  } catch (error) {
    if (error instanceof NoDatabase) return failed(res, 503, 'The board is not set up yet.', error);
    failed(res, 503, 'The board could not be reached.', error);
  }
}

/** Vercel parses a JSON body itself, but a string still arrives on some paths. */
function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try { return parse(JSON.parse(body)); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

/**
 * The six figures, coerced to numbers and nothing else taken. `plausible` is
 * what decides whether they could have happened; this only makes sure it is
 * being handed numbers rather than whatever was in the body.
 */
function figures(raw: unknown): Innings {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  return {
    runs: read('runs'), sixes: read('sixes'), fours: read('fours'),
    wickets: read('wickets'), dots: read('dots'), balls: read('balls'),
  };
}

/** The Test match's five, the same way. */
function surviveFigures(raw: unknown): SurviveInnings {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  return {
    runs: read('runs'), balls: read('balls'), wickets: read('wickets'),
    blows: read('blows'), health: read('health'),
  };
}
