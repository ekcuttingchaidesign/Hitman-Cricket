import {
  awayInMatch, backToRoom, ballInMatch, beatInMatch, doneMatch, hostMatch, inviteToMatch, joinMatch, leaveMatch, nudgeInMatch, reactInMatch, readInvites, readMatch, readyMatch, removeFromMatch,
  settleMatch, startMatch,
  type KnockoutStore, type MatchInvitesAccepted, type MatchOutcome, type MatchRefusal, type Member,
} from './knockout-store.js';

/**
 * A request to `/api/challenge?knockout=1`, turned into a call on the store; shared by the
 * deployed function and the dev server, so the two cannot drift.
 *
 *   GET ?code=K7Q2          the match as it stands, never cached
 *   GET ?invites=<player>   that player's open invites, never cached
 *   POST {action: …}        host · join · ready · leave · remove · invite · start · ball · beat · away · back · done · settle · react · nudge
 */
export interface KnockoutRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  address: string;
}

export async function knockoutRequest(store: KnockoutStore, req: KnockoutRequest): Promise<MatchOutcome | MatchInvitesAccepted | MatchRefusal> {
  if (req.method === 'GET') {
    const invites = one(req.query.invites);
    if (invites) return readInvites(store, invites);
    return readMatch(store, one(req.query.code));
  }
  if (req.method !== 'POST') return { ok: false, status: 405, reason: 'Use GET or POST.' };
  const body = parse(req.body);
  if (!body) return { ok: false, status: 400, reason: 'Send the match as JSON.' };
  const member: Member = { playerId: String(body.playerId ?? ''), name: body.name, avatar: body.avatar, address: req.address };
  const code = String(body.code ?? '');
  switch (String(body.action ?? '')) {
    case 'host': return hostMatch(store, member);
    case 'join': return joinMatch(store, code, member);
    case 'ready': return readyMatch(store, code, member, body.ready !== false);
    case 'leave': return leaveMatch(store, code, member);
    case 'remove': return removeFromMatch(store, code, member, body.handle);
    case 'invite': return inviteToMatch(store, code, member, body.handle);
    case 'start': return startMatch(store, code, member);
    case 'ball': return ballInMatch(store, code, member, body.ball, body.value, Date.now(), body.round, body.how);
    case 'back': return backToRoom(store, code, member);
    case 'done': return doneMatch(store, code, member, body.round);
    case 'settle': return settleMatch(store, code, member);
    case 'beat': return beatInMatch(store, code, member);
    case 'react': return reactInMatch(store, code, member, body.to, body.emoji);
    case 'nudge': return nudgeInMatch(store, code, member, body.handle);
    case 'away': return awayInMatch(store, code, member, body.handle, body.over);
    default: return { ok: false, status: 400, reason: 'Say what to do with the match.' };
  }
}

/**
 * Nothing about a match is cached: a ball counts on every phone only once the
 * store has it, so a read a second or two old held a phone at the over's end
 * on a ball that had already landed, and an older answer arriving after a
 * newer one took the room back.
 */
export const KNOCKOUT_CACHE = 'no-store';

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try { return parse(JSON.parse(body)); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
