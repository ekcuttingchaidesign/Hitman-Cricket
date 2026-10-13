// The `.js` on these is not a mistake and must not be tidied away — see the
// note at the top of `api/board.ts`.
import { readSaved, refusedSave, saveDressing } from '../src/server/dressing-save.js';
import { NoDatabase, redisFromEnv, upstashDressing, upstashRecap } from '../src/server/upstash.js';
import { recordUnlocks } from '../src/server/recap-store.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `GET /api/dressing?player=<id>` — what a player wears and holds, and what of
 * the Dressing Room they have already been shown, as kept for them.
 * `POST /api/dressing` — a device's copy, `{ playerId, dressing }`, merged into
 * what is kept; the merged copy comes back for the device to take up.
 *
 * It is how a pick follows a player to a new phone: the player id is what a
 * career key brings back, and this is read by it. Never cached by anyone — it
 * is one player's, and it changes with a tap.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const saved = await readSaved(upstashDressing(redisFromEnv(true)), req.query?.player);
      return res.status(200).json({ dressing: saved });
    }
    if (req.method !== 'POST') return failed(res, 405, 'Use GET or POST.');
    const body = parse(req.body);
    if (!body) return failed(res, 400, 'Send the Dressing Room as JSON.');
    const outcome = await saveDressing(upstashDressing(redisFromEnv()), { playerId: body.playerId, dressing: body.dressing, address: addressOf(req) });
    if (refusedSave(outcome)) return failed(res, outcome.status, outcome.reason);
    // Pieces of the room this save brought in for the first time were won about
    // now: dated for the year recap. Never the reason a save fails.
    await recordUnlocks(upstashRecap(redisFromEnv()), { playerId: String(body.playerId), keys: outcome.won, at: Date.now() })
      .catch(error => console.error('The year recap could not date an unlock.', error));
    res.status(200).json({ dressing: outcome.saved });
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
