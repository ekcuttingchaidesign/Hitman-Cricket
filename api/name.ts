import {
  CLASSIC_LADDER, MARATHON_SOLO_LADDER, MARATHON_TEAM_LADDER, SURVIVE_LADDER, claimOnly, foldName, nameRefused,
} from '../src/server/board-store.js';
import { nameCareer } from '../src/server/career-store.js';
import { carryKey, keyOnClaim } from '../src/server/recovery-store.js';
import {
  NoDatabase, redisFromEnv, upstashCareer, upstashRecovery, upstashStore,
} from '../src/server/upstash.js';
import {
  BLAST_CAREER, MARATHON_CAREER, SURVIVE_CAREER, type BlastCareer, type MarathonCareer, type SurviveCareer,
} from '../src/game/career.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `POST /api/name` — a name claimed on its own, with no innings for a board.
 *
 * The end card offers this to a player with no name whose innings earned no
 * place: the name is what keeps a career on a new phone and ranks it on the
 * career boards, and a place in a full top fifty used to be the only way to be
 * asked for one. Everything that decides whether the name is given is
 * `claimOnly`, the gate a board claim passes. What follows a yes is what
 * follows one on `/api/score`: the careers already counted go onto the career
 * boards under it, and the key that brings them back is minted, once.
 *
 * It is also how a player with a name changes it, from My Stats: the same gate,
 * which holds a new name to once a month, and then the new name on every row
 * and career they hold, with the key they already have carried across rather
 * than a second one minted. `previous` is the name the browser bats under now,
 * and is only ever used to find that key: `carryKey` checks it is theirs.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return failed(res, 405, 'Use POST.');

  const body = parse(req.body);
  if (!body) return failed(res, 400, 'Send a name as JSON.');
  const who = {
    playerId: String(body.playerId ?? ''),
    name: String(body.name ?? ''),
    avatar: Number(body.avatar),
    address: addressOf(req),
  };

  try {
    const outcome = await claimOnly(upstashStore(redisFromEnv()), who);
    if (nameRefused(outcome)) {
      if (!outcome.held) return failed(res, outcome.status, outcome.reason);
      return res.status(outcome.status).json({ error: outcome.reason, retry: false, status: outcome.status, held: outcome.held });
    }
    const name = (outcome as { ok: true; name: string }).name;
    // The careers counted so far, and the rows on the boards, under the name.
    // It must not be able to fail the claim: the name is what was asked for
    // and it is already held. A player with no rows has nothing renamed.
    try {
      const write = redisFromEnv();
      await Promise.all([
        ...[CLASSIC_LADDER, SURVIVE_LADDER, MARATHON_TEAM_LADDER, MARATHON_SOLO_LADDER]
          .map(ladder => upstashStore(write, ladder.scope).rename(who.playerId, name)),
        nameCareer(upstashCareer<BlastCareer>(redisFromEnv(), BLAST_CAREER.scope), BLAST_CAREER, who.playerId, name, who.avatar),
        nameCareer(upstashCareer<SurviveCareer>(redisFromEnv(), SURVIVE_CAREER.scope), SURVIVE_CAREER, who.playerId, name, who.avatar),
        nameCareer(upstashCareer<MarathonCareer>(redisFromEnv(), MARATHON_CAREER.scope), MARATHON_CAREER, who.playerId, name, who.avatar),
      ]);
    } catch (error) {
      console.error('The career boards did not take the name.', error);
    }
    // The key, minted the first time this name is claimed and handed over once.
    let key: string | null = null;
    try {
      const recovery = upstashRecovery(redisFromEnv());
      await carryKey(recovery, { from: body.previous, to: foldName(name), playerId: who.playerId });
      key = await keyOnClaim(recovery, foldName(name));
    } catch (error) {
      console.error('No career key was minted for the name.', error);
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(key ? { ok: true, name, key } : { ok: true, name });
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
