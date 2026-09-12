// The `.js` on these is not a mistake and must not be tidied away. package.json
// declares `"type": "module"`, so Node resolves these as ESM — and ESM requires
// an explicit extension on a relative import. Written extensionless, the
// function crashes on load with ERR_MODULE_NOT_FOUND before any handler runs,
// which is a 500 with no log of its own. TypeScript maps `.js` back to the `.ts`
// beside it, and Vite and Vitest resolve it the same way, so this costs the rest
// of the project nothing. `scripts/function-check.mjs` is what keeps it honest.
import { readBoard } from '../src/server/board-store.js';
import { NoDatabase, redisFromEnv, upstashStore } from '../src/server/upstash.js';
import { cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

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
export default async function handler(req: ApiRequest, res: ApiResponse) {
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
    // A board with no database behind it was never set up; a board that is down
    // was. Saying which one saves reading the logs to find out.
    if (error instanceof NoDatabase) return failed(res, 503, 'The board is not set up yet.', error);
    // The board being down must never be the player's problem, so this says so
    // plainly and the game carries on without it.
    failed(res, 503, 'The board could not be reached.', error);
  }
}
