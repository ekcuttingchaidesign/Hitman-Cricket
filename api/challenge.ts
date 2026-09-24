// The `.js` on these is not a mistake and must not be tidied away. See the note
// at the top of `api/board.ts`: `package.json` declares `"type": "module"`, so
// Node resolves these as ESM, and ESM requires an explicit extension on a
// relative import. Written extensionless, the function crashes on load with
// ERR_MODULE_NOT_FOUND before any handler runs — a 500 with no log of its own.
import {
  answerChallenge, challengeRefused, createChallenge, readChallenge,
  type Batter, type ChallengeOutcome,
} from '../src/server/challenge-store.js';
import { NoDatabase, redisFromEnv, upstashChallenges } from '../src/server/upstash.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `/api/challenge` — one recorded innings, and the one that answers it.
 *
 * `GET ?code=K7QPX2` is the challenge as it stands, and it is **the same answer
 * for everybody who holds the link**, deliberately. That is what lets it sit in
 * the edge cache: a challenger checking for an answer and the friend about to
 * chase it read the same bytes, and each finds their own row by player id.
 *
 * `POST` is the two things that change a challenge: setting one, and answering
 * it. Every rule about either lives in `challenge-store.ts`, next to the
 * board's, and this file only turns a request into that call and the answer back
 * into a response. The body is read as data and nothing in it is trusted — least
 * of all a score, which is never sent at all: a client sends the thirty balls it
 * played and the store works out what they were worth.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  try {
    if (req.method === 'GET') return await answer(res, await get(req), true);
    if (req.method === 'POST') return await answer(res, await post(req));
    return failed(res, 405, 'Use GET or POST.');
  } catch (error) {
    // A challenge with no database behind it was never set up; one that is down
    // was. Saying which saves reading the logs to find out.
    if (error instanceof NoDatabase) return failed(res, 503, 'Challenges are not set up yet.', error);
    failed(res, 503, 'The challenge could not be reached.', error);
  }
}

/** The challenge as it stands. Reads with the read-only token: it cannot write. */
async function get(req: ApiRequest): Promise<ChallengeOutcome> {
  const code = req.query?.code;
  return readChallenge(upstashChallenges(redisFromEnv(true)), typeof code === 'string' ? code : '');
}

/** Setting a challenge, or answering one. */
async function post(req: ApiRequest): Promise<ChallengeOutcome> {
  const body = parse(req.body);
  if (!body) return { ok: false, status: 400, reason: 'Send the challenge as JSON.' };
  const store = upstashChallenges(redisFromEnv());
  const who: Batter = {
    playerId: String(body.playerId ?? ''),
    name: String(body.name ?? ''),
    avatar: Number(body.avatar),
    address: addressOf(req),
    // Read as data and checked in the store. Never coerced here: a string is
    // the only shape an innings can arrive in, and anything else is not one.
    card: body.card,
  };
  switch (String(body.action ?? '')) {
    case 'create': return createChallenge(store, who);
    case 'answer': return answerChallenge(store, String(body.code ?? ''), who);
    default: return { ok: false, status: 400, reason: 'Say what to do with the challenge.' };
  }
}

/** The outcome as a response. A refusal is the player's to act on; the rest is a challenge. */
async function answer(res: ApiResponse, outcome: ChallengeOutcome, cache = false) {
  if (challengeRefused(outcome)) return failed(res, outcome.status, outcome.reason);
  // Two seconds of edge cache on a read, then a moment where a stale answer is
  // served while a fresh one is fetched behind it. A challenge two seconds out
  // of date is not wrong — but never word an unanswered one as final, because
  // those two seconds are exactly when an answer lands. A write is never cached.
  res.setHeader('Cache-Control', cache ? 'public, s-maxage=2, stale-while-revalidate=4' : 'no-store');
  res.status(200).json(outcome);
}

/** Vercel parses a JSON body itself, but a string still arrives on some paths. */
function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try { return parse(JSON.parse(body)); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
