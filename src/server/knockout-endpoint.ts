import {
  awayInMatch, backToRoom, ballInMatch, beatInMatch, doneMatch, hostMatch, inviteToMatch, joinMatch, leaveMatch, nudgeInMatch, reactInMatch, readInvites, readMatch, readyMatch, removeFromMatch,
  settleMatch, startMatch,
  type KnockoutStore, type MatchInvitesAccepted, type MatchOutcome, type MatchRefusal, type Member,
} from './knockout-store.js';
import { knockoutBoards, knockoutStanding, type KnockoutBoards, type KnockoutLedger, type KnockoutStanding } from './knockout-ledger.js';

/**
 * A request to `/api/challenge?knockout=1`, turned into a call on the store; shared by the
 * deployed function and the dev server, so the two cannot drift.
 *
 *   GET ?code=K7Q2          the match as it stands, never cached
 *   GET ?invites=<player>   that player's open invites, never cached
 *   GET ?board=1            Super Knockout's ladders, every one at once
 *   GET ?standing=<player>  that player's Knockout record and their place on each ladder
 *   POST {action: …}        host · join · ready · leave · remove · invite · start · ball · beat · away · back · done · settle · react · nudge
 */
export interface KnockoutRequest {
  method?: string;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  address: string;
}

export async function knockoutRequest(store: KnockoutStore, req: KnockoutRequest, ledger: KnockoutLedger | null = null):
Promise<MatchOutcome | MatchInvitesAccepted | MatchRefusal | KnockoutBoards | KnockoutStanding> {
  if (req.method === 'GET') {
    const invites = one(req.query.invites);
    if (invites) return readInvites(store, invites);
    if (one(req.query.board)) return ledger ? knockoutBoards(ledger) : { ok: false, status: 503, reason: 'The board is out of reach.' };
    const standing = one(req.query.standing);
    if (standing) return ledger ? knockoutStanding(ledger, standing) : { ok: false, status: 503, reason: 'The board is out of reach.' };
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
    case 'back': return backToRoom(store, code, member, Date.now(), ledger);
    case 'done': return doneMatch(store, code, member, body.round, Date.now(), ledger);
    case 'settle': return settleMatch(store, code, member, Date.now(), Math.random, ledger);
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
/** The ladders: the same for everybody, moved only by a match ending. */
export const KNOCKOUT_BOARD_CACHE = 'public, s-maxage=30, stale-while-revalidate=60';

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try { return parse(JSON.parse(body)); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}
