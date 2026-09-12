import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readBoard } from '../src/server/board-store';
import { redisFromEnv, upstashStore } from '../src/server/upstash';
import { cors, failed } from '../src/server/http';

/**
 * `GET /api/board` — the fifty, and the score the fiftieth is holding.
 *
 * The same answer for everybody, deliberately. Where a player stands is worked
 * out in their own browser from the packed score, which is the same number
 * computed by the same function, so this response carries nothing personal and
 * can sit in Vercel's edge cache. A hundred people opening the board in the same
 * ten seconds cost one pair of Redis commands rather than a hundred — which is
 * what keeps a half-million-command month out of reach.
 *
 * It reads with the read-only token. An endpoint that cannot write is one fewer
 * thing to get wrong.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return failed(res, 405, 'Use GET.');
  try {
    const board = await readBoard(upstashStore(redisFromEnv(true)));
    // Ten seconds of edge cache, then a minute where a stale board is served
    // while a fresh one is fetched behind it. A leaderboard ten seconds old is
    // not wrong; a leaderboard that makes the player wait is.
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=59');
    res.status(200).json(board);
  } catch (error) {
    // The board being down must never be the player's problem, so this says so
    // plainly and the game carries on without it.
    failed(res, 503, 'The board could not be reached.', error);
  }
}
