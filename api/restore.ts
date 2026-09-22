// The `.js` on these is not a mistake and must not be tidied away — see the
// note at the top of `api/board.ts`. `scripts/function-check.mjs` is what keeps
// it honest.
import { newKey, refusedRecovery, restore } from '../src/server/recovery-store.js';
import { NoDatabase, redisFromEnv, upstashRecovery } from '../src/server/upstash.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `POST /api/restore` — a name and a key, for the player id they open.
 * `POST /api/restore?new=1` — a fresh key, for whoever already holds the name.
 *
 * This is the one endpoint in the game where being wrong hands a stranger
 * somebody else's career, so every rule about it lives in `recovery-store` and
 * is tested there. This file turns a request into that call and nothing else:
 * the body is data, the address comes from the request rather than from the
 * body, and no answer is ever cached by anybody.
 *
 * The two halves share a file because they share a subject and a store. They
 * do not share a rule: restoring proves who you are with a key, and replacing
 * a key proves it with the player id — the same secret the board is written
 * with, so it hands back nothing the caller did not already have.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return failed(res, 405, 'Use POST.');

  const body = parse(req.body);
  if (!body) return failed(res, 400, 'Send the name and the key as JSON.');

  try {
    const store = upstashRecovery(redisFromEnv());
    // Never cached, by anyone, ever — not the refusals either. A cache in front
    // of this would answer the eleventh try from a rate-limited address with
    // the tenth try's answer.
    res.setHeader('Cache-Control', 'no-store');

    if (req.query?.new) {
      const made = await newKey(store, { name: body.name, playerId: body.playerId });
      if (refusedRecovery(made)) return failed(res, made.status, made.reason);
      return res.status(200).json({ key: made.key });
    }

    const brought = await restore(store, {
      name: body.name,
      key: body.key,
      address: addressOf(req),
    });
    if (refusedRecovery(brought)) return failed(res, brought.status, brought.reason);
    res.status(200).json({ playerId: brought.playerId });
  } catch (error) {
    if (error instanceof NoDatabase) return failed(res, 503, 'Records are not set up yet.', error);
    failed(res, 503, 'That could not be checked. Try again in a minute.', error);
  }
}

/** Vercel parses a JSON body itself, but a string still arrives on some paths. */
function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try { return parse(JSON.parse(body)); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
