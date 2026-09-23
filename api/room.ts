// The `.js` on these is not a mistake and must not be tidied away. See the note
// at the top of `api/board.ts`: `package.json` declares `"type": "module"`, so
// Node resolves these as ESM, and ESM requires an explicit extension on a
// relative import. Written extensionless, the function crashes on load with
// ERR_MODULE_NOT_FOUND before any handler runs — a 500 with no log of its own.
import {
  createRoom, joinRoom, pushInnings, readRoom, roomRefused, startRoom,
  type RoomCaller, type RoomOutcome,
} from '../src/server/room-store.js';
import { NoDatabase, redisFromEnv, upstashRooms } from '../src/server/upstash.js';
import { addressOf, cors, failed, type ApiRequest, type ApiResponse } from '../src/server/http.js';
import type { Innings } from '../src/game/leaderboard.js';

/**
 * `/api/room` — a few friends batting at the same time, with one ladder.
 *
 * `GET ?code=K7QP` is the room as it stands, and it is **the same answer for
 * everybody in it**, deliberately. That is what lets it sit in the edge cache
 * for a couple of seconds: four players polling every three seconds cost one
 * `HGETALL` every two seconds rather than four a second, which is the whole
 * reason a room is affordable. Each player finds their own row by player id, so
 * the response carries nothing personal and nothing that would have to vary.
 *
 * `POST` is the four things that change a room — making one, joining it,
 * starting it, and pushing a score as an innings runs. Every rule about which of
 * those is allowed lives in `room-store.ts`, next to the board's, and this file
 * only turns a request into that call and the answer back into a response. The
 * body is read as data and nothing in it is trusted, least of all the clock: the
 * store stamps every push itself, or a laptop running fast would win the
 * tiebreak between two identical innings.
 */
export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (cors(req, res)) return;
  try {
    if (req.method === 'GET') return await answer(res, await get(req), true);
    if (req.method === 'POST') return await answer(res, await post(req));
    return failed(res, 405, 'Use GET or POST.');
  } catch (error) {
    // A room with no database behind it was never set up; a room that is down
    // was. Saying which one saves reading the logs to find out.
    if (error instanceof NoDatabase) return failed(res, 503, 'Rooms are not set up yet.', error);
    failed(res, 503, 'The room could not be reached.', error);
  }
}

/** The room as it stands. Reads with the read-only token: it cannot write. */
async function get(req: ApiRequest): Promise<RoomOutcome> {
  const code = req.query?.code;
  return readRoom(upstashRooms(redisFromEnv(true)), typeof code === 'string' ? code : '');
}

/** One of the four things that change a room, picked by `action`. */
async function post(req: ApiRequest): Promise<RoomOutcome> {
  const body = parse(req.body);
  if (!body) return { ok: false, status: 400, reason: 'Send the room as JSON.' };
  const store = upstashRooms(redisFromEnv());
  const code = String(body.code ?? '');
  const who: RoomCaller = {
    playerId: String(body.playerId ?? ''),
    name: String(body.name ?? ''),
    avatar: Number(body.avatar),
    address: addressOf(req),
  };
  switch (String(body.action ?? '')) {
    case 'create': return createRoom(store, who);
    case 'join': return joinRoom(store, code, who);
    case 'start': return startRoom(store, code, who.playerId, who.address);
    case 'score': return pushInnings(store, code, { ...who, innings: figures(body.innings), done: body.done === true });
    default: return { ok: false, status: 400, reason: 'Say what to do with the room.' };
  }
}

/** The outcome as a response. A refusal is the player's to act on; the rest is a room. */
async function answer(res: ApiResponse, outcome: RoomOutcome, cache = false) {
  if (roomRefused(outcome)) return failed(res, outcome.status, outcome.reason);
  // Two seconds of edge cache on a read, then a moment where a stale room is
  // served while a fresh one is fetched behind it. A ladder two seconds old is
  // not wrong. A write is never cached, by anyone, ever.
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

/**
 * The six figures, coerced to numbers and nothing else taken. `underway` and
 * `plausible` are what decide whether they could have happened; this only makes
 * sure the rules are handed numbers rather than whatever was in the body.
 */
function figures(raw: unknown): Innings {
  const from = (raw ?? {}) as Record<string, unknown>;
  const read = (key: string) => Number(from[key]);
  return {
    runs: read('runs'), sixes: read('sixes'), fours: read('fours'),
    wickets: read('wickets'), dots: read('dots'), balls: read('balls'),
  };
}
