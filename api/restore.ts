// The `.js` on these is not a mistake and must not be tidied away — see the
// note at the top of `api/board.ts`. `scripts/function-check.mjs` is what keeps
// it honest.
import {
  describeFrom, findPlayers, firstKey, newKey, passwordSet, questionFor, recoverByAnswer, refusedRecovery, restore,
  restoreWithPassword, setPassword,
} from '../src/server/recovery-store.js';
import { NoDatabase, redisFromEnv, upstashCareer, upstashRecovery } from '../src/server/upstash.js';
import { BLAST_CAREER, MARATHON_CAREER, SURVIVE_CAREER } from '../src/game/career.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';

/**
 * `POST /api/restore` — a name and a key, for the player id they open.
 * `POST /api/restore?new=1` — a fresh key, for whoever already holds the name.
 * `POST /api/restore?first=1` — the key a name never had, if it never had one.
 * `POST /api/restore` with a password — a name and a password, for the player id.
 * `POST /api/restore?find=1` — the names a restore can pick from, for a few letters.
 * `POST /api/restore?password=1` — a password set or changed, by the player id.
 * `POST /api/restore?status=1` — whether the player id has set one, and a question.
 * `POST /api/restore?question=1` — forgot password: which question a name's player picked.
 * `POST /api/restore?recover=1` — the answer, and with it a new password, for the player id.
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

    // Asked on sight of the game by a player who holds a name and no key, so
    // the answer `null` is the ordinary one: it means the name already has a
    // key, which cannot be handed over a second time and must not be replaced.
    if (req.query?.first) {
      const made = await firstKey(store, { name: body.name, playerId: body.playerId });
      if (refusedRecovery(made)) return failed(res, made.status, made.reason);
      return res.status(200).json({ key: made.key });
    }

    if (req.query?.find) {
      const redis = redisFromEnv();
      const careers = [BLAST_CAREER, SURVIVE_CAREER, MARATHON_CAREER]
        .map(ladder => upstashCareer<{ innings: number }>(redis, ladder.scope));
      const found = await findPlayers(store, { name: body.name, address: addressOf(req) }, describeFrom(careers));
      if (refusedRecovery(found)) return failed(res, found.status, found.reason);
      return res.status(200).json({ players: found.players });
    }

    if (req.query?.password) {
      const set = await setPassword(store, {
        name: body.name, playerId: body.playerId, password: body.password, question: body.question, answer: body.answer,
      });
      if (refusedRecovery(set)) return failed(res, set.status, set.reason);
      return res.status(200).json({ ok: true, at: set.at, question: set.question });
    }

    if (req.query?.status) {
      const known = await passwordSet(store, { name: body.name, playerId: body.playerId });
      if (refusedRecovery(known)) return failed(res, known.status, known.reason);
      return res.status(200).json({ password: known.password, question: known.question, at: known.at });
    }

    if (req.query?.question) {
      const asked = await questionFor(store, { name: body.name, address: addressOf(req) });
      if (refusedRecovery(asked)) return failed(res, asked.status, asked.reason);
      return res.status(200).json({ question: asked.question });
    }

    if (req.query?.recover) {
      const back = await recoverByAnswer(store, { name: body.name, answer: body.answer, password: body.password, address: addressOf(req) });
      if (refusedRecovery(back)) return failed(res, back.status, back.reason);
      return res.status(200).json({ ok: true, playerId: back.playerId });
    }

    if (typeof body.password === 'string') {
      const back = await restoreWithPassword(store, { name: body.name, password: body.password, address: addressOf(req) });
      if (refusedRecovery(back)) return failed(res, back.status, back.reason);
      return res.status(200).json({ playerId: back.playerId });
    }

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
