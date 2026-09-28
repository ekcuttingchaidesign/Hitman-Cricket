// The `.js` on these is not a mistake and must not be tidied away. See the note
// at the top of `api/board.ts`: `package.json` declares `"type": "module"`, so
// Node resolves these as ESM, and ESM requires an explicit extension on a
// relative import. Written extensionless, the function crashes on load with
// ERR_MODULE_NOT_FOUND before any handler runs — a 500 with no log of its own.
import { challengeRefused } from '../src/server/challenge-store.js';
import { cacheable, challengeRequest } from '../src/server/challenge-endpoint.js';
import { NoDatabase, redisFromEnv, upstashChallenges } from '../src/server/upstash.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `/api/challenge` — a match room: one link, and everybody who bats under it.
 *
 * `GET ?code=K7QPX2` is the room as it stands, and it is **the same answer for
 * everybody who holds the link**, deliberately. That is what lets it sit in the
 * edge cache: two friends batting at once poll the same bytes, and each finds
 * their own row by player id. `GET ?player=…` is one player's list of rooms,
 * and is never cached, because it is one player's. `GET ?board=rivals` is the
 * Rivals board, and caches like a room: it is the same for everybody.
 *
 * `POST` is the four things that change a room: making one, joining it, a ball,
 * and having seen the result. Every rule about them lives in
 * `challenge-store.ts`; the dispatch is `challenge-endpoint.ts`, shared with the
 * dev server so the two cannot drift.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  try {
    const request = { method: req.method, query: req.query ?? {}, body: req.body, address: addressOf(req) };
    // Reads use the read-only token: they cannot write, whatever they are sent.
    // All but one: a player's list is where a finished match is added to their
    // record, because nothing on the server fires when a match ends, so that
    // read has to be able to write. It is never cached and it is one player's.
    const writes = req.method !== 'GET' || !!request.query.player;
    const store = upstashChallenges(redisFromEnv(!writes));
    const outcome = await challengeRequest(store, request);
    if (challengeRefused(outcome)) return failed(res, outcome.status, outcome.reason);
    // Two seconds of edge cache on a room read, then a moment where a stale
    // answer is served while a fresh one is fetched behind it. A room two
    // seconds out of date is not wrong — a ball lands, and the next poll has it.
    // The board gets longer: it moves when a match ends, not with every ball.
    const board = !!request.query.board;
    res.setHeader('Cache-Control', !cacheable(request) ? 'no-store'
      : board ? 'public, s-maxage=30, stale-while-revalidate=60' : 'public, s-maxage=2, stale-while-revalidate=4');
    res.status(200).json(outcome);
  } catch (error) {
    // A room with no database behind it was never set up; one that is down
    // was. Saying which saves reading the logs to find out.
    if (error instanceof NoDatabase) return failed(res, 503, 'Matches are not set up yet.', error);
    failed(res, 503, 'The match could not be reached.', error);
  }
}
