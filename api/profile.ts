// The `.js` on these is not a mistake and must not be tidied away: see the note
// at the top of `api/board.ts`.
import { profileRefused, profileRequest } from '../src/server/profile-endpoint.js';
import { NoDatabase, redisFromEnv, upstashProfiles } from '../src/server/upstash.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `/api/profile` — somebody's profile by handle, your own activity, and your
 * bio. Every call is one player's, so none is cached; and every one writes —
 * a look is counted, a rate counter raised — so none takes the read-only token.
 * What it does is `profileRequest`, shared with the dev server.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  try {
    const query = Object.fromEntries(Object.entries(req.query ?? {})
      .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
    const request = { method: req.method, query, body: req.body, address: addressOf(req) };
    const outcome = await profileRequest(upstashProfiles(redisFromEnv()), request);
    if (profileRefused(outcome)) return failed(res, outcome.status, outcome.reason);
    res.setHeader('Cache-Control', outcome.cache);
    res.status(200).json(outcome.body);
  } catch (error) {
    if (error instanceof NoDatabase) return failed(res, 503, 'Profiles are not set up yet.', error);
    failed(res, 503, 'The profile could not be reached.', error);
  }
}
