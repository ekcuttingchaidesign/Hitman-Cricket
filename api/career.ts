// The `.js` on these is not a mistake and must not be tidied away — see the
// note at the top of `api/board.ts`.
import { CAREER_BOARD_SIZE, readCareer, readCareerBoards } from '../src/server/career-store.js';
import { NoDatabase, redisFromEnv, upstashCareer } from '../src/server/upstash.js';
import { cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';
import { BLAST_CAREER, SURVIVE_CAREER, type BlastCareer, type SurviveCareer } from '../src/game/career.js';

/**
 * `GET /api/career` — every career board of one mode, or one player's figures.
 *
 * Two answers from one endpoint, and they are cached in opposite ways, which is
 * usually a reason to split a file in two. They are together here because the
 * split would be along the wrong line: this is one record read two ways, and a
 * second function would be a second copy of the mode switch, the ladder pair
 * and the error handling for the sake of a header.
 *
 * Without `?player=`, it is the boards — all of a mode's ladders in one answer,
 * because the sheet draws them as tabs over one screen and fetching them one
 * tab at a time would make switching tabs cost a round trip. It carries nothing
 * personal, so it sits in the edge cache; five minutes stale is nothing on a
 * board of all-time totals, and it is what keeps this off the command budget.
 *
 * With `?player=`, it is that player's own career for their card, and it is
 * never cached by anyone. Their figures are theirs.
 *
 * `?mode=survive` asks for the Test career instead. The two are separate
 * records over separate keys — balls survived and sixes hit in a slog are not
 * the same career — so the mode picks which keys are read and which ladder
 * shapes the answer. Anything else, including nothing, is the Blast.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return failed(res, 405, 'Use GET.');

  const survive = String(req.query?.mode ?? '').toLowerCase() === 'survive';
  const player = String(req.query?.player ?? '');

  try {
    // It reads with the read-only token. An endpoint that cannot write is one
    // fewer thing to get wrong.
    const redis = redisFromEnv(true);
    if (player) {
      const mine = survive
        ? await readCareer(upstashCareer<SurviveCareer>(redis, SURVIVE_CAREER.scope), SURVIVE_CAREER, player)
        : await readCareer(upstashCareer<BlastCareer>(redis, BLAST_CAREER.scope), BLAST_CAREER, player);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(mine);
    }
    const boards = survive
      ? await readCareerBoards(upstashCareer<SurviveCareer>(redis, SURVIVE_CAREER.scope), SURVIVE_CAREER)
      : await readCareerBoards(upstashCareer<BlastCareer>(redis, BLAST_CAREER.scope), BLAST_CAREER);
    // Five minutes of edge cache, then an hour where a stale set of boards is
    // served while a fresh one is fetched behind it. An all-time total five
    // minutes old is not wrong; a screen that makes the player wait is.
    res.setHeader('Cache-Control', `public, s-maxage=300, stale-while-revalidate=3600`);
    res.status(200).json({ ...boards, size: CAREER_BOARD_SIZE });
  } catch (error) {
    if (error instanceof NoDatabase) return failed(res, 503, 'The board is not set up yet.', error);
    failed(res, 503, 'The board could not be reached.', error);
  }
}
