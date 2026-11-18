// The `.js` on these is not a mistake and must not be tidied away: see the note
// at the top of `api/board.ts`.
import { matchRefused } from '../src/server/knockout-store.js';
import { knockoutCacheable, knockoutRequest } from '../src/server/knockout-endpoint.js';
import { NoDatabase, redisFromEnv, upstashKnockouts } from '../src/server/upstash.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `/api/knockout` — Super Knockout with friends (`knockout-store.ts`). A match
 * read is the same for everybody holding its code, so it may sit at the edge
 * for a second: twelve phones polling one match poll the same bytes.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  try {
    const request = { method: req.method, query: req.query ?? {}, body: req.body, address: addressOf(req) };
    const store = upstashKnockouts(redisFromEnv());
    const outcome = await knockoutRequest(store, request);
    if (matchRefused(outcome)) return failed(res, outcome.status, outcome.reason);
    res.setHeader('Cache-Control', knockoutCacheable(request) ? 'public, s-maxage=1, stale-while-revalidate=2' : 'no-store');
    res.status(200).json(outcome);
  } catch (error) {
    if (error instanceof NoDatabase) return failed(res, 503, 'Matches are not set up yet.', error);
    failed(res, 503, 'The match could not be reached.', error);
  }
}
