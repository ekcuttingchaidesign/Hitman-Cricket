import {
  createChallenge, joinChallenge, markSeen, readChallenge, readMine, recordBalls,
  type Batter, type ChallengeListOutcome, type ChallengeOutcome, type ChallengeStore,
} from './challenge-store.js';

/**
 * A request to `/api/challenge`, turned into a call on the store.
 *
 * Shared by the deployed function and the dev server's mirror, so the two
 * cannot drift: whatever the game does against `npm run dev` it does against
 * Vercel. The body is read as data and nothing in it is trusted — least of all
 * a score, which is never sent at all: a client sends the balls it played and
 * the store works out what they were worth.
 *
 *   GET ?code=K7QPX2      the room as it stands — the same bytes for everybody
 *   GET ?player=…         every room this player is in, newest first
 *   POST {action: …}      create · join · ball · seen
 */
export interface ChallengeRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  /** Whoever the edge says is asking. Used to rate limit, never as identity. */
  address: string;
}

export async function challengeRequest(
  store: ChallengeStore, req: ChallengeRequest,
): Promise<ChallengeOutcome | ChallengeListOutcome> {
  if (req.method === 'GET') {
    const player = one(req.query.player);
    if (player) return readMine(store, player);
    return readChallenge(store, one(req.query.code));
  }
  if (req.method !== 'POST') return { ok: false, status: 405, reason: 'Use GET or POST.' };
  const body = parse(req.body);
  if (!body) return { ok: false, status: 400, reason: 'Send the match as JSON.' };
  const who: Batter = {
    playerId: String(body.playerId ?? ''),
    name: String(body.name ?? ''),
    avatar: Number(body.avatar),
    address: req.address,
  };
  const code = String(body.code ?? '');
  switch (String(body.action ?? '')) {
    case 'create': return createChallenge(store, { ...who, card: body.card, rematchOf: body.rematchOf });
    case 'join': return joinChallenge(store, code, who);
    case 'ball': return recordBalls(store, code, { ...who, card: body.card });
    case 'seen': return markSeen(store, code, who);
    default: return { ok: false, status: 400, reason: 'Say what to do with the match.' };
  }
}

/** Whether a read may sit in the edge cache: only the room itself, never a player's list or a write. */
export function cacheable(req: ChallengeRequest): boolean {
  return req.method === 'GET' && !one(req.query.player);
}

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/** Vercel parses a JSON body itself, but a string still arrives on some paths. */
function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try { return parse(JSON.parse(body)); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
