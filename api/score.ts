import { refused, submitScore, type Submission } from '../src/server/board-store.js';
import { NoDatabase, redisFromEnv, upstashStore } from '../src/server/upstash.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';
import type { Innings } from '../src/game/leaderboard.js';

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

  const input: Submission = {
    playerId: String(body.playerId ?? ''),
    name: String(body.name ?? ''),
    avatar: Number(body.avatar),
    innings: figures(body.innings),
    address: addressOf(req),
  };

  try {
    const outcome = await submitScore(upstashStore(redisFromEnv()), input);
    if (refused(outcome)) return failed(res, outcome.status, outcome.reason);
    // A submission is never cached, by anyone, ever.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(outcome);
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
