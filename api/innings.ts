// The `.js` on these is not a mistake and must not be tidied away — see the
// note at the top of `api/board.ts`, and `scripts/function-check.mjs`, which is
// what keeps it honest.
import { countInnings, refusedCareer } from '../src/server/career-store.js';
import { NoDatabase, redisFromEnv, upstashCareer } from '../src/server/upstash.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';
import {
  BLAST_CAREER, SURVIVE_CAREER, type BlastCareer, type SurviveCareer, type SurviveTally,
} from '../src/game/career.js';
import type { Innings } from '../src/game/leaderboard.js';

/**
 * `POST /api/innings` — an innings, counted toward a career.
 *
 * Deliberately not `/api/score`, and the split is the whole design rather than
 * tidiness. `/api/score` is the *claim*: it runs only when a player has decided
 * to put an innings on the top fifty, it wants a name, and it refuses anything
 * that would not improve their row. This runs after every innings anybody
 * finishes, wants no decision from the player, and never refuses an innings for
 * being ordinary — because "most runs, all time" is a lie if it only adds up
 * the innings that were good enough for a leaderboard.
 *
 * That also means this endpoint is hit far more often than the other one, which
 * is why the work behind it is two commands plus one `ZADD` a board, and why
 * the guards against a script are all answered from the record it was going to
 * read anyway. See `career-store.ts` for the three of them.
 *
 * Nothing in the body is trusted, least of all the clock: the store stamps the
 * innings itself, and the day a career total was reached is what settles a tie.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return failed(res, 405, 'Use POST.');

  const body = parse(req.body);
  if (!body) return failed(res, 400, 'Send an innings as JSON.');

  // Which career this innings belongs to. The two are separate records over
  // separate keys, and the figures a tally carries differ, so this decides both.
  const survive = String(body.mode ?? '').toLowerCase() === 'survive';
  const who = {
    playerId: String(body.playerId ?? ''),
    // Whatever this browser last batted under. It is only written onto the
    // record if the name registry says this player holds it, so sending one
    // here can never put somebody on a board under a name they did not claim.
    name: String(body.name ?? ''),
    avatar: Number(body.avatar),
    nonce: String(body.nonce ?? ''),
    address: addressOf(req),
  };

  try {
    const outcome = survive
      ? await countInnings(
        upstashCareer<SurviveCareer>(redisFromEnv(), SURVIVE_CAREER.scope),
        SURVIVE_CAREER,
        { ...who, tally: surviveTally(body.innings) },
      )
      : await countInnings(
        upstashCareer<BlastCareer>(redisFromEnv(), BLAST_CAREER.scope),
        BLAST_CAREER,
        { ...who, tally: blastTally(body.innings) },
      );
    if (refusedCareer(outcome)) return failed(res, outcome.status, outcome.reason);
    // A career is one player's own figures. Nobody else's cache may hold it.
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
 * The Blast's six figures, coerced to numbers and nothing else taken. Whether
 * they could have happened is the ladder's own `plausible` to say; this only
 * makes sure it is being handed numbers rather than whatever was in the body.
 */
function blastTally(raw: unknown): Innings {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  return {
    runs: read('runs'), sixes: read('sixes'), fours: read('fours'),
    wickets: read('wickets'), dots: read('dots'), balls: read('balls'),
  };
}

/** The Test match's five, plus the two boundary columns its board never held. */
function surviveTally(raw: unknown): SurviveTally {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  return {
    runs: read('runs'), balls: read('balls'), wickets: read('wickets'),
    blows: read('blows'), health: read('health'),
    sixes: read('sixes'), fours: read('fours'),
  };
}
