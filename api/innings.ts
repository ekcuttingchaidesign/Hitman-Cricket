// The `.js` on these is not a mistake and must not be tidied away — see the
// note at the top of `api/board.ts`, and `scripts/function-check.mjs`, which is
// what keeps it honest.
import { countInnings, refusedCareer } from '../src/server/career-store.js';
import { NoDatabase, redisFromEnv, upstashCareer, upstashPlayers, upstashRecap } from '../src/server/upstash.js';
import { rememberHandle } from '../src/server/player-store.js';
import { recordInnings } from '../src/server/recap-store.js';
import { inningsLookOf } from '../src/game/recap.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';
import {
  BLAST_CAREER, MARATHON_CAREER, SUPER10_CAREER, SURVIVE_CAREER, readBlastTally, readMarathonTally, readSuper10Tally,
  readSurviveTally, type BlastCareer, type MarathonCareer, type Super10Career, type SurviveCareer,
} from '../src/game/career.js';
import { modeAsked } from '../src/server/mode.js';

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

  // Which career this innings belongs to. The three are separate records over
  // separate keys, and the figures a tally carries differ, so this decides both.
  const mode = modeAsked(body.mode);
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
    const tally = mode === 'survive' ? readSurviveTally(body.innings)
      : mode === 'marathon' ? readMarathonTally(body.innings)
      : mode === 'super10' ? readSuper10Tally(body.innings)
      : readBlastTally(body.innings);
    const outcome = mode === 'survive'
      ? await countInnings(
        upstashCareer<SurviveCareer>(redisFromEnv(), SURVIVE_CAREER.scope),
        SURVIVE_CAREER,
        { ...who, tally: tally as ReturnType<typeof readSurviveTally> },
      )
      : mode === 'marathon'
      ? await countInnings(
        upstashCareer<MarathonCareer>(redisFromEnv(), MARATHON_CAREER.scope),
        MARATHON_CAREER,
        { ...who, tally: tally as ReturnType<typeof readMarathonTally> },
      )
      : mode === 'super10'
      ? await countInnings(
        upstashCareer<Super10Career>(redisFromEnv(), SUPER10_CAREER.scope),
        SUPER10_CAREER,
        { ...who, tally: tally as ReturnType<typeof readSuper10Tally> },
      )
      : await countInnings(
        upstashCareer<BlastCareer>(redisFromEnv(), BLAST_CAREER.scope),
        BLAST_CAREER,
        { ...who, tally: tally as ReturnType<typeof readBlastTally> },
      );
    if (refusedCareer(outcome)) return failed(res, outcome.status, outcome.reason);
    // The year recap takes the innings the career took, once: a repeat is
    // answered but not counted. Never the reason an innings fails.
    if (outcome.counted && tally) {
      await recordInnings(upstashRecap(redisFromEnv()), {
        playerId: who.playerId, mode, tally, look: inningsLookOf(body.look, mode), at: Date.now(),
      }).catch(error => console.error('The year recap could not take an innings.', error));
    }
    // The handle a named career's rows go by, so they open its profile.
    if (outcome.name) await rememberHandle(upstashPlayers(redisFromEnv()), who.playerId);
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


