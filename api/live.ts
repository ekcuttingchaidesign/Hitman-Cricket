// The `.js` on these is not a mistake and must not be tidied away: see the note
// at the top of `api/board.ts`.
import { checkIn, readLive } from '../src/server/live-store.js';
import { NoDatabase, redisFromEnv, upstashLive } from '../src/server/upstash.js';
import { cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `/api/live` — who is around right now (`live-store.ts`).
 *
 *   GET                                       the list, by handle: the same for everybody, so cached at the edge
 *   POST { playerId, name, avatar, state, mode }  a check-in: online, or batting a mode
 *
 * A read writes only to forget stale entries, so it takes the full token; it
 * is cached for half a minute, which is what keeps a busy board cheap.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  try {
    const store = upstashLive(redisFromEnv());
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=30');
      return res.status(200).json(await readLive(store));
    }
    if (req.method !== 'POST') return failed(res, 405, 'Use GET or POST.');
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as Record<string, unknown>;
    const outcome = await checkIn(store, { playerId: body.playerId, name: body.name, avatar: body.avatar, state: body.state, mode: body.mode });
    if (!outcome.ok) return failed(res, outcome.status, outcome.reason);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true });
  } catch (error) {
    if (error instanceof NoDatabase) return failed(res, 503, 'Who’s online is not set up yet.', error);
    failed(res, 503, 'Who’s online could not be reached.', error);
  }
}
